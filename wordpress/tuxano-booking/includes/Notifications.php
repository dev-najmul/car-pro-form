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
        $settings = Settings::get();
        if (empty($settings['email_customer'])) { return false; }
        $states = $retry ? ['pending', 'failed'] : ['pending'];
        $started = !empty($row['update_mail_started']) ? strtotime($row['update_mail_started'] . ' UTC') : false;
        if ($retry && $state === 'sending' && $started !== false && $started < time() - 10 * MINUTE_IN_SECONDS) { $states[] = 'sending'; }
        if (!in_array($state, $states, true)) { return false; }
        $claim = gmdate('Y-m-d H:i:s');
        $lease = $state === 'sending' ? $wpdb->prepare(' AND update_mail_started = %s', $row['update_mail_started']) : '';
        $claimed = $wpdb->query($wpdb->prepare('UPDATE ' . Database::table() . " SET update_mail = 'sending', update_mail_started = %s WHERE id = %d AND revision = %d AND update_mail_revision = %d AND update_mail = %s", $claim, $id, $revision, $revision, $state) . $lease);
        if ($claimed !== 1) { return false; }
        $recipient = $row['customer_email'];
        $accepted = is_email($recipient) && self::deliver($recipient, self::update_subject($row), $row, $settings, 'update');
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
        elseif ($kind !== 'admin' && is_email($settings['support_email'] ?? '')) { $headers[] = 'Reply-To: ' . $settings['support_email']; }
        $alternative = self::plain_text($row, $settings, $kind);
        $configure = static function ($mailer) use ($subject, $alternative): void {
            if (($mailer->Subject ?? '') === $subject) { $mailer->AltBody = $alternative; }
        };
        add_action('phpmailer_init', $configure, 20);
        try { return (bool) wp_mail($recipient, $subject, self::template($row, $settings, $kind), $headers); }
        catch (\Throwable $error) { return false; }
        finally { remove_action('phpmailer_init', $configure, 20); }
    }

    /** Status announcements remain distinct from a later contact/itinerary edit. */
    private static function status_event(array $row, string $kind): string
    {
        $status = self::value($row['status'] ?? '');
        if ($kind !== 'update' || !in_array($status, ['confirmed', 'cancelled', 'completed'], true)) { return ''; }
        $history = is_array($row['history'] ?? null) ? $row['history'] : [];
        if (!$history) { return $status; }
        foreach (array_reverse($history) as $entry) {
            if (!is_array($entry) || (int) ($entry['revision'] ?? 0) !== (int) ($row['revision'] ?? 1)) { continue; }
            $change = $entry['changes']['status'] ?? null;
            return is_array($change) && ($change['new'] ?? '') === $status && ($change['old'] ?? '') !== $status ? $status : '';
        }
        return '';
    }

    private static function update_subject(array $row): string
    {
        $subjects = ['confirmed' => 'Your reservation is confirmed', 'cancelled' => 'Your reservation has been cancelled', 'completed' => 'Thank you for travelling with us'];
        $event = self::status_event($row, 'update');
        return isset($subjects[$event]) ? $subjects[$event] . ' — ' . self::value($row['reference'] ?? '') : 'Updated transportation request ' . self::value($row['reference'] ?? '') . ' — revision ' . (int) ($row['revision'] ?? 1);
    }

    /** Table layout and inline styles keep the thank-you design usable in mail clients. */
    public static function template(array $row, array $settings, string $kind): string
    {
        $data = self::message_data($row, $settings, $kind);
        $html = self::shell_start($data, $settings);
        $html .= '<h1 class="email-heading" style="font:36px/1.2 Georgia,Times,serif;font-weight:600;color:#0a121f;margin:0 0 18px;word-break:break-word;overflow-wrap:anywhere">' . esc_html($data['title']) . '</h1><p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#475467;word-break:break-word;overflow-wrap:anywhere">' . esc_html($data['intro']) . '</p>';
        $html .= '<p style="margin:0 0 18px;font-size:12px;color:#475467"><strong>Request ID:</strong> ' . esc_html(self::value($row['reference'] ?? '')) . '</p>';
        $html .= self::request_banner($data);
        if ($data['status_event'] !== '') {
            if ($data['status_event'] === 'confirmed') {
                $html .= self::section('Your confirmed journey', array_diff_key($data['summary'], ['Pickup date & time' => true]));
                $html .= self::estimate_total($data['total'], 'ESTIMATED TOTAL');
                $html .= '<p style="margin:15px 0 0;font-size:12px;color:#667085">Estimate · not a payment receipt. Payment instructions will be sent separately.</p>';
            }
            return $html . self::shell_end($settings, $data['status_event']);
        }
        if ($kind === 'update' && $data['changes']) {
            $html .= '<p style="margin:22px 0 0;font-size:12px;color:#475467"><strong>Updated details:</strong> ' . esc_html(implode(' · ', $data['changes'])) . '.</p>';
        }
        if ($kind === 'update' && $data['previous_total'] !== '') {
            $html .= '<p style="margin:10px 0 0;font-size:12px;color:#475467">' . esc_html('Previous estimate: ' . $data['previous_total'] . ' · Updated estimate: ' . $data['total']) . '</p>';
        }
        $html .= self::section('Trip details', $data['trip']);
        $html .= self::vehicle_section($row, $data);
        $html .= self::section('Contact & billing', $data['contact']);
        if ($data['additional']) { $html .= self::section('Additional details', $data['additional']); }
        $html .= '<h2 style="font:700 14px/1.5 Arial,Helvetica,sans-serif;text-transform:uppercase;color:#0a121f;margin:28px 0 5px;padding-top:22px;border-top:1px solid #d8dce4">Pricing summary</h2><p style="margin:0 0 10px;font-size:11px;color:#667085">ESTIMATE · NOT A PAYMENT RECEIPT</p><table width="100%" cellpadding="0" cellspacing="0" aria-label="Estimated charges" style="width:100%;border-collapse:collapse">';
        foreach ($data['charges'] as $label => $value) {
            $html .= '<tr><th scope="row" align="left" style="font-weight:400;padding:9px 10px 9px 0;border-bottom:1px solid #e9ecf1;color:#475467;font-size:13px">' . esc_html($label) . '</th><td align="right" style="padding:9px 0;border-bottom:1px solid #e9ecf1;white-space:nowrap;font-weight:600;color:#0a121f;font-size:13px">' . esc_html($value) . '</td></tr>';
        }
        $html .= '</table><p style="font-size:11px;color:#667085;margin:10px 0 18px">' . esc_html($data['waiting_note']) . '</p>' . self::estimate_total($data['total'], 'ESTIMATED TOTAL');
        $html .= '<p style="font-size:11px;line-height:1.65;color:#667085;margin:14px 0 0">No payment has been collected by this email. Driving estimates exclude live traffic and pickup-date traffic forecasts.</p>';
        if ($kind === 'admin') {
            $html .= '<p style="margin:24px 0 0"><a href="' . esc_url(admin_url('admin.php?page=tuxano-submissions&booking_id=' . (int) ($row['id'] ?? 0))) . '" style="display:inline-block;background:#0a121f;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:4px;padding:12px 22px">Review in WordPress</a></p>';
        } elseif ($kind === 'customer') {
            $html .= '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #d8dce4;border-radius:6px;background:#f5f6f8"><tr><td style="padding:18px 20px"><h2 style="font:700 13px/1.5 Arial,Helvetica,sans-serif;color:#0a121f;margin:0 0 10px">WHAT HAPPENS NEXT?</h2><p style="margin:0;color:#475467;font-size:12px;line-height:1.8">1. We review availability and your reservation details.<br>2. You receive an email with confirmation and any payment instructions.<br>3. Once confirmed, your reservation is secured.</p></td></tr></table>';
        }
        return $html . self::shell_end($settings);
    }

    private static function shell_start(array $data, array $settings): string
    {
        $company = self::value($settings['company_name'] ?? 'TUXANO');
        $logo = Settings::email_logo_url($settings);
        $brand = $logo !== ''
            ? '<img src="' . esc_url($logo) . '" width="240" alt="' . esc_attr($company . ' — Private Transportation') . '" style="display:block;border:0;width:240px;max-width:100%;height:auto;color:#ffffff;font:22px Georgia,serif">'
            : '<div style="font:26px/1.3 Georgia,serif;letter-spacing:4px;color:#ffffff">' . esc_html($company) . '</div>';
        return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' . esc_html($data['title']) . '</title><style>@media only screen and (max-width:600px){.email-shell{width:100%!important}.email-content{padding:24px 20px!important}.email-heading{font-size:29px!important}.email-pair th,.email-pair td,.email-banner-column,.email-vehicle-column{display:block!important;width:auto!important}.email-pair th{padding-bottom:0!important}.email-pair td{padding-top:3px!important}.email-banner-column+.email-banner-column{padding-top:14px!important}.email-vehicle-column+.email-vehicle-column{padding:12px 0 0!important}.email-outer{padding:0!important}}</style></head><body style="margin:0;padding:0;background:#f2f4f7;color:#0a121f;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;-webkit-text-size-adjust:100%"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' . esc_html($data['preheader']) . '</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f2f4f7"><tr><td class="email-outer" align="center" style="padding:24px 12px"><table class="email-shell" role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;border-collapse:collapse;background:#ffffff"><tr><td class="email-content" bgcolor="#0a121f" style="padding:28px 32px;background:#0a121f">' . $brand . '</td></tr><tr><td class="email-content" style="padding:30px 32px">';
    }

    private static function request_banner(array $data): string
    {
        $titles = ['confirmed' => 'Reservation confirmed', 'cancelled' => 'Reservation cancelled', 'completed' => 'Journey completed'];
        $title = $titles[$data['status_event']] ?? ($data['admin'] ? 'New reservation request' : ($data['update'] ? 'Reservation updated' : 'Reservation request received'));
        $html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border:1px solid #d8dce4;border-radius:6px;background:#f5f6f8"><tr><td style="padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td class="email-banner-column" valign="top" style="padding:0 18px 0 0"><strong style="display:block;color:#0a121f;font-size:15px">' . esc_html($title) . '</strong><span style="display:block;margin-top:4px;font-size:12px;color:#667085">' . esc_html('Status: ' . $data['status']) . '</span></td>';
        if (!in_array($data['status_event'], ['cancelled', 'completed'], true)) {
            $html .= '<td class="email-banner-column" valign="top" width="44%" style="width:44%;padding:0"><span style="display:block;font-size:11px;color:#667085">Pickup date &amp; time</span><strong style="display:block;color:#0a121f;font-size:13px">' . esc_html($data['pickup_display']) . '</strong></td>';
        }
        return $html . '</tr></table></td></tr></table>';
    }

    private static function estimate_total(string $total, string $label): string
    {
        return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border:1px solid #d8dce4;border-radius:6px;background:#f5f6f8"><tr><td align="center" style="padding:20px 18px"><span style="display:block;font-size:11px;font-weight:700;color:#0a121f">' . esc_html($label) . '</span><strong style="display:block;margin:8px 0;font:34px/1.25 Georgia,Times,serif;color:#0a121f">' . esc_html($total) . '</strong><span style="font-size:11px;color:#475467">All-inclusive estimate</span></td></tr></table>';
    }

    private static function vehicle_section(array $row, array $data): string
    {
        $booking = is_array($row['payload']['booking'] ?? null) ? $row['payload']['booking'] : ($row['payload'] ?? []);
        $snapshot = is_array($booking['vehicleSnapshot'] ?? null) ? $booking['vehicleSnapshot'] : [];
        $image = esc_url(self::value($snapshot['image'] ?? ''), ['http', 'https']);
        $html = '<h2 style="font:700 14px/1.5 Arial,Helvetica,sans-serif;text-transform:uppercase;color:#0a121f;margin:28px 0 12px;padding-top:22px;border-top:1px solid #d8dce4">Vehicle selected</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr>';
        if ($image !== '') { $html .= '<td class="email-vehicle-column" valign="top" width="172" style="width:172px;padding:0 18px 0 0"><img src="' . $image . '" width="154" alt="' . esc_attr(self::value($row['vehicle_name'] ?? 'Selected vehicle')) . '" style="display:block;border:0;width:154px;max-width:100%;height:auto"></td>'; }
        $html .= '<td class="email-vehicle-column" valign="middle" style="padding:0"><strong style="display:block;color:#0a121f;font-size:14px">' . esc_html(self::value($row['vehicle_name'] ?? '')) . '</strong>';
        $models = array_filter(array_map([self::class, 'value'], is_array($snapshot['models'] ?? null) ? $snapshot['models'] : []));
        if ($models) { $html .= '<p style="margin:6px 0;color:#475467;font-size:12px">' . esc_html(implode(' / ', $models)) . '</p>'; }
        if (isset($snapshot['capacity'], $snapshot['luggageCapacity'])) { $html .= '<p style="margin:6px 0 0;color:#667085;font-size:11px">' . esc_html('Up to ' . (int) $snapshot['capacity'] . ' passengers · Up to ' . (int) $snapshot['luggageCapacity'] . ' bags') . '</p>'; }
        return $html . '</td></tr></table>';
    }

    private static function shell_end(array $settings, string $event = ''): string
    {
        $company = self::value($settings['company_name'] ?? 'TUXANO');
        $support = [];
        if (is_email($settings['support_email'] ?? '')) { $support[] = '<a style="color:#ffffff;text-decoration:underline" href="mailto:' . esc_attr($settings['support_email']) . '">' . esc_html($settings['support_email']) . '</a>'; }
        if (!empty($settings['support_phone'])) { $support[] = esc_html(self::value($settings['support_phone'])); }
        $website = esc_url(self::value($settings['website'] ?? ''), ['http', 'https']);
        if ($website !== '') { $support[] = '<a style="color:#ffffff;text-decoration:underline" href="' . $website . '">' . esc_html(preg_replace('~^https?://~i', '', self::value($settings['website']))) . '</a>'; }
        $closing = $event === 'completed' ? 'Thank you for choosing ' . $company . '. We look forward to your next journey with us.' : ($event === 'cancelled' ? 'Questions about this cancellation or need help with another journey? Contact us and include your request ID.' : 'Questions or changes? Contact us and include your request ID.');
        return '<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #d8dce4;color:#475467;font-size:12px;line-height:1.7">' . esc_html($closing) . '</p></td></tr><tr><td class="email-content" bgcolor="#0a121f" style="padding:22px 32px;background:#0a121f;color:#ffffff"><strong style="display:block;font-size:13px;letter-spacing:2px;color:#ffffff">' . esc_html($company) . '</strong>' . ($support ? '<p style="margin:9px 0 0;font-size:12px;line-height:1.8;color:#ffffff;word-break:break-word;overflow-wrap:anywhere">' . implode(' &nbsp;·&nbsp; ', $support) . '</p>' : '') . '</td></tr></table></td></tr></table></body></html>';
    }

    /** Email table values are plain strings; no stored HTML is ever interpolated. */
    private static function section(string $title, array $rows): string
    {
        $html = '<h2 style="font:700 14px/1.5 Arial,Helvetica,sans-serif;text-transform:uppercase;color:#0a121f;margin:28px 0 10px;padding-top:22px;border-top:1px solid #d8dce4">' . esc_html($title) . '</h2><table class="email-pair" width="100%" cellpadding="0" cellspacing="0" aria-label="' . esc_attr($title) . '" style="width:100%;border-collapse:collapse">';
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
        $journey += ['Drop-off location' => $trip['dropoff'] ?? '', 'Passengers / luggage' => self::value($booking['passengers'] ?? '') . ' / ' . self::value($booking['luggage'] ?? ''), 'Driving distance' => number_format((float) ($route['distanceMeters'] ?? 0) / 1000, 1, '.', ',') . ' km / ' . number_format((float) ($route['distanceMeters'] ?? 0) / 1609.344, 1, '.', ',') . ' mi', 'Driving estimate' => self::duration($route['durationSeconds'] ?? 0), 'Stop waiting' => $waiting . ' min', 'Total journey estimate' => self::duration((float) ($route['durationSeconds'] ?? 0) + $waiting * 60)];
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
        $event = self::status_event($row, $kind);
        $first_name = self::value($billing['first'] ?? '') ?: 'there';
        if ($event === 'confirmed') {
            $title = 'Your reservation is confirmed';
            $intro = 'Thank you, ' . $first_name . '. Your reservation has been confirmed. We look forward to welcoming you on board.';
        } elseif ($event === 'cancelled') {
            $title = 'Your request has been cancelled';
            $intro = 'Sorry, ' . $first_name . ', your reservation request has been cancelled. If you have any questions or would like help arranging another journey, please contact our team.';
        } elseif ($event === 'completed') {
            $title = 'Thank you for travelling with us';
            $intro = 'Thank you, ' . $first_name . ', for choosing us for your journey. We hope you enjoyed your trip and look forward to welcoming you again.';
        }
        $pickup_display = trim(self::value($trip['date'] ?? '') . ' ' . self::value($trip['time'] ?? '')) . ' (' . $timezone . ')';
        $summary = ['Pickup date & time' => $pickup_display, 'Pickup location' => $trip['pickup'] ?? '', 'Drop-off location' => $trip['dropoff'] ?? '', 'Vehicle' => $row['vehicle_name'] ?? ''];
        return ['status_event' => $event, 'admin' => $kind === 'admin', 'update' => $kind === 'update', 'pickup_display' => $pickup_display, 'summary' => $summary, 'title' => $title, 'intro' => $intro, 'eyebrow' => $kind === 'admin' ? 'New request · action required' : ($kind === 'update' ? 'Reservation update' : 'Reservation request received'), 'preheader' => $title . ' · ' . self::value($row['reference'] ?? '') . (in_array($event, ['cancelled', 'completed'], true) ? '' : ' · ' . self::money($pricing['total'] ?? 0, $currency)), 'status' => $status, 'trip' => $journey, 'contact' => $contact, 'additional' => $additional, 'charges' => $charges, 'total' => self::money($pricing['total'] ?? 0, $currency), 'waiting_note' => $waiting > 0 ? 'Transportation includes ' . $waiting . ' min of selected stop waiting (' . self::money($pricing['fare']['waitingCharge'] ?? 0, $currency) . '); it is not charged again below.' : 'No stop waiting has been added to this estimate.', 'changes' => $changes, 'previous_total' => $previous_total];
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
        if ($data['status_event'] !== '') {
            if ($data['status_event'] === 'confirmed') {
                $lines[] = '';
                foreach ($data['summary'] as $label => $value) { $lines[] = $label . ': ' . self::value($value); }
                $lines[] = 'ESTIMATED TOTAL: ' . $data['total'];
                $lines[] = 'Estimate, not a payment receipt. Payment instructions will be sent separately.';
            }
            $lines[] = '';
            $lines[] = $data['status_event'] === 'completed' ? 'We look forward to your next journey with us.' : 'Questions or changes? Contact us and include your request ID.';
            if (!empty($settings['support_email'])) { $lines[] = self::value($settings['support_email']); }
            if (!empty($settings['support_phone'])) { $lines[] = self::value($settings['support_phone']); }
            return implode("\n", $lines);
        }
        if ($kind === 'update') {
            $lines[] = 'Revision: ' . (int) ($row['revision'] ?? 1);
            if ($data['changes']) { $lines[] = 'Updated details: ' . implode(', ', $data['changes']); }
            if ($data['previous_total'] !== '') { $lines[] = 'Previous estimate: ' . $data['previous_total']; }
        }
        foreach (['Your journey' => $data['trip'] + ['Vehicle' => self::value($row['vehicle_name'] ?? '')], 'Contacts & billing' => $data['contact'], 'Additional details' => $data['additional'], 'Itemized estimate (not a payment receipt)' => $data['charges']] as $title => $rows) {
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
