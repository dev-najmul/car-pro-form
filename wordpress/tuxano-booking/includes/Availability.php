<?php
/** Vehicle-specific pickup slots; no customer data is returned to visitors. */
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Availability
{
    /** @param mixed $vehicle */
    public static function vehicle_id($vehicle): int
    {
        if ((!is_string($vehicle) && !is_int($vehicle)) || !preg_match('/^[1-9][0-9]{0,18}$/D', (string) $vehicle) || filter_var($vehicle, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
            throw new \InvalidArgumentException('Choose a valid vehicle.');
        }
        return (int) $vehicle;
    }

    /**
     * A pickup is compared as an instant, never as a browser timezone or an
     * address string. Historical records retain their recorded timezone.
     */
    public static function slot($vehicle, string $date, string $time, ?string $timezone = null): array
    {
        $id = self::vehicle_id($vehicle);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || !preg_match('/^\d{2}:\d{2}$/D', $time)) { throw new \InvalidArgumentException('Choose a valid pickup date and time.'); }
        try { $zone = $timezone === null || $timezone === '' ? wp_timezone() : new \DateTimeZone($timezone); }
        catch (\Exception $error) { throw new \InvalidArgumentException('The saved pickup timezone is invalid. Contact the booking team.'); }
        $local = \DateTimeImmutable::createFromFormat('!Y-m-d H:i', $date . ' ' . $time, $zone);
        if (!$local || $local->format('Y-m-d H:i') !== $date . ' ' . $time || (int) $local->format('Y') < 1970 || (int) $local->format('Y') > 2100) { throw new \InvalidArgumentException('Choose a valid pickup date and time.'); }
        $utc = $local->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        return ['vehicle_id' => $id, 'pickup_utc' => $utc];
    }

    public static function from_booking(array $booking): array
    {
        $booking = is_array($booking['booking'] ?? null) ? $booking['booking'] : $booking;
        $trip = $booking['trip'] ?? [];
        if (!is_array($trip) || !is_string($trip['date'] ?? null) || !is_string($trip['time'] ?? null) || (isset($trip['timezone']) && !is_string($trip['timezone']))) { throw new \InvalidArgumentException('The request has no valid pickup schedule.'); }
        return self::slot($booking['vehicle'] ?? null, $trip['date'], $trip['time'], $trip['timezone'] ?? null);
    }

    public static function confirmed_key(array $slot): string
    {
        return hash('sha256', (string) $slot['vehicle_id'] . '|' . $slot['pickup_utc']);
    }

    /** A short shared write lock keeps confirm/request races deterministic. */
    public static function lock_name(): string
    {
        global $wpdb;
        return 'tuxano_schedule_' . substr(hash('sha256', DB_NAME . '|' . $wpdb->prefix), 0, 40);
    }

    /** @return mixed|\WP_Error */
    public static function write(callable $operation)
    {
        global $wpdb;
        $name = self::lock_name();
        $previous = $wpdb->suppress_errors(true);
        $locked = $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 3)', $name));
        $wpdb->suppress_errors($previous);
        if ((string) $locked !== '1') { return self::unavailable_service(); }
        try { return $operation(); }
        finally { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $name)); }
    }

    /**
     * Bounded additive migration. The cursor advances past corrupt records;
     * unresolved confirmed records remain fail-closed for their vehicle (or
     * globally when its identity is unknown), rather than being silently free.
     */
    public static function backfill(int $limit = 250): void
    {
        global $wpdb;
        $cursor = max(0, (int) get_option('tuxano_schedule_cursor', 0));
        $rows = $wpdb->get_results($wpdb->prepare('SELECT id,payload,status,vehicle_id,pickup_utc FROM ' . Database::table() . ' WHERE id > %d ORDER BY id LIMIT %d', $cursor, max(1, min(1000, $limit))), ARRAY_A);
        if (!is_array($rows)) { return; }
        foreach ($rows as $row) {
            if ((int) $row['vehicle_id'] < 1 || empty($row['pickup_utc'])) {
                $booking = json_decode((string) $row['payload'], true);
                $booking = is_array($booking) ? $booking : [];
                $data = ['vehicle_id' => 0, 'pickup_utc' => null, 'confirmed_slot' => null];
                $source = is_array($booking['booking'] ?? null) ? $booking['booking'] : $booking;
                try { $data['vehicle_id'] = self::vehicle_id($source['vehicle'] ?? null); } catch (\InvalidArgumentException $error) { /* Unknown identity remains protected. */ }
                try {
                    $slot = self::from_booking($booking);
                    $data = array_merge($data, $slot);
                    if ($row['status'] === 'confirmed') { $data['confirmed_slot'] = self::confirmed_key($slot); }
                } catch (\InvalidArgumentException $error) { /* Invalid historical schedules require administrator correction. */ }
                $previous = $wpdb->suppress_errors(true);
                $saved = $wpdb->update(Database::table(), $data, ['id' => (int) $row['id'], 'payload' => $row['payload'], 'status' => $row['status']]);
                // Keep pre-existing double confirmations intact and indexed;
                // future confirmations are rejected until the team resolves it.
                if ($saved === false && $data['confirmed_slot'] !== null && stripos($wpdb->last_error, 'duplicate') !== false && stripos($wpdb->last_error, 'confirmed_slot') !== false) {
                    $data['confirmed_slot'] = null;
                    $saved = $wpdb->update(Database::table(), $data, ['id' => (int) $row['id'], 'payload' => $row['payload'], 'status' => $row['status']]);
                }
                $wpdb->suppress_errors($previous);
                if ($saved === false) { return; }
            }
            $cursor = (int) $row['id'];
        }
        update_option('tuxano_schedule_cursor', $cursor, false);
    }

    /** @return array|\WP_Error */
    public static function check(array $slot, int $exclude = 0)
    {
        global $wpdb;
        $table = Database::table();
        // A partially migrated database must not advertise a pending slot as
        // free merely because its derived index has not been backfilled yet.
        $cursor = max(0, (int) get_option('tuxano_schedule_cursor', 0));
        $unindexed = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE id>%d AND (vehicle_id=0 OR pickup_utc IS NULL) AND status IN ('new','reviewing','confirmed') LIMIT 1", $cursor));
        if ($wpdb->last_error !== '' || $unindexed !== null) { return self::unavailable_service(); }
        // A single unreadable pending request must not block unrelated cars.
        // A confirmed schedule whose timezone/identity is unknown cannot safely
        // be advertised as available until an administrator repairs that row.
        $unknown = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE status='confirmed' AND id<>%d AND (vehicle_id=0 OR (vehicle_id=%d AND pickup_utc IS NULL)) LIMIT 1", $exclude, $slot['vehicle_id']));
        if ($wpdb->last_error !== '' || $unknown !== null) { return self::unavailable_service(); }
        $status = $wpdb->get_var($wpdb->prepare("SELECT status FROM {$table} WHERE vehicle_id=%d AND pickup_utc=%s AND id<>%d AND status IN ('confirmed','new','reviewing') ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END LIMIT 1", $slot['vehicle_id'], $slot['pickup_utc'], $exclude));
        if ($wpdb->last_error !== '') { return self::unavailable_service(); }
        if ($status === 'confirmed') { return ['state' => 'unavailable', 'message' => 'This vehicle already has a confirmed booking at this pickup date and time. Choose another vehicle or change your pickup time.']; }
        if ($status === 'new' || $status === 'reviewing') { return ['state' => 'requested', 'message' => 'This vehicle has already been requested for this pickup date and time. Availability is not guaranteed. You can continue with a request, choose another vehicle, or change your pickup time.']; }
        return ['state' => 'available', 'message' => 'No conflicting request is recorded for this vehicle at this pickup date and time. Your request is still subject to confirmation.'];
    }

    /** @return true|\WP_Error */
    public static function permit(array $slot, int $exclude = 0)
    {
        $state = self::check($slot, $exclude);
        if (is_wp_error($state)) { return $state; }
        return $state['state'] === 'unavailable' ? new \WP_Error('tuxano_vehicle_unavailable', $state['message'], ['status' => 409, 'state' => 'unavailable']) : true;
    }

    private static function unavailable_service(): \WP_Error
    {
        return new \WP_Error('tuxano_availability_unavailable', 'Vehicle availability could not be verified. Please try again or contact the booking team.', ['status' => 503]);
    }
}
