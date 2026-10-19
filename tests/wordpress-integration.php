<?php
/**
 * Real WordPress REST/database/mail integration with a deterministic Google mock.
 * Run only in an isolated test installation: wp eval-file tests/wordpress-integration.php
 * Fixtures are removed and configuration is restored even when an assertion fails.
 */

use Tuxano\Booking\Database;
use Tuxano\Booking\Notifications;
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
    if (!$condition) {
        throw new RuntimeException($message);
    }
    ++$checks;
};
$original_user = get_current_user_id();
$original_settings = get_option(Settings::OPTION, null);
$original_remote = $_SERVER['REMOTE_ADDR'] ?? null;
$rate_snapshot = $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%'), OBJECT_K);
$sessions = [];
$quotes = [];
$created_ids = [];
$mail = [];
$mail_results = ['customer' => true, 'admin' => false];
$provider_mode = 'ok';
$provider_calls = 0;
$fixture_key = 'integration_routes_key_123456789012345';
$run = 'integration_' . bin2hex(random_bytes(8));
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
$check(!empty($admins), 'An administrator is required in the isolated installation.');
$site = wp_parse_url(home_url('/'));
$origin = $site['scheme'] . '://' . $site['host'] . (isset($site['port']) ? ':' . $site['port'] : '');
$points = ['origin' => ['placeId' => 'ChIJ_Integration_Pickup'], 'destination' => ['latitude' => 40.75, 'longitude' => -73.98], 'stops' => [['placeId' => 'ChIJ_Integration_Stop']]];

$request = static function (string $path, mixed $body = [], string $token = '', array $headers = [], string $method = 'POST', ?string $raw = null) use ($origin): WP_REST_Response {
    $request = new WP_REST_Request($method, '/tuxano-booking/v1/' . $path);
    foreach (array_replace(['Origin' => $origin, 'Sec-Fetch-Site' => 'same-origin', 'Content-Type' => 'application/json'], $headers) as $name => $value) {
        $request->set_header($name, $value);
    }
    if ($token !== '') {
        $request->set_header('X-Tuxano-Session', $token);
    }
    $request->set_body($raw ?? wp_json_encode($body));
    $response = rest_do_request($request);
    // WP_REST_Server::serve_request applies this after dispatch for HTTP requests.
    return apply_filters('rest_post_dispatch', $response, rest_get_server(), $request);
};
$error = static function (WP_REST_Response $response, int $status, string $code, string $message) use ($check): void {
    $data = $response->get_data();
    $check($response->get_status() === $status && ($data['code'] ?? '') === $code, $message . ' (received ' . $response->get_status() . '/' . ($data['code'] ?? 'success') . ')');
};
$new_session = static function () use ($request, $check, &$sessions): string {
    $response = $request('session');
    $data = $response->get_data();
    $check($response->get_status() === 200 && preg_match('/^[a-f0-9]{64}$/D', $data['token'] ?? '') === 1, 'Session endpoint must issue a cryptographic token.');
    $token = $data['token'];
    $name = 'tuxano_session_' . hash('sha256', $token);
    $sessions[] = $name;
    $stored = get_transient($name);
    $stored['created'] = time() - 3;
    set_transient($name, $stored, 2 * HOUR_IN_SECONDS);
    return $token;
};
$new_quote = static function (string $token) use ($request, $check, $points, &$quotes): array {
    $response = $request('route', $points, $token);
    $data = $response->get_data();
    $check($response->get_status() === 200 && preg_match('/^[a-f0-9]{64}$/D', $data['quoteToken'] ?? '') === 1, 'A real PHP route callback must issue a quote from the mocked provider.');
    $quotes[] = 'tuxano_quote_' . hash('sha256', $data['quoteToken']);
    return $data;
};
$http_mock = static function ($preempt, array $args, string $url) use ($check, &$provider_calls, &$provider_mode, $fixture_key, $points) {
    ++$provider_calls;
    $check($url === 'https://routes.googleapis.com/directions/v2:computeRoutes', 'Provider URL must remain the fixed Google endpoint.');
    $check($args['headers']['X-Goog-Api-Key'] === $fixture_key && $args['headers']['X-Goog-FieldMask'] === 'routes.distanceMeters,routes.duration', 'Server must send the private fixture key and bounded field mask.');
    $check($args['timeout'] <= 15 && $args['redirection'] === 0 && $args['limit_response_size'] === 262144, 'Provider calls must bound time, redirects and response size.');
    $sent = json_decode($args['body'], true);
    $check($sent === ['origin' => $points['origin'], 'destination' => ['location' => ['latLng' => $points['destination']]], 'intermediates' => $points['stops'], 'travelMode' => 'DRIVE', 'routingPreference' => 'TRAFFIC_UNAWARE', 'computeAlternativeRoutes' => false, 'optimizeWaypointOrder' => false, 'units' => 'METRIC'], 'Google payload must preserve ordered locations and agreed routing options.');
    if ($provider_mode === 'unavailable') {
        return new WP_Error('fixture_unavailable', 'Deterministic provider outage.');
    }
    return ['headers' => [], 'response' => ['code' => $provider_mode === 'denied' ? 403 : 200, 'message' => 'Fixture'], 'body' => wp_json_encode($provider_mode === 'malformed' ? ['routes' => [['distanceMeters' => 1, 'duration' => '-1s']]] : ['routes' => [['distanceMeters' => 16093.44, 'duration' => '1200s']]]), 'cookies' => []];
};
$mail_mock = static function ($preempt, array $args) use ($check, &$mail, &$created_ids, &$mail_results, $wpdb) {
    $kind = $args['to'] === 'booking-admin@example.test' ? 'admin' : 'customer';
    preg_match('/TUX-\d{4}-[A-F0-9]+/', $args['subject'], $match);
    $id = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . Database::table() . ' WHERE reference=%s', $match[0] ?? ''));
    if ($id) {
        $created_ids[$id] = $id;
    }
    $row = $id ? Database::find($id) : null;
    $check($row !== null && $row[$kind . '_mail'] === 'sending', 'Notification must be claimed only after its booking is durably saved.');
    $mail[] = ['kind' => $kind, 'args' => $args];
    if ($mail_results[$kind] === 'throw') {
        throw new RuntimeException('Deterministic mail transport exception.');
    }
    return $mail_results[$kind];
};

