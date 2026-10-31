<?php
/** Exact geographic zones, DST, quote authority and historical schedule safety. */
use Tuxano\Booking\Availability;
use Tuxano\Booking\BookingUpdates;
use Tuxano\Booking\Database;
use Tuxano\Booking\Rest;
use Tuxano\Booking\Settings;
use Tuxano\Booking\Timezones;
use Tuxano\Booking\Vehicles;

if (!defined('WP_CLI') || !WP_CLI || wp_get_environment_type() !== 'local') { exit('Run only with WP-CLI in disposable local WordPress.'); }
global $wpdb;
$checks = 0;
$check = static function (bool $ok, string $message) use (&$checks): void { if (!$ok) { throw new RuntimeException($message); } ++$checks; };
$throws = static function (callable $call, string $message) use ($check): void { try { $call(); } catch (InvalidArgumentException $error) { $check(true, $message); return; } $check(false, $message); };
$old_settings = get_option(Settings::OPTION, null); $old_user = get_current_user_id(); $old_zone = get_option('timezone_string'); $old_offset = get_option('gmt_offset'); $old_remote = $_SERVER['REMOTE_ADDR'] ?? null;
$old_cursor = get_option('tuxano_schedule_cursor', null);
$rates = $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%'), OBJECT_K);
$transients = []; $ids = []; $vehicle_id = 0; $provider_calls = 0; $provider_point = ['latitude' => 40.758, 'longitude' => -73.9855]; $omit_origin = false;
$run = bin2hex(random_bytes(6)); $year = (int) gmdate('Y') + 1; $date = $year . '-07-15';
$site = wp_parse_url(home_url('/')); $origin = $site['scheme'] . '://' . $site['host'] . (isset($site['port']) ? ':' . $site['port'] : '');
$request = static function (string $path, $body = [], string $token = '', array $headers = []) use ($origin): WP_REST_Response {
    $r = new WP_REST_Request('POST', '/tuxano-booking/v1/' . $path);
    foreach (array_replace(['Origin' => $origin, 'Sec-Fetch-Site' => 'same-origin', 'Content-Type' => 'application/json'], $headers) as $key => $value) { $r->set_header($key, $value); }
    if ($token !== '') { $r->set_header('X-Tuxano-Session', $token); }
    $r->set_body(wp_json_encode($body)); return apply_filters('rest_post_dispatch', rest_do_request($r), rest_get_server(), $r);
};
$mock = static function ($preempt, array $args, string $url) use (&$provider_calls, &$provider_point, &$omit_origin, $check) {
    ++$provider_calls;
    $check($url === 'https://routes.googleapis.com/directions/v2:computeRoutes', 'Only the existing fixed Routes endpoint is called.');
    $check($args['headers']['X-Goog-FieldMask'] === 'routes.distanceMeters,routes.duration,routes.legs.startLocation.latLng', 'Provider mask includes the authoritative resolved pickup geometry.');
    $route = ['distanceMeters' => 16093.44, 'duration' => '1200s'];
    if (!$omit_origin) { $route['legs'] = [['startLocation' => ['latLng' => $provider_point]]]; }
    return ['headers' => [], 'response' => ['code' => 200], 'body' => wp_json_encode(['routes' => [$route]]), 'cookies' => []];
};
$no_mail = static function () { throw new RuntimeException('Timezone fixtures must never send email.'); };
add_filter('pre_http_request', $mock, 10, 3); add_filter('pre_wp_mail', $no_mail);

