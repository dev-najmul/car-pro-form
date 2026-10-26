<?php
/**
 * Administrative edit, notification and control regressions in real WordPress.
 * Run only against a disposable WP_ENVIRONMENT_TYPE=local installation:
 * wp eval-file tests/wordpress-updates.php
 * HTTP and mail are intercepted. Fixture records/options/users are restored.
 */

use Tuxano\Booking\Admin;
use Tuxano\Booking\BookingUpdates;
use Tuxano\Booking\Countries;
use Tuxano\Booking\Database;
use Tuxano\Booking\Notifications;
use Tuxano\Booking\Pricing;
use Tuxano\Booking\Rest;
use Tuxano\Booking\Settings;
use Tuxano\Booking\Vehicles;

if (!defined('WP_CLI') || !WP_CLI) {
    exit('Run using WP-CLI in an isolated WordPress test installation.');
}
if (wp_get_environment_type() !== 'local') {
    WP_CLI::error('These fixture tests run only in an isolated local WordPress installation.');
}

global $wpdb;
$checks = 0;
$check = static function (bool $condition, string $message) use (&$checks): void {
    if (!$condition) { throw new RuntimeException($message); }
    ++$checks;
};
$error = static function ($result, int $status, string $message) use ($check): void {
    $check(is_wp_error($result) && (int) ($result->get_error_data()['status'] ?? 0) === $status, $message);
};
$original_user = get_current_user_id();
$original_settings = get_option(Settings::OPTION, null);
$original_post = $_POST;
$original_request = $_REQUEST;
$original_remote = $_SERVER['REMOTE_ADDR'] ?? null;
$rate_snapshot = $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%'), OBJECT_K);
$fixture_ids = [];
$fixture_users = [];
$session_names = [];
$vehicle_id = 0;
$mail = [];
$mail_result = true;
$provider_calls = [];
$provider_mode = 'ok';
$during_provider = null;
$run = 'updates_' . bin2hex(random_bytes(8));
$route_key = 'updates_routes_key_123456789012345';
$provider_key = $route_key;
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
$check(!empty($admins), 'An administrator must exist in the isolated installation.');
$admin_id = (int) $admins[0];
$reference = 'TUX-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(6)));
$request_key = $run . '_received';
$site = wp_parse_url(home_url('/'));
$origin = $site['scheme'] . '://' . $site['host'] . (isset($site['port']) ? ':' . $site['port'] : '');
$admin_request = static function (string $path, array $body = [], string $nonce = '', array $headers = [], ?string $raw = null) use ($origin): WP_REST_Response {
    $request = new WP_REST_Request('POST', '/tuxano-booking/v1/' . $path);
    foreach (array_replace(['Origin' => $origin, 'Sec-Fetch-Site' => 'same-origin', 'Content-Type' => 'application/json'], $headers) as $name => $value) { $request->set_header($name, $value); }
    if ($nonce !== '') { $request->set_header('X-WP-Nonce', $nonce); }
    $request->set_body($raw ?? wp_json_encode($body));
    return rest_do_request($request);
};

$http_mock = static function ($preempt, array $args, string $url) use (&$provider_calls, &$provider_mode, &$provider_key, &$during_provider, $check) {
    $provider_calls[] = ['url' => $url, 'args' => $args];
    $check($url === 'https://routes.googleapis.com/directions/v2:computeRoutes', 'Administrative provider calls must use the fixed Google Routes URL.');
    $check(($args['headers']['X-Goog-Api-Key'] ?? '') === $provider_key && ($args['headers']['X-Goog-FieldMask'] ?? '') === 'routes.distanceMeters,routes.duration', 'Admin route measurements must keep the server key private and request only bounded metrics.');
    $check(($args['sslverify'] ?? true) === true && $args['timeout'] <= 15 && $args['redirection'] === 0 && $args['limit_response_size'] === 262144, 'Administrative Google calls must preserve TLS verification and resource bounds.');
    if (is_callable($during_provider)) { $once = $during_provider; $during_provider = null; $once(); }
    if ($provider_mode === 'unavailable') { return new WP_Error('fixture_outage', 'Deterministic network outage.'); }
    $body = $provider_mode === 'malformed' ? ['routes' => [['distanceMeters' => 1, 'duration' => '-1s']]] : ['routes' => [['distanceMeters' => 32186.88, 'duration' => '1800s']]];
    return ['headers' => [], 'response' => ['code' => $provider_mode === 'denied' ? 403 : 200, 'message' => 'Fixture'], 'body' => wp_json_encode($body), 'cookies' => []];
};
$mail_mock = static function ($preempt, array $args) use (&$mail, &$mail_result, $reference, $check): bool {
    global $wpdb;
    $id = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . Database::table() . ' WHERE reference=%s', $reference));
    $row = Database::find($id);
    $check($row !== null && $row['update_mail'] === 'sending' && (int) $row['update_mail_revision'] === (int) $row['revision'], 'Customer update mail must claim the current durable revision before transport.');
    $mail[] = ['args' => $args, 'revision' => (int) $row['revision'], 'total' => (float) $row['total'], 'customer' => $row['customer_email']];
    return $mail_result;
};