try {
    wp_set_current_user((int) $admins[0]);
    $check(Settings::save(['browser_key' => 'integration_browser_key_123456789012345', 'routes_key' => $fixture_key, 'admin_email' => 'booking-admin@example.test', 'email_customer' => true, 'email_admin' => true, 'meet_price' => 50, 'first_seat_price' => 75, 'additional_seat_price' => 50, 'default_gratuity' => 20, 'min_hours' => 1, 'max_hours' => 24, 'max_stops' => 5, 'currency' => 'USD', 'route_daily_limit' => 10000, 'route_minute_limit' => 120, 'booking_hourly_limit' => 1000, 'session_hourly_limit' => 1000]) === true, 'Valid isolated fixture settings must save.');
    $_SERVER['REMOTE_ADDR'] = '198.51.100.' . random_int(1, 254);
    wp_set_current_user(0);
    add_filter('pre_http_request', $http_mock, 10, 3);
    add_filter('pre_wp_mail', $mail_mock, 10, 2);

    $error($request('session', [], '', ['Origin' => 'https://other.example.test']), 403, 'tuxano_origin', 'Cross-origin session requests must fail.');
    $error($request('session', [], '', ['Sec-Fetch-Site' => 'same-site']), 403, 'tuxano_origin', 'Cross-site sibling requests must fail.');
    $error($request('session', [], '', [], 'POST', wp_json_encode(['oversized' => str_repeat('x', 65537)])), 413, 'tuxano_body', 'Oversized valid JSON bodies must fail.');
    $error($request('session', [], '', ['Content-Type' => 'text/plain']), 413, 'tuxano_body', 'Non-JSON requests must fail.');
    $error($request('route', $points), 403, 'tuxano_session', 'Route calculation requires a session.');
    $error($request('bookings', [], '', [], 'GET'), 404, 'rest_no_route', 'Anonymous GET must not expose submissions.');

    $token = $new_session();
    $fixture_remote = $_SERVER['REMOTE_ADDR'];
    $_SERVER['REMOTE_ADDR'] = '203.0.113.1';
    $error($request('route', $points, $token), 403, 'tuxano_session', 'A session token must be bound to the server-observed client.');
    $_SERVER['REMOTE_ADDR'] = $fixture_remote;
    $session_response = $request('session');
    $session_data = $session_response->get_data();
    $sessions[] = 'tuxano_session_' . hash('sha256', $session_data['token']);
    $check($session_response->get_headers()['Cache-Control'] === 'private, no-store, max-age=0' && $session_response->get_headers()['X-Content-Type-Options'] === 'nosniff', 'Session responses must prohibit caching and MIME sniffing.');
    $check(strpos(wp_json_encode($session_data), $fixture_key) === false && !isset($session_data['settings']['admin_email']) && $session_data['maps']['browserConfigured'] && $session_data['maps']['routesConfigured'], 'Bootstrap must expose readiness without private route key or admin address.');
    $error($request('route', [], $token, [], 'POST', '{broken-json'), 400, 'rest_invalid_json', 'Malformed JSON must fail in the WordPress parser.');
    $error($request('route', array_replace($points, ['origin' => ['latitude' => 91, 'longitude' => 0]]), $token), 400, 'tuxano_route_input', 'Out-of-range map coordinates must fail.');
    $error($request('route', array_replace($points, ['origin' => ['placeId' => 'bad?query']]), $token), 400, 'tuxano_route_input', 'Malformed place IDs must fail.');
    $error($request('route', array_replace($points, ['origin' => ['latitude' => '40', 'longitude' => 0]]), $token), 400, 'tuxano_route_input', 'String map coordinates must fail.');
    $error($request('route', array_replace($points, ['stops' => array_fill(0, 6, $points['origin'])]), $token), 400, 'tuxano_route_input', 'Excess stops must fail.');
    $check($provider_calls === 0, 'Invalid route input must never call the provider.');
    foreach (['unavailable' => 'tuxano_google_unavailable', 'denied' => 'tuxano_google_route', 'malformed' => 'tuxano_google_route'] as $mode => $code) {
        $provider_mode = $mode;
        $error($request('route', $points, $token), 502, $code, 'Provider ' . $mode . ' must return a controlled error.');
    }
    $provider_mode = 'ok';
    $quote = $new_quote($token);
    $check($quote['distanceMeters'] === 16093.44 && $quote['durationSeconds'] === 1200.0 && $quote['provider'] === 'google', 'Only provider metrics may form the server quote.');
    $quote_name = 'tuxano_quote_' . hash('sha256', $quote['quoteToken']);
    $check(get_transient($quote_name)['session'] === hash('sha256', $token), 'Quote must be bound to the creating session.');
    $other_token = $new_session();
    $premium = null;
    foreach (Vehicles::all() as $vehicle) {
        if ($vehicle['name'] === 'PREMIUM SUV') {
            $premium = $vehicle;
        }
    }
    $check($premium !== null && $premium['tariff'] === ['base' => 65.0, 'perMile' => 2.0, 'perDrivingMinute' => 3.0, 'minimum' => 100.0, 'perWaitingMinute' => 1.0, 'hourly' => 95.0], 'Integration fixture requires the original Premium SUV tariffs.');
    $booking = [
        'trip' => ['service' => 'transfer', 'hours' => 3, 'date' => wp_date('Y-m-d', time() + 2 * DAY_IN_SECONDS), 'time' => '12:00', 'pickup' => 'Integration pickup', 'dropoff' => 'Integration destination', 'pickupPlace' => $points['origin'], 'dropoffPlace' => $points['destination'], 'stops' => [['text' => 'Integration stop', 'waitMinutes' => 30, 'place' => $points['stops'][0]]]],
        'vehicle' => $premium['id'], 'passengers' => 3, 'luggage' => 3, 'meet' => true, 'child' => true, 'carSeats' => 2, 'boosterSeats' => 1, 'inPerson' => false, 'same' => true, 'consent' => true, 'gratuity' => 'custom', 'custom' => 12.5,
        'billing' => ['first' => 'Ada & Co', 'last' => 'Integration', 'email' => 'booking-customer@example.test', 'phone' => '+1 717 555 0100', 'company' => '', 'street' => '123 Test Street', 'unit' => '', 'city' => 'Test City', 'region' => 'PA', 'zip' => '17000', 'country' => 'US', 'notes' => 'Integration fixture'],
        'passenger' => ['first' => 'Ignored', 'last' => 'When Same', 'email' => '', 'mobile' => '+1 717 555 0101'], 'special' => 'Integration fixture',
        'total' => 0.01, 'pricing' => ['total' => 0.01], 'route' => ['distanceMeters' => 0, 'durationSeconds' => 0],
    ];
    $submit = static function (array $value, string $quote_token, string $session_token, ?string $key = null, string $honeypot = '') use ($request, $run): WP_REST_Response {
        return $request('bookings', ['booking' => $value, 'quoteToken' => $quote_token, 'requestKey' => $key ?? $run . '_' . bin2hex(random_bytes(6)), 'website' => $honeypot], $session_token);
    };
    $guard_name = 'tuxano_session_' . hash('sha256', $session_data['token']);
    $guard_session = get_transient($guard_name);
    $guard_session['created'] = time();
    set_transient($guard_name, $guard_session, 2 * HOUR_IN_SECONDS);
    $error($submit($booking, $quote['quoteToken'], $session_data['token']), 429, 'tuxano_booking_rate', 'A freshly created session must respect the submission guard without sleeping in tests.');
    $error($submit($booking, $quote['quoteToken'], $other_token), 409, 'tuxano_quote_expired', 'A different session cannot use another visitor quote.');
    $error($submit($booking, str_repeat('0', 64), $token), 409, 'tuxano_quote_expired', 'Missing or expired quotes cannot be booked.');
    $expired_quote = $new_quote($token);
    $expired_name = 'tuxano_quote_' . hash('sha256', $expired_quote['quoteToken']);
    set_transient($expired_name, get_transient($expired_name), -1);
    $error($submit($booking, $expired_quote['quoteToken'], $token), 409, 'tuxano_quote_expired', 'An expired real provider quote must fail.');
    $error($submit($booking, $quote['quoteToken'], $token, null, 'spam.example.test'), 400, 'tuxano_booking_input', 'Honeypot submissions must fail.');
    foreach ([
        ['trip' => ['date' => '2025-02-30']], ['trip' => ['date' => '2020-01-01']], ['trip' => ['date' => wp_date('Y-m-d', time() + 6 * YEAR_IN_SECONDS)]], ['trip' => ['time' => '25:00']],
        ['billing' => ['email' => 'invalid-address']], ['billing' => ['phone' => '12']], ['consent' => false], ['consent' => 'true'],
        ['passengers' => 7], ['passengers' => '3'], ['luggage' => 7], ['carSeats' => 4], ['custom' => 101], ['gratuity' => '99'],
        ['trip' => ['pickupPlace' => ['placeId' => 'Different_Location']]], ['trip' => ['stops' => [['text' => 'Integration stop', 'waitMinutes' => 7, 'place' => $points['stops'][0]]]]],
    ] as $invalid) {
        $error($submit(array_replace_recursive($booking, $invalid), $quote['quoteToken'], $token), 400, 'tuxano_booking_validation', 'Invalid booking details must be rejected: ' . wp_json_encode($invalid));
    }
    $check(count($mail) === 0, 'Rejected bookings must not send notifications.');
    wp_set_current_user((int) $admins[0]);
    $check(Settings::save(['meet_price' => 51]) === true, 'Pricing revision fixture must save.');
    wp_set_current_user(0);
    $error($submit($booking, $quote['quoteToken'], $token), 409, 'tuxano_pricing_changed', 'Quotes made before a pricing revision must fail.');
    wp_set_current_user((int) $admins[0]);
    Settings::save(['meet_price' => 50]);
    wp_set_current_user(0);
    $quote = $new_quote($token);
    $request_key = $run . '_durable';
    $response = $submit($booking, $quote['quoteToken'], $token, $request_key);
    $receipt = $response->get_data();
    $check($response->get_status() === 200 && preg_match('/^TUX-\d{4}-[A-F0-9]{12}$/D', $receipt['requestId'] ?? '') === 1, 'Valid booking must return a persisted reference.');
    $check((float) $receipt['pricing']['transportation'] === 175.0 && (float) $receipt['pricing']['carCost'] === 125.0 && (float) $receipt['pricing']['boosterCost'] === 50.0 && (float) $receipt['pricing']['meet'] === 50.0 && (float) $receipt['pricing']['tip'] === 21.88 && (float) $receipt['pricing']['total'] === 421.88, 'Server must independently compute fare, waiting, extras and tip, ignoring forged totals.');
    $row = Database::by_request(hash_hmac('sha256', $request_key, wp_salt('secure_auth')));
    $check($row !== null && $row['reference'] === $receipt['requestId'] && $row['pricing'] === $receipt['pricing'] && $row['route'] === $receipt['route'] && (float) $row['total'] === 421.88, 'Receipt must match decoded durable database state.');
    $id = (int) $row['id'];
    $created_ids[$id] = $id;
    $check(!isset($row['payload']['total'], $row['payload']['pricing'], $row['payload']['route']) && $row['payload']['passenger']['first'] === 'Ada & Co', 'Persisted payload must discard forged fields and normalize same-as-billing contact.');
    $check(isset($row['payload']['vehicleSnapshot']['tariff']['perMile']) && $row['payload']['vehicleSnapshot']['id'] === $booking['vehicle'], 'The original selected vehicle and tariff must be retained independently of future fleet edits.');
    $check(count($mail) === 2 && $row['customer_mail'] === 'accepted' && $row['admin_mail'] === 'failed', 'Customer/admin transport acceptance must be recorded independently without losing a booking.');
    $check(strpos($mail[0]['args']['message'], 'Ada &amp; Co') !== false && strpos($mail[0]['args']['message'], 'USD 421.88') !== false && strpos($mail[1]['args']['message'], 'Review in WordPress') !== false, 'Escaped notification HTML must include authoritative total and administrator review link.');
    $check(strpos(wp_json_encode($receipt) . wp_json_encode($mail), $fixture_key) === false, 'Receipts and notifications must never expose the server key.');
    delete_transient('tuxano_quote_' . hash('sha256', $quote['quoteToken']));
    $retry = $submit($booking, $quote['quoteToken'], $token, $request_key);
    $check($retry->get_status() === 200 && $retry->get_data() === $receipt && count($mail) === 2, 'Identical retry after quote expiry must return the original receipt without duplicate mail.');
    $error($submit(array_replace($booking, ['special' => 'Changed retry']), $quote['quoteToken'], $token, $request_key), 409, 'tuxano_idempotency', 'Reusing a key with changed details must fail.');
    $error($submit($booking, $quote['quoteToken'], $other_token, $request_key), 409, 'tuxano_idempotency', 'A guessed request key must not reveal another session receipt.');
    $check((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . Database::table() . ' WHERE request_key=%s', hash_hmac('sha256', $request_key, wp_salt('secure_auth')))) === 1, 'All retries must retain exactly one durable booking.');
    $duplicate = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . Database::table() . ' WHERE id=%d', $id), ARRAY_A);
    unset($duplicate['id']);
    $duplicate['reference'] = 'TUX-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(6)));
    $duplicate_result = Database::insert($duplicate);
    $check(is_wp_error($duplicate_result) && $duplicate_result->get_error_code() === 'booking_save_failed', 'The database unique constraint must reject duplicate request keys during racing submissions.');

    Notifications::send($id);
    $check(count($mail) === 2, 'Automatic send must skip both accepted and failed recipients.');
    $mail_results['admin'] = true;
    Notifications::send($id, true);
    $check(count($mail) === 3 && $mail[2]['kind'] === 'admin' && Database::find($id)['admin_mail'] === 'accepted', 'Explicit retry must send only failed recipient and update acceptance.');
    Notifications::send($id, true);
    $check(count($mail) === 3, 'Accepted messages must never resend on repeated retry.');
    $wpdb->update(Database::table(), ['admin_mail' => 'sending', 'admin_mail_started' => gmdate('Y-m-d H:i:s')], ['id' => $id]);
    Notifications::send($id, true);
    $check(count($mail) === 3 && Database::find($id)['admin_mail'] === 'sending', 'An active mail lease must prevent duplicate sends.');
    $wpdb->update(Database::table(), ['admin_mail_started' => gmdate('Y-m-d H:i:s', time() - 11 * MINUTE_IN_SECONDS)], ['id' => $id]);
    Notifications::send($id);
    $check(count($mail) === 3, 'Automatic sender must not recover stale leases.');
    Notifications::send($id, true);
    $check(count($mail) === 4 && Database::find($id)['admin_mail'] === 'accepted', 'Explicit retry must recover a stale mail lease.');
    $wpdb->update(Database::table(), ['customer_mail' => 'pending'], ['id' => $id]);
    $mail_results['customer'] = 'throw';
    Notifications::send($id);
    $check(count($mail) === 5 && Database::find($id)['customer_mail'] === 'failed', 'Mail transport exceptions must record failure and preserve the durable booking.');
    $mail_results['customer'] = true;
    Notifications::send($id, true);
    $check(count($mail) === 6 && Database::find($id)['customer_mail'] === 'accepted', 'Failed customer mail must also be individually retryable.');

    $listing = Database::listing(['search' => $receipt['requestId'], 'status' => 'new', 'per_page' => 1]);
    $check($listing['total'] === 1 && (int) $listing['items'][0]['id'] === $id && !isset($listing['items'][0]['payload']), 'Private admin listing must filter and paginate scalar summary rows.');
    $check(Database::update($id, ['status' => 'confirmed', 'notes' => 'Integration reviewed', 'total' => 1]) === true && (float) Database::find($id)['total'] === 421.88, 'Admin updates may change status and notes without changing authoritative total.');
    $check(is_wp_error(Database::update($id, ['status' => 'invented'])) && Database::find($id)['status'] === 'confirmed', 'Invalid admin statuses must not modify a booking.');
    $export = Database::privacy_export('booking-customer@example.test');
    $check(count($export['data']) === 1 && strpos(wp_json_encode($export), $request_key) === false && strpos(wp_json_encode($export), 'Integration reviewed') === false, 'Privacy export must include customer records without request keys or internal notes.');
    WP_CLI::success('WordPress REST/database/notification integration checks passed: ' . $checks);
} finally {
    remove_filter('pre_http_request', $http_mock, 10);
    remove_filter('pre_wp_mail', $mail_mock, 10);
    foreach ($created_ids as $id) {
        Database::delete($id);
    }
    foreach (array_merge($sessions, $quotes) as $name) {
        delete_transient($name);
    }
    $current_rates = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%'));
    foreach ($current_rates as $name) {
        if (isset($rate_snapshot[$name])) {
            update_option($name, $rate_snapshot[$name]->option_value, false);
        } else {
            delete_option($name);
        }
    }
    if ($original_settings === null) {
        delete_option(Settings::OPTION);
    } else {
        update_option(Settings::OPTION, $original_settings, false);
    }
    if ($original_remote === null) {
        unset($_SERVER['REMOTE_ADDR']);
    } else {
        $_SERVER['REMOTE_ADDR'] = $original_remote;
    }
    wp_set_current_user($original_user);
}
