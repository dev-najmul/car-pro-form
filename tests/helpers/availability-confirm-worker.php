<?php
/** A disposable local-only process used to exercise real database contention. */
if (PHP_SAPI !== 'cli' || count($argv) !== 5) { exit(2); }
$root = $argv[1]; $id = filter_var($argv[2], FILTER_VALIDATE_INT); $admin = filter_var($argv[3], FILTER_VALIDATE_INT); $directory = $argv[4];
if (!$id || !$admin || !preg_match('~/tuxano-availability-[a-f0-9]{16}$~D', $directory) || !is_dir($directory)) { exit(2); }
define('WP_USE_THEMES', false);
require rtrim($root, '/') . '/wp-load.php';
if (wp_get_environment_type() !== 'local') { exit(2); }
$row = \Tuxano\Booking\Database::find($id);
if (!$row || strpos($row['reference'], 'TUX-AVAIL-') !== 0 || substr($row['customer_email'], -13) !== '@example.test') { exit(2); }
wp_set_current_user($admin);
add_filter('pre_wp_mail', static function () { return true; });
file_put_contents($directory . '/' . $id . '.ready', 'ready');
$result = \Tuxano\Booking\Database::update($id, ['status' => 'confirmed']);
echo wp_json_encode(['ok' => !is_wp_error($result), 'code' => is_wp_error($result) ? $result->get_error_code() : '', 'status' => is_wp_error($result) ? ($result->get_error_data()['status'] ?? 0) : 200]);
