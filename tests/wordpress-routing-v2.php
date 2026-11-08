<?php
/** Complete transfer positioning routes, forecasts and quote/service isolation. */
use Tuxano\Booking\Rest;
use Tuxano\Booking\Settings;
use Tuxano\Booking\Vehicles;

if (!defined('WP_CLI') || !WP_CLI || wp_get_environment_type() !== 'local') { exit('Disposable local WP-CLI fixtures only.'); }
require_once __DIR__ . '/helpers/wordpress-session.php';

global $wpdb;
$checks = 0;
$check = static function (bool $ok, string $message) use (&$checks): void { if (!$ok) { throw new RuntimeException($message); } ++$checks; };
$old_cursor = get_option('tuxano_schedule_cursor', null);
$old_settings = get_option(Settings::OPTION, null); $old_user = get_current_user_id(); $old_remote = $_SERVER['REMOTE_ADDR'] ?? null;
$rates = $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%'), OBJECT_K);
$ids = []; $transients = []; $calls = []; $fail_at = 0; $bad_legs = false; $omit_pickup = false; $change_base_at = 0; $zero_pickup = false; $unverified_zero = false;
$base = '304 Sype Dr., Carol Stream, IL 60188, USA'; $run = bin2hex(random_bytes(5)); $date = ((int) gmdate('Y') + 1) . '-07-15';
$site = wp_parse_url(home_url('/')); $origin = $site['scheme'] . '://' . $site['host'] . (isset($site['port']) ? ':' . $site['port'] : '');
$request = static function (string $path, $body = [], string $token = '') use ($origin): WP_REST_Response {
    $r = new WP_REST_Request('POST', '/tuxano-booking/v1/' . $path);
    $headers = tuxano_test_session_headers($token, ['Origin' => $origin, 'Sec-Fetch-Site' => 'same-origin', 'Content-Type' => 'application/json']);
    foreach ($headers as $key => $value) { $r->set_header($key, $value); }
    if ($token !== '') { $r->set_header('X-Tuxano-Session', $token); }
    $r->set_body(wp_json_encode($body)); return apply_filters('rest_post_dispatch', rest_do_request($r), rest_get_server(), $r);
};
$mock = static function ($preempt, array $args, string $url) use (&$calls, &$fail_at, &$bad_legs, &$omit_pickup, &$change_base_at, &$zero_pickup, &$unverified_zero, $base, $check) {
    $payload = json_decode($args['body'], true); $calls[] = $payload; $index = count($calls);
    $check($url === 'https://routes.googleapis.com/directions/v2:computeRoutes' && $args['sslverify'] === true && $args['redirection'] === 0 && $args['limit_response_size'] === 262144, 'Provider URL, TLS, redirects and body bounds stay fixed.');
    $check(!isset($payload['arrivalTime']) && $payload['optimizeWaypointOrder'] === false && $payload['computeAlternativeRoutes'] === false, 'No unsupported DRIVE arrival time or stop reordering is sent.');
    if ($change_base_at === $index) { Settings::save(['transfer_base_address' => '500 Another Base Street, Carol Stream, IL 60188']); }
    if ($fail_at === $index) { return ['headers' => [], 'response' => ['code' => 503], 'body' => '{}', 'cookies' => []]; }
    $leg = static function (float $miles, float $seconds, array $point): array { return ['distanceMeters' => $miles * 1609.344, 'duration' => $seconds . 's', 'startLocation' => ['latLng' => $point]]; };
    $base_point = ['latitude' => 41.912, 'longitude' => -88.134]; $pickup_point = $zero_pickup ? $base_point : ['latitude' => 40.758, 'longitude' => -73.9855];
    $legacy = $args['headers']['X-Goog-FieldMask'] === 'routes.distanceMeters,routes.duration,routes.legs.startLocation.latLng';
    if ($legacy) {
        $check($payload['routingPreference'] === 'TRAFFIC_UNAWARE' && !isset($payload['departureTime']), 'Legacy and Hourly routes keep their traffic-unaware behavior.');
        return ['headers' => [], 'response' => ['code' => 200], 'body' => wp_json_encode(['routes' => [['distanceMeters' => 96.5 * 1609.344, 'duration' => '6240s', 'legs' => [['startLocation' => ['latLng' => $pickup_point]]]]]]), 'cookies' => []];
    }
    $check(strpos($args['headers']['X-Goog-FieldMask'], 'routes.legs.duration') !== false && strpos($args['headers']['X-Goog-FieldMask'], 'routes.legs.startLocation.latLng') !== false && $args['timeout'] === 12, 'Transfer mask requests separate verified legs with a bounded per-call timeout.');
    if ($payload['routingPreference'] === 'TRAFFIC_UNAWARE') {
        $check($payload['origin'] === ['address' => $base] && $payload['destination'] === ['address' => $base] && count($payload['intermediates']) === 3 && !isset($payload['departureTime']), 'Only the server-configured exact base is used in the initial positioning probe.');
        $legs = [$leg($zero_pickup ? 0 : 123, $zero_pickup ? 0 : 6000, $base_point), $leg(50, 3000, $pickup_point), $leg(46.5, 3240, $pickup_point), $leg(34.9, 2700, $pickup_point)];
        if ($omit_pickup) { unset($legs[1]['startLocation']); }
        if ($bad_legs) { array_pop($legs); }
        $route = ['distanceMeters' => ($zero_pickup ? 131.4 : 254.4) * 1609.344, 'duration' => $zero_pickup ? '8940s' : '14940s', 'legs' => $legs];
    } else {
        $check($payload['routingPreference'] === 'TRAFFIC_AWARE' && is_string($payload['departureTime'] ?? null) && strtotime($payload['departureTime']) > time(), 'Every billed transfer leg uses a valid traffic-aware future departure.');
        if (isset($payload['origin']['address'])) {
            $route = ['distanceMeters' => 123 * 1609.344, 'duration' => '7200s', 'legs' => [$leg(123, 7200, $base_point)]];
            if ($zero_pickup) {
                $zero = ['duration' => '0s', 'startLocation' => ['latLng' => $base_point], 'endLocation' => ['latLng' => $base_point]];
                if ($unverified_zero) { unset($zero['endLocation']); }
                $route = ['duration' => '0s', 'legs' => [$zero]];
            }
        }
        elseif (isset($payload['destination']['address'])) { $route = ['distanceMeters' => 34.9 * 1609.344, 'duration' => '2700s', 'legs' => [$leg(34.9, 2700, $pickup_point)]]; }
        else { $check(count($payload['intermediates']) === 1, 'Passenger B keeps the selected ordered stops.'); $route = ['distanceMeters' => 96.5 * 1609.344, 'duration' => '6240s', 'legs' => [$leg(50, 3000, $pickup_point), $leg(46.5, 3240, $pickup_point)]]; }
    }
    return ['headers' => [], 'response' => ['code' => 200], 'body' => wp_json_encode(['routes' => [$route]]), 'cookies' => []];
};
$no_mail = static function () { throw new RuntimeException('Routing fixtures never send mail.'); };
add_filter('pre_http_request', $mock, 10, 3); add_filter('pre_wp_mail', $no_mail);

