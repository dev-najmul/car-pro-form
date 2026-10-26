<?php
/** Email branding configuration boundaries in a disposable local WordPress DB. */

use Tuxano\Booking\Settings;

if (!defined('WP_CLI') || !WP_CLI) { exit('Run using WP-CLI.'); }
if (wp_get_environment_type() !== 'local') { WP_CLI::error('Run only against isolated local WordPress.'); }

$checks = 0;
$check = static function (bool $condition, string $message) use (&$checks): void {
    if (!$condition) { throw new RuntimeException($message); }
    ++$checks;
};
$original = get_option(Settings::OPTION, null);
$original_user = get_current_user_id();
$admins = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ID']);
$check(!empty($admins), 'An administrator fixture is required.');
wp_set_current_user((int) $admins[0]);

try {
    $default = plugins_url('public/' . TUXANO_BOOKING_VERSION . '/assets/tuxano-wordmark.png', TUXANO_BOOKING_FILE);
    $legacy = Settings::get(); unset($legacy['email_logo_url']); update_option(Settings::OPTION, $legacy, false);
    $check(Settings::get()['email_logo_url'] === '' && Settings::email_logo_url(Settings::get()) === $default, 'Legacy installations use the versioned bundled logo without requiring a save.');
    $revision = Settings::revision();
    $before = Settings::get();
    $custom = 'https://cdn.example.test/brand/email-logo.png?version=2&size=480';
    $check(Settings::save(['email_logo_url' => $custom]) === true, 'A public HTTPS image URL may be saved.');
    $after = Settings::get();
    $check($after['email_logo_url'] === $custom && Settings::email_logo_url($after) === $custom, 'The selected logo resolves unchanged for email rendering.');
    unset($before['email_logo_url'], $after['email_logo_url']);
    $check($before === $after, 'Logo saves preserve every other setting, including private keys and notification preferences.');
    $check(Settings::revision() === $revision, 'Email branding changes do not invalidate route quotes.');
    $public = Settings::public_data();
    $check(!array_key_exists('email_logo_url', $public) && !array_key_exists('emailLogoUrl', $public), 'Email branding configuration is not included in the public booking session.');
    $check(($public['availabilityChecks'] ?? null) === true, 'The new server advertises availability support without a persisted administrator toggle.');
    foreach (['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///tmp/logo.png', '//cdn.example.test/logo.png', 'https://user:pass@example.test/logo.png', 'https://example.test/logo.svg#fragment', "https://example.test/logo.png\r\nX-Header: bad", 'https://example.test/logo image.png', ['https://example.test/logo.png'], str_repeat('https://example.test/', 200)] as $invalid) {
        $before = Settings::get();
        $result = Settings::save(['company_name' => 'Must not partially save', 'email_logo_url' => $invalid]);
        $check(is_wp_error($result) && Settings::get() === $before, 'Unsafe or malformed logo input rejects the whole partial settings save.');
        $check(Settings::email_logo_url(['email_logo_url' => $invalid]) === $default, 'Corrupt stored logo values resolve to the safe bundled asset.');
    }
    $check(Settings::save(['email_logo_url' => 'http://images.example.test/logo.webp']) === true, 'An administrator may explicitly use an HTTP image URL.');
    $check(Settings::save(['email_logo_url' => '']) === true && Settings::email_logo_url(Settings::get()) === $default, 'Clearing the custom URL restores the default logo.');
    wp_set_current_user(0);
    $before = Settings::get();
    $check(is_wp_error(Settings::save(['email_logo_url' => $custom])) && Settings::get() === $before, 'Anonymous callers cannot change email branding.');
    WP_CLI::success('WordPress email-logo checks passed: ' . $checks);
} finally {
    if ($original === null) { delete_option(Settings::OPTION); } else { update_option(Settings::OPTION, $original, false); }
    wp_set_current_user($original_user);
}
