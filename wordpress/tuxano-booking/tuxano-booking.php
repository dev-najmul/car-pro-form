<?php
/**
 * Plugin Name: Tuxano Booking
 * Description: Executive transportation requests, route-based pricing, fleet management and private booking administration.
 * Version: 2.3.1
 * Plugin URI: https://farhanrajnajmul.com/
 * Requires at least: 6.6
 * Requires PHP: 7.4
 * Author: Farhan
 * Author URI: https://farhanrajnajmul.com/
 * License: GPL-2.0-or-later
 * Text Domain: tuxano-booking
 */

namespace Tuxano\Booking;

defined('ABSPATH') || exit;

define('TUXANO_BOOKING_VERSION', '2.3.1');
define('TUXANO_BOOKING_FILE', __FILE__);
define('TUXANO_BOOKING_DIR', plugin_dir_path(__FILE__));
define('TUXANO_BOOKING_URL', plugin_dir_url(__FILE__));

foreach (['Countries', 'Settings', 'Vehicles', 'Pricing', 'Database', 'Availability', 'Notifications', 'BookingUpdates', 'Rest', 'Frontend', 'Admin'] as $component) {
    require_once TUXANO_BOOKING_DIR . 'includes/' . $component . '.php';
}

register_activation_hook(__FILE__, static function (bool $network_wide = false): void {
    if (is_multisite() && $network_wide) {
        wp_die(esc_html__('Activate Tuxano Booking separately for each site. Network-wide activation is not supported.', 'tuxano-booking'), '', ['back_link' => true]);
    }
    Database::install();
    Vehicles::register();
    Vehicles::seed();
    if (!wp_next_scheduled('tuxano_booking_maintenance')) {
        wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'tuxano_booking_maintenance');
    }
});
register_deactivation_hook(__FILE__, static function (): void {
    wp_clear_scheduled_hook('tuxano_booking_maintenance');
});
add_action('plugins_loaded', static function (): void {
    if (get_option('tuxano_booking_db_version') !== TUXANO_BOOKING_VERSION) {
        Database::install();
    }
    Admin::register();
    Frontend::register();
});
add_action('init', [Vehicles::class, 'register']);
add_action('rest_api_init', [Rest::class, 'register']);
add_action('tuxano_booking_maintenance', [Database::class, 'maintenance']);
add_filter('wp_privacy_personal_data_exporters', static function (array $exporters): array {
    $exporters['tuxano-booking'] = ['exporter_friendly_name' => __('Tuxano bookings', 'tuxano-booking'), 'callback' => [Database::class, 'privacy_export']];
    return $exporters;
});
add_filter('wp_privacy_personal_data_erasers', static function (array $erasers): array {
    $erasers['tuxano-booking'] = ['eraser_friendly_name' => __('Tuxano bookings', 'tuxano-booking'), 'callback' => [Database::class, 'privacy_erase']];
    return $erasers;
});
