<?php
/** Capability-checked, auditable changes to an already received request. */
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class BookingUpdates
{
    public static function revision(array $row): string
    {
        return (string) max(1, (int) ($row['revision'] ?? 1));
    }

    /**
     * Preserve the accepted fare for contact-only edits. A changed itinerary,
     * priced option or explicit reprice uses authoritative server rates.
     * Notification transport runs only after the complete revision is saved.
     *
     * @return array|\WP_Error
     */
    public static function save(int $id, array $booking, string $revision, string $status, string $notes, bool $notify_customer = false, bool $reprice = false)
    {
        if (!current_user_can('manage_options')) { return self::error('tuxano_admin_forbidden', 'You cannot edit booking requests.', 403); }
        $row = Database::find($id);
        if (!$row) { return self::error('tuxano_booking_missing', 'The request was not found.', 404); }
        if (!preg_match('/^[1-9][0-9]{0,18}$/D', $revision) || $revision !== self::revision($row)) {
            return self::error('tuxano_edit_conflict', 'This request was changed by another administrator. Reload it before saving your changes.', 409);
        }
        if (!in_array($status, Database::STATUSES, true)) { return self::error('tuxano_edit_validation', 'Choose a valid request status.', 400, ['status' => 'Choose an available status.']); }
        if (mb_strlen($notes) > 5000 || strpos($notes, "\0") !== false) { return self::error('tuxano_edit_validation', 'Internal notes must be at most 5,000 characters.', 400, ['notes' => 'Use at most 5,000 characters.']); }
        $encoded = wp_json_encode($booking);
        if (!is_string($encoded) || strlen($encoded) > 65536) { return self::error('tuxano_edit_validation', 'Booking details must be valid data of at most 64 KB.'); }
        $fields = self::contact_errors($booking);
        if ($fields) { return self::error('tuxano_edit_validation', reset($fields), 400, $fields); }
        $old = is_array($row['payload']['booking'] ?? null) ? $row['payload']['booking'] : $row['payload'];
        $snapshot = self::historical_vehicle($old, $row);
        try {
            $points = Rest::booking_points($booking, true);
            $old_points = Rest::booking_points($old, true);
            // Reject malformed fields before spending a provider request. UTC
            // here validates only calendar/field shape; the geographic zone is
            // resolved below and revalidated before anything can be saved.
            [$pre_clean, $pre_vehicle] = Rest::validate_booking($booking, ['points' => $points, 'pickupTimezone' => 'UTC', 'allowLegacyTime' => true], true, $snapshot);
        } catch (\InvalidArgumentException $error) { return self::error('tuxano_edit_validation', $error->getMessage()); }
        $route_changed = wp_json_encode($points) !== wp_json_encode($old_points);
        $pickup_changed = wp_json_encode($points['origin']) !== wp_json_encode($old_points['origin']);
        $same_schedule = !$pickup_changed && ($old['trip']['date'] ?? '') === ($booking['trip']['date'] ?? '') && ($old['trip']['time'] ?? '') === ($booking['trip']['time'] ?? '');
        $priced_changed = wp_json_encode(self::priced_fields($pre_clean)) !== wp_json_encode(self::priced_fields($old));
        $accepted_transfer_forecast = ($old['trip']['service'] ?? '') === 'transfer' && self::uses_new_pricing($old['vehicleSnapshot'] ?? []);
        // Only accepted traffic-based transfers gain schedule-dependent pricing.
        // A date-only correction of a legacy booking keeps its accepted fare.
        $forecast_changed = $accepted_transfer_forecast && !$same_schedule;
        $needs_price = $route_changed || $priced_changed || $reprice || $forecast_changed;
        $pricing_revision = $needs_price ? Settings::revision() : '';
        $vehicle = $needs_price ? (Vehicles::find((string) $pre_clean['vehicle']) ?: $pre_vehicle) : $pre_vehicle;
        $pricing_settings = Settings::get();
        $new_transfer = $needs_price && ($pre_clean['trip']['service'] ?? '') === 'transfer' && self::uses_new_pricing($vehicle);
        $service_changed = ($old['trip']['service'] ?? '') !== ($pre_clean['trip']['service'] ?? '');
        $route = $row['route']; $route_refreshed = false;
        // Contact/status-only edits retain the accepted geographic interpretation.
        $timezone = $same_schedule ? ($old['trip']['timezone'] ?? wp_timezone_string()) : (!$pickup_changed ? ($route['pickupTimezone'] ?? null) : null);
        $needs_route = $route_changed || !is_string($timezone) || $timezone === '' || $new_transfer || ($needs_price && ($service_changed || !empty($route['trafficAware'])));
        if ($needs_route) {
            if (self::uses_new_pricing($vehicle)) {
                // This helper budgets every provider attempt, including all
                // service-base legs. A reprice never reuses stale base metrics.
                $measured = Rest::measure_booking_route($points, $pre_clean['trip'], true);
            } else {
                if (!Rest::admin_provider_budget()) { return self::error('tuxano_rate', 'The route request limit has been reached. Please try again later.', 429); }
                $measured = Rest::measure_route($points, null, true);
            }
            if (is_wp_error($measured)) { return $measured; }
            if (!$same_schedule || $pickup_changed || $new_transfer) { $timezone = $measured['pickupTimezone']; }
            if ($route_changed || $new_transfer || ($needs_price && ($service_changed || !empty($route['trafficAware'])))) {
                $route = $measured; $route_refreshed = true;
            } else {
                $route['pickupTimezone'] = $measured['pickupTimezone']; $route['pickupTimezoneLabel'] = $measured['pickupTimezoneLabel'];
            }
        }
        $validation_quote = ['points' => $points, 'route' => $route, 'pickupTimezone' => $timezone, 'allowLegacyTime' => $same_schedule && !$new_transfer];
        if (self::uses_new_pricing($vehicle) && ($needs_price || self::uses_new_pricing($old['vehicleSnapshot'] ?? []))) { $validation_quote['trip'] = Rest::booking_quote_trip($pre_clean['trip']); }
        try { [$clean, $vehicle, $pickup] = Rest::validate_booking($booking, $validation_quote, true, $vehicle); }
        catch (\InvalidArgumentException $error) { return self::error('tuxano_edit_validation', $error->getMessage()); }
        $pricing = $row['pricing'];
        if ($needs_price) {
            try { $pricing = Pricing::calculate($vehicle, $route, $clean, $pricing_settings); }
            catch (\InvalidArgumentException $error) { return self::error('tuxano_edit_validation', $error->getMessage()); }
            if (!hash_equals($pricing_revision, Settings::revision())) {
                return self::error('tuxano_pricing_changed', 'Pricing changed while this estimate was being calculated. Review the current rates and try again.', 409);
            }
        } elseif (isset($old['vehicleSnapshot']) && is_array($old['vehicleSnapshot'])) {
            $clean['vehicleSnapshot'] = $old['vehicleSnapshot'];
        } else {
            // A contact correction cannot upgrade an old record to a new fare
            // model without the corresponding verified service-base legs.
            unset($clean['vehicleSnapshot']);
        }
        $notes = sanitize_textarea_field($notes);
        $changes = self::diff($old, $clean);
        if ($status !== $row['status']) { $changes['status'] = ['old' => $row['status'], 'new' => $status]; }
        if ($notes !== $row['notes']) { $changes['notes'] = ['old' => $row['notes'], 'new' => $notes]; }
        $status_notification = $status !== $row['status'] && in_array($status, ['confirmed', 'cancelled', 'completed'], true);
        $notify_customer = !empty(Settings::get()['email_customer']) && ($notify_customer || $status_notification);
        if (!$changes && !$reprice && !$notify_customer) { return $row; }
        $next = (int) $row['revision'] + 1;
        $data = [
            'status' => $status, 'notes' => $notes, 'pickup_at' => $pickup,
            'customer_name' => trim($clean['billing']['first'] . ' ' . $clean['billing']['last']),
            'customer_email' => $clean['billing']['email'],
            'vehicle_name' => $needs_price ? $vehicle['display'] : $row['vehicle_name'],
            'total' => $pricing['total'], 'currency' => $pricing['currency'],
            'payload' => $clean, 'pricing' => $pricing, 'route' => $route,
            'update_mail' => $notify_customer ? 'pending' : 'disabled',
            'update_mail_revision' => $next, 'update_mail_started' => null,
        ];
        $entry = ['changes' => $changes, 'beforePricing' => $row['pricing'], 'afterPricing' => $pricing, 'recalculated' => $needs_price, 'routeChanged' => $route_changed || $route_refreshed, 'notificationRequested' => $notify_customer];
        if ($route_changed || $route_refreshed) { $entry['beforeRoute'] = $row['route']; $entry['afterRoute'] = $route; }
        $saved = Database::revise($id, (int) $revision, $data, $entry);
        if (is_wp_error($saved)) { return $saved; }
        if (($saved['update_mail'] ?? '') === 'pending') { Notifications::send_update($id, $next); }
        return Database::find($id);
    }

    /** A removed fleet item remains editable through its accepted snapshot. */
    private static function historical_vehicle(array $booking, array $row): ?array
    {
        $snapshot = $booking['vehicleSnapshot'] ?? null;
        if (is_array($snapshot) && (string) ($snapshot['id'] ?? '') === (string) ($booking['vehicle'] ?? '')) { return $snapshot; }
        $vehicle = Vehicles::find((string) ($booking['vehicle'] ?? ''));
        if ($vehicle) { return $vehicle; }
        if (empty($booking['vehicle'])) { return null; }
        // Very old records without a tariff snapshot can still receive contact
        // corrections. They cannot be repriced without a valid current tariff.
        return ['id' => (string) $booking['vehicle'], 'name' => $row['vehicle_name'], 'display' => $row['vehicle_name'], 'capacity' => max(1, min(100, (int) ($booking['passengers'] ?? 1))), 'luggageCapacity' => max(0, min(100, (int) ($booking['luggage'] ?? 0))), 'tariff' => []];
    }

    private static function uses_new_pricing(array $vehicle): bool
    {
        return isset($vehicle['tariff']['transfer'], $vehicle['tariff']['hourlyBooking']) && ($vehicle['tariff']['transfer']['version'] ?? null) === 2;
    }

    private static function priced_fields(array $booking): array
    {
        $trip = $booking['trip'] ?? [];
        return [
            'vehicle' => $booking['vehicle'] ?? '', 'service' => $trip['service'] ?? '', 'hours' => $trip['hours'] ?? null,
            'waits' => array_map(static fn(array $stop) => $stop['waitMinutes'] ?? null, $trip['stops'] ?? []),
            'meet' => $booking['meet'] ?? false, 'child' => $booking['child'] ?? false,
            'carSeats' => $booking['carSeats'] ?? 0, 'boosterSeats' => $booking['boosterSeats'] ?? 0,
            'inPerson' => $booking['inPerson'] ?? false, 'gratuity' => $booking['gratuity'] ?? '', 'custom' => $booking['custom'] ?? 0,
        ];
    }

    /** Dotted field changes allow readable, deliberately whitelisted emails. */
    private static function diff(array $before, array $after, string $prefix = ''): array
    {
        $changes = [];
        foreach (array_unique(array_merge(array_keys($before), array_keys($after))) as $key) {
            $old = $before[$key] ?? null; $new = $after[$key] ?? null;
            $path = $prefix === '' ? (string) $key : $prefix . '.' . $key;
            if (wp_json_encode($old) === wp_json_encode($new)) { continue; }
            if (is_array($old) && is_array($new)) { $changes += self::diff($old, $new, $path); }
            else { $changes[$path] = ['old' => $old, 'new' => $new]; }
        }
        return $changes;
    }

    /** Admin forms return field-specific feedback without losing input. */
    private static function contact_errors(array $booking): array
    {
        $errors = [];
        foreach (['billing', 'passenger'] as $section) {
            if ($section === 'passenger' && !empty($booking['same'])) { continue; }
            $data = $booking[$section] ?? [];
            if (!is_array($data)) { $errors[$section] = 'Complete the contact details.'; continue; }
            $email = $data['email'] ?? '';
            if (($section === 'billing' || $email !== '') && (!is_string($email) || !is_email($email))) { $errors[$section . '.email'] = 'Enter a valid email address.'; }
            $key = $section === 'billing' ? 'phone' : 'mobile';
            $phone = $data[$key] ?? '';
            $digits = is_string($phone) ? preg_replace('/\D/', '', $phone) : '';
            if (strlen($digits) < 7 || strlen($digits) > 15) { $errors[$section . '.' . $key] = 'Enter a phone number with 7 to 15 digits.'; }
        }
        return $errors;
    }

    private static function error(string $code, string $message, int $status = 400, array $fields = []): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status, 'fields' => $fields]);
    }
}
