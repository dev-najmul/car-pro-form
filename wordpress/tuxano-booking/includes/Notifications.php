<?php
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Notifications
{
    /** wp_mail acceptance is recorded separately for each recipient. */
    public static function send(int $id, bool $retry = false): void
    {
        global $wpdb;
        $row = Database::find($id);
        if (!$row) { return; }
        $settings = Settings::get();
        foreach (['customer' => $row['customer_email'], 'admin' => $settings['admin_email']] as $kind => $recipient) {
            if (empty($settings['email_' . $kind]) || !is_email($recipient)) { continue; }
            $column = $kind . '_mail';
            $started_column = $column . '_started';
            $states = $retry ? ['pending', 'failed'] : ['pending'];
            $started = !empty($row[$started_column]) ? strtotime($row[$started_column] . ' UTC') : false;
            // Only an explicit administrator retry can recover a crashed sender.
            // A stale delivery is uncertain and a manual retry can duplicate mail.
            if ($retry && $row[$column] === 'sending' && $started !== false && $started < time() - 10 * MINUTE_IN_SECONDS) { $states[] = 'sending'; }
            if (!in_array($row[$column], $states, true)) { continue; }
            $claim_time = gmdate('Y-m-d H:i:s');
            $lease = $row[$column] === 'sending' ? $wpdb->prepare(" AND {$started_column} = %s", $row[$started_column]) : '';
            // Claim the send atomically to prevent simultaneous admin retries.
            $claimed = $wpdb->query($wpdb->prepare('UPDATE ' . Database::table() . " SET {$column} = 'sending', {$started_column} = %s WHERE id = %d AND {$column} = %s", $claim_time, $id, $row[$column]) . $lease);
            if ($claimed !== 1) { continue; }
            $subject = $kind === 'admin' ? 'New transportation request ' : 'Your transportation request ';
            $accepted = self::deliver($recipient, $subject . $row['reference'], $row, $settings, $kind);
            $wpdb->update(Database::table(), [$column => $accepted ? 'accepted' : 'failed'], ['id' => $id, $started_column => $claim_time]);
        }
    }

    /**
     * Send a committed administrator revision once, independently of the initial
     * receipt. Only an explicit retry may recover failed or stalled deliveries.
     * Returns transport acceptance; it cannot establish external inbox delivery.
     */
    public static function send_update(int $id, int $revision, bool $retry = false): bool
    {
        global $wpdb;
        $row = Database::find($id);
        if (!$row || $revision < 1 || (int) ($row['revision'] ?? 1) !== $revision || (int) ($row['update_mail_revision'] ?? 0) !== $revision) { return false; }
        $state = $row['update_mail'] ?? 'disabled';
        if ($state === 'accepted') { return true; }
        $states = $retry ? ['pending', 'failed'] : ['pending'];
        $started = !empty($row['update_mail_started']) ? strtotime($row['update_mail_started'] . ' UTC') : false;
        if ($retry && $state === 'sending' && $started !== false && $started < time() - 10 * MINUTE_IN_SECONDS) { $states[] = 'sending'; }
        if (!in_array($state, $states, true)) { return false; }
        $claim = gmdate('Y-m-d H:i:s');
        $lease = $state === 'sending' ? $wpdb->prepare(' AND update_mail_started = %s', $row['update_mail_started']) : '';
        $claimed = $wpdb->query($wpdb->prepare('UPDATE ' . Database::table() . " SET update_mail = 'sending', update_mail_started = %s WHERE id = %d AND revision = %d AND update_mail_revision = %d AND update_mail = %s", $claim, $id, $revision, $revision, $state) . $lease);
        if ($claimed !== 1) { return false; }
        $recipient = $row['customer_email'];
        $accepted = is_email($recipient) && self::deliver($recipient, 'Updated transportation request ' . $row['reference'] . ' — revision ' . $revision, $row, Settings::get(), 'update');
        $wpdb->update(Database::table(), ['update_mail' => $accepted ? 'accepted' : 'failed'], ['id' => $id, 'revision' => $revision, 'update_mail_revision' => $revision, 'update_mail_started' => $claim, 'update_mail' => 'sending']);
        return $accepted;
    }

    /** Scope the plain-text alternative to this exact message, then remove it. */
    private static function deliver(string $recipient, string $subject, array $row, array $settings, string $kind): bool
    {
        $subject = sanitize_text_field($subject);
        $headers = ['Content-Type: text/html; charset=UTF-8'];
        $from = $settings['from_email'] ?? '';
        if (is_email($from)) {
            $sender = str_replace(['<', '>', '"', "\r", "\n"], '', sanitize_text_field($settings['sender_name'] ?? $settings['company_name'] ?? ''));
            $headers[] = 'From: ' . $sender . ' <' . $from . '>';
        }
        if ($kind === 'admin' && is_email($row['customer_email'] ?? '')) { $headers[] = 'Reply-To: ' . $row['customer_email']; }
        $alternative = self::plain_text($row, $settings, $kind);
        $configure = static function ($mailer) use ($subject, $alternative): void {
            if (($mailer->Subject ?? '') === $subject) { $mailer->AltBody = $alternative; }
        };
        add_action('phpmailer_init', $configure, 20);
        try { return (bool) wp_mail($recipient, $subject, self::template($row, $settings, $kind), $headers); }
        catch (\Throwable $error) { return false; }
        finally { remove_action('phpmailer_init', $configure, 20); }
    }

    public static function template(array $row, array $settings, string $kind): string
    {
        $data = self::message_data($row, $settings, $kind);
        $company = $settings['company_name'] ?? 'TUXANO';
        $version = defined('TUXANO_BOOKING_VERSION') ? TUXANO_BOOKING_VERSION : '2.1.0';
        $file = defined('TUXANO_BOOKING_FILE') ? TUXANO_BOOKING_FILE : dirname(__DIR__) . '/tuxano-booking.php';
        $logo = plugins_url('public/' . $version . '/assets/tuxano-wordmark.png', $file);
        $brand = strcasecmp(trim($company), 'TUXANO') === 0
            ? '<img src="' . esc_url($logo) . '" width="240" height="46" alt="' . esc_attr($company . ' — Private Transportation') . '" style="display:block;border:0;width:240px;max-width:100%;height:auto">'
            : '<div style="font:28px/1.2 Georgia,serif;letter-spacing:4px;color:#ffffff">' . esc_html($company) . '</div>';
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' . esc_html($data['title']) . '</title><style>@media only screen and (max-width:600px){.email-shell{width:100%!important}.email-content{padding:24px 20px!important}.email-heading{font-size:29px!important}.email-pair th,.email-pair td{display:block!important;width:auto!important}.email-pair th{padding-bottom:0!important}.email-pair td{padding-top:3px!important}.email-outer{padding:12px 8px!important}}</style></head><body style="margin:0;padding:0;background:#eef1f6;color:#101828;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;-webkit-text-size-adjust:100%"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' . esc_html($data['preheader']) . '</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#eef1f6"><tr><td class="email-outer" align="center" style="padding:32px 16px"><table class="email-shell" role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #dce2eb;border-radius:12px;overflow:hidden"><tr><td class="email-content" style="padding:32px;background:#0b1220;border-top:4px solid #bca77d">' . $brand . '</td></tr><tr><td class="email-content" style="padding:30px 32px 24px"><p style="font-size:11px;font-weight:700;letter-spacing:2px;color:#7c6847;margin:0 0 12px;text-transform:uppercase">' . esc_html($data['eyebrow']) . '</p><h1 class="email-heading" style="font:36px/1.15 Georgia,Times,serif;color:#101a30;font-weight:600;margin:0 0 16px">' . esc_html($data['title']) . '</h1><p style="margin:0 0 20px;color:#475467">' . esc_html($data['intro']) . '</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#f5f7fb;border:1px solid #dfe5ef;border-radius:8px"><tr><td style="padding:15px 18px"><span style="display:block;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#667085">REQUEST REFERENCE</span><strong style="font-size:16px;letter-spacing:.7px;color:#10234b">' . esc_html($row['reference']) . '</strong><span style="display:block;margin-top:4px;color:#667085;font-size:12px">' . esc_html('Status: ' . $data['status']) . ($kind === 'update' ? esc_html(' · Revision ' . (int) ($row['revision'] ?? 1)) : '') . '</span></td></tr></table>';
        if ($kind === 'update' && $data['changes']) {
            $html .= '<h2 style="font:22px/1.3 Georgia,serif;margin:26px 0 10px;color:#10234b">What changed</h2><p style="margin:0 0 12px;color:#475467">' . esc_html(implode(' · ', $data['changes'])) . '. The latest details are below.</p>';
        }
        if ($kind === 'update' && $data['previous_total'] !== '') {
            $html .= '<p style="padding:12px 16px;border-left:3px solid #bca77d;background:#faf8f4;margin:0 0 20px;font-size:13px">' . esc_html('Previous estimate: ' . $data['previous_total'] . ' · Updated estimate: ' . $data['total']) . '</p>';
        }
        $html .= self::section('Your journey', $data['trip']);
        $html .= self::section('Contacts & billing', $data['contact']);
        if ($data['additional']) { $html .= self::section('Additional details', $data['additional']); }
        $html .= '<h2 style="font:24px/1.3 Georgia,serif;color:#10234b;margin:28px 0 4px">' . esc_html($kind === 'update' ? 'Updated itemized estimate' : 'Itemized estimate') . '</h2><p style="margin:0 0 13px;font-size:11px;font-weight:700;letter-spacing:1px;color:#667085">ESTIMATE · NOT A PAYMENT RECEIPT</p><table width="100%" cellpadding="0" cellspacing="0" aria-label="Estimated charges" style="width:100%;border-collapse:collapse">';
        foreach ($data['charges'] as $label => $value) {
            $html .= '<tr><th scope="row" align="left" style="font-weight:400;padding:10px 0;border-bottom:1px solid #edf0f5;color:#475467">' . esc_html($label) . '</th><td align="right" style="padding:10px 0;border-bottom:1px solid #edf0f5;white-space:nowrap;font-weight:600;color:#101828">' . esc_html($value) . '</td></tr>';
        }
        $html .= '</table><p style="font-size:12px;color:#667085;margin:9px 0 18px">' . esc_html($data['waiting_note']) . '</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#0d1c40;border-radius:8px;color:white"><tr><td align="center" style="padding:22px 18px"><span style="display:block;font-size:10px;letter-spacing:1.8px;font-weight:700;color:#d4ddf1">ESTIMATED TOTAL</span><strong style="display:block;font:34px/1.25 Georgia,serif;color:white;margin:5px 0">' . esc_html($data['total']) . '</strong><span style="font-size:11px;color:#d4ddf1">No payment has been collected by this email.</span></td></tr></table><p style="font-size:12px;color:#667085;margin:18px 0 0">Driving duration is a baseline estimate. Live traffic and pickup-date traffic forecasts are not included.</p>';
        if ($kind === 'admin') {
            $html .= '<p style="margin:24px 0 0"><a href="' . esc_url(admin_url('admin.php?page=tuxano-submissions&booking_id=' . (int) $row['id'])) . '" style="display:inline-block;background:#10234b;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:5px;padding:12px 22px">Review in WordPress</a></p>';
        }
        $html .= '</td></tr><tr><td class="email-content" style="padding:22px 32px 26px;border-top:1px solid #e8ecf3;background:#fafbfc"><p style="margin:0 0 7px;color:#10234b;font-weight:700">' . esc_html($company) . '</p><p style="margin:0 0 9px;font-size:12px;color:#667085">Questions or changes? Contact your booking team and include your request reference.</p>';
        $support = [];
        if (is_email($settings['support_email'] ?? '')) { $support[] = '<a style="color:#15346b;text-decoration:underline" href="mailto:' . esc_attr($settings['support_email']) . '">' . esc_html($settings['support_email']) . '</a>'; }
        if (!empty($settings['support_phone'])) { $support[] = esc_html($settings['support_phone']); }
        if ($support) { $html .= '<p style="margin:0;font-size:12px">' . implode(' &nbsp;·&nbsp; ', $support) . '</p>'; }
        return $html . '</td></tr></table><p style="max-width:600px;font:11px/1.6 Arial,sans-serif;color:#758195;margin:16px 12px 0">Please keep this email for your records. Availability, reservation confirmation and payment arrangements are handled by your booking team.</p></td></tr></table></body></html>';
    }

    /** Email table values are plain strings; no stored HTML is ever interpolated. */
    private static function section(string $title, array $rows): string
    {
        $html = '<h2 style="font:24px/1.3 Georgia,serif;color:#10234b;margin:28px 0 10px">' . esc_html($title) . '</h2><table class="email-pair" width="100%" cellpadding="0" cellspacing="0" aria-label="' . esc_attr($title) . '" style="width:100%;border-collapse:collapse">';
        foreach ($rows as $label => $value) {
            $html .= '<tr><th scope="row" align="left" valign="top" width="34%" style="width:34%;font-size:12px;font-weight:600;color:#667085;padding:10px 14px 10px 0;border-bottom:1px solid #edf0f5">' . esc_html($label) . '</th><td valign="top" style="font-size:13px;color:#101828;padding:10px 0;border-bottom:1px solid #edf0f5;word-break:break-word">' . nl2br(esc_html(self::value($value))) . '</td></tr>';
        }
        return $html . '</table>';
    }

    private static function value($value): string
    {
        return is_scalar($value) ? (string) $value : '';
    }

    private static function money($amount, string $currency): string
    {
        $number = is_numeric($amount) && is_finite((float) $amount) ? (float) $amount : 0.0;
        return $currency . ' ' . number_format($number, 2, '.', ',');
    }

    private static function duration($seconds): string
    {
        $minutes = max(0, (int) ceil((float) $seconds / 60));
        return $minutes >= 60 ? (string) intdiv($minutes, 60) . ' hr' . ($minutes % 60 ? ' ' . ($minutes % 60) . ' min' : '') : $minutes . ' min';
    }

    /** Prepare the same authoritative values for rich HTML and plain-text mail. */
    private static function message_data(array $row, array $settings, string $kind): array
    {
        $booking = is_array($row['payload'] ?? null) ? $row['payload'] : [];
        $booking = isset($booking['booking']) && is_array($booking['booking']) ? $booking['booking'] : $booking;
        $trip = is_array($booking['trip'] ?? null) ? $booking['trip'] : [];
        $billing = is_array($booking['billing'] ?? null) ? $booking['billing'] : [];
        $passenger = is_array($booking['passenger'] ?? null) ? $booking['passenger'] : [];
        $pricing = is_array($row['pricing'] ?? null) ? $row['pricing'] : [];
        $route = is_array($row['route'] ?? null) ? $row['route'] : [];
        $currency = self::value($pricing['currency'] ?? $row['currency'] ?? 'USD');
        $status_labels = ['new' => 'Awaiting review', 'reviewing' => 'Being reviewed', 'confirmed' => 'Confirmed', 'cancelled' => 'Cancelled', 'completed' => 'Completed'];
        $status = $status_labels[$row['status'] ?? 'new'] ?? 'Awaiting review';
        $title = $kind === 'admin' ? 'New reservation request' : ($kind === 'update' ? 'Your request has been updated' : 'Thank you, ' . (self::value($billing['first'] ?? '') ?: 'there'));
        $intro = $kind === 'admin' ? 'A new transportation request is ready for your team to review. Check availability and the details below before confirming with the customer.' : ($kind === 'update' ? 'Your booking team has updated your request. Please review the latest itinerary and estimate below, and contact us if anything needs changing.' : 'Your reservation request has been received and is awaiting availability review. Your booking team will contact you about confirmation and payment arrangements.');
        $timezone = self::value($trip['timezone'] ?? wp_timezone_string());
        $journey = ['Service' => ($trip['service'] ?? '') === 'hourly' ? 'Hourly (' . self::value($trip['hours'] ?? '') . ' booked hours)' : 'Transfer', 'Pickup date & time' => trim(self::value($trip['date'] ?? '') . ' ' . self::value($trip['time'] ?? '')) . ' (' . $timezone . ')', 'Pickup location' => $trip['pickup'] ?? ''];
        $waiting = 0;
        foreach (is_array($trip['stops'] ?? null) ? $trip['stops'] : [] as $index => $stop) {
            if (!is_array($stop)) { continue; }
            $wait = (int) ($stop['waitMinutes'] ?? 0); $waiting += $wait;
            $journey['Stop ' . ($index + 1)] = self::value($stop['text'] ?? '') . ' (' . $wait . ' min waiting)';
        }
        $journey += ['Drop-off location' => $trip['dropoff'] ?? '', 'Vehicle' => $row['vehicle_name'] ?? '', 'Passengers / luggage' => self::value($booking['passengers'] ?? '') . ' / ' . self::value($booking['luggage'] ?? ''), 'Driving distance' => number_format((float) ($route['distanceMeters'] ?? 0) / 1000, 1, '.', ',') . ' km / ' . number_format((float) ($route['distanceMeters'] ?? 0) / 1609.344, 1, '.', ',') . ' mi', 'Driving estimate' => self::duration($route['durationSeconds'] ?? 0), 'Stop waiting' => $waiting . ' min', 'Total journey estimate' => self::duration((float) ($route['durationSeconds'] ?? 0) + $waiting * 60)];
        $billing_address = [];
        foreach (['street', 'unit', 'city', 'region', 'zip', 'country'] as $key) { $value = self::value($billing[$key] ?? ''); if ($value !== '') { $billing_address[] = $value; } }
        $contact = ['Booking contact' => trim(self::value($billing['first'] ?? '') . ' ' . self::value($billing['last'] ?? '')), 'Contact email' => $row['customer_email'] ?? $billing['email'] ?? '', 'Contact phone' => $billing['phone'] ?? '', 'Billing address' => implode(', ', $billing_address), 'Primary passenger' => trim(self::value($passenger['first'] ?? '') . ' ' . self::value($passenger['last'] ?? '')), 'Passenger mobile' => $passenger['mobile'] ?? ''];
        if (!empty($billing['company'])) { $contact['Company'] = $billing['company']; }
        if (!empty($passenger['email'])) { $contact['Passenger email'] = $passenger['email']; }
        $additional = [];
        if (!empty($booking['airline'])) { $additional['Airline / operator'] = $booking['airline']; }
        if (!empty($booking['flight'])) { $additional['Flight / tail number'] = $booking['flight']; }
        if ($additional) { $additional['Flight type'] = ($booking['flightType'] ?? '') === 'private' ? 'Private aviation' : 'Commercial'; }
        if (!empty($booking['special'])) { $additional['Special requests'] = $booking['special']; }
        if (!empty($billing['notes'])) { $additional['Billing notes'] = $billing['notes']; }
        $charges = ['Transportation' => self::money($pricing['transportation'] ?? 0, $currency), 'Meet & greet' => self::money($pricing['meet'] ?? 0, $currency), 'Car seats (' . (int) ($booking['carSeats'] ?? 0) . ')' => self::money($pricing['carCost'] ?? 0, $currency), 'Booster seats (' . (int) ($booking['boosterSeats'] ?? 0) . ')' => self::money($pricing['boosterCost'] ?? 0, $currency), !empty($booking['inPerson']) ? 'Gratuity (in person)' : 'Gratuity (' . self::value($pricing['percent'] ?? 0) . '%)' => self::money($pricing['tip'] ?? 0, $currency)];
        $changes = []; $previous_total = '';
        foreach (array_reverse(is_array($row['history'] ?? null) ? $row['history'] : []) as $entry) {
            if (!is_array($entry) || (int) ($entry['revision'] ?? 0) !== (int) ($row['revision'] ?? 1)) { continue; }
            foreach (array_keys(is_array($entry['changes'] ?? null) ? $entry['changes'] : []) as $path) {
                $label = self::change_label((string) $path); if ($label !== '' && !in_array($label, $changes, true)) { $changes[] = $label; }
            }
            $before = is_array($entry['beforePricing'] ?? null) ? $entry['beforePricing'] : [];
            if (isset($before['total']) && ((float) $before['total'] !== (float) ($pricing['total'] ?? 0) || ($before['currency'] ?? $currency) !== $currency)) { $previous_total = self::money($before['total'], self::value($before['currency'] ?? $currency)); }
            break;
        }
        return ['title' => $title, 'intro' => $intro, 'eyebrow' => $kind === 'admin' ? 'New request · action required' : ($kind === 'update' ? 'Reservation update' : 'Reservation request received'), 'preheader' => $title . ' · ' . self::value($row['reference'] ?? '') . ' · ' . self::money($pricing['total'] ?? 0, $currency), 'status' => $status, 'trip' => $journey, 'contact' => $contact, 'additional' => $additional, 'charges' => $charges, 'total' => self::money($pricing['total'] ?? 0, $currency), 'waiting_note' => $waiting > 0 ? 'Transportation includes ' . $waiting . ' min of selected stop waiting (' . self::money($pricing['fare']['waitingCharge'] ?? 0, $currency) . '); it is not charged again below.' : 'No stop waiting has been added to this estimate.', 'changes' => $changes, 'previous_total' => $previous_total];
    }

    /** Never email internal notes, audit actors, tokens or original contact data. */
    private static function change_label(string $path): string
    {
        $path = preg_replace('/^(?:payload\.|booking\.)+/', '', $path);
        $labels = ['trip.pickup' => 'Pickup location', 'trip.dropoff' => 'Drop-off location', 'trip.date' => 'Pickup date', 'trip.time' => 'Pickup time', 'trip.service' => 'Service type', 'trip.hours' => 'Booked hours', 'vehicle' => 'Vehicle', 'vehicle_name' => 'Vehicle', 'passengers' => 'Passenger count', 'luggage' => 'Luggage count', 'meet' => 'Meet & greet', 'child' => 'Child seats', 'carSeats' => 'Car seats', 'boosterSeats' => 'Booster seats', 'gratuity' => 'Gratuity', 'custom' => 'Gratuity', 'inPerson' => 'Gratuity', 'same' => 'Passenger contact', 'special' => 'Special requests', 'flightType' => 'Flight type', 'airline' => 'Airline / operator', 'flight' => 'Flight details', 'status' => 'Request status', 'total' => 'Estimated charges', 'currency' => 'Currency'];
        if (isset($labels[$path])) { return $labels[$path]; }
        foreach (['trip.stops' => 'Journey stops', 'billing.' => 'Billing details', 'passenger.' => 'Passenger contact', 'vehicleSnapshot.' => 'Vehicle', 'pricing.' => 'Estimated charges'] as $prefix => $label) { if (strpos($path, $prefix) === 0) { return $label; } }
        return '';
    }

    public static function plain_text(array $row, array $settings, string $kind): string
    {
        $data = self::message_data($row, $settings, $kind);
        $lines = [self::value($settings['company_name'] ?? 'TUXANO'), $data['title'], '', $data['intro'], '', 'Request reference: ' . self::value($row['reference'] ?? ''), 'Status: ' . $data['status']];
        if ($kind === 'update') {
            $lines[] = 'Revision: ' . (int) ($row['revision'] ?? 1);
            if ($data['changes']) { $lines[] = 'Updated details: ' . implode(', ', $data['changes']); }
            if ($data['previous_total'] !== '') { $lines[] = 'Previous estimate: ' . $data['previous_total']; }
        }
        foreach (['Your journey' => $data['trip'], 'Contacts & billing' => $data['contact'], 'Additional details' => $data['additional'], 'Itemized estimate (not a payment receipt)' => $data['charges']] as $title => $rows) {
            if (!$rows) { continue; }
            $lines[] = ''; $lines[] = $title;
            foreach ($rows as $label => $value) { $lines[] = $label . ': ' . self::value($value); }
        }
        $lines[] = $data['waiting_note']; $lines[] = 'ESTIMATED TOTAL: ' . $data['total'];
        $lines[] = 'No payment has been collected by this email. Driving estimates exclude live traffic.';
        if ($kind === 'admin') { $lines[] = 'Review in WordPress: ' . admin_url('admin.php?page=tuxano-submissions&booking_id=' . (int) $row['id']); }
        $lines[] = ''; $lines[] = 'Contact your booking team and include your request reference.';
        if (!empty($settings['support_email'])) { $lines[] = self::value($settings['support_email']); }
        if (!empty($settings['support_phone'])) { $lines[] = self::value($settings['support_phone']); }
        return implode("\n", $lines);
    }
}
