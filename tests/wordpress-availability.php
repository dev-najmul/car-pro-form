<?php
/** Vehicle-slot persistence, privacy, automatic mail and actual concurrent writes. */
use Tuxano\Booking\Availability;
use Tuxano\Booking\BookingUpdates;
use Tuxano\Booking\Database;
use Tuxano\Booking\Notifications;
use Tuxano\Booking\Rest;
use Tuxano\Booking\Settings;
use Tuxano\Booking\Vehicles;

if (!defined('WP_CLI') || !WP_CLI || wp_get_environment_type() !== 'local') { exit('Run only with WP-CLI in disposable local WordPress.'); }
global $wpdb;
$checks = 0;
$check = static function (bool $ok, string $message) use (&$checks): void { if (!$ok) { throw new RuntimeException($message); } ++$checks; };
$error = static function ($value, string $code, string $message) use ($check): void { $check(is_wp_error($value) && $value->get_error_code() === $code, $message); };
$original_settings = get_option(Settings::OPTION, null); $original_user = get_current_user_id();
$original_timezone = get_option('timezone_string'); $original_offset = get_option('gmt_offset'); $original_cursor = get_option('tuxano_schedule_cursor', null);
$original_remote = $_SERVER['REMOTE_ADDR'] ?? null;
$rates = $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%'), OBJECT_K);
$ids = []; $vehicle_ids = []; $transients = []; $workers = []; $directory = ''; $held = false; $mail = []; $accept_mail = true;
$run = bin2hex(random_bytes(6)); $sequence = 0;
$date = gmdate('Y-m-d', time() + 40 * DAY_IN_SECONDS);
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
$check(!empty($admins), 'An administrator is needed in isolated WordPress.'); $admin = (int) $admins[0];
$capture = static function ($preempt, array $args) use (&$mail, &$accept_mail) { $mail[] = $args; return $accept_mail; };
add_filter('pre_wp_mail', $capture, 10, 2);
$site = wp_parse_url(home_url('/')); $origin = $site['scheme'] . '://' . $site['host'] . (isset($site['port']) ? ':' . $site['port'] : '');
$request = static function (string $path, array $body, string $token = '', array $headers = []) use ($origin): WP_REST_Response {
    $r = new WP_REST_Request('POST', '/tuxano-booking/v1/' . $path);
    foreach (array_replace(['Origin' => $origin, 'Sec-Fetch-Site' => 'same-origin', 'Content-Type' => 'application/json'], $headers) as $key => $value) { $r->set_header($key, $value); }
    if ($token !== '') { $r->set_header('X-Tuxano-Session', $token); }
    $r->set_body(wp_json_encode($body));
    return apply_filters('rest_post_dispatch', rest_do_request($r), rest_get_server(), $r);
};