try {
    foreach ($rates as $name => $row) { delete_option($name); }
    $admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']); $check(!empty($admins), 'A local administrator exists.'); wp_set_current_user((int) $admins[0]); $_SERVER['REMOTE_ADDR'] = '192.0.2.' . random_int(1, 254);
    $check(Settings::save(['routes_key' => 'routing_v2_fixture_key_123456789012345', 'transfer_base_address' => $base, 'email_customer' => false, 'email_admin' => false, 'route_daily_limit' => 1000, 'route_minute_limit' => 120, 'min_hours' => 3, 'max_hours' => 24]) === true, 'Isolated route settings save.');
    $check(Settings::public_data()['transferPricing'] === true && Settings::public_data()['transferTrafficBasis'] === 'pickup' && !isset(Settings::public_data()['transfer_base_address']), 'Public capability advertises forecast support without exposing private routing configuration.');
    $revision = Settings::revision();
    foreach (['', str_repeat('x', 513), "Street\nAnother", '<b>Street</b>'] as $bad) { $check(is_wp_error(Settings::save(['transfer_base_address' => $bad])) && Settings::get()['transfer_base_address'] === $base, 'Invalid or blank bases fail without replacing the existing address.'); }
    $check(Settings::save(['transfer_base_address' => '500 Other Street, Carol Stream, IL']) === true && Settings::revision() !== $revision, 'Base changes invalidate the authoritative pricing revision.'); Settings::save(['transfer_base_address' => $base]);
    $vehicle_id = wp_insert_post(['post_type' => Vehicles::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Routing v2 fixture ' . $run]); $ids[] = $vehicle_id;
    $tariff = ['base' => 0, 'perMile' => 3, 'perDrivingMinute' => 2.5, 'minimum' => 150, 'perWaitingMinute' => 2.5, 'hourly' => 150, 'transfer' => ['version' => 2, 'mode' => 'mileage', 'pickupFreeMinutes' => 30, 'returnFreeMinutes' => 30, 'roundingMinutes' => 15, 'minimumMinutes' => 60, 'pickupFreeMiles' => 20, 'returnFreeMiles' => 20], 'hourlyBooking' => ['hourly' => 150, 'perMile' => 2, 'perWaitingMinute' => 1]];
    update_post_meta($vehicle_id, '_tuxano_vehicle_data', ['display' => 'Routing fixture', 'capacity' => 6, 'luggageCapacity' => 6, 'image' => '', 'models' => ['Fixture'], 'features' => ['Fixture'], 'tariff' => $tariff]);
    $session = $request('session')->get_data(); $token = $session['token']; $transients[] = 'tuxano_session_' . hash('sha256', $token);
    $points = ['origin' => ['placeId' => 'ChIJ_Routing_Fixture_Pickup'], 'destination' => ['placeId' => 'ChIJ_Routing_Fixture_Dropoff'], 'stops' => [['placeId' => 'ChIJ_Routing_Fixture_Stop']]];
    $context = ['service' => 'transfer', 'date' => $date, 'time' => '17:50', 'waitMinutes' => [15]];
    $input = $points + ['trip' => $context];
    foreach ([['service' => 'unknown'], ['date' => '2027-02-30'], ['time' => '24:10'], ['date' => ''], ['waitMinutes' => []], ['waitMinutes' => [7]], ['waitMinutes' => ['15']], ['waitMinutes' => [1 => 15]], ['timezone' => 'Asia/Dhaka'], ['mode' => 'time']] as $bad) {
        $invalid = $input; $invalid['trip'] = array_replace($context, $bad); $before = count($calls); $response = $request('route', $invalid, $token); $check($response->get_status() === 400 && count($calls) === $before, 'Malformed route contexts fail before provider work.');
    }
    $calls = []; $response = $request('route', $input, $token); $route = $response->get_data();
    $check($response->get_status() === 200 && count($calls) === 4, 'A complete scheduled transfer consumes exactly four bounded provider calls.');
    $check(abs($route['distanceMeters'] / 1609.344 - 96.5) < 0.000001 && $route['durationSeconds'] === 6240.0, 'Top-level route metrics contain passenger B only.');
    $check(abs($route['transferLegs']['pickup']['distanceMeters'] / 1609.344 - 123) < 0.000001 && $route['transferLegs']['pickup']['durationSeconds'] === 7200.0 && $route['transferLegs']['return']['durationSeconds'] === 2700.0, 'Positioning and return measurements remain separate and traffic-aware.');
    $check($route['pickupTimezone'] === 'America/New_York' && $route['trafficBasis'] === 'pickup', 'Pickup geography determines the zone instead of the Chicago service base.');
    $pickup_at = new DateTimeImmutable($date . ' 17:50:00', new DateTimeZone('America/New_York'));
    $check($calls[1]['departureTime'] === $pickup_at->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z'), 'Passenger forecast starts at the selected pickup-local instant.');
    $check(strtotime($calls[2]['departureTime']) === $pickup_at->getTimestamp() - 6000 && strtotime($calls[3]['departureTime']) === $pickup_at->getTimestamp() + 6240 + 900, 'Base departure uses its probe estimate; return starts after passenger driving and stop waiting.');
    $quote_name = 'tuxano_quote_' . hash('sha256', $route['quoteToken']); $transients[] = $quote_name; $quote = get_transient($quote_name);
    $check($quote['trip'] === $context && $quote['revision'] === $route['pricingRevision'] && $quote['revision'] === Settings::revision(), 'The server quote binds service, calendar, waiting order and pre-provider pricing revision.');
    $booking = ['trip' => ['service' => 'transfer', 'hours' => 3, 'date' => $date, 'time' => '17:50', 'timezone' => 'Asia/Dhaka', 'pickup' => 'Fixture pickup', 'dropoff' => 'Fixture dropoff', 'pickupPlace' => $points['origin'], 'dropoffPlace' => $points['destination'], 'stops' => [['text' => 'Fixture stop', 'waitMinutes' => 15, 'place' => $points['stops'][0]]]], 'vehicle' => (string) $vehicle_id, 'passengers' => 1, 'luggage' => 1, 'meet' => false, 'child' => false, 'carSeats' => 0, 'boosterSeats' => 0, 'inPerson' => false, 'same' => true, 'consent' => true, 'gratuity' => '20', 'custom' => 20, 'billing' => ['first' => 'Route', 'last' => 'Fixture', 'email' => $run . '@example.test', 'phone' => '+13125550100', 'company' => '', 'street' => '1 Fixture Street', 'unit' => '', 'city' => 'New York', 'region' => '', 'zip' => '', 'country' => 'United States', 'notes' => ''], 'passenger' => ['first' => 'Route', 'last' => 'Fixture', 'email' => $run . '@example.test', 'mobile' => '+13125550100'], 'flightType' => 'commercial', 'airline' => '', 'flight' => '', 'special' => ''];
    [$clean] = Rest::validate_booking($booking, $quote); $check($clean['trip']['timezone'] === 'America/New_York', 'Client timezone cannot alter the forecast/booking authority.');
    foreach (['service', 'date', 'time', 'wait'] as $change) {
        $other = $booking;
        if ($change === 'service') { $other['trip']['service'] = 'hourly'; }
        elseif ($change === 'date') { $other['trip']['date'] = ((int) gmdate('Y') + 1) . '-07-16'; }
        elseif ($change === 'time') { $other['trip']['time'] = '18:00'; }
        else { $other['trip']['stops'][0]['waitMinutes'] = 20; }
        $rejected = false; try { Rest::validate_booking($other, $quote); } catch (InvalidArgumentException $error) { $rejected = true; }
        $check($rejected, 'A changed service, date, time or wait cannot reuse the forecast quote.');
    }
    $unbound = $quote; unset($unbound['trip']); $rejected = false; try { Rest::validate_booking($booking, $unbound); } catch (InvalidArgumentException $error) { $rejected = true; } $check($rejected, 'A current v2 vehicle cannot borrow a legacy unbound quote.');
    $availability = ['vehicleId' => (string) $vehicle_id, 'date' => $date, 'time' => '17:50', 'quoteToken' => $route['quoteToken'], 'service' => 'transfer'];
    $check($request('availability', $availability, $token)->get_status() === 200, 'Matching v2 service/schedule availability works.');
    foreach (['missing', 'wrong-service', 'wrong-date', 'wrong-time'] as $change) { $other = $availability; if ($change === 'missing') { unset($other['service']); } elseif ($change === 'wrong-service') { $other['service'] = 'hourly'; } elseif ($change === 'wrong-date') { $other['date'] = ((int) gmdate('Y') + 1) . '-07-16'; } else { $other['time'] = '18:00'; } $check($request('availability', $other, $token)->get_status() === 409, 'Availability refuses a stale or mismatched forecast quote.'); }
    $calls = []; $hourly = $input; $hourly['trip']['service'] = 'hourly'; $response = $request('route', $hourly, $token); $data = $response->get_data(); $transients[] = 'tuxano_quote_' . hash('sha256', $data['quoteToken']);
    $check($response->get_status() === 200 && count($calls) === 1 && !isset($data['transferLegs']), 'Hourly makes one unchanged passenger-only Google call.');
    $calls = []; $hourly['trip']['time'] = ''; $response = $request('route', $hourly, $token); $data = $response->get_data(); $transients[] = 'tuxano_quote_' . hash('sha256', $data['quoteToken']);
    $check($response->get_status() === 200 && count($calls) === 1, 'Hourly can preview passenger metrics while the visitor is still selecting date/time.');
    $calls = []; $zero_pickup = true; $response = $request('route', $input, $token); $data = $response->get_data();
    $check($response->get_status() === 200 && $data['transferLegs']['pickup']['distanceMeters'] === 0.0 && $data['transferLegs']['pickup']['durationSeconds'] === 0.0, 'A genuinely zero positioning leg with matching Google endpoints survives protobuf zero-field omission.'); $transients[] = 'tuxano_quote_' . hash('sha256', $data['quoteToken']);
    $calls = []; $unverified_zero = true; $failed = $request('route', $input, $token); $check($failed->get_status() === 502 && count($calls) === 3, 'Missing route measurements are not defaulted to zero without verified coincident endpoints.'); $zero_pickup = false; $unverified_zero = false;
    $calls = []; $bad_legs = true; $failed = $request('route', $input, $token); $check($failed->get_status() === 502 && count($calls) === 1 && !isset($failed->get_data()['quoteToken']), 'Incomplete positioning legs cannot become a zero-cost or legacy quote.'); $bad_legs = false;
    $calls = []; $omit_pickup = true; $failed = $request('route', $input, $token); $check($failed->get_status() === 502 && count($calls) === 1, 'Missing authoritative pickup geometry never guesses the base zone.'); $omit_pickup = false;
    $calls = []; $fail_at = 3; $failed = $request('route', $input, $token); $check($failed->get_status() === 502 && count($calls) === 3 && !isset($failed->get_data()['quoteToken']), 'A failed positioning call cannot silently reuse probe durations.'); $fail_at = 0;
    $calls = []; $change_base_at = 2; $failed = $request('route', $input, $token); $check($failed->get_status() === 409 && $failed->get_data()['code'] === 'tuxano_pricing_changed' && !isset($failed->get_data()['quoteToken']), 'A service-base change during provider work cannot stamp new settings onto old measurements.'); $change_base_at = 0; Settings::save(['transfer_base_address' => $base]);
    $global_name = '_tuxano_rate_' . hash('sha256', 'route-global' . 'all' . (int) floor(time() / DAY_IN_SECONDS)); delete_option($global_name); Settings::save(['route_daily_limit' => 2]);
    $calls = []; $failed = $request('route', $input, $token); $check($failed->get_status() === 429 && count($calls) === 2, 'Every transfer provider call consumes the shared daily budget.'); Settings::save(['route_daily_limit' => 1000]); delete_option($global_name);
    $calls = []; $historical = $booking['trip']; $historical['date'] = ((int) gmdate('Y') - 1) . '-07-15'; $metrics = Rest::measure_booking_route($points, $historical, true);
    $check(!is_wp_error($metrics) && count($calls) === 4 && $metrics['trafficBasis'] === 'current-for-historical-pickup', 'An explicit historical admin recalculation records current-traffic basis rather than making an invalid past Google forecast.');
    $calls = []; $soon = $booking['trip']; $local = (new DateTimeImmutable('now', new DateTimeZone('America/New_York')))->modify('+2 minutes'); $soon['date'] = $local->format('Y-m-d'); $soon['time'] = $local->format('H:i'); $metrics = Rest::measure_booking_route($points, $soon, true);
    $check(!is_wp_error($metrics) && count($calls) === 4 && strtotime($metrics['baseDepartureUtc']) > time(), 'Near-term pickup forecasts clamp impossible past base departures honestly.');
    WP_CLI::success('WordPress transfer routing/security checks passed: ' . $checks);
} finally {
    remove_filter('pre_http_request', $mock, 10); remove_filter('pre_wp_mail', $no_mail);
    foreach ($transients as $name) { delete_transient($name); }
    foreach ($ids as $id) { wp_delete_post((int) $id, true); }
    foreach ($wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%')) as $name) { if (!isset($rates[$name])) { delete_option($name); } }
    foreach ($rates as $name => $row) { update_option($name, $row->option_value, false); }
    if ($old_settings === null) { delete_option(Settings::OPTION); } else { update_option(Settings::OPTION, $old_settings, false); }
    if ($old_cursor === null) { delete_option('tuxano_schedule_cursor'); } else { update_option('tuxano_schedule_cursor', $old_cursor, false); }
    wp_set_current_user($old_user); if ($old_remote === null) { unset($_SERVER['REMOTE_ADDR']); } else { $_SERVER['REMOTE_ADDR'] = $old_remote; }
}
