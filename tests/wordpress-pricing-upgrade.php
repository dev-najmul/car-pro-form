<?php
/** Native fleet migration and historical-price preservation. No provider or mail transport. */
use Tuxano\Booking\BookingUpdates;
use Tuxano\Booking\Database;
use Tuxano\Booking\Pricing;
use Tuxano\Booking\Rest;
use Tuxano\Booking\Settings;
use Tuxano\Booking\Vehicles;

if (!defined('WP_CLI') || !WP_CLI || wp_get_environment_type() !== 'local') {
    exit('Run only with WP-CLI in an isolated local WordPress installation.');
}

global $wpdb;
$checks = 0;
$check = static function (bool $condition, string $message) use (&$checks): void {
    if (!$condition) { throw new RuntimeException($message); }
    ++$checks;
};
$original_user = get_current_user_id();
$original_post = $_POST;
$original_settings = get_option(Settings::OPTION, null);
$original_remote = $_SERVER['REMOTE_ADDR'] ?? null;
$rate_snapshot = $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%'), OBJECT_K);
$marker = 'tuxano_booking_transfer_pricing_version';
$original_marker = get_option($marker, null);
$created_posts = [];
$created_bookings = [];
$premium_id = 0;
$premium_meta = null;
$premium_status = '';
$premium_terms = [];
$original_vehicle_meta = [];
$http_calls = 0;
$mail_calls = 0;
$allow_routing = false;
$provider_calls = [];
$provider_fail_at = 0;
$run = 'pricing_upgrade_' . bin2hex(random_bytes(8));
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
$check(!empty($admins), 'A local administrator must exist.');
$leg = static function (float $miles, int $seconds, array $point): array {
    return ['distanceMeters' => $miles * 1609.344, 'duration' => $seconds . 's', 'startLocation' => ['latLng' => $point]];
};
$http = static function ($preempt, array $args, string $url) use (&$http_calls, &$allow_routing, &$provider_calls, &$provider_fail_at, $leg, $check) {
    ++$http_calls;
    if (!$allow_routing) { return new WP_Error('fixture_no_network', 'This preservation phase permits no provider request.'); }
    $check($url === 'https://routes.googleapis.com/directions/v2:computeRoutes' && ($args['sslverify'] ?? true) === true && $args['redirection'] === 0 && $args['timeout'] <= 15, 'Administrative repricing uses only bounded verified Google routing.');
    $payload = json_decode($args['body'], true); $provider_calls[] = $payload;
    if ($provider_fail_at && count($provider_calls) === $provider_fail_at) { return new WP_Error('fixture_provider_outage', 'Deterministic forecast failure.'); }
    $pickup = ['latitude' => 41.8818, 'longitude' => -87.6232];
    $base = ['latitude' => 41.94, 'longitude' => -88.12];
    if (isset($payload['origin']['address'], $payload['destination']['address'])) {
        $check($payload['routingPreference'] === 'TRAFFIC_UNAWARE' && count($payload['intermediates']) === 3, 'The positioning probe keeps the complete base/pickup/stop/drop-off loop.');
        $route = ['distanceMeters' => 55 * 1609.344, 'duration' => '4500s', 'legs' => [$leg(15, 1800, $base), $leg(15, 900, $pickup), $leg(15, 900, $pickup), $leg(10, 900, $pickup)]];
    } elseif (isset($payload['origin']['address'])) {
        $check($payload['routingPreference'] === 'TRAFFIC_AWARE' && strtotime($payload['departureTime']) > time(), 'Pickup positioning has an explicitly forecast departure.');
        $route = ['distanceMeters' => 15 * 1609.344, 'duration' => '2100s', 'legs' => [$leg(15, 2100, $base)]];
    } elseif (isset($payload['destination']['address'])) {
        $check($payload['routingPreference'] === 'TRAFFIC_AWARE' && strtotime($payload['departureTime']) > time(), 'Return positioning has an explicitly forecast departure.');
        $route = ['distanceMeters' => 10 * 1609.344, 'duration' => '900s', 'legs' => [$leg(10, 900, $pickup)]];
    } else {
        $check(count($payload['intermediates']) === 1, 'Both services retain the selected passenger stop.');
        $route = ['distanceMeters' => 30 * 1609.344, 'duration' => '1800s', 'legs' => [$leg(15, 900, $pickup), $leg(15, 900, $pickup)]];
    }
    return ['headers' => [], 'response' => ['code' => 200], 'body' => wp_json_encode(['routes' => [$route]]), 'cookies' => []];
};
$mail = static function () use (&$mail_calls): bool { ++$mail_calls; return true; };

