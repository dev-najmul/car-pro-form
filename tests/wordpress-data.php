<?php
/**
 * Integration checks for data/settings/pricing against an isolated WordPress DB.
 * Run: wp eval-file tests/wordpress-data.php
 */

use Tuxano\Booking\Pricing;
use Tuxano\Booking\Settings;
use Tuxano\Booking\Vehicles;
use Tuxano\Booking\Frontend;

if (!defined('WP_CLI') || !WP_CLI) {
    exit('Run this file using WP-CLI in the isolated test installation.');
}
if (wp_get_environment_type() !== 'local') {
    WP_CLI::error('These fixture tests run only in an isolated local WordPress installation.');
}

foreach (['Settings', 'Vehicles', 'Pricing', 'Frontend'] as $class) {
    if (!class_exists('Tuxano\\Booking\\' . $class)) {
        require_once dirname(__DIR__) . '/wordpress/tuxano-booking/includes/' . $class . '.php';
    }
}
if (!post_type_exists(Vehicles::POST_TYPE)) {
    Vehicles::register();
}

$checks = 0;
$check = static function (bool $condition, string $message) use (&$checks): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
    ++$checks;
};
$throws = static function (callable $callback, string $message) use ($check): void {
    try {
        $callback();
    } catch (InvalidArgumentException $error) {
        $check(true, $message);
        return;
    }
    $check(false, $message);
};
$original_user = get_current_user_id();
$original_post = $_POST;
$original_option = get_option(Settings::OPTION, null);
$created_posts = [];
$created_terms = [];
$created_users = [];
$admin = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
$check(!empty($admin), 'An administrator is required in the isolated WordPress test installation.');
wp_set_current_user((int) $admin[0]);