try {
    $admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']); $check(!empty($admins), 'A local fixture administrator exists.'); wp_set_current_user((int) $admins[0]);
    update_option('timezone_string', 'Asia/Dhaka'); update_option('gmt_offset', 6); $_SERVER['REMOTE_ADDR'] = '192.0.2.' . random_int(1, 254);
    $check(Settings::save(['email_customer' => false, 'email_admin' => false, 'min_hours' => 3, 'max_hours' => 24, 'routes_key' => 'timezone_fixture_routes_123456789012345', 'route_daily_limit' => 1000, 'route_minute_limit' => 120, 'booking_hourly_limit' => 100]) === true, 'Isolated settings save without changing live configuration.');
    $check(Settings::public_data()['pickupTimezones'] === true && Settings::public_data()['timezone'] === 'America/New_York', 'Public capability defaults to Eastern while each pickup is resolved.');
    $cities = [
        [39.7684, -86.1581, 'America/Indiana/Indianapolis', 'Eastern Time'], [41.8781, -87.6298, 'America/Chicago', 'Central Time'], [40.7128, -74.0060, 'America/New_York', 'Eastern Time'],
        [41.6764, -86.2520, 'America/Indiana/Indianapolis', 'Eastern Time'], [41.5934, -87.3464, 'America/Chicago', 'Central Time'], [39.4667, -87.4139, 'America/Indiana/Indianapolis', 'Eastern Time'],
        [33.4484, -112.0740, 'America/Phoenix', 'Mountain Time'], [36.1699, -115.1398, 'America/Los_Angeles', 'Pacific Time'], [39.7392, -104.9903, 'America/Denver', 'Mountain Time'],
        [47.6062, -122.3321, 'America/Los_Angeles', 'Pacific Time'], [61.2181, -149.9003, 'America/Anchorage', 'Alaska Time'], [21.3099, -157.8581, 'Pacific/Honolulu', 'Hawaii-Aleutian Time'],
        [22.7010, 90.3535, 'Asia/Dhaka', 'Bangladesh Time'], [23.8103, 90.4125, 'Asia/Dhaka', 'Bangladesh Time'], [35.6762, 139.6503, 'Asia/Tokyo', 'Japan Time'],
    ];
    foreach ($cities as [$lat, $lng, $zone, $label]) { $resolved = Timezones::resolve($lat, $lng); $check($resolved === $zone, 'Exact geographic pickup zone: ' . $zone); $check(Timezones::label($resolved, $date) === $label, 'Full generic label: ' . $label); }
    foreach ([[91, 0], [0, 181], [INF, 0], [0, NAN]] as $bad) { $throws(static fn() => Timezones::resolve($bad[0], $bad[1]), 'Out-of-range/non-finite coordinates reject.'); }
    $check(Timezones::display('2026-10-30', '17:50', 'America/New_York') === 'October 30, 2026 at 5:50 PM (Eastern Time)', 'Email schedule exactly matches the requested full date/time/zone format.');
    $check(Timezones::display('2026-10-30', '17:50', 'America/Chicago') === 'October 30, 2026 at 5:50 PM (Central Time)', 'Chicago wall time uses Central Time without conversion into the visitor zone.');
    $check(Timezones::local('2027-01-15', '17:50', 'America/New_York')->format('P') === '-05:00' && Timezones::local('2027-07-15', '17:50', 'America/New_York')->format('P') === '-04:00', 'Reservation date controls Eastern daylight saving offset.');
    $check(Timezones::local('2027-01-15', '17:50', 'America/Chicago')->format('P') === '-06:00' && Timezones::local('2027-07-15', '17:50', 'America/Chicago')->format('P') === '-05:00', 'Reservation date controls Central daylight saving offset.');
    $check(Timezones::local('2027-07-15', '17:50', 'America/Phoenix')->format('P') === '-07:00', 'Arizona remains distinct from DST-observing Mountain locations.');
    foreach ([['2027-03-14', '02:30', 'America/New_York'], ['2027-11-07', '01:30', 'America/New_York'], ['2027-03-14', '02:30', 'America/Chicago'], ['2027-11-07', '01:30', 'America/Chicago'], ['2027-02-30', '12:00', 'America/New_York'], ['2027-01-01', '24:00', 'America/New_York'], ['2027-01-01', '12:00', 'Invalid/Timezone']] as $bad) { $throws(static fn() => Timezones::local(...$bad), 'Invalid, DST-gap and repeated-hour schedules fail closed.'); }
    $check(Timezones::local('2027-11-07', '01:30', 'America/New_York', true)->format('Y-m-d H:i') === '2027-11-07 01:30', 'Already saved legacy repeated-hour requests remain readable without reinterpretation.');

    $vehicle_id = wp_insert_post(['post_type' => Vehicles::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Timezone fixture ' . $run]); $check(is_int($vehicle_id) && $vehicle_id > 0, 'Disposable fixture vehicle created.');
    update_post_meta($vehicle_id, '_tuxano_vehicle_data', ['display' => 'Timezone fixture', 'capacity' => 6, 'luggageCapacity' => 6, 'image' => '', 'models' => ['Fixture'], 'features' => ['Fixture'], 'tariff' => ['base' => 50, 'perMile' => 2, 'perDrivingMinute' => 1, 'minimum' => 75, 'perWaitingMinute' => 1, 'hourly' => 80]]);
    $session = $request('session')->get_data(); $token = $session['token']; $session_name = 'tuxano_session_' . hash('sha256', $token); $transients[] = $session_name; $session_record = get_transient($session_name); $session_record['created'] = time() - 3; set_transient($session_name, $session_record, 2 * HOUR_IN_SECONDS);
    $check($session['settings']['pickupTimezones'] === true, 'Session exposes the new timezone contract.');
    $preview = $request('timezone', ['latitude' => 41.8781, 'longitude' => -87.6298], $token);
    $check($preview->get_status() === 200 && $preview->get_data() === ['timezone' => 'America/Chicago', 'label' => 'Central Time'], 'Preview resolves a pickup point without Google or a client timezone.');
    foreach ([[['latitude' => 0, 'longitude' => 0, 'timezone' => 'UTC'], $token, [], 400], [['latitude' => '40', 'longitude' => -74], $token, [], 400], [['placeId' => 'ChIJ_Fixture'], $token, [], 400], [['latitude' => 40, 'longitude' => -74], '', [], 403], [['latitude' => 40, 'longitude' => -74], $token, ['Origin' => 'https://elsewhere.invalid'], 403]] as [$input, $auth, $headers, $status]) { $check($request('timezone', $input, $auth, $headers)->get_status() === $status, 'Preview input, session and origin security remain strict.'); }
    $check($provider_calls === 0, 'Offline timezone previews never call a provider.');
    $points = ['origin' => ['placeId' => 'ChIJ_Timezone_Provider'], 'destination' => ['latitude' => 40.6413, 'longitude' => -73.7781], 'stops' => []];
    $quote_response = $request('route', $points, $token); $quote = $quote_response->get_data();
    $check($quote_response->get_status() === 200 && $quote['pickupTimezone'] === 'America/New_York' && $quote['pickupTimezoneLabel'] === 'Eastern Time', 'Server route uses Google-resolved place origin for the pickup zone.');
    $quote_name = 'tuxano_quote_' . hash('sha256', $quote['quoteToken']); $transients[] = $quote_name; $saved_quote = get_transient($quote_name);
    $check($saved_quote['pickupTimezone'] === 'America/New_York', 'Authoritative zone is bound to the server quote.');
    $omit_origin = true; $missing = $request('route', $points, $token); $check($missing->get_status() === 502 && $missing->get_data()['code'] === 'tuxano_google_origin', 'A provider response with no resolved place geometry cannot guess a zone.'); $omit_origin = false;
    $coordinate_points = $points; $coordinate_points['origin'] = ['latitude' => 41.8781, 'longitude' => -87.6298];
    $direct = $request('route', $coordinate_points, $token); $direct_data = $direct->get_data(); $transients[] = 'tuxano_quote_' . hash('sha256', $direct_data['quoteToken']);
    $check($direct->get_status() === 200 && $direct_data['pickupTimezone'] === 'America/Chicago', 'A coordinate pickup retains its exact selected origin rather than a snapped provider point.');
    $slot_body = ['vehicleId' => (string) $vehicle_id, 'date' => $date, 'time' => '17:50', 'quoteToken' => $quote['quoteToken']];
    $check($request('availability', $slot_body, $token)->get_status() === 200, 'Availability accepts a session-bound authoritative zone quote.');
    $forged = $slot_body; $forged['timezone'] = 'Asia/Dhaka'; $check($request('availability', $forged, $token)->get_status() === 400, 'Arbitrary visitor timezone cannot alter a slot.');
    $foreign = $request('session')->get_data(); $transients[] = 'tuxano_session_' . hash('sha256', $foreign['token']);
    $check($request('availability', $slot_body, $foreign['token'])->get_status() === 409, 'Another session cannot borrow a timezone quote.');
    $gap = $slot_body; $gap['date'] = '2027-03-14'; $gap['time'] = '02:30'; $check($request('availability', $gap, $token)->get_status() === 400, 'Availability rejects a spring-forward nonexistent hour.');
    $fold = $slot_body; $fold['date'] = '2027-11-07'; $fold['time'] = '01:30'; $check($request('availability', $fold, $token)->get_status() === 400, 'Availability rejects an ambiguous repeated hour.');
    $booking = ['trip' => ['service' => 'transfer', 'hours' => 3, 'date' => $date, 'time' => '17:50', 'timezone' => 'Asia/Dhaka', 'pickup' => 'Fixture pickup, New York', 'dropoff' => 'Fixture airport', 'pickupPlace' => array_merge($points['origin'], ['latitude' => 23.81, 'longitude' => 90.41]), 'dropoffPlace' => $points['destination'], 'stops' => []], 'vehicle' => (string) $vehicle_id, 'passengers' => 1, 'luggage' => 1, 'meet' => false, 'child' => false, 'carSeats' => 0, 'boosterSeats' => 0, 'inPerson' => false, 'same' => true, 'consent' => true, 'gratuity' => '20', 'custom' => 20, 'billing' => ['first' => 'Pavel', 'last' => 'Fixture', 'email' => $run . '@example.test', 'phone' => '+17175550100', 'company' => '', 'street' => '123 Fixture Street', 'unit' => '', 'city' => 'New York', 'region' => 'NY', 'zip' => '', 'country' => 'United States', 'notes' => ''], 'passenger' => ['first' => 'Pavel', 'last' => 'Fixture', 'email' => $run . '@example.test', 'mobile' => '+17175550100'], 'flightType' => 'commercial', 'airline' => '', 'flight' => '', 'special' => ''];
    $limits = get_option(Settings::OPTION, []);
    update_option(Settings::OPTION, array_replace($limits, ['min_hours' => 2]), false);
    $short = $booking; $short['trip']['service'] = 'hourly'; $short['trip']['hours'] = 2; $short_rejected = false;
    try { Rest::validate_booking($short, $saved_quote); } catch (InvalidArgumentException $expected) { $short_rejected = true; }
    finally { update_option(Settings::OPTION, $limits, false); }
    $check($short_rejected, 'An upgraded legacy two-hour setting cannot bypass the new three-hour public minimum.');
    [$clean] = Rest::validate_booking($booking, $saved_quote);
    $check($clean['trip']['timezone'] === 'America/New_York' && !isset($clean['trip']['pickupPlace']['latitude']), 'Forged client zone/extra place coordinates cannot override server geographic authority.');
    $submitted_body = ['booking' => $booking, 'quoteToken' => $quote['quoteToken'], 'requestKey' => 'timezone_fixture_' . $run, 'website' => ''];
    $submitted = $request('bookings', $submitted_body, $token); $receipt = $submitted->get_data();
    $check($submitted->get_status() === 200 && $receipt['pickupTimezone'] === 'America/New_York', 'Saved receipt returns the authoritative original zone.');
    $id = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . Database::table() . ' WHERE reference=%s', $receipt['requestId'])); $ids[] = $id; $row = Database::find($id);
    $check($row['payload']['trip']['timezone'] === 'America/New_York' && $row['pickup_at'] === $date . ' 17:50:00' && $row['pickup_utc'] === $date . ' 21:50:00', 'Saved local and UTC timestamps use the reservation-date offset, not site or browser time.');
    $equivalent = Availability::slot((string) $vehicle_id, $date, '16:50', 'America/Chicago');
    $check($equivalent['pickup_utc'] === $row['pickup_utc'], 'Different wall times in two zones identify the same vehicle instant.');
    $edited = $row['payload']; $edited['billing']['first'] = 'Updated'; $edited['trip']['timezone'] = 'Pacific/Honolulu';
    $updated = BookingUpdates::save($id, $edited, BookingUpdates::revision($row), 'reviewing', '', false);
    $check(!is_wp_error($updated) && $updated['payload']['trip']['timezone'] === 'America/New_York' && $updated['pickup_utc'] === $row['pickup_utc'], 'Contact-only editing preserves saved zone and instant even if submitted hidden metadata differs.');
    $check($request('bookings', $submitted_body, $token)->get_data()['pickupTimezone'] === 'America/New_York', 'Idempotent replay retains accepted original zone after admin edits.');
    $changed_date = $updated['payload']; $changed_date['trip']['date'] = $year . '-01-15';
    $winter = BookingUpdates::save($id, $changed_date, BookingUpdates::revision($updated), 'reviewing', '', false);
    $check(!is_wp_error($winter) && $winter['payload']['trip']['timezone'] === 'America/New_York' && $winter['pickup_utc'] === $year . '-01-15 22:50:00', 'Changing the reservation date recomputes DST using the saved geographic zone.');
    $provider_point = ['latitude' => 41.8781, 'longitude' => -87.6298];
    $changed_pickup = $winter['payload']; $changed_pickup['trip']['pickupPlace'] = ['placeId' => 'ChIJ_Timezone_Chicago']; $changed_pickup['trip']['pickup'] = 'Fixture Chicago pickup';
    $central = BookingUpdates::save($id, $changed_pickup, BookingUpdates::revision($winter), 'reviewing', '', false);
    $check(!is_wp_error($central) && $central['payload']['trip']['timezone'] === 'America/Chicago' && $central['pickup_utc'] === $year . '-01-15 23:50:00', 'A changed pickup obtains a new provider-resolved geographic zone.');
    $legacy = $central['payload']; $legacy['trip']['timezone'] = '+00:00'; $legacy['trip']['time'] = '13:17';
    $legacy_id = Database::insert(['reference' => 'TUX-TZ-LEGACY-' . $run, 'request_key' => hash('sha256', $run . 'legacy'), 'request_hash' => hash('sha256', $run), 'status' => 'new', 'created_at' => gmdate('Y-m-d H:i:s'), 'pickup_at' => $legacy['trip']['date'] . ' 13:17:00', 'customer_name' => 'Legacy fixture', 'customer_email' => $legacy['billing']['email'], 'vehicle_name' => 'Timezone fixture', 'total' => $central['total'], 'currency' => 'USD', 'payload' => wp_json_encode($legacy), 'route' => wp_json_encode(['distanceMeters' => 16093.44, 'durationSeconds' => 1200]), 'pricing' => wp_json_encode($central['pricing']), 'notes' => '', 'customer_mail' => 'disabled', 'admin_mail' => 'disabled']);
    $check(is_int($legacy_id) && $legacy_id > 0, 'A historical fixed-offset fixture saves.'); $ids[] = $legacy_id;
    $legacy_row = Database::find($legacy_id); $legacy['billing']['first'] = 'Legacy edited'; $legacy_edit = BookingUpdates::save($legacy_id, $legacy, BookingUpdates::revision($legacy_row), 'reviewing', '', false);
    $check(!is_wp_error($legacy_edit) && $legacy_edit['payload']['trip']['timezone'] === '+00:00' && $legacy_edit['pickup_utc'] === $legacy_row['pickup_utc'], 'Existing fixed-offset records are never silently converted during contact/status edits.');
    $legacy['trip']['time'] = '13:18'; $legacy_retime = BookingUpdates::save($legacy_id, $legacy, BookingUpdates::revision($legacy_edit), 'reviewing', '', false);
    $check(!is_wp_error($legacy_retime) && $legacy_retime['payload']['trip']['timezone'] === 'America/Chicago', 'A newly changed legacy schedule resolves its actual pickup zone.');
    WP_CLI::success($checks . ' timezone checks passed.');
} finally {
    remove_filter('pre_http_request', $mock, 10); remove_filter('pre_wp_mail', $no_mail);
    foreach ($ids as $id) { $wpdb->delete(Database::table(), ['id' => $id]); }
    if ($vehicle_id) { wp_delete_post($vehicle_id, true); }
    foreach ($transients as $name) { delete_transient($name); }
    foreach ($wpdb->get_results($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%')) as $row) { if (!isset($rates[$row->option_name])) { delete_option($row->option_name); } }
    foreach ($rates as $name => $row) { update_option($name, $row->option_value, false); }
    if ($old_settings === null) { delete_option(Settings::OPTION); } else { update_option(Settings::OPTION, $old_settings, false); }
    if ($old_cursor === null) { delete_option('tuxano_schedule_cursor'); } else { update_option('tuxano_schedule_cursor', $old_cursor, false); }
    update_option('timezone_string', $old_zone); update_option('gmt_offset', $old_offset); wp_set_current_user($old_user);
    if ($old_remote === null) { unset($_SERVER['REMOTE_ADDR']); } else { $_SERVER['REMOTE_ADDR'] = $old_remote; }
}
