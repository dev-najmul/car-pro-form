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
            $headers = ['Content-Type: text/html; charset=UTF-8'];
            $from = $settings['from_email'];
            if (is_email($from)) { $headers[] = 'From: ' . sanitize_text_field($settings['sender_name']) . ' <' . $from . '>'; }
            if ($kind === 'admin') { $headers[] = 'Reply-To: ' . $row['customer_email']; }
            try { $accepted = wp_mail($recipient, $subject . $row['reference'], self::template($row, $settings, $kind), $headers); }
            catch (\Throwable $error) { $accepted = false; }
            $wpdb->update(Database::table(), [$column => $accepted ? 'accepted' : 'failed'], ['id' => $id, $started_column => $claim_time]);
        }
    }

    public static function template(array $row, array $settings, string $kind): string
    {
        $booking = $row['payload']; $trip = $booking['trip']; $pricing = $row['pricing'];
        $title = $kind === 'admin' ? 'New reservation request' : 'Thank you, ' . $booking['billing']['first'];
        $rows = [
            'Request reference' => $row['reference'], 'Pickup date and time' => $trip['date'] . ' ' . $trip['time'] . ' (' . wp_timezone_string() . ')',
            'Pickup' => $trip['pickup'], 'Destination' => $trip['dropoff'], 'Vehicle' => $row['vehicle_name'],
            'Service' => $trip['service'] === 'hourly' ? 'Hourly (' . $trip['hours'] . ' hours)' : 'Transfer',
            'Passengers / bags' => $booking['passengers'] . ' / ' . $booking['luggage'],
            'Driving distance' => number_format_i18n($row['route']['distanceMeters'] / 1000, 1) . ' km',
        ];
        foreach ($trip['stops'] as $index => $stop) { $rows['Stop ' . ($index + 1)] = $stop['text'] . ' (' . $stop['waitMinutes'] . ' minutes waiting)'; }
        if ($kind === 'admin') {
            $rows['Booking contact'] = $row['customer_name'] . ' / ' . $booking['billing']['phone'] . ' / ' . $row['customer_email'];
            $rows['Passenger contact'] = $booking['passenger']['first'] . ' ' . $booking['passenger']['last'] . ' / ' . $booking['passenger']['mobile'];
            $rows['Special requests'] = $booking['special'] ?: 'None';
        }
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;background:#f4f6fa;color:#0b1220;font:16px/1.6 Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px"><table role="presentation" width="100%" style="max-width:640px;background:#fff;border:1px solid #d8deea"><tr><td style="padding:28px;background:#10265a;color:white"><strong>' . esc_html($settings['company_name']) . '</strong><h1 style="font-size:24px;margin:12px 0 0">' . esc_html($title) . '</h1></td></tr><tr><td style="padding:28px"><p>Your reservation request has been received and is awaiting availability review. This email does not confirm a reservation or collect payment.</p><table role="presentation" width="100%" style="border-collapse:collapse">';
        foreach ($rows as $label => $value) { $html .= '<tr><th align="left" valign="top" style="padding:8px;border-bottom:1px solid #e5e7ed;font-size:13px">' . esc_html($label) . '</th><td style="padding:8px;border-bottom:1px solid #e5e7ed">' . esc_html($value) . '</td></tr>'; }
        foreach (['transportation' => 'Transportation', 'seats' => 'Child seats', 'meet' => 'Meet & greet', 'tip' => 'Gratuity', 'total' => 'Estimated total'] as $key => $label) {
            $html .= '<tr><th align="left" style="padding:8px">' . esc_html($label) . '</th><td style="padding:8px">' . esc_html($pricing['currency'] . ' ' . number_format((float) $pricing[$key], 2, '.', ',')) . '</td></tr>';
        }
        $html .= '</table><p>Route duration is a baseline estimate; live traffic is not included. Please contact us for changes or questions.</p>';
        if ($kind === 'admin') { $html .= '<p><a href="' . esc_url(admin_url('admin.php?page=tuxano-submissions&booking_id=' . (int) $row['id'])) . '">Review in WordPress</a></p>'; }
        if (is_email($settings['support_email'])) { $html .= '<p><a href="mailto:' . esc_attr($settings['support_email']) . '">' . esc_html($settings['support_email']) . '</a></p>'; }
        return $html . '</td></tr></table></td></tr></table></body></html>';
    }
}