try {
    wp_set_current_user((int) $admins[0]);
    $_SERVER['REMOTE_ADDR'] = '198.51.100.' . random_int(1, 254);
    add_filter('pre_http_request', $http, 10, 3);
    add_filter('pre_wp_mail', $mail, 10, 2);
    $check(Settings::save(['currency' => 'USD', 'email_customer' => false, 'email_admin' => false, 'min_hours' => 3, 'max_hours' => 24, 'max_stops' => 5, 'routes_key' => 'pricing_upgrade_fixture_key_123456789012345', 'route_daily_limit' => 10000, 'route_minute_limit' => 120]) === true, 'Local migration fixture settings save.');
    $check(method_exists(Vehicles::class, 'upgrade_pricing'), 'A public idempotent fleet-pricing upgrade entry is available.');
    foreach (get_posts(['post_type' => Vehicles::POST_TYPE, 'post_status' => ['publish', 'draft', 'pending', 'private', 'future', 'trash', 'auto-draft'], 'posts_per_page' => -1]) as $post) {
        $original_vehicle_meta[$post->ID] = ['exists' => metadata_exists('post', $post->ID, '_tuxano_vehicle_data'), 'data' => get_post_meta($post->ID, '_tuxano_vehicle_data', true), 'backupExists' => metadata_exists('post', $post->ID, '_tuxano_pricing_pre_260'), 'backup' => get_post_meta($post->ID, '_tuxano_pricing_pre_260', true)];
    }

    // Inspect fresh-install defaults without replacing an existing local fleet.
    $seeds_method = new ReflectionMethod(Vehicles::class, 'seed_records');
    $seeds_method->setAccessible(true);
    $seed_records = $seeds_method->invoke(null);
    $fresh = [];
    foreach ($seed_records as $record) { $fresh[$record['slug']] = $record; }
    $check(count($fresh) === 6, 'The original six vehicle categories remain available as fresh seeds.');
    $premium_fresh = $fresh['tuxano-premium']['tariff'];
    $check((float) $premium_fresh['base'] === 0.0 && (float) $premium_fresh['perDrivingMinute'] === 2.5, 'Fresh Premium retains the client mockup values for the inactive legacy components.');
    $check((float) $premium_fresh['perMile'] === 3.0 && (float) $premium_fresh['minimum'] === 150.0 && (float) $premium_fresh['hourly'] === 150.0 && (float) $premium_fresh['perWaitingMinute'] === 2.5, 'Fresh Premium has the documented active Transfer rates.');
    $check(($premium_fresh['transfer']['mode'] ?? '') === 'mileage' && ($premium_fresh['transfer']['version'] ?? null) === 2, 'Fresh Transfer profiles default to the user-selected mileage method.');
    $check((float) $premium_fresh['hourlyBooking']['hourly'] === 150.0 && (float) $premium_fresh['hourlyBooking']['perMile'] === 2.0 && (float) $premium_fresh['hourlyBooking']['perWaitingMinute'] === 1.0, 'Premium Hourly hire uses the documented hourly rate and preserves its unspecified service-specific mileage/wait rates.');
    foreach (['tuxano-luxury' => [75, 3, 3, 125, 1.5, 115], 'tuxano-executive' => [105, 3.5, 3, 150, 2, 135], 'tuxano-ghost' => [500, 15, 15, 600, 5, 500], 'tuxano-cullinan' => [700, 20, 25, 900, 7.5, 750], 'tuxano-phantom' => [1000, 30, 55, 1500, 10, 1250]] as $slug => $values) {
        $tariff = $fresh[$slug]['tariff'];
        $actual = array_map('floatval', array_intersect_key($tariff, array_flip(['base', 'perMile', 'perDrivingMinute', 'minimum', 'perWaitingMinute', 'hourly'])));
        $expected = array_combine(['base', 'perMile', 'perDrivingMinute', 'minimum', 'perWaitingMinute', 'hourly'], array_map('floatval', $values));
        $check($actual === $expected, 'No undocumented category-rate invention for ' . $slug . '.');
    }

    $premium_posts = get_posts(['post_type' => Vehicles::POST_TYPE, 'post_status' => ['publish', 'draft', 'pending', 'private', 'future', 'trash'], 'name' => 'tuxano-premium', 'posts_per_page' => 1]);
    if ($premium_posts) {
        $premium_id = (int) $premium_posts[0]->ID;
        $premium_meta = get_post_meta($premium_id, '_tuxano_vehicle_data', true);
        $premium_status = $premium_posts[0]->post_status;
        $premium_terms = wp_get_object_terms($premium_id, Vehicles::TAXONOMY, ['fields' => 'ids']);
        $check(!is_wp_error($premium_terms), 'The original Premium collection is readable for restoration.');
    } else {
        $premium_id = wp_insert_post(['post_type' => Vehicles::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Pricing upgrade Premium', 'post_name' => 'tuxano-premium'], true);
        $check(!is_wp_error($premium_id) && $premium_id > 0, 'A known-slug migration fixture can be created.');
        $premium_id = (int) $premium_id;
        $created_posts[] = $premium_id;
    }
    wp_update_post(['ID' => $premium_id, 'post_status' => 'publish']);
    $old_tariff = ['base' => 65.0, 'perMile' => 2.0, 'perDrivingMinute' => 3.0, 'minimum' => 100.0, 'perWaitingMinute' => 1.0, 'hourly' => 95.0];
    $old_meta = ['display' => 'Upgrade Premium fixture', 'capacity' => 6, 'luggageCapacity' => 5, 'image' => 'https://example.test/premium-preserved.png', 'models' => ['Original model'], 'features' => ['Original feature'], 'tariff' => $old_tariff];
    update_post_meta($premium_id, '_tuxano_vehicle_data', $old_meta);
    $legacy_vehicle = Vehicles::find((string) $premium_id);
    $check($legacy_vehicle !== null && $legacy_vehicle['tariff'] === $old_tariff, 'A pre-upgrade legacy vehicle snapshot is independently available.');

    $custom_id = wp_insert_post(['post_type' => Vehicles::POST_TYPE, 'post_status' => 'publish', 'post_title' => 'Premium SUV', 'post_name' => $run], true);
    $check(!is_wp_error($custom_id) && $custom_id > 0, 'A custom vehicle with a Premium-looking title can be created.');
    $custom_id = (int) $custom_id; $created_posts[] = $custom_id;
    $custom_meta = ['display' => 'Premium SUV', 'capacity' => 4, 'luggageCapacity' => 3, 'image' => 'https://example.test/custom-preserved.png', 'models' => ['Custom model'], 'features' => ['Custom feature'], 'tariff' => ['base' => 42.0, 'perMile' => 4.25, 'perDrivingMinute' => 0.75, 'minimum' => 88.0, 'perWaitingMinute' => 1.25, 'hourly' => 84.0]];
    update_post_meta($custom_id, '_tuxano_vehicle_data', $custom_meta);

    $route = ['distanceMeters' => 16093.44, 'durationSeconds' => 1200, 'provider' => 'google', 'calculatedAt' => gmdate('c'), 'pickupTimezone' => 'America/Chicago', 'pickupTimezoneLabel' => 'Central Time'];
    $booking = [
        'trip' => ['service' => 'transfer', 'hours' => 3, 'date' => '2020-02-03', 'time' => '12:00', 'timezone' => 'America/Chicago', 'pickup' => 'Historical pickup', 'dropoff' => 'Historical destination', 'pickupPlace' => ['placeId' => 'ChIJ_Upgrade_Pickup'], 'dropoffPlace' => ['placeId' => 'ChIJ_Upgrade_Dropoff'], 'stops' => [['text' => 'Historical stop', 'waitMinutes' => 30, 'place' => ['placeId' => 'ChIJ_Upgrade_Stop']]]],
        'vehicle' => (string) $premium_id, 'passengers' => 2, 'luggage' => 2, 'meet' => false, 'child' => false, 'carSeats' => 0, 'boosterSeats' => 0, 'inPerson' => false, 'same' => true, 'consent' => true, 'gratuity' => '20', 'custom' => 0,
        'billing' => ['first' => 'Historical', 'last' => 'Customer', 'email' => $run . '@example.test', 'phone' => '+1 312 555 0100', 'company' => 'Original company', 'street' => '123 Fixture Street', 'unit' => '', 'city' => 'Chicago', 'region' => 'IL', 'zip' => '60601', 'country' => 'United States', 'notes' => ''],
        'passenger' => ['first' => 'Historical', 'last' => 'Customer', 'email' => $run . '@example.test', 'mobile' => '+1 312 555 0100'], 'flightType' => 'commercial', 'airline' => '', 'flight' => '', 'special' => '', 'vehicleSnapshot' => $legacy_vehicle,
    ];
    $old_pricing = Pricing::calculate($legacy_vehicle, $route, $booking, Settings::get());
    $check($old_pricing['transportation'] === 175.0 && $old_pricing['total'] === 210.0, 'Historical accepted pricing uses the original flat tariff exactly.');
    $booking_id = Database::insert(['reference' => 'TUX-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(6))), 'request_key' => hash('sha256', $run), 'request_hash' => hash('sha256', $run . wp_json_encode($booking)), 'status' => 'new', 'created_at' => current_time('mysql', true), 'pickup_at' => '2020-02-03 18:00:00', 'customer_name' => 'Historical Customer', 'customer_email' => $booking['billing']['email'], 'vehicle_name' => $legacy_vehicle['display'], 'total' => $old_pricing['total'], 'currency' => 'USD', 'payload' => wp_json_encode($booking), 'pricing' => wp_json_encode($old_pricing), 'route' => wp_json_encode($route), 'notes' => 'Original private fixture note', 'customer_mail' => 'disabled', 'admin_mail' => 'disabled']);
    $check(!is_wp_error($booking_id) && $booking_id > 0, 'A pre-upgrade historical receipt can be stored without sending a notification.');
    $booking_id = (int) $booking_id; $created_bookings[] = $booking_id;
    $historical_before = Database::find($booking_id);

    delete_option($marker);
    Vehicles::upgrade_pricing();
    $premium_new = get_post_meta($premium_id, '_tuxano_vehicle_data', true);
    $custom_new = get_post_meta($custom_id, '_tuxano_vehicle_data', true);
    $check((int) get_option($marker) === 2, 'A completed upgrade records the v2 migration marker.');
    foreach (['display', 'capacity', 'luggageCapacity', 'image', 'models', 'features'] as $field) {
        $check($premium_new[$field] === $old_meta[$field] && $custom_new[$field] === $custom_meta[$field], 'Migration preserves existing fleet content: ' . $field . '.');
    }
    $premium_rates = $premium_new['tariff'];
    $check($premium_rates['base'] === 65.0 && $premium_rates['perDrivingMinute'] === 3.0, 'The unused original Premium fields are retained rather than reset from the visual mockup.');
    $check($premium_rates['perMile'] === 3.0 && $premium_rates['minimum'] === 150.0 && $premium_rates['perWaitingMinute'] === 2.5 && $premium_rates['hourly'] === 150.0, 'Only the recognized Premium receives the specified active client rates.');
    $check($premium_rates['hourlyBooking'] === ['hourly' => 150.0, 'perMile' => 2.0, 'perWaitingMinute' => 1.0], 'Premium service groups are independent and preserve unspecified Hourly mileage/waiting rates.');
    foreach ($custom_meta['tariff'] as $field => $value) { $check($custom_new['tariff'][$field] === $value, 'A lookalike custom vehicle keeps its saved ' . $field . ' rate.'); }
    $check($custom_new['tariff']['hourlyBooking'] === ['hourly' => 84.0, 'perMile' => 4.25, 'perWaitingMinute' => 1.25], 'Custom Hourly rates copy its own old shared values, never Premium defaults.');
    $check(get_post_meta($custom_id, '_tuxano_pricing_pre_260', true) === $custom_meta['tariff'], 'Original custom six-field prices are privately retained before conversion.');
    $premium_backup = get_post_meta($premium_id, '_tuxano_pricing_pre_260', true);
    $expected_backup = !empty($original_vehicle_meta[$premium_id]['backupExists']) ? $original_vehicle_meta[$premium_id]['backup'] : $old_tariff;
    $check($premium_backup === $expected_backup, 'A pre-existing original-price backup is not replaced by a later upgrade attempt.');
    $check($premium_rates['transfer']['mode'] === 'mileage' && $custom_new['tariff']['transfer']['mode'] === 'mileage', 'Migrated active vehicles default to mileage Transfer.');
    $check(Database::find($booking_id) === $historical_before, 'Fleet migration does not rewrite a saved historical booking, route, total or tariff snapshot.');

    $edited_rates = $premium_new; $edited_rates['tariff']['perMile'] = 4.75; $edited_rates['tariff']['hourlyBooking']['hourly'] = 180.0;
    update_post_meta($premium_id, '_tuxano_vehicle_data', $edited_rates);
    Vehicles::upgrade_pricing();
    delete_option($marker); Vehicles::upgrade_pricing(); Vehicles::seed();
    $check(get_post_meta($premium_id, '_tuxano_vehicle_data', true) === $edited_rates, 'Repeated upgrades and activation never replace subsequent administrator prices.');
    $check(get_post_meta($premium_id, '_tuxano_pricing_pre_260', true) === $premium_backup, 'Original-price backups are immutable after subsequent administrator changes.');

    $custom_edit = $custom_new;
    $custom_edit['tariff']['hourly'] = 200.0;
    $custom_edit['tariff']['perMile'] = 9.0;
    $custom_edit['tariff']['minimum'] = 20.0;
    $custom_edit['tariff']['perWaitingMinute'] = 2.75;
    $custom_edit['tariff']['transfer']['mode'] = 'time';
    $custom_edit['tariff']['hourlyBooking'] = ['hourly' => 88.0, 'perMile' => 1.5, 'perWaitingMinute' => 0.25];
    $_POST = ['tuxano_vehicle_nonce' => wp_create_nonce('tuxano_save_vehicle_' . $custom_id), 'tuxano_vehicle' => wp_slash(array_replace($custom_edit, ['collection' => '0']))];
    Vehicles::save_meta($custom_id, get_post($custom_id), true);
    $custom_saved = Vehicles::find((string) $custom_id);
    $check($custom_saved !== null && $custom_saved['tariff']['hourly'] === 200.0 && $custom_saved['tariff']['perMile'] === 9.0 && $custom_saved['tariff']['minimum'] === 20.0 && $custom_saved['tariff']['perWaitingMinute'] === 2.75 && $custom_saved['tariff']['transfer']['mode'] === 'time' && $custom_saved['tariff']['hourlyBooking'] === ['hourly' => 88.0, 'perMile' => 1.5, 'perWaitingMinute' => 0.25], 'Native vehicle save retains independent Transfer and Hourly rate groups.');
    $check(!array_key_exists('perMile', $custom_saved['tariff']['transfer']), 'Transfer has only one underlying mileage rate, distinct from the Hourly service mileage rate.');
    $profile_route = ['distanceMeters' => 48280.32, 'durationSeconds' => 1800, 'transferLegs' => ['pickup' => ['distanceMeters' => 24140.16, 'durationSeconds' => 2100], 'return' => ['distanceMeters' => 16093.44, 'durationSeconds' => 900]]];
    $profile_booking = ['trip' => ['service' => 'hourly', 'hours' => 3, 'stops' => [['waitMinutes' => 15]]], 'inPerson' => true];
    $hourly_price = Pricing::calculate($custom_saved, $profile_route, $profile_booking, Settings::get());
    $check($hourly_price['transportation'] === 312.75, 'Hourly hire reads its own hourly/mileage/waiting values and ignores all service-base travel.');
    $profile_booking['trip']['service'] = 'transfer';
    $time_price = Pricing::calculate($custom_saved, $profile_route, $profile_booking, Settings::get());
    $check($time_price['transportation'] === 241.25, 'Time Transfer reads its own hourly and waiting rates without Hourly-profile or legacy-base additions.');
    $mileage_vehicle = $custom_saved; $mileage_vehicle['tariff']['transfer']['mode'] = 'mileage';
    $mileage_price = Pricing::calculate($mileage_vehicle, $profile_route, $profile_booking, Settings::get());
    $check($mileage_price['transportation'] === 311.25, 'Mileage Transfer reads its single saved per-mile value without hourly or driving-minute additions.');

    $_POST = ['tuxano_vehicle_nonce' => wp_create_nonce('tuxano_save_vehicle_' . $premium_id), 'tuxano_vehicle' => wp_slash(array_replace($old_meta, ['collection' => '0']))];
    $terms_before_stale = wp_get_object_terms($premium_id, Vehicles::TAXONOMY, ['fields' => 'ids']);
    Vehicles::save_meta($premium_id, get_post($premium_id), true);
    $check(get_post_meta($premium_id, '_tuxano_vehicle_data', true) === $edited_rates, 'An old open six-field editor cannot erase or clobber migrated service profiles.');
    $check(wp_get_object_terms($premium_id, Vehicles::TAXONOMY, ['fields' => 'ids']) === $terms_before_stale && is_string(get_transient('tuxano_vehicle_error_' . $admins[0])), 'A stale form is rejected before modifying collection or pricing, with a reload notice.');
    $_POST = [];

    $rejected_profile = static function (array $invalid, string $message) use ($custom_id, $admins, $check): void {
        $before = get_post_meta($custom_id, '_tuxano_vehicle_data', true);
        delete_transient('tuxano_vehicle_error_' . $admins[0]);
        $_POST = ['tuxano_vehicle_nonce' => wp_create_nonce('tuxano_save_vehicle_' . $custom_id), 'tuxano_vehicle' => wp_slash(array_replace($invalid, ['collection' => '0']))];
        Vehicles::save_meta($custom_id, get_post($custom_id), true);
        $check(get_post_meta($custom_id, '_tuxano_vehicle_data', true) === $before && is_string(get_transient('tuxano_vehicle_error_' . $admins[0])), $message);
    };
    $invalid = $custom_new; unset($invalid['tariff']['hourlyBooking']);
    $rejected_profile($invalid, 'A half-specified service profile must fail instead of falling back to legacy pricing.');
    $invalid = $custom_new; $invalid['tariff']['transfer']['mode'] = 'legacy';
    $rejected_profile($invalid, 'Only the documented time/mileage modes are accepted in a new Transfer profile.');
    $invalid = $custom_new; $invalid['tariff']['transfer']['roundingMinutes'] = 0;
    $rejected_profile($invalid, 'Zero rounding increments cannot reach the pricing calculator.');
    $invalid = $custom_new; $invalid['tariff']['hourlyBooking']['perMile'] = -1;
    $rejected_profile($invalid, 'Invalid Hourly rates cannot silently reuse Transfer prices.');

    $contact_edit = $historical_before['payload']; $contact_edit['billing']['company'] = 'Updated contact only';
    $saved = BookingUpdates::save($booking_id, $contact_edit, BookingUpdates::revision($historical_before), 'new', $historical_before['notes'], false);
    $check(!is_wp_error($saved), 'A contact-only edit to an old receipt still saves after active fleet migration.');
    $check($saved['pricing'] === $historical_before['pricing'] && $saved['total'] === $historical_before['total'], 'Contact edits preserve the accepted old fare even while current Premium rates differ.');
    $check($saved['payload']['vehicleSnapshot']['tariff'] === $historical_before['payload']['vehicleSnapshot']['tariff'] && !isset($saved['payload']['vehicleSnapshot']['tariff']['transfer']), 'Historical flat snapshots are not silently upgraded during a contact edit.');
    $without_snapshot = $historical_before['payload']; unset($without_snapshot['vehicleSnapshot']);
    $oldest_id = Database::insert(['reference' => 'TUX-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(6))), 'request_key' => hash('sha256', $run . '_no_snapshot'), 'request_hash' => hash('sha256', $run . '_no_snapshot_payload'), 'status' => 'new', 'created_at' => current_time('mysql', true), 'pickup_at' => '2020-02-03 18:00:00', 'customer_name' => 'Historical Customer', 'customer_email' => $without_snapshot['billing']['email'], 'vehicle_name' => $legacy_vehicle['display'], 'total' => $old_pricing['total'], 'currency' => 'USD', 'payload' => wp_json_encode($without_snapshot), 'pricing' => wp_json_encode($old_pricing), 'route' => wp_json_encode($route), 'notes' => 'Very old no-snapshot fixture', 'customer_mail' => 'disabled', 'admin_mail' => 'disabled']);
    $check(!is_wp_error($oldest_id) && $oldest_id > 0, 'A very old receipt without a vehicle snapshot can be represented independently.');
    $oldest_id = (int) $oldest_id; $created_bookings[] = $oldest_id; $oldest_before = Database::find($oldest_id);
    $oldest_edit = $oldest_before['payload']; $oldest_edit['billing']['company'] = 'Very old contact correction';
    $oldest_saved = BookingUpdates::save($oldest_id, $oldest_edit, BookingUpdates::revision($oldest_before), 'new', $oldest_before['notes'], false);
    $check(!is_wp_error($oldest_saved) && $oldest_saved['pricing'] === $oldest_before['pricing'] && $oldest_saved['route'] === $oldest_before['route'], 'A no-snapshot historical contact edit preserves its accepted price and passenger-only route despite active v2 rates.');
    $check(!array_key_exists('vehicleSnapshot', $oldest_saved['payload']) && $oldest_saved['payload']['trip']['timezone'] === $oldest_before['payload']['trip']['timezone'], 'A no-snapshot historical edit neither attaches a modern pricing profile nor reinterprets its saved time zone.');
    wp_update_post(['ID' => $premium_id, 'post_status' => 'draft']);
    $archived = $saved['payload']; $archived['billing']['company'] = 'Archived vehicle contact edit';
    $saved_archived = BookingUpdates::save($booking_id, $archived, BookingUpdates::revision($saved), 'new', $saved['notes'], false);
    $check(!is_wp_error($saved_archived) && $saved_archived['pricing'] === $historical_before['pricing'], 'Archived-vehicle contact edits retain the historical flat price and remain editable.');
    $check($http_calls === 0 && $mail_calls === 0, 'Migration, rejected stale forms and contact-only preservation require no provider call or notification.');

    // Deliberate administrative repricing, unlike contact corrections, must
    // adopt the current service profile and acquire all missing base legs.
    wp_update_post(['ID' => $premium_id, 'post_status' => 'publish']);
    $allow_routing = true;
    // These are independent editing scenarios, not a rate-limit test. Reset
    // this fixture administrator's bucket between actions and restore it below.
    $reset_admin_budget = static function () use ($admins): void {
        delete_option('_tuxano_rate_' . hash('sha256', 'admin-provider' . $admins[0] . (int) floor(time() / MINUTE_IN_SECONDS)));
    };
    $reset_admin_budget();
    $repriced = BookingUpdates::save($booking_id, $saved_archived['payload'], BookingUpdates::revision($saved_archived), 'new', $saved_archived['notes'], false, true);
    $check(!is_wp_error($repriced) && count($provider_calls) === 4 && isset($repriced['route']['transferLegs']), 'Explicit repricing of a legacy receipt acquires all current Transfer legs.');
    $check((float) $repriced['pricing']['transportation'] === 225.0 && $repriced['route']['trafficBasis'] === 'current-for-historical-pickup', 'An explicit past-booking reprice uses current traffic honestly and the active Transfer rate.');
    $check($repriced['payload']['vehicleSnapshot']['tariff']['transfer']['version'] === 2 && $repriced['history'][0]['original']['pricing'] === $historical_before['pricing'], 'Repricing snapshots the new profile without altering the immutable original receipt.');
    $as_hourly = $repriced['payload']; $as_hourly['trip']['service'] = 'hourly'; $as_hourly['trip']['hours'] = 3;
    $before_calls = count($provider_calls); $reset_admin_budget();
    $hourly_saved = BookingUpdates::save($booking_id, $as_hourly, BookingUpdates::revision($repriced), 'new', $repriced['notes'], false);
    $check(!is_wp_error($hourly_saved) && count($provider_calls) === $before_calls + 1 && !isset($hourly_saved['route']['transferLegs']) && empty($hourly_saved['route']['trafficAware']), 'Switching to Hourly replaces Transfer forecasts with one unchanged passenger-only route.');
    $check((float) $hourly_saved['pricing']['transportation'] === 630.0 && end($provider_calls)['routingPreference'] === 'TRAFFIC_UNAWARE', 'Hourly repricing uses its separate current hire/mileage/wait rates without deadhead charges.');
    $hourly_schedule = $hourly_saved['payload']; $hourly_schedule['trip']['date'] = '2020-02-04'; $hourly_schedule['trip']['time'] = '13:00';
    $before_calls = count($provider_calls); $reset_admin_budget();
    $hourly_rescheduled = BookingUpdates::save($booking_id, $hourly_schedule, BookingUpdates::revision($hourly_saved), 'new', $hourly_saved['notes'], false);
    $check(!is_wp_error($hourly_rescheduled) && count($provider_calls) === $before_calls && $hourly_rescheduled['pricing'] === $hourly_saved['pricing'], 'An Hourly calendar correction retains its fare and does not introduce traffic-based repricing.');
    $as_transfer = $hourly_rescheduled['payload']; $as_transfer['trip']['service'] = 'transfer';
    $as_transfer['trip']['date'] = (new DateTimeImmutable('now', new DateTimeZone('America/Chicago')))->modify('+3 days')->format('Y-m-d');
    $before_calls = count($provider_calls); $reset_admin_budget();
    $transfer_saved = BookingUpdates::save($booking_id, $as_transfer, BookingUpdates::revision($hourly_rescheduled), 'new', $hourly_rescheduled['notes'], false);
    $check(!is_wp_error($transfer_saved) && count($provider_calls) === $before_calls + 4 && $transfer_saved['route']['trafficBasis'] === 'pickup', 'Switching back to Transfer obtains a complete pickup-time forecast.');
    $scheduled = $transfer_saved['payload']; $scheduled['trip']['time'] = '14:00'; $before_calls = count($provider_calls); $reset_admin_budget();
    $rescheduled = BookingUpdates::save($booking_id, $scheduled, BookingUpdates::revision($transfer_saved), 'new', $transfer_saved['notes'], false);
    $check(!is_wp_error($rescheduled) && count($provider_calls) === $before_calls + 4 && strtotime($rescheduled['route']['passengerDepartureUtc']) === strtotime($transfer_saved['route']['passengerDepartureUtc']) + 3600, 'A new Transfer pickup time refreshes the forecast and audit route even when the measured fare is unchanged. ' . wp_json_encode(['error' => is_wp_error($rescheduled) ? $rescheduled->get_error_code() . ': ' . $rescheduled->get_error_message() : '', 'calls' => count($provider_calls) - $before_calls, 'before' => $transfer_saved['route']['passengerDepartureUtc'] ?? '', 'after' => is_wp_error($rescheduled) ? '' : ($rescheduled['route']['passengerDepartureUtc'] ?? '')]));
    $waiting = $rescheduled['payload']; $waiting['trip']['stops'][0]['waitMinutes'] = 15; $before_calls = count($provider_calls); $reset_admin_budget();
    $wait_changed = BookingUpdates::save($booking_id, $waiting, BookingUpdates::revision($rescheduled), 'new', $rescheduled['notes'], false);
    $check(!is_wp_error($wait_changed) && count($provider_calls) === $before_calls + 4 && (float) $wait_changed['pricing']['transportation'] === 187.5, 'Changing Transfer stop waiting refreshes the return forecast and charges waiting exactly once.');
    $check(strtotime($wait_changed['route']['returnDepartureUtc']) === strtotime($rescheduled['route']['returnDepartureUtc']) - 900, 'Return departure includes the updated waiting duration rather than stale quote waits.');
    $new_base = '500 Fixture Avenue, Carol Stream, IL 60188'; Settings::save(['transfer_base_address' => $new_base]); $before_calls = count($provider_calls); $reset_admin_budget();
    $base_changed = BookingUpdates::save($booking_id, $wait_changed['payload'], BookingUpdates::revision($wait_changed), 'new', $wait_changed['notes'], false, true);
    $check(!is_wp_error($base_changed) && count($provider_calls) === $before_calls + 4 && $provider_calls[$before_calls]['origin']['address'] === $new_base, 'Explicit repricing after a service-base change measures the current configured address.');
    $before_failure = Database::find($booking_id); $failed_edit = $before_failure['payload']; $failed_edit['trip']['time'] = '15:00';
    $reset_admin_budget(); $provider_fail_at = count($provider_calls) + 3;
    $failed = BookingUpdates::save($booking_id, $failed_edit, BookingUpdates::revision($before_failure), 'new', $before_failure['notes'], false);
    $check(is_wp_error($failed) && Database::find($booking_id) === $before_failure, 'A partial provider failure cannot replace the saved schedule, profile, route, fare or revision.');
    $check($mail_calls === 0, 'Administrative pricing fixtures never send real or requested customer notifications.');
    $stable_window = false; $allowed_calls = 0; $forty_first = true; $global_unchanged = false;
    for ($attempt = 0; $attempt < 3; $attempt++) {
        $window = (int) floor(time() / MINUTE_IN_SECONDS); $day = (int) floor(time() / DAY_IN_SECONDS);
        $reset_admin_budget(); $allowed_calls = 0;
        for ($index = 0; $index < 40; $index++) { if (Rest::admin_provider_budget()) { ++$allowed_calls; } }
        $global_name = '_tuxano_rate_' . hash('sha256', 'route-global' . 'all' . $day);
        $global_before = get_option($global_name);
        $forty_first = Rest::admin_provider_budget();
        $global_unchanged = get_option($global_name) === $global_before;
        $stable_window = $window === (int) floor(time() / MINUTE_IN_SECONDS) && $day === (int) floor(time() / DAY_IN_SECONDS);
        if ($stable_window) { break; }
    }
    $check($stable_window && $allowed_calls === 40 && !$forty_first, 'Forty provider calls permit ten four-leg admin actions per minute; the forty-first call is still rejected.');
    $check($global_unchanged, 'A rejected admin-minute request cannot consume an additional shared daily provider budget.');
    WP_CLI::success('WordPress pricing migration/history checks passed: ' . $checks);
} finally {
    remove_filter('pre_http_request', $http, 10);
    remove_filter('pre_wp_mail', $mail, 10);
    foreach ($created_bookings as $id) { Database::delete($id); }
    foreach ($created_posts as $id) { wp_delete_post($id, true); }
    if ($premium_id && !in_array($premium_id, $created_posts, true)) {
        update_post_meta($premium_id, '_tuxano_vehicle_data', $premium_meta);
        wp_update_post(['ID' => $premium_id, 'post_status' => $premium_status]);
        wp_set_object_terms($premium_id, array_map('intval', $premium_terms), Vehicles::TAXONOMY);
    }
    foreach ($original_vehicle_meta as $id => $original) {
        if ($original['exists']) { update_post_meta($id, '_tuxano_vehicle_data', $original['data']); } else { delete_post_meta($id, '_tuxano_vehicle_data'); }
        if ($original['backupExists']) { update_post_meta($id, '_tuxano_pricing_pre_260', $original['backup']); } else { delete_post_meta($id, '_tuxano_pricing_pre_260'); }
    }
    if ($original_settings === null) { delete_option(Settings::OPTION); } else { update_option(Settings::OPTION, $original_settings, false); }
    if ($original_marker === null) { delete_option($marker); } else { update_option($marker, $original_marker, false); }
    foreach ($wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%')) as $name) {
        if (!isset($rate_snapshot[$name])) { delete_option($name); }
    }
    foreach ($rate_snapshot as $name => $row) { update_option($name, $row->option_value, false); }
    delete_transient('tuxano_vehicle_error_' . $admins[0]);
    $_POST = $original_post;
    if ($original_remote === null) { unset($_SERVER['REMOTE_ADDR']); } else { $_SERVER['REMOTE_ADDR'] = $original_remote; }
    wp_set_current_user($original_user);
}