try {
    wp_set_current_user($admin); update_option('timezone_string', 'UTC'); update_option('gmt_offset', 0);
    $_SERVER['REMOTE_ADDR'] = '198.51.100.' . random_int(1, 254);
    $check(Settings::save(['email_customer' => true, 'email_admin' => false, 'max_stops' => 5, 'min_hours' => 1, 'max_hours' => 24, 'session_hourly_limit' => 120, 'booking_hourly_limit' => 100]) === true, 'Local availability settings save.');
    foreach (['A', 'B'] as $name) {
        $id = wp_insert_post(['post_type' => Vehicles::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Availability ' . $run . ' ' . $name]);
        $check(is_int($id) && $id > 0, 'A separate real fleet item is created.'); $vehicle_ids[] = $id;
        update_post_meta($id, '_tuxano_vehicle_data', ['display' => 'Fixture ' . $name, 'capacity' => 6, 'luggageCapacity' => 6, 'image' => '', 'models' => ['Fixture'], 'features' => ['Fixture'], 'tariff' => ['base' => 50, 'perMile' => 2, 'perDrivingMinute' => 1, 'minimum' => 75, 'perWaitingMinute' => 1, 'hourly' => 80]]);
    }
    $vehicle = Vehicles::find((string) $vehicle_ids[0]); $check($vehicle !== null, 'The fixture fleet item is bookable.');
    $booking = [
        'trip' => ['service' => 'transfer', 'hours' => 3, 'date' => $date, 'time' => '14:30', 'timezone' => 'UTC', 'pickup' => 'Fixture pickup', 'dropoff' => 'Fixture airport', 'pickupPlace' => ['placeId' => 'ChIJ_Availability_Pickup', 'countryCode' => 'US'], 'dropoffPlace' => ['placeId' => 'ChIJ_Availability_Dropoff', 'countryCode' => 'US'], 'stops' => []],
        'vehicle' => (string) $vehicle_ids[0], 'passengers' => 1, 'luggage' => 1, 'meet' => false, 'child' => false, 'carSeats' => 0, 'boosterSeats' => 0, 'inPerson' => false, 'same' => true, 'consent' => true, 'gratuity' => '20', 'custom' => 20,
        'billing' => ['first' => 'Availability', 'last' => 'Fixture', 'email' => $run . '@example.test', 'phone' => '+17175550100', 'company' => '', 'street' => '123 Fixture Street', 'unit' => '', 'city' => 'New York', 'region' => 'NY', 'zip' => '', 'country' => 'United States', 'notes' => ''],
        'passenger' => ['first' => 'Availability', 'last' => 'Fixture', 'email' => $run . '@example.test', 'mobile' => '+17175550100'], 'flightType' => 'commercial', 'airline' => '', 'flight' => '', 'special' => '', 'vehicleSnapshot' => $vehicle,
    ];
    $route = ['distanceMeters' => 16093.44, 'durationSeconds' => 1200, 'provider' => 'google'];
    $pricing = ['currency' => 'USD', 'transportation' => 90, 'meet' => 0, 'carCost' => 0, 'boosterCost' => 0, 'seats' => 0, 'percent' => 20, 'tip' => 18, 'total' => 108];
    $make = static function (array $changes = [], bool $legacy = false) use (&$sequence, &$ids, $run, $booking, $route, $pricing, $wpdb, $check): int {
        $body = $changes['payload'] ?? $booking; unset($changes['payload']); ++$sequence;
        $row = array_replace(['reference' => 'TUX-AVAIL-' . $run . '-' . $sequence, 'request_key' => hash('sha256', $run . $sequence), 'request_hash' => hash('sha256', 'content' . $run . $sequence), 'status' => 'new', 'created_at' => gmdate('Y-m-d H:i:s'), 'pickup_at' => $body['trip']['date'] . ' ' . $body['trip']['time'] . ':00', 'customer_name' => 'Availability Fixture', 'customer_email' => $body['billing']['email'], 'vehicle_name' => 'Fixture A', 'total' => 108, 'currency' => 'USD', 'payload' => wp_json_encode($body), 'route' => wp_json_encode($route), 'pricing' => wp_json_encode($pricing), 'notes' => '', 'customer_mail' => 'disabled', 'admin_mail' => 'disabled'], $changes);
        if ($legacy) { $ok = $wpdb->insert(Database::table(), $row); $id = $ok ? (int) $wpdb->insert_id : 0; }
        else { $id = Database::insert($row); }
        $check(is_int($id) && $id > 0, 'A disposable schedule fixture saves.'); $ids[] = $id; return $id;
    };
    $slot = Availability::from_booking($booking);
    $check($slot['pickup_utc'] === $date . ' 14:30:00' && $slot['vehicle_id'] === $vehicle_ids[0], 'UTC schedule fields derive from payload.');
    $check(Availability::slot($vehicle_ids[0], $date, '20:30', '+06:00') === $slot, 'Equivalent wall times in recorded timezones identify the same instant.');
    foreach ([['2027-02-30', '12:00', 'UTC'], ['2027-03-14', '02:30', 'America/New_York'], [$date, '24:00', 'UTC'], [$date, '14:30', 'Invalid/Timezone']] as $invalid) {
        try { Availability::slot($vehicle_ids[0], $invalid[0], $invalid[1], $invalid[2]); $check(false, 'Invalid/DST-gap schedules must reject.'); } catch (InvalidArgumentException $e) { $check(true, 'Invalid/DST-gap schedule rejects.'); }
    }
    $a = $make(); $b = $make();
    $check(Availability::check($slot)['state'] === 'requested', 'Pending requests warn without reserving a slot.');
    $other = Availability::slot($vehicle_ids[1], $date, '14:30');
    $check(Availability::check($other)['state'] === 'available', 'A different vehicle at the same minute remains available.');
    $confirmed = BookingUpdates::save($a, $booking, BookingUpdates::revision(Database::find($a)), 'confirmed', '', false);
    $check(!is_wp_error($confirmed) && $confirmed['status'] === 'confirmed', 'The native booking editor confirms and notifies even without the optional generic-email checkbox.');
    $check(count($mail) === 1 && strpos($mail[0]['subject'], 'confirmed') !== false && strpos($mail[0]['message'], 'Fixture pickup') !== false, 'A committed confirmation sends the short trip/price notification.');
    $row = Database::find($a); $check($row['update_mail'] === 'accepted' && $row['confirmed_slot'] === Availability::confirmed_key($slot), 'Confirmation and mail lease persist.');
    $check(Database::update($a, ['status' => 'confirmed']) === true && count($mail) === 1, 'Repeating an unchanged status does not notify again.');
    $error(Database::update($b, ['status' => 'confirmed']), 'tuxano_vehicle_unavailable', 'A second confirmation cannot double-book.');
    $check(Database::find($b)['status'] === 'new' && count($mail) === 1, 'A rejected confirmation changes no record or email.');
    $error(Database::insert(['payload' => wp_json_encode($booking), 'status' => 'new']), 'tuxano_vehicle_unavailable', 'Final insertion rechecks confirmed conflicts independently.');
    $check(Availability::check($slot)['state'] === 'unavailable', 'Confirmed availability blocks.');
    $different_booking = $booking; $different_booking['vehicle'] = (string) $vehicle_ids[1]; $make(['payload' => $different_booking]);
    $check(Availability::check($other)['state'] === 'requested', 'A separate vehicle can receive a concurrent request.');
    $check(Database::update($a, ['status' => 'cancelled']) === true && count($mail) === 2, 'Cancellation automatically notifies.');
    $check(Database::find($a)['confirmed_slot'] === null && Availability::check($slot)['state'] === 'requested', 'Cancelled slot is released but pending warnings remain.');
    $check(Database::update($b, ['status' => 'confirmed']) === true && count($mail) === 3, 'A waiting request can be confirmed after cancellation.');
    $check(Database::update($b, ['status' => 'completed']) === true && count($mail) === 4 && strpos($mail[3]['subject'], 'Thank you for travelling') !== false && strpos($mail[3]['message'], 'next journey') !== false, 'Completion sends one concise thank-you.');
    $check(Availability::check($slot)['state'] === 'available', 'Completed records no longer occupy this slot.');
    $silent = $make(); Settings::save(['email_customer' => false]);
    $check(Database::update($silent, ['status' => 'confirmed']) === true && count($mail) === 4 && Database::find($silent)['update_mail'] === 'disabled', 'Global customer-mail disable prevents automatic transport.');
    Settings::save(['email_customer' => true]);
    $check(Database::update($silent, ['status' => 'cancelled']) === true && count($mail) === 5, 'A later enabled lifecycle transition sends once.');
    $failed = $make(); $accept_mail = false;
    $check(Database::update($failed, ['status' => 'confirmed']) === true && Database::find($failed)['update_mail'] === 'failed', 'Mail failure cannot undo confirmed persistence.');
    $mail_count = count($mail); Settings::save(['email_customer' => false]);
    $check(!Notifications::send_update($failed, (int) Database::find($failed)['revision'], true) && count($mail) === $mail_count, 'Retry also respects a subsequently disabled customer preference.');
    Settings::save(['email_customer' => true]); $accept_mail = true;
    $check(Notifications::send_update($failed, (int) Database::find($failed)['revision'], true), 'Explicit retry recovers a failed status email.');
    $mail_count = count($mail); Notifications::send_update($failed, (int) Database::find($failed)['revision'], true);
    $check(count($mail) === $mail_count, 'Accepted update email cannot be repeated by retry.');
    Database::update($failed, ['status' => 'cancelled']);

    // Upgrade adds only derived indexes; historical accepted details are stable.
    $legacy_booking = $booking; $legacy_booking['trip']['time'] = '15:01';
    $legacy = $make(['payload' => $legacy_booking, 'status' => 'confirmed'], true);
    $before = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . Database::table() . ' WHERE id=%d', $legacy), ARRAY_A);
    $error(Availability::check(Availability::from_booking($legacy_booking)), 'tuxano_availability_unavailable', 'Unmigrated active rows do not advertise false availability.');
    Availability::backfill(); $after = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . Database::table() . ' WHERE id=%d', $legacy), ARRAY_A);
    foreach (array_keys($before) as $column) { if (!in_array($column, ['vehicle_id', 'pickup_utc', 'confirmed_slot'], true)) { $check($before[$column] === $after[$column], 'Backfill preserves original ' . $column); } }
    $check(Availability::check(Availability::from_booking($legacy_booking))['state'] === 'unavailable', 'Migrated confirmation blocks its true slot.');
    $check($after['pickup_at'] === $before['pickup_at'] && $after['confirmed_slot'] !== null, 'Local pickup remains unchanged while unique UTC key is added.');

    // Session-bound public checks reveal only state/message, never request data.
    wp_set_current_user(0); $session_response = $request('session', []); $session = $session_response->get_data();
    $check($session_response->get_status() === 200, 'A public session starts.'); $token = $session['token'];
    $session_name = 'tuxano_session_' . hash('sha256', $token); $transients[] = $session_name;
    $stored = get_transient($session_name); $stored['created'] = time() - 3; set_transient($session_name, $stored, 2 * HOUR_IN_SECONDS);
    $availability_quote = str_repeat('c', 64); $availability_quote_name = 'tuxano_quote_' . hash('sha256', $availability_quote); $transients[] = $availability_quote_name;
    set_transient($availability_quote_name, ['session' => hash('sha256', $token), 'points' => Rest::booking_points($booking), 'route' => $route, 'pickupTimezone' => 'UTC', 'revision' => Settings::revision()], 15 * MINUTE_IN_SECONDS);
    $body = ['vehicleId' => (string) $vehicle_ids[0], 'date' => $date, 'time' => '15:01', 'quoteToken' => $availability_quote];
    $reply = $request('availability', $body, $token); $data = $reply->get_data();
    $check($reply->get_status() === 200 && $data['state'] === 'unavailable' && array_keys($data) === ['state', 'message'], 'Public availability returns only a bounded state/message.');
    $check(strpos(wp_json_encode($data), $run) === false && strpos(wp_json_encode($data), '@') === false, 'Reference and customer data do not enter availability output.');
    $check(strpos($reply->get_headers()['Cache-Control'] ?? '', 'no-store') !== false, 'Availability responses cannot be cached.');
    foreach ([[$body, '', [], 403], [$body, $token, ['Origin' => 'https://elsewhere.invalid'], 403], [array_merge($body, ['timezone' => 'UTC']), $token, [], 400], [array_merge($body, ['date' => '2020-01-01']), $token, [], 400], [array_merge($body, ['vehicleId' => '999999999']), $token, [], 400], [array_merge($body, ['time' => []]), $token, [], 400], [array_diff_key($body, ['quoteToken' => true]), $token, [], 400], [array_merge($body, ['quoteToken' => str_repeat('0', 64)]), $token, [], 409]] as $case) {
        $check($request('availability', $case[0], $case[1], $case[2])->get_status() === $case[3], 'Malformed, stale, cross-origin and unauthenticated availability checks reject.');
    }
    // A stale page can never skip the final server check; replays remain safe.
    $public_booking = $booking; $public_booking['trip']['time'] = '16:10';
    $quote = str_repeat('d', 64); $quote_name = 'tuxano_quote_' . hash('sha256', $quote); $transients[] = $quote_name;
    set_transient($quote_name, ['session' => hash('sha256', $token), 'points' => Rest::booking_points($public_booking), 'route' => $route, 'pickupTimezone' => 'UTC', 'revision' => Settings::revision()], 15 * MINUTE_IN_SECONDS);
    $submission = ['booking' => $public_booking, 'requestKey' => 'availability-' . $run . '-public', 'quoteToken' => $quote, 'website' => ''];
    $received = $request('bookings', $submission, $token); $check($received->get_status() === 200, 'A pending public request saves normally.');
    $reference = $received->get_data()['requestId']; $public_id = (int) $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . Database::table() . ' WHERE reference=%s', $reference)); $ids[] = $public_id;
    wp_set_current_user($admin); $check(Database::update($public_id, ['status' => 'confirmed']) === true, 'That pending public request can be confirmed.'); wp_set_current_user(0);
    $replay = $request('bookings', $submission, $token); $check($replay->get_status() === 200 && $replay->get_data()['requestId'] === $reference, 'Idempotent replay still returns the original receipt after confirmation.');
    $submission['requestKey'] .= '-different'; $rejected = $request('bookings', $submission, $token);
    $check($rejected->get_status() === 409 && $rejected->get_data()['code'] === 'tuxano_vehicle_unavailable', 'Another submission cannot use that now-confirmed vehicle/time.');

    // Two independent PHP/DB connections queue behind one short write lock.
    wp_set_current_user($admin); Settings::save(['email_customer' => false]);
    $racing = $booking; $racing['trip']['time'] = '17:59'; $first = $make(['payload' => $racing]); $second = $make(['payload' => $racing]);
    $directory = sys_get_temp_dir() . '/tuxano-availability-' . bin2hex(random_bytes(8)); mkdir($directory, 0700);
    $check((string) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 1)', Availability::lock_name())) === '1', 'Race controller holds the real database lock.'); $held = true;
    foreach ([$first, $second] as $worker_id) {
        $pipes = []; $process = proc_open([PHP_BINARY, __DIR__ . '/helpers/availability-confirm-worker.php', ABSPATH, (string) $worker_id, (string) $admin, $directory], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $check(is_resource($process), 'An independent confirmation worker starts.'); fclose($pipes[0]); $workers[] = ['process' => $process, 'out' => $pipes[1], 'err' => $pipes[2]];
    }
    $deadline = microtime(true) + 2.4;
    do { if (is_file($directory . '/' . $first . '.ready') && is_file($directory . '/' . $second . '.ready')) { break; } usleep(20000); } while (microtime(true) < $deadline);
    $ready = is_file($directory . '/' . $first . '.ready') && is_file($directory . '/' . $second . '.ready');
    $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', Availability::lock_name())); $held = false;
    $check($ready, 'Both real processes queued before the controller released the lock.');
    $results = [];
    foreach ($workers as $worker) { $out = stream_get_contents($worker['out']); $err = stream_get_contents($worker['err']); fclose($worker['out']); fclose($worker['err']); $exit = proc_close($worker['process']); $check($exit === 0 && trim($err) === '', 'Worker finishes without PHP/network errors.'); $results[] = json_decode($out, true); } $workers = [];
    $check(count(array_filter($results, static function ($r) { return !empty($r['ok']); })) === 1 && count(array_filter($results, static function ($r) { return ($r['code'] ?? '') === 'tuxano_vehicle_unavailable'; })) === 1, 'Exactly one concurrent confirmation succeeds; the other receives the conflict.');
    $check((int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . Database::table() . " WHERE id IN (%d,%d) AND status='confirmed'", $first, $second)) === 1, 'Database contains exactly one confirmed booking for the raced slot.');
    $winner = Database::find($first)['status'] === 'confirmed' ? $first : $second; $loser = $winner === $first ? $second : $first;
    $previous = $wpdb->suppress_errors(true); $forced = $wpdb->update(Database::table(), ['status' => 'confirmed', 'confirmed_slot' => Database::find($winner)['confirmed_slot']], ['id' => $loser]); $wpdb->suppress_errors($previous);
    $check($forced === false && Database::find($loser)['status'] === 'new', 'A unique database index also rejects a direct conflicting write.');
    $other_connection = new wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
    $check((string) $other_connection->get_var($other_connection->prepare('SELECT GET_LOCK(%s, 1)', Availability::lock_name())) === '1', 'An independent connection can hold the schedule lock.');
    try {
        $before_blocked = Database::find($loser);
        $error(Database::update($loser, ['status' => 'confirmed']), 'tuxano_availability_unavailable', 'A busy/unavailable write lock fails closed instead of skipping conflict validation.');
        $check(Database::find($loser) === $before_blocked, 'Lock contention leaves the complete saved request unchanged.');
    } finally { $other_connection->get_var($other_connection->prepare('SELECT RELEASE_LOCK(%s)', Availability::lock_name())); $other_connection->close(); }
    WP_CLI::success('WordPress availability/concurrency/status-email checks passed: ' . $checks);
} finally {
    if ($held) { $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', Availability::lock_name())); }
    foreach ($workers as $worker) { proc_terminate($worker['process']); foreach (['out', 'err'] as $key) { if (is_resource($worker[$key])) { fclose($worker[$key]); } } proc_close($worker['process']); }
    remove_filter('pre_wp_mail', $capture, 10);
    foreach ($ids as $id) { Database::delete((int) $id); }
    foreach ($vehicle_ids as $id) { wp_delete_post($id, true); }
    foreach ($transients as $name) { delete_transient($name); }
    foreach ($wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%')) as $name) { if (isset($rates[$name])) { update_option($name, $rates[$name]->option_value, false); } else { delete_option($name); } }
    if ($original_settings === null) { delete_option(Settings::OPTION); } else { update_option(Settings::OPTION, $original_settings, false); }
    if ($original_cursor === null) { delete_option('tuxano_schedule_cursor'); } else { update_option('tuxano_schedule_cursor', $original_cursor, false); }
    update_option('timezone_string', $original_timezone); update_option('gmt_offset', $original_offset);
    if ($original_remote === null) { unset($_SERVER['REMOTE_ADDR']); } else { $_SERVER['REMOTE_ADDR'] = $original_remote; }
    wp_set_current_user($original_user);
    if ($directory !== '' && is_dir($directory)) { foreach (glob($directory . '/*') ?: [] as $file) { unlink($file); } rmdir($directory); }
}