try {
    $defaults = Settings::defaults();
    $check($defaults['meet_price'] === 50.0 && $defaults['first_seat_price'] === 75.0 && $defaults['additional_seat_price'] === 50.0, 'Original extras defaults must match the form.');
    $check($defaults['dashboard_recent_limit'] === 3, 'The dashboard defaults to the three newest submissions.');
    $check($defaults['min_hours'] === 3 && $defaults['max_hours'] === 24, 'New hourly bookings default to a three-hour minimum and twenty-four-hour maximum.');
    $legacy = Settings::get();
    unset($legacy['dashboard_recent_limit']);
    update_option(Settings::OPTION, $legacy, false);
    $check(Settings::get()['dashboard_recent_limit'] === 3, 'Existing settings without the new dashboard option use its default.');
    $rate_revision = Settings::revision();
    foreach ([1, 20, 3] as $recent_limit) {
        $check(Settings::save(['dashboard_recent_limit' => (string) $recent_limit]) === true && Settings::get()['dashboard_recent_limit'] === $recent_limit, 'Dashboard recent submission bounds save as integers: ' . $recent_limit);
    }
    $check(Settings::revision() === $rate_revision, 'Changing only dashboard display preferences must not expire valid route quotes.');
    $legacy_colors = Settings::get();
    foreach (array_keys(Settings::FORM_COLORS) as $key) { unset($legacy_colors[$key]); }
    update_option(Settings::OPTION, $legacy_colors, false);
    $check(count(Settings::FORM_COLORS) === 10 && array_intersect_key(Settings::get(), Settings::FORM_COLORS) === Settings::FORM_COLORS, 'Old installations receive the ten original form color defaults.');
    $appearance_revision = Settings::revision();
    $appearance = array_fill_keys(array_keys(Settings::FORM_COLORS), '#AaBbCc');
    $check(Settings::save($appearance) === true, 'All supported form colors save through the validated settings contract.');
    $check(array_unique(array_values(array_intersect_key(Settings::get(), Settings::FORM_COLORS))) === ['#aabbcc'], 'Saved colors normalize to canonical lowercase six-digit hex.');
    $public_colors = Settings::public_data()['formColors'];
    $check(count($public_colors) === 10 && $public_colors['title'] === '#aabbcc' && $public_colors['activeCircleText'] === '#aabbcc', 'The public appearance contract contains the supported display colors.');
    $check(Settings::revision() === $appearance_revision, 'Appearance-only saves must not invalidate an accepted route quote.');
    foreach (['#fff', '#12345678', 'red', 'url(https://example.test/image)', '#ffffff;display:none', "#fff\nfff", ['#ffffff'], ''] as $invalid_color) {
        $before = Settings::get();
        $result = Settings::save(['company_name' => 'Must not partially save', 'form_title_color' => $invalid_color]);
        $check(is_wp_error($result) && Settings::get() === $before, 'Invalid CSS/color input must reject the entire partial save.');
    }
    $check(Settings::save(['form_title_color' => '#123456']) === true && Settings::get()['form_subtitle_color'] === '#aabbcc', 'Changing one appearance control preserves every omitted color.');
    $check(Settings::save(Settings::FORM_COLORS) === true && Settings::revision() === $appearance_revision, 'Original appearance may be restored without changing fares.');
    $check($defaults['booking_page_id'] === 0, 'Quick booking has no assumed destination on a new installation.');
    $legacy_quick = Settings::get();
    unset($legacy_quick['booking_page_id']);
    update_option(Settings::OPTION, $legacy_quick, false);
    $check(Settings::get()['booking_page_id'] === 0 && Settings::public_data()['bookingPageUrl'] === '', 'Older settings resolve an unset quick destination without inventing a URL.');
    $quick_pages = [];
    foreach ([['page', 'publish', ''], ['page', 'draft', ''], ['page', 'private', ''], ['page', 'publish', 'private-test-password'], ['post', 'publish', '']] as $index => $definition) {
        [$type, $status, $password] = $definition;
        $page_id = wp_insert_post(['post_type' => $type, 'post_status' => $status, 'post_title' => 'Quick booking fixture ' . $index, 'post_content' => '[tuxano_booking]', 'post_password' => $password], true);
        if (is_wp_error($page_id)) { throw new RuntimeException('Could not create an isolated quick-booking page fixture.'); }
        $quick_pages[] = (int) $page_id;
        $created_posts[] = (int) $page_id;
    }
    $quick_revision = Settings::revision();
    $check(Settings::save(['booking_page_id' => (string) $quick_pages[0]]) === true && Settings::get()['booking_page_id'] === $quick_pages[0], 'A published public page saves as an integer quick destination.');
    $check(Settings::public_data()['bookingPageUrl'] === get_permalink($quick_pages[0]) && !array_key_exists('booking_page_id', Settings::public_data()), 'Public quick configuration exposes only the resolved public destination URL.');
    $check(Settings::revision() === $quick_revision, 'Selecting a quick destination does not invalidate route quotes.');
    $check(Settings::save(['company_name' => Settings::get()['company_name']]) === true && Settings::get()['booking_page_id'] === $quick_pages[0], 'Omitted destination fields survive unrelated partial saves.');
    foreach (array_merge(array_slice($quick_pages, 1), ['-1', '1.5', '2147483648', '999999999', 'https://external.example/booking/', ['1']]) as $invalid_page) {
        $before = Settings::get();
        $result = Settings::save(['company_name' => 'Must not partially save', 'booking_page_id' => $invalid_page]);
        $check(is_wp_error($result) && Settings::get() === $before, 'Invalid, private, protected or non-page quick destinations reject the whole settings save.');
    }
    $home = wp_parse_url(home_url('/'));
    $origin = $home['scheme'] . '://' . $home['host'] . (isset($home['port']) ? ':' . $home['port'] : '');
    foreach (['https://external.example/booking/', $home['scheme'] . '://user:pass@' . $home['host'] . '/booking/', $origin . '/booking/#unexpected', ($home['scheme'] === 'https' ? 'http' : 'https') . substr($origin, strpos($origin, ':')) . '/booking/'] as $unsafe_link) {
        $filter = static function ($link, $id) use ($quick_pages, $unsafe_link) { return (int) $id === $quick_pages[0] ? $unsafe_link : $link; };
        add_filter('page_link', $filter, 10, 2);
        $check(Settings::booking_page_url() === '' && Settings::public_data()['bookingPageUrl'] === '', 'A permalink filter cannot turn the selected page into an external, credentialled, fragmented or different-origin destination.');
        remove_filter('page_link', $filter, 10);
    }
    wp_update_post(['ID' => $quick_pages[0], 'post_status' => 'draft']);
    $check(Settings::booking_page_url() === '' && Settings::public_data()['bookingPageUrl'] === '', 'Unpublishing the saved page immediately disables quick redirection.');
    wp_update_post(['ID' => $quick_pages[0], 'post_status' => 'publish']);
    $check(Settings::booking_page_url() === get_permalink($quick_pages[0]), 'Republishing the configured public page restores its validated URL.');
    Frontend::register();
    $quick_markup = do_shortcode('[tuxano_quick_booking]');
    $second_markup = do_shortcode('[tuxano_quick_booking]');
    preg_match('/id="([^"]+)"/', $quick_markup, $quick_id);
    preg_match('/id="([^"]+)"/', $second_markup, $second_id);
    $check(!empty($quick_id[1]) && !empty($second_id[1]) && $quick_id[1] !== $second_id[1] && strpos($quick_markup, '<iframe') === false, 'Each quick shortcode renders a unique native inline card rather than an iframe.');
    $check(strpos($quick_markup, 'data-tuxano-quick-booking') !== false && strpos($quick_markup, 'data-rest-url="' . esc_url(rest_url('tuxano-booking/v1/')) . '"') !== false && strpos($quick_markup, 'data-booking-url="' . esc_url(get_permalink($quick_pages[0])) . '"') !== false, 'The quick shortcode exposes the escaped same-origin bootstrap attributes.');
    $check(strpos($quick_markup, '<noscript>') !== false && strpos($quick_markup, 'data-asset-url="' . esc_url(TUXANO_BOOKING_URL . 'public/' . TUXANO_BOOKING_VERSION . '/') . '"') !== false && strpos($quick_markup, 'nonce') === false && strpos($quick_markup, 'token') === false, 'Cached quick markup includes versioned assets and no visitor token or REST nonce.');
    $check(wp_style_is('tuxano-booking-quick', 'enqueued') && strpos(wp_styles()->registered['tuxano-booking-quick']->src, '/public/' . TUXANO_BOOKING_VERSION . '/quick-booking.css') !== false, 'Quick styles are enqueued from the current versioned public assets.');
    ob_start();
    wp_script_modules()->print_enqueued_script_modules();
    $quick_modules = (string) ob_get_clean();
    $check(strpos($quick_modules, 'type="module"') !== false && strpos($quick_modules, '/public/' . TUXANO_BOOKING_VERSION . '/quick-booking.js') !== false, 'The quick frontend is enqueued through the native WordPress module API.');
    $check(Settings::save(['booking_page_id' => '0']) === true && Settings::booking_page_url() === '' && Settings::revision() === $quick_revision, 'An administrator can clear the destination without altering any fare.');
    $check(Settings::save(['browser_key' => 'test_browser_key_123456789012345', 'routes_key' => 'test_routes_key_123456789012345', 'meet_price' => '64.75']) === true, 'Valid settings should save.');
    $check(Settings::save(['meet_price' => '80', 'browser_key' => '', 'routes_key' => '']) === true, 'A partial form should preserve blank API keys.');
    $settings = Settings::get();
    $check($settings['browser_key'] === 'test_browser_key_123456789012345' && $settings['routes_key'] === 'test_routes_key_123456789012345' && $settings['meet_price'] === 80.0, 'API keys and partial-save merge must be preserved.');
    $public = Settings::public_data();
    $check(!array_key_exists('routes_key', $public) && !array_key_exists('routesKey', $public) && !array_key_exists('admin_email', $public) && !array_key_exists('browser_key', $public), 'Private config must not leak into public settings.');
    $check(!array_key_exists('dashboard_recent_limit', $public) && !array_key_exists('dashboardRecentLimit', $public), 'Administrator dashboard preferences are not exposed in public form settings.');
    $check(Settings::get()['dashboard_recent_limit'] === 3, 'Unrelated partial price/key updates preserve dashboard preferences.');
    $check($public['meetPrice'] === 80.0 && $public['minHours'] === $settings['min_hours'], 'Public config must use the camelCase contract.');
    global $wpdb;
    $autoload = $wpdb->get_var($wpdb->prepare("SELECT autoload FROM {$wpdb->options} WHERE option_name=%s", Settings::OPTION));
    $check(!in_array($autoload, ['yes', 'on', 'auto-on', 'auto'], true), 'Private configuration must not be autoloaded.');
    foreach ([
        ['meet_price' => '-1'], ['first_seat_price' => 'INF'], ['additional_seat_price' => ['5']],
        ['default_gratuity' => '101'], ['max_stops' => '6'], ['min_hours' => '25'],
        ['min_hours' => '20', 'max_hours' => '2'], ['retention_days' => '-1'],
        ['admin_email' => "client@example.test\r\nBcc: victim@example.test"],
        ['sender_name' => "Name\nBcc: victim@example.test"], ['website' => 'javascript:alert(1)'],
        ['browser_key' => "unsafe\nkey"], ['currency' => 'USDD'], ['email_customer' => 'true'],
        ['dashboard_recent_limit' => '0'], ['dashboard_recent_limit' => '21'],
        ['dashboard_recent_limit' => '-1'], ['dashboard_recent_limit' => '1.5'],
        ['dashboard_recent_limit' => ['3']], ['dashboard_recent_limit' => 'INF'],
    ] as $invalid) {
        $before = Settings::get();
        $result = Settings::save(array_merge(['company_name' => 'Must not partially save'], $invalid));
        $check(is_wp_error($result) && Settings::get() === $before, 'Invalid settings must reject the entire partial save: ' . implode(',', array_keys($invalid)));
    }
    $check(Settings::save(['clear_browser_key' => '1', 'clear_routes_key' => true]) === true && Settings::get()['browser_key'] === '' && Settings::get()['routes_key'] === '', 'Explicit clear controls should remove saved keys.');
    wp_set_current_user(0);
    $check(is_wp_error(Settings::save(['meet_price' => '0'])), 'Anonymous callers must not change settings.');
    wp_set_current_user((int) $admin[0]);
    Settings::save(['meet_price' => 50, 'first_seat_price' => 75, 'additional_seat_price' => 50, 'min_hours' => 1, 'max_hours' => 24, 'max_stops' => 5, 'currency' => 'USD']);

    Vehicles::seed();
    $fleet = Vehicles::all();
    $check(count($fleet) >= 6, 'Activation should seed the original six vehicles.');
    $ids = array_column($fleet, 'id');
    Vehicles::seed();
    $check(array_column(Vehicles::all(), 'id') === $ids, 'Reactivation must not duplicate the fleet.');
    $seed = [];
    foreach ($fleet as $vehicle) {
        if (!in_array($vehicle['name'], ['PREMIUM SUV', 'LUXURY SUV', 'EXECUTIVE SUV', 'ROLLS-ROYCE GHOST', 'ROLLS-ROYCE CULLINAN', 'ROLLS-ROYCE PHANTOM'], true)) {
            continue;
        }
        $seed[strtolower(str_replace(['ROLLS-ROYCE ', ' SUV'], '', $vehicle['name']))] = $vehicle;
        $image_url = wp_parse_url($vehicle['image']);
        $check(is_string($vehicle['id']) && is_array($image_url) && in_array($image_url['scheme'] ?? '', ['https', 'http'], true) && !empty($image_url['host']) && isset($vehicle['tariff']['perDrivingMinute']), 'Seed records must expose valid IDs, absolute bundled photo URLs and tariffs.');
    }
    $check(count($seed) === 6, 'The isolated test installation must retain all six original seed records.');
    $check($seed['premium']['tariff']['base'] === 65.0 && $seed['phantom']['tariff']['hourly'] === 1250.0, 'Original per-vehicle tariffs must be retained.');
    $check($seed['luxury']['category'] === 'SUV COLLECTION' && $seed['ghost']['category'] === 'ROLLS-ROYCE COLLECTION', 'Original collection grouping must be retained.');

    $term = wp_insert_term('Integration category', Vehicles::TAXONOMY, ['description' => 'Only this test category.']);
    $check(!is_wp_error($term), 'A native collection should be creatable.');
    $term_id = (int) $term['term_id'];
    $created_terms[] = $term_id;
    $id = wp_insert_post(['post_type' => Vehicles::POST_TYPE, 'post_status' => 'draft', 'post_title' => 'Integration Vehicle'], true);
    $check(!is_wp_error($id) && $id > 0, 'A vehicle draft should be creatable.');
    $id = (int) $id;
    $created_posts[] = $id;
    $check(Vehicles::find((string) $id) === null, 'A draft cannot be booked.');
    $valid = [
        'display' => 'Integration display', 'capacity' => '4', 'luggageCapacity' => '2',
        'image' => 'https://example.test/car.png', 'models' => "Model one\nModel two", 'features' => "Feature one\nFeature two",
        'collection' => (string) $term_id,
        'tariff' => ['base' => '25', 'perMile' => '1.5', 'perDrivingMinute' => '0.25', 'minimum' => '40', 'perWaitingMinute' => '0.5', 'hourly' => '60'],
    ];
    $save = static function (array $input, string $nonce = '') use ($id): void {
        $_POST = ['tuxano_vehicle_nonce' => $nonce ?: wp_create_nonce('tuxano_save_vehicle_' . $id), 'tuxano_vehicle' => wp_slash($input)];
        Vehicles::save_meta($id, get_post($id), true);
    };
    $save($valid);
    $saved = get_post_meta($id, '_tuxano_vehicle_data', true);
    $check($saved['capacity'] === 4 && $saved['luggageCapacity'] === 2 && $saved['tariff']['perDrivingMinute'] === 0.25, 'Native fleet save must validate numeric input and save tariffs.');
    $_POST = [];
    wp_update_post(['ID' => $id, 'post_status' => 'publish']);
    $public_vehicle = Vehicles::find((string) $id);
    $check($public_vehicle !== null && $public_vehicle['category'] === 'Integration category' && $public_vehicle['image'] === 'https://example.test/car.png', 'Published vehicles and taxonomy edits must become public form config.');
    foreach ([
        ['tariff' => array_replace($valid['tariff'], ['base' => '-1'])],
        ['capacity' => '0'], ['luggageCapacity' => '101'], ['image' => 'javascript:alert(1)'],
        ['image' => 'assets/../private.png'], ['image' => 'http://example.test/car.png'],
        ['features' => array_fill(0, 21, 'Too many features')], ['collection' => '9999999999'],
    ] as $invalid) {
        $save(array_replace($valid, $invalid));
        $check(get_post_meta($id, '_tuxano_vehicle_data', true) === $saved, 'Invalid fleet input must preserve the previous tariffs/details: ' . implode(',', array_keys($invalid)) . (isset($invalid['image']) ? '=' . $invalid['image'] : ''));
    }
    $save(array_replace($valid, ['display' => 'Invalid nonce edit']), 'invalid');
    $check(get_post_meta($id, '_tuxano_vehicle_data', true) === $saved, 'Invalid nonce must not change vehicle metadata.');
    $subscriber = wp_insert_user(['user_login' => 'tuxano-data-' . wp_generate_password(10, false), 'user_pass' => wp_generate_password(30, true), 'role' => 'subscriber']);
    $check(!is_wp_error($subscriber), 'A subscriber is available for capability checks.');
    $created_users[] = (int) $subscriber;
    wp_set_current_user((int) $subscriber);
    $save(array_replace($valid, ['display' => 'Unauthorized edit']));
    $check(get_post_meta($id, '_tuxano_vehicle_data', true) === $saved && is_wp_error(Settings::save(['meet_price' => 0])), 'Subscriber cannot change fleet or global pricing.');
    wp_set_current_user((int) $admin[0]);
    $revision = Settings::revision();
    $save(array_replace($valid, ['tariff' => array_replace($valid['tariff'], ['base' => 26])]));
    $check(Settings::revision() !== $revision, 'Editing vehicle tariffs must invalidate existing route quotes.');
    $revision = Settings::revision();
    wp_update_post(['ID' => $id, 'post_title' => 'Changed vehicle selection']);
    $check(Settings::revision() !== $revision, 'Changing the advertised vehicle must require a refreshed quote.');
    $revision = Settings::revision();
    Settings::save(['meet_price' => 51]);
    $check(Settings::revision() !== $revision, 'Editing global prices must invalidate existing route quotes.');
    $_POST = [];
    wp_update_post(['ID' => $id, 'post_status' => 'draft']);
    $check(Vehicles::find((string) $id) === null && Vehicles::find('javascript:1') === null && Vehicles::find('001') === null, 'Inactive/malformed vehicle IDs cannot be booked.');

    $settings = array_replace(Settings::defaults(), ['min_hours' => 1, 'max_hours' => 24]);
    // Values independently produced by the shared JavaScript pricing module.
    $fixtures = [
        ['luxury', 16093.44, 1200, 0, 'transfer', 3, 165.0, 20.63, 410.63],
        ['premium', 166700, 12198, 30, 'transfer', 3, 912.07, 114.01, 1251.08],
        ['ghost', 10000, 14400, 10, 'hourly', 3, 2143.21, 267.90, 2636.11],
        ['phantom', 12, 12, 120, 'transfer', 2, 2700.0, 337.50, 3262.50],
        ['premium', 0, 0, 0, 'hourly', 1, 95.0, 11.88, 331.88],
    ];
    foreach ($fixtures as [$name, $distance, $duration, $wait, $service, $hours, $transportation, $tip, $total]) {
        $booking = ['trip' => ['service' => $service, 'hours' => $hours, 'stops' => $wait ? [['waitMinutes' => $wait]] : []], 'child' => true, 'carSeats' => 2, 'boosterSeats' => 1, 'meet' => true, 'inPerson' => false, 'gratuity' => 'custom', 'custom' => 12.5];
        $result = Pricing::calculate($seed[$name], ['distanceMeters' => $distance, 'durationSeconds' => $duration], $booking, $settings);
        $check($result['transportation'] === $transportation && $result['tip'] === $tip && $result['total'] === $total, 'PHP/JavaScript fare and gratuity cents must match: ' . $name . '/' . $service);
        $check($result['carCost'] === 125.0 && $result['boosterCost'] === 50.0 && $result['fare']['totalDurationSeconds'] === (float) ($duration + $wait * 60), 'Child seat allocation and stop durations must be correct.');
    }
    foreach ([[1.005, 1.01], [10.075, 10.07], [1.255, 1.26], [100.005, 100.01], [0.005, 0.01], [123456.785, 123456.79]] as [$amount, $expected]) {
        $vehicle = array_replace($seed['premium'], ['tariff' => ['base' => $amount, 'minimum' => 0, 'perMile' => 0, 'perDrivingMinute' => 0, 'perWaitingMinute' => 0, 'hourly' => 0]]);
        $result = Pricing::calculate($vehicle, ['distanceMeters' => 0, 'durationSeconds' => 0], ['trip' => ['service' => 'transfer', 'stops' => []]], $settings);
        $check($result['transportation'] === $expected, 'PHP should match JavaScript half-cent floating-point rounding at ' . $amount);
    }
    $base_booking = ['trip' => ['service' => 'transfer', 'stops' => []], 'child' => true, 'carSeats' => 0, 'boosterSeats' => 2, 'inPerson' => true];
    $result = Pricing::calculate($seed['premium'], ['distanceMeters' => 0, 'durationSeconds' => 0], $base_booking, $settings);
    $check($result['carCost'] === 0.0 && $result['boosterCost'] === 125.0 && $result['tip'] === 0.0, 'Booster-only bookings charge the first-seat rate once; in-person tips are zero.');
    foreach ([
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => INF, 'durationSeconds' => 60], $base_booking, $settings),
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => -1, 'durationSeconds' => 60], $base_booking, $settings),
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => 1, 'durationSeconds' => 60], array_replace_recursive($base_booking, ['trip' => ['service' => 'flight']]), $settings),
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => 1, 'durationSeconds' => 60], array_replace_recursive($base_booking, ['trip' => ['stops' => [['waitMinutes' => 121]]]]), $settings),
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => 1, 'durationSeconds' => 60], array_replace_recursive($base_booking, ['trip' => ['stops' => [1 => ['waitMinutes' => 5]]]]), $settings),
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => 1, 'durationSeconds' => 60], array_replace_recursive($base_booking, ['trip' => ['stops' => [1 => ['waitMinutes' => 5], 0 => ['waitMinutes' => 10]]]]), $settings),
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => 1, 'durationSeconds' => 60], array_replace($base_booking, ['carSeats' => 6, 'boosterSeats' => 2]), $settings),
        static fn() => Pricing::calculate($seed['premium'], ['distanceMeters' => 1, 'durationSeconds' => 60], array_replace($base_booking, ['child' => 'false']), $settings),
    ] as $invalid_pricing) {
        $throws($invalid_pricing, 'Invalid pricing inputs must be rejected.');
    }
    WP_CLI::success('WordPress data/settings/fleet/pricing checks passed: ' . $checks);
} finally {
    $_POST = [];
    wp_set_current_user((int) $admin[0]);
    foreach ($created_posts as $post_id) {
        wp_delete_post($post_id, true);
    }
    foreach ($created_terms as $term_id) {
        wp_delete_term($term_id, Vehicles::TAXONOMY);
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($created_users as $user_id) {
        wp_delete_user($user_id);
    }
    if ($original_option === null) {
        delete_option(Settings::OPTION);
    } else {
        update_option(Settings::OPTION, $original_option, false);
    }
    delete_transient('tuxano_vehicle_error_' . $admin[0]);
    $_POST = $original_post;
    wp_set_current_user($original_user);
}