try {
    wp_set_current_user($admin_id);
    $_SERVER['REMOTE_ADDR'] = '198.51.100.' . random_int(1, 254);
    $check(count(Countries::all()) === 249 && Countries::normalize('US') === 'United States' && Countries::normalize('Bangladesh') === 'Bangladesh', 'Billing countries must include all ISO territories and normalize legacy codes without losing valid names.');
    $check(Countries::normalize('ZZ') === null && Countries::normalize('Unknown Republic') === null, 'Unknown billing country codes and invented names must not be accepted.');
    $check(Settings::save(['routes_key' => $route_key, 'browser_key' => 'updates_browser_key_123456789012345', 'admin_email' => 'updates-admin@example.test', 'email_customer' => true, 'email_admin' => true, 'currency' => 'USD', 'meet_price' => 50, 'first_seat_price' => 75, 'additional_seat_price' => 50, 'default_gratuity' => 20, 'min_hours' => 1, 'max_hours' => 24, 'max_stops' => 5]) === true, 'Isolated administrative fixture settings must save.');
    $vehicle_result = wp_insert_post(['post_type' => Vehicles::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Administrative fixture vehicle ' . $run], true);
    $check(!is_wp_error($vehicle_result) && $vehicle_result > 0, 'An isolated editable vehicle must be creatable.');
    $vehicle_id = (int) $vehicle_result;
    $meta = ['display' => 'Administrative fixture SUV', 'capacity' => 6, 'luggageCapacity' => 6, 'image' => 'https://example.test/vehicle.png', 'models' => ['Fixture model'], 'features' => ['Fixture feature'], 'tariff' => ['base' => 65, 'perMile' => 2, 'perDrivingMinute' => 3, 'minimum' => 100, 'perWaitingMinute' => 1, 'hourly' => 95]];
    update_post_meta($vehicle_id, '_tuxano_vehicle_data', $meta);
    $vehicle = Vehicles::find((string) $vehicle_id);
    $check($vehicle !== null, 'The isolated vehicle must be bookable.');
    $save_vehicle = static function (array $input) use ($vehicle_id): void {
        $_POST = ['tuxano_vehicle_nonce' => wp_create_nonce('tuxano_save_vehicle_' . $vehicle_id), 'tuxano_vehicle' => wp_slash($input)];
        Vehicles::save_meta($vehicle_id, get_post($vehicle_id), true);
    };
    $none = $meta; $none['collection'] = '0'; $none['tariff']['base'] = ''; $none['disabled_tariff'] = ['perMile' => '1'];
    $save_vehicle($none);
    $none_saved = get_post_meta($vehicle_id, '_tuxano_vehicle_data', true);
    $check($none_saved['tariff']['base'] === 0.0 && $none_saved['tariff']['perMile'] === 0.0 && $none_saved['tariff']['perDrivingMinute'] === 3.0, 'Blank and explicitly disabled fare components must mean not charged while preserving other rates.');
    $all_none = $meta; $all_none['collection'] = '0'; unset($all_none['tariff']); $all_none['disabled_tariff'] = array_fill_keys(array_keys($meta['tariff']), '1');
    $save_vehicle($all_none);
    $all_none_saved = get_post_meta($vehicle_id, '_tuxano_vehicle_data', true);
    $check($all_none_saved['tariff'] === array_fill_keys(array_keys($meta['tariff']), 0.0), 'All components may be zero only when the administrator explicitly disables every one.');
    $zero_price = Pricing::calculate(Vehicles::find((string) $vehicle_id), ['distanceMeters' => 10000, 'durationSeconds' => 600], ['trip' => ['service' => 'transfer', 'stops' => []]], Settings::get());
    $check($zero_price['transportation'] === 0.0 && $zero_price['total'] === 0.0, 'Explicit no-charge components must calculate as numeric zero, never missing/NaN values.');
    $missing_rates = $meta; $missing_rates['collection'] = '0'; unset($missing_rates['tariff']['base']);
    $save_vehicle($missing_rates);
    $check(get_post_meta($vehicle_id, '_tuxano_vehicle_data', true) === $all_none_saved, 'An accidentally omitted non-disabled fare must not overwrite valid stored rates.');
    $invalid_none = $meta; $invalid_none['collection'] = '0'; $invalid_none['disabled_tariff'] = ['base' => ['unexpected']];
    $save_vehicle($invalid_none);
    $check(get_post_meta($vehicle_id, '_tuxano_vehicle_data', true) === $all_none_saved, 'Malformed no-charge switches must not alter saved rates.');
    update_post_meta($vehicle_id, '_tuxano_vehicle_data', $meta); $_POST = [];
    $vehicle = Vehicles::find((string) $vehicle_id);
    $route = ['distanceMeters' => 16093.44, 'durationSeconds' => 1200, 'provider' => 'google', 'calculatedAt' => gmdate('c')];
    $booking = [
        'trip' => ['service' => 'transfer', 'hours' => 3, 'date' => '2024-03-01', 'time' => '12:00', 'pickup' => 'Original pickup, United States', 'dropoff' => 'Original destination, United States', 'pickupPlace' => ['placeId' => 'ChIJ_Updates_Pickup', 'countryCode' => 'US'], 'dropoffPlace' => ['placeId' => 'ChIJ_Updates_Destination', 'countryCode' => 'US'], 'stops' => [['text' => 'Original stop, United States', 'waitMinutes' => 30, 'place' => ['placeId' => 'ChIJ_Updates_Stop', 'countryCode' => 'US']]]],
        'vehicle' => (string) $vehicle_id, 'passengers' => 3, 'luggage' => 2, 'meet' => true, 'child' => true, 'carSeats' => 2, 'boosterSeats' => 1, 'inPerson' => false, 'same' => true, 'consent' => true, 'gratuity' => 'custom', 'custom' => 12.5,
        'billing' => ['first' => 'Original & Customer', 'last' => 'Updates fixture', 'email' => $run . '@example.test', 'phone' => '+1 717 555 0100', 'company' => 'Original company', 'street' => '123 Fixture Street', 'unit' => '', 'city' => 'Fixture City', 'region' => 'PA', 'zip' => '17000', 'country' => 'US', 'notes' => 'Customer-visible billing note'],
        'passenger' => ['first' => 'Original & Customer', 'last' => 'Updates fixture', 'email' => $run . '@example.test', 'mobile' => '+1 717 555 0100'], 'flightType' => 'commercial', 'airline' => 'Fixture Airline', 'flight' => 'FX123', 'special' => 'Original special request', 'vehicleSnapshot' => $vehicle,
    ];
    $pricing = Pricing::calculate($vehicle, $route, $booking, Settings::get());
    $check($pricing['transportation'] === 175.0 && $pricing['tip'] === 21.88 && $pricing['total'] === 421.88, 'Independent fixture fare must be 175 transportation + 175 seats + 50 meet + 21.88 gratuity.');
    wp_set_current_user(0);
    $session_response = $admin_request('session');
    $session_data = $session_response->get_data();
    $check($session_response->get_status() === 200 && preg_match('/^[a-f0-9]{64}$/D', $session_data['token'] ?? '') === 1, 'An original visitor session must be created for retry-after-edit verification.');
    $visitor_token = $session_data['token'];
    $session_name = 'tuxano_session_' . hash('sha256', $visitor_token); $session_names[] = $session_name;
    $visitor_session = get_transient($session_name); $visitor_session['created'] = time() - 3; set_transient($session_name, $visitor_session, 2 * HOUR_IN_SECONDS);
    wp_set_current_user($admin_id);
    $id = Database::insert(['reference' => $reference, 'request_key' => hash_hmac('sha256', $request_key, wp_salt('secure_auth')), 'request_hash' => hash('sha256', $visitor_token . wp_json_encode($booking)), 'status' => 'new', 'created_at' => current_time('mysql', true), 'pickup_at' => '2024-03-01 12:00:00', 'customer_name' => 'Original & Customer Updates fixture', 'customer_email' => $booking['billing']['email'], 'vehicle_name' => $vehicle['display'], 'total' => $pricing['total'], 'currency' => 'USD', 'payload' => wp_json_encode($booking), 'pricing' => wp_json_encode($pricing), 'route' => wp_json_encode($route), 'notes' => 'Original private note', 'customer_mail' => 'accepted', 'admin_mail' => 'accepted']);
    $check(!is_wp_error($id), 'A durable historical fixture booking must save.');
    $id = (int) $id; $fixture_ids[] = $id;
    $initial = Database::find($id);
    $revision = BookingUpdates::revision($initial);
    $check($revision === '1', 'Existing/migrated bookings must begin with revision one.');
    add_filter('pre_http_request', $http_mock, 10, 3);
    add_filter('pre_wp_mail', $mail_mock, 10, 2);

    // Trap WordPress's response boundary before the handlers' redirect/exit,
    // so a missing nonce check fails the assertion without abandoning fixtures.
    $rejected_handler = static function (callable $handler, array $post, int $user, string $message) use ($check): void {
        $previous_user = get_current_user_id(); $previous_post = $_POST; $previous_request = $_REQUEST;
        $stopped_on_die = false;
        $die = static function () use (&$stopped_on_die) {
            return static function () use (&$stopped_on_die): void { $stopped_on_die = true; throw new RuntimeException('Expected fixture wp_die boundary.'); };
        };
        $redirect = static function (): void { throw new RuntimeException('Unexpected fixture redirect boundary.'); };
        add_filter('wp_die_handler', $die, 999);
        add_filter('wp_redirect', $redirect, 999);
        try {
            wp_set_current_user($user); $_POST = $post; $_REQUEST = $post;
            $handler();
        } catch (RuntimeException $expected) {
            // Only the explicit wp_die flag establishes a rejected request.
        } finally {
            remove_filter('wp_die_handler', $die, 999); remove_filter('wp_redirect', $redirect, 999);
            $_POST = $previous_post; $_REQUEST = $previous_request; wp_set_current_user($previous_user);
        }
        $check($stopped_on_die, $message);
    };
    $rejected_handler([Admin::class, 'edit_booking'], ['booking_id' => (string) $id, '_wpnonce' => 'invalid-fixture-nonce'], $admin_id, 'The native edit handler must reject an invalid WordPress nonce.');
    $rejected_handler([Admin::class, 'bulk_bookings'], ['booking_ids' => [(string) $id], 'bulk_action' => 'delete', '_wpnonce' => 'invalid-fixture-nonce'], $admin_id, 'The native bulk-delete handler must reject an invalid WordPress nonce.');
    $check(Database::find($id) === $initial && !$mail, 'Rejected admin nonces must not edit/delete the selected request or send mail.');

    wp_set_current_user(0);
    $error(BookingUpdates::save($id, $booking, $revision, 'confirmed', '', true), 403, 'Anonymous callers must not edit private requests or trigger update email.');
    $subscriber = wp_insert_user(['user_login' => 'tuxano-updates-' . wp_generate_password(10, false), 'user_pass' => wp_generate_password(30, true), 'role' => 'subscriber']);
    $check(!is_wp_error($subscriber), 'A subscriber fixture must exist for capability checks.');
    $fixture_users[] = (int) $subscriber;
    wp_set_current_user((int) $subscriber);
    $error(BookingUpdates::save($id, $booking, $revision, 'confirmed', '', true), 403, 'Subscriber capability must not permit private request edits.');
    wp_set_current_user($admin_id);
    $check(Database::find($id) === $initial && !$mail && !$provider_calls, 'Rejected permissions must preserve all request data and avoid transport/provider work.');

    foreach ([
        ['billing' => ['email' => 'not-an-email']], ['billing' => ['phone' => '12']], ['billing' => ['country' => 'ZZ']], ['billing' => ['country' => 'Unknown Republic']], ['trip' => ['date' => '2024-02-30']], ['trip' => ['time' => '25:00']],
        ['passengers' => 7], ['luggage' => 7], ['carSeats' => 7], ['custom' => 101], ['trip' => ['stops' => [['text' => 'Stop', 'waitMinutes' => 7, 'place' => $booking['trip']['stops'][0]['place']]]]],
        ['trip' => ['dropoffPlace' => ['placeId' => 'bad?query']]], ['trip' => ['dropoffPlace' => ['placeId' => 'ChIJ_Updates_Destination', 'countryCode' => 'CA']]],
    ] as $invalid) {
        $error(BookingUpdates::save($id, array_replace_recursive($booking, $invalid), $revision, 'new', '', false), 400, 'Invalid administrative fields must be rejected without replacing a valid request.');
        $check(BookingUpdates::revision(Database::find($id)) === $revision, 'Rejected administrative fields must not advance the revision.');
    }
    $error(BookingUpdates::save($id, $booking, $revision, 'invented', '', false), 400, 'Unknown request statuses must fail validation.');
    $check(!$mail && !$provider_calls, 'Field validation failures must not send mail or measure a route.');

    Settings::save(['default_gratuity' => 24]);
    $legacy_tip = $booking; $legacy_tip['gratuity'] = '23';
    $legacy_points = Rest::booking_points($legacy_tip, true);
    [$legacy_clean] = Rest::validate_booking($legacy_tip, ['points' => $legacy_points], true, $vehicle);
    $check($legacy_clean['gratuity'] === '23', 'Administrative historical edits must retain a previously valid gratuity even if current presets/default changed.');
    $legacy_tip['trip']['date'] = wp_date('Y-m-d', time() + 2 * DAY_IN_SECONDS);
    $public_tip_rejected = false;
    try { Rest::validate_booking($legacy_tip, ['points' => $legacy_points]); }
    catch (InvalidArgumentException $expected) { $public_tip_rejected = true; }
    $check($public_tip_rejected, 'Historical administrator gratuity support must not relax public submission presets.');
    Settings::save(['default_gratuity' => 20]);

    // New business prices must not silently alter a historical contact-only edit.
    $changed_meta = $meta; $changed_meta['tariff']['perMile'] = 5;
    update_post_meta($vehicle_id, '_tuxano_vehicle_data', $changed_meta);
    Settings::save(['meet_price' => 70]);
    $check(Settings::save(['max_stops' => 0, 'min_hours' => 4]) === true, 'An administrator may narrow current booking bounds after a historical request was accepted.');
    $edited = $booking;
    $edited['billing']['first'] = 'Changed & Customer';
    $edited['billing']['email'] = $run . '-updated@example.test';
    $edited['billing']['company'] = 'Updated company';
    $edited['billing']['region'] = ''; $edited['billing']['zip'] = '';
    $edited['special'] = 'Updated special request';
    $edited['total'] = 0.01; $edited['pricing'] = ['total' => 0.01]; $edited['route'] = ['distanceMeters' => 0, 'durationSeconds' => 0];
    $edited['vehicleSnapshot'] = ['tariff' => ['base' => 0]];
    $private_note = 'PRIVATE_DISPATCH_ONLY_' . $run;
    $updated = BookingUpdates::save($id, $edited, $revision, 'confirmed', $private_note, true);
    $check(!is_wp_error($updated) && (int) $updated['revision'] === 2, 'An authorized historical contact edit must save a new revision.');
    $check((float) $updated['total'] === 421.88 && (float) $updated['pricing']['transportation'] === 175.0 && $updated['route'] === $route, 'Contact-only edits must preserve the existing measured route and historical price despite current tariff changes and forged totals.');
    $check($updated['payload']['billing']['first'] === 'Changed & Customer' && $updated['payload']['passenger']['first'] === 'Changed & Customer' && $updated['customer_email'] === $edited['billing']['email'], 'Saved contact and same-as-billing passenger data must normalize to the updated customer.');
    $check($updated['payload']['billing']['country'] === 'United States' && $updated['payload']['billing']['region'] === '' && $updated['payload']['billing']['zip'] === '', 'Legacy country codes must normalize while optional region and postal fields remain valid when empty.');
    $check(!isset($updated['payload']['total'], $updated['payload']['pricing'], $updated['payload']['route']) && (float) $updated['payload']['vehicleSnapshot']['tariff']['perMile'] === 2.0, 'Client price fields and fake vehicle snapshots must not enter the saved payload.');
    $check($updated['status'] === 'confirmed' && $updated['notes'] === $private_note, 'Administrative status and private notes must be persisted with the edit.');
    $check(count($updated['history']) === 1 && (int) $updated['history'][0]['revision'] === 2 && (int) $updated['history'][0]['actor'] === $admin_id, 'A durable audit entry must identify the revision and editing administrator.');
    $check(strpos(wp_json_encode($updated['history']), 'Original & Customer') !== false && strpos(wp_json_encode($updated['history']), '421.88') !== false, 'History must retain the original request and fare for later review.');
    $check(count($mail) === 1 && $mail[0]['customer'] === $edited['billing']['email'] && $mail[0]['total'] === 421.88 && $updated['update_mail'] === 'accepted', 'Optional update mail must target the newly saved contact after commit.');
    $check($updated['customer_mail'] === 'accepted' && $updated['admin_mail'] === 'accepted', 'An update notification must not reset or resend the initial receipt/admin notifications.');
    $message = $mail[0]['args']['message'];
    $check(strpos($message, 'Changed &amp; Customer') !== false && strpos($message, '421.88') !== false && strpos($message, $reference) !== false, 'Updated customer email must escape customer content and include its itemized authoritative estimate/reference.');
    $check(strpos($message, $private_note) === false && strpos($message, $route_key) === false, 'Internal dispatch notes and API secrets must never appear in customer update email.');
    $plain = Notifications::plain_text($updated, Settings::get(), 'update');
    $check(strpos($plain, 'Changed & Customer') !== false && strpos($plain, '421.88') !== false && stripos($plain, 'not a payment') !== false && strpos($plain, $private_note) === false, 'Accessible plain-text update email must retain the estimate and customer name without private dispatch notes.');
    $check(Notifications::send_update($id, 2) === true && count($mail) === 1, 'Repeated notification for an accepted revision must be idempotent.');
    $unchanged = BookingUpdates::save($id, $updated['payload'], BookingUpdates::revision($updated), 'confirmed', $private_note, false);
    $check(!is_wp_error($unchanged) && (int) $unchanged['revision'] === 2 && $unchanged['update_mail'] === 'accepted' && count($mail) === 1 && !$provider_calls, 'Saving an unchanged historical edit must preserve its revision/mail state even after current stop/hour limits become stricter.');
    $error(BookingUpdates::save($id, $edited, $revision, 'cancelled', 'Stale browser', true), 409, 'An old edit revision must not overwrite the newer request.');
    $check(Database::find($id)['status'] === 'confirmed' && count($mail) === 1, 'A stale edit must not change status or send another email.');

    $current = Database::find($id);
    Settings::save(['max_stops' => 5, 'min_hours' => 1]);
    $repriced = BookingUpdates::save($id, $current['payload'], BookingUpdates::revision($current), 'confirmed', $private_note, false, true);
    $check(!is_wp_error($repriced) && (float) $repriced['pricing']['transportation'] === 205.0 && (float) $repriced['pricing']['meet'] === 70.0 && (float) $repriced['pricing']['tip'] === 25.63 && (float) $repriced['total'] === 475.63, 'Explicit repricing must use current tariffs and extras: 205 transportation + 175 seats + 70 meet + 25.63 tip.');
    $check(count($mail) === 1 && $repriced['customer_mail'] === 'accepted' && $repriced['admin_mail'] === 'accepted', 'An unnotified edit must not send any messages or change original acceptance states.');

    update_post_meta($vehicle_id, '_tuxano_vehicle_data', $meta); Settings::save(['meet_price' => 50]);
    $rerouted = $repriced['payload'];
    $rerouted['trip']['dropoff'] = 'Updated destination, United States';
    $rerouted['trip']['dropoffPlace'] = ['placeId' => 'ChIJ_Updates_NewDestination', 'countryCode' => 'US'];
    $rerouted['trip']['stops'][0]['waitMinutes'] = 15;
    $mail_result = false;
    $measured = BookingUpdates::save($id, $rerouted, BookingUpdates::revision($repriced), 'reviewing', $private_note, true);
    $check(!is_wp_error($measured) && $measured['route']['distanceMeters'] === 32186.88 && (float) $measured['route']['durationSeconds'] === 1800.0 && count($provider_calls) === 1, 'Changed endpoints must obtain a fresh server-provider measurement exactly once.');
    $sent = json_decode($provider_calls[0]['args']['body'], true);
    $check($sent['origin'] === ['placeId' => 'ChIJ_Updates_Pickup'] && $sent['destination'] === ['placeId' => 'ChIJ_Updates_NewDestination'] && $sent['intermediates'] === [['placeId' => 'ChIJ_Updates_Stop']] && $sent['optimizeWaypointOrder'] === false, 'Administrative route requests must retain the exact selected point IDs and stop order.');
    $check((float) $measured['pricing']['transportation'] === 210.0 && (float) $measured['pricing']['fare']['waitingCharge'] === 15.0 && (float) $measured['pricing']['tip'] === 26.25 && (float) $measured['total'] === 461.25, 'A freshly measured 20-mile/30-minute route plus 15-minute wait must independently total 461.25.');
    $check($measured['update_mail'] === 'failed' && (int) $measured['revision'] === 4 && count($mail) === 2 && Database::find($id)['payload']['trip']['dropoff'] === 'Updated destination, United States', 'Failed update mail must preserve the new durable request and expose a separate failed revision state.');
    $check(Notifications::send_update($id, 2, true) === false && count($mail) === 2, 'An old revision notification cannot be sent after a later edit.');
    $mail_result = true;
    $check(Notifications::send_update($id, 4, true) === true && count($mail) === 3 && Database::find($id)['update_mail'] === 'accepted', 'An explicit retry must send only the failed current revision and record acceptance.');
    $check(Notifications::send_update($id, 4, true) === true && count($mail) === 3, 'Retrying an accepted update must not duplicate its email.');

    $before_failure = Database::find($id);
    $bad_route = $before_failure['payload']; $bad_route['trip']['pickupPlace'] = ['placeId' => 'ChIJ_Updates_OutagePickup', 'countryCode' => 'US'];
    foreach (['unavailable', 'denied', 'malformed'] as $mode) {
        $provider_mode = $mode;
        $error(BookingUpdates::save($id, $bad_route, BookingUpdates::revision($before_failure), 'cancelled', 'Uncommitted', true), 502, 'Provider failures must not fabricate route metrics or save a partial edit.');
        $check(Database::find($id) === $before_failure && count($mail) === 3, 'Rejected provider work must leave the complete stored revision and notification count unchanged.');
    }
    $provider_mode = 'ok';

    // A second administrator may win while the first request waits on Google.
    // The final database compare-and-swap must preserve that winner as well.
    $during_provider = static function () use ($id, $check): void {
        $check(Database::update($id, ['status' => 'confirmed', 'notes' => 'Concurrent administrator winner']) === true, 'The concurrent edit fixture must commit before the first request resumes.');
    };
    $error(BookingUpdates::save($id, $bad_route, BookingUpdates::revision($before_failure), 'cancelled', 'Stale outer edit', true), 409, 'A concurrent winning edit during provider work must be protected by the final database revision check.');
    $winner = Database::find($id);
    $check((int) $winner['revision'] === 5 && $winner['status'] === 'confirmed' && $winner['notes'] === 'Concurrent administrator winner' && $winner['route'] === $before_failure['route'] && count($mail) === 4 && $winner['update_mail'] === 'accepted', 'A losing edit preserves the concurrent winner and its one automatic confirmation notification.');

    wp_set_current_user(0);
    $original_retry = $admin_request('bookings', ['booking' => $booking, 'quoteToken' => str_repeat('0', 64), 'requestKey' => $request_key, 'website' => ''], '', ['X-Tuxano-Session' => $visitor_token]);
    $original_receipt = $original_retry->get_data();
    $check($original_retry->get_status() === 200 && $original_receipt['requestId'] === $reference && $original_receipt['pricing']['total'] === 421.88 && $original_receipt['route'] === $route, 'A retry of the original visitor request after admin edits must return its original accepted receipt, not the revised price or private audit history.');
    $check(count($mail) === 4 && !isset($original_receipt['history'], $original_receipt['payload'], $original_receipt['notes']), 'A visitor retry after an admin edit must not duplicate mail or expose private administrative data.');
    wp_set_current_user($admin_id);

    if (is_callable([Admin::class, 'per_page']) && is_callable([Admin::class, 'bulk_ids'])) {
        $check(Admin::per_page('10') === 10 && Admin::per_page('50') === 50 && Admin::per_page('100') === 100, 'Documented page-size choices must be accepted.');
        $check(Admin::per_page('100000') === 20 && Admin::per_page('-1') === 20 && Admin::per_page(['20']) === 20, 'Untrusted page sizes must fall back to a bounded default.');
        $check(Admin::bulk_ids([(string) $id, $id]) === [$id], 'Bulk selections must deduplicate the same booking ID.');
        $check(Admin::bulk_ids(['1 OR 1=1']) === [] && Admin::bulk_ids(['-1']) === [] && Admin::bulk_ids([['1']]) === [] && Admin::bulk_ids(range(1, 101)) === [], 'Malformed or excessive bulk selections must not select any bookings.');
    } else {
        throw new RuntimeException('Expected administrator page-size and bulk-selection controls are missing.');
    }

    // Bulk deletion must be bounded, reject the entire malformed selection,
    // and delete only explicitly selected fixture rows.
    $bulk_ids = [];
    for ($index = 0; $index < 3; ++$index) {
        $bulk_booking = $booking; $bulk_booking['trip']['time'] = '12:0' . ($index + 1);
        $bulk_id = Database::insert(['reference' => 'TUX-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(6))), 'request_key' => hash('sha256', $run . '_bulk_' . $index), 'request_hash' => hash('sha256', $run . '_bulk_body_' . $index), 'status' => 'new', 'created_at' => current_time('mysql', true), 'pickup_at' => '2024-03-01 ' . $bulk_booking['trip']['time'] . ':00', 'customer_name' => 'Bulk fixture ' . $run, 'customer_email' => $run . '-bulk@example.test', 'vehicle_name' => $vehicle['display'], 'total' => 421.88, 'currency' => 'USD', 'payload' => wp_json_encode($bulk_booking), 'pricing' => wp_json_encode($pricing), 'route' => wp_json_encode($route), 'notes' => '', 'customer_mail' => 'disabled', 'admin_mail' => 'disabled']);
        $check(!is_wp_error($bulk_id), 'Bulk fixture rows must be durable before a delete test.');
        $bulk_ids[] = (int) $bulk_id; $fixture_ids[] = (int) $bulk_id;
    }
    wp_set_current_user(0);
    $error(Database::bulk_delete([$bulk_ids[0]]), 403, 'Anonymous bulk deletion must fail.');
    wp_set_current_user((int) $subscriber);
    $error(Database::bulk_delete([$bulk_ids[0]]), 403, 'Subscriber bulk deletion must fail.');
    wp_set_current_user($admin_id);
    foreach ([[], range(1, 101), [$bulk_ids[0], 'bad'], [$bulk_ids[0], -1], [$bulk_ids[0], ['nested']], [$bulk_ids[0], '9223372036854775808']] as $invalid_ids) {
        $error(Database::bulk_delete($invalid_ids), 400, 'Malformed or excessive bulk selection must fail atomically.');
        $check(Database::find($bulk_ids[0]) !== null, 'Invalid bulk selection must never partially delete a valid selected row.');
    }
    $check(Database::bulk_delete([$bulk_ids[0], (string) $bulk_ids[1], $bulk_ids[0]]) === 2, 'Bulk deletion must count only selected, distinct rows.');
    $check(Database::find($bulk_ids[0]) === null && Database::find($bulk_ids[1]) === null && Database::find($bulk_ids[2]) !== null && Database::find($id) !== null, 'Bulk deletion must preserve unselected customer requests.');

    $api_error = static function (WP_REST_Response $response, int $status, string $message) use ($check): void {
        $check($response->get_status() === $status && isset($response->get_data()['code']), $message);
    };
    $api_points = ['origin' => ['placeId' => 'ChIJ_Updates_Pickup'], 'destination' => ['placeId' => 'ChIJ_Updates_NewDestination'], 'stops' => []];
    $calls_before_api = count($provider_calls);
    wp_set_current_user(0);
    $api_error($admin_request('admin/route', $api_points), 403, 'Anonymous callers must not use the administrator route endpoint.');
    $api_error($admin_request('admin/test-api', ['kind' => 'routes']), 403, 'Anonymous callers must not inspect/test configured private API credentials.');
    wp_set_current_user($admin_id);
    $api_error($admin_request('admin/route', $api_points), 403, 'Even administrators must supply a valid REST nonce for provider work.');
    $api_error($admin_request('admin/test-api', ['kind' => 'routes'], 'invalid-fixture-nonce'), 403, 'An invalid REST nonce must reject connection tests.');
    $nonce = wp_create_nonce('wp_rest');
    $api_error($admin_request('admin/route', $api_points, $nonce, ['Origin' => 'https://other.example.test']), 403, 'A cross-origin request must not invoke the administrator provider endpoint.');
    $api_error($admin_request('admin/route', $api_points, $nonce, ['Content-Type' => 'text/plain']), 413, 'Administrator routes must retain the JSON content-type guard.');
    $api_error($admin_request('admin/route', [], $nonce, [], '{malformed-json'), 400, 'Malformed JSON must fail in the WordPress parser.');
    $api_error($admin_request('admin/route', array_replace($api_points, ['origin' => ['latitude' => 91, 'longitude' => 0]]), $nonce), 400, 'Invalid admin preview coordinates must not reach Google.');
    $api_error($admin_request('admin/test-api', ['kind' => 'https://other.example.test'], $nonce), 400, 'Connection tests must not accept a visitor-chosen API/URL.');
    $api_error($admin_request('admin/test-api', ['kind' => 'routes', 'key' => 'bad'], $nonce), 400, 'A malformed candidate key must fail before provider work.');
    $check(count($provider_calls) === $calls_before_api, 'Invalid administrator API requests must not use Google quota.');
    $browser_check = $admin_request('admin/test-api', ['kind' => 'browser'], $nonce);
    $browser_data = $browser_check->get_data();
    $check($browser_check->get_status() === 200 && array_key_exists('valid', $browser_data) && $browser_data['valid'] === null && $browser_data['status'] === 'browser_check_required', 'PHP must distinguish a configured browser key from actual browser/referrer authorization.');
    $check(count($provider_calls) === $calls_before_api && ($browser_data['browserKey'] ?? '') === Settings::get()['browser_key'] && strpos(wp_json_encode($browser_data), $route_key) === false, 'The authorized browser SDK check may receive its intentionally public key without server quota use or disclosure of the private Routes key.');
    $preview = $admin_request('admin/route', $api_points, $nonce);
    $preview_data = $preview->get_data();
    $check($preview->get_status() === 200 && $preview_data['distanceMeters'] === 32186.88 && $preview_data['durationSeconds'] === 1800.0 && !isset($preview_data['quoteToken']), 'An authorized route preview must return only bounded provider metrics, not a public booking quote.');
    $candidate_key = 'updates_candidate_routes_key_1234567890'; $provider_key = $candidate_key;
    $connection = $admin_request('admin/test-api', ['kind' => 'routes', 'key' => $candidate_key], $nonce);
    $connection_data = $connection->get_data();
    $check($connection->get_status() === 200 && $connection_data['valid'] === true && $connection_data['status'] === 'connected', 'A manual server-key test must demonstrate an actual measured Google response.');
    $check(Settings::get()['routes_key'] === $route_key && strpos(wp_json_encode($connection_data), $candidate_key) === false, 'Testing an unsaved replacement key must not save it or echo it in the response.');
    $provider_key = $route_key; $provider_mode = 'denied';
    $api_error($admin_request('admin/test-api', ['kind' => 'routes'], $nonce), 400, 'A rejected provider key must return an actionable controlled connection-test error.');
    $provider_mode = 'ok';

    $export = Database::privacy_export($edited['billing']['email']);
    $check(count($export['data']) === 1 && strpos(wp_json_encode($export), $private_note) === false && strpos(wp_json_encode($export), $request_key) === false, 'Privacy export must follow the edited contact while excluding private dispatch notes and request tokens.');
    WP_CLI::success('WordPress administrative update/integrity checks passed: ' . $checks);
} finally {
    remove_filter('pre_http_request', $http_mock, 10);
    remove_filter('pre_wp_mail', $mail_mock, 10);
    wp_set_current_user($admin_id);
    foreach ($fixture_ids as $fixture_id) { Database::delete($fixture_id); }
    if ($vehicle_id > 0) { wp_delete_post($vehicle_id, true); }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($fixture_users as $fixture_user) { wp_delete_user($fixture_user); }
    foreach ($session_names as $session_name) { delete_transient($session_name); }
    if ($original_settings === null) { delete_option(Settings::OPTION); }
    else { update_option(Settings::OPTION, $original_settings, false); }
    foreach ($wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%')) as $name) {
        if (!isset($rate_snapshot[$name])) { delete_option($name); }
    }
    foreach ($rate_snapshot as $name => $option) { update_option($name, $option->option_value, false); }
    if ($original_remote === null) { unset($_SERVER['REMOTE_ADDR']); }
    else { $_SERVER['REMOTE_ADDR'] = $original_remote; }
    delete_transient('tuxano_vehicle_error_' . $admin_id);
    $_POST = $original_post;
    $_REQUEST = $original_request;
    wp_set_current_user($original_user);
}
