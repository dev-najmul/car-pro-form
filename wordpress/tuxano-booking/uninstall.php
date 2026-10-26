<?php
/** Data is retained unless an administrator explicitly enabled removal. */
defined('WP_UNINSTALL_PLUGIN') || exit;
// Default retention prevents plugin deletion from silently destroying bookings.
// Manual purge is deliberately explicit: define TUXANO_BOOKING_REMOVE_DATA true
// in wp-config.php before uninstalling, after making a backup if required.
if (!defined('TUXANO_BOOKING_REMOVE_DATA') || TUXANO_BOOKING_REMOVE_DATA !== true) { return; }
global $wpdb;
$table = $wpdb->prefix . 'tuxano_bookings';
$wpdb->query("DROP TABLE IF EXISTS {$table}");
// WordPress invokes uninstall while the plugin is inactive; register only the
// owned data types so core deletion can remove taxonomy relationships too.
if (!post_type_exists('tuxano_vehicle')) { register_post_type('tuxano_vehicle', ['public' => false]); }
if (!taxonomy_exists('tuxano_collection')) { register_taxonomy('tuxano_collection', 'tuxano_vehicle', ['public' => false]); }
$vehicles = get_posts(['post_type' => 'tuxano_vehicle', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']);
foreach ($vehicles as $vehicle) { wp_delete_post($vehicle, true); }
$terms = get_terms(['taxonomy' => 'tuxano_collection', 'hide_empty' => false, 'fields' => 'ids']);
if (!is_wp_error($terms)) { foreach ($terms as $term) { wp_delete_term($term, 'tuxano_collection'); } }
foreach (['tuxano_booking_settings', 'tuxano_booking_db_version', 'tuxano_booking_fleet_seeded', 'tuxano_schedule_cursor'] as $option) { delete_option($option); }
$keys = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s OR option_name LIKE %s", $wpdb->esc_like('_tuxano_rate_') . '%', $wpdb->esc_like('_transient_tuxano_') . '%', $wpdb->esc_like('_transient_timeout_tuxano_') . '%'));
foreach ($keys as $key) { delete_option($key); }
wp_clear_scheduled_hook('tuxano_booking_maintenance');
