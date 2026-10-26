<?php
/**
 * Validated plugin configuration. Secret options are never part of public_data().
 *
 * @package TuxanoBooking
 */

namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Settings
{
    public const OPTION = 'tuxano_booking_settings';

    /** Form header/navigation only. These preferences never affect a fare. */
    public const FORM_COLORS = [
        'form_title_color' => '#101e36',
        'form_subtitle_color' => '#52617a',
        'form_step_label_color' => '#53617a',
        'form_active_step_label_color' => '#132d60',
        'form_connector_color' => '#d8e0ed',
        'form_circle_background' => '#ffffff',
        'form_circle_text_color' => '#666666',
        'form_circle_border_color' => '#ced7e5',
        'form_active_circle_background' => '#173a7b',
        'form_active_circle_text_color' => '#ffffff',
    ];

    /** @return array<string,mixed> */
    public static function defaults(): array
    {
        $host = (string) wp_parse_url(home_url('/'), PHP_URL_HOST);
        $host = preg_replace('/^www\./i', '', $host);
        $from = sanitize_email('noreply@' . $host);
        if (!is_email($from)) {
            $from = (string) get_option('admin_email', '');
        }

        return array_merge([
            'currency' => 'USD',
            'currency_symbol' => '$',
            'meet_price' => 50.0,
            'first_seat_price' => 75.0,
            'additional_seat_price' => 50.0,
            'default_gratuity' => 20.0,
            'company_name' => 'TUXANO',
            'support_email' => 'info@tuxano.com',
            'support_phone' => '+1 (717) 434-6195',
            'website' => 'https://tuxano.com',
            'terms_url' => '',
            'privacy_url' => (string) get_privacy_policy_url(),
            'max_stops' => 5,
            'min_hours' => 2,
            'max_hours' => 12,
            'admin_email' => (string) get_option('admin_email', ''),
            'email_customer' => true,
            'email_admin' => true,
            'retention_days' => 0,
            'sender_name' => (string) get_bloginfo('name'),
            'from_email' => $from,
            'email_logo_url' => '',
            'browser_key' => '',
            'routes_key' => '',
            'route_daily_limit' => 1000,
            'route_minute_limit' => 30,
            'session_hourly_limit' => 120,
            'booking_hourly_limit' => 20,
            'dashboard_recent_limit' => 3,
            'booking_page_id' => 0,
        ], self::FORM_COLORS);
    }

    /** @return array<string,mixed> */
    public static function get(): array
    {
        $defaults = self::defaults();
        $stored = get_option(self::OPTION, []);
        return array_replace($defaults, is_array($stored) ? array_intersect_key($stored, $defaults) : []);
    }

    /**
     * Merge a partial settings form. Blank API inputs preserve stored keys.
     * Callers must unslash WordPress request data before passing it here.
     *
     * @return true|\WP_Error
     */
    public static function save(array $input)
    {
        if (!current_user_can('manage_options')) {
            return new \WP_Error('tuxano_settings_forbidden', __('You cannot change booking settings.', 'tuxano-booking'), ['status' => 403]);
        }

        $next = self::get();
        $errors = new \WP_Error();
        $price_fields = ['meet_price', 'first_seat_price', 'additional_seat_price', 'default_gratuity'];
        $integer_bounds = ['max_stops' => [0, 5], 'min_hours' => [1, 24], 'max_hours' => [1, 24], 'retention_days' => [0, 3650], 'route_daily_limit' => [1, 100000], 'route_minute_limit' => [1, 120], 'session_hourly_limit' => [1, 1000], 'booking_hourly_limit' => [1, 1000], 'dashboard_recent_limit' => [1, 20]];
        $text_bounds = ['company_name' => 120, 'support_phone' => 60, 'sender_name' => 120, 'currency_symbol' => 12];

        foreach (self::defaults() as $key => $_default) {
            if (!array_key_exists($key, $input)) {
                continue;
            }
            $value = $input[$key];
            if (in_array($key, ['email_customer', 'email_admin'], true)) {
                if (!in_array($value, [true, false, 0, 1, '0', '1'], true)) {
                    $errors->add('tuxano_invalid_settings', sprintf(__('Invalid value for %s.', 'tuxano-booking'), $key));
                } else {
                    $next[$key] = in_array($value, [true, 1, '1'], true);
                }
                continue;
            }
            if (!is_string($value) && !is_int($value) && !is_float($value)) {
                $errors->add('tuxano_invalid_settings', sprintf(__('Invalid value for %s.', 'tuxano-booking'), $key));
                continue;
            }
            $value = trim((string) $value);

            if (in_array($key, ['browser_key', 'routes_key'], true)) {
                if ($value === '') {
                    continue;
                }
                if (!preg_match('/^[A-Za-z0-9_-]{20,200}$/D', $value)) {
                    $errors->add('tuxano_invalid_settings', __('An API key contains invalid characters or has an invalid length.', 'tuxano-booking'));
                    continue;
                }
                $next[$key] = $value;
            } elseif ($key === 'booking_page_id') {
                if (!preg_match('/^\d{1,10}$/D', $value) || (float) $value > 2147483647 || ((int) $value > 0 && self::booking_page_url((int) $value) === '')) {
                    $errors->add('tuxano_invalid_settings', __('Choose a published, public booking page on this website.', 'tuxano-booking'));
                } else {
                    $next[$key] = (int) $value;
                }
            } elseif (array_key_exists($key, self::FORM_COLORS)) {
                if (!preg_match('/^#[A-Fa-f0-9]{6}$/D', $value)) {
                    $errors->add('tuxano_invalid_settings', __('Choose a six-digit hexadecimal form color, such as #ffffff.', 'tuxano-booking'));
                } else {
                    $next[$key] = strtolower($value);
                }
            } elseif (in_array($key, $price_fields, true)) {
                $number = self::decimal($value, $key === 'default_gratuity' ? 100 : 1000000);
                if ($number === null) {
                    $errors->add('tuxano_invalid_settings', sprintf(__('Enter a valid nonnegative amount for %s.', 'tuxano-booking'), $key));
                } else {
                    $next[$key] = $number;
                }
            } elseif (isset($integer_bounds[$key])) {
                [$min, $max] = $integer_bounds[$key];
                if (!preg_match('/^\d{1,6}$/D', $value) || (int) $value < $min || (int) $value > $max) {
                    $errors->add('tuxano_invalid_settings', sprintf(__('Enter a whole number between %1$d and %2$d for %3$s.', 'tuxano-booking'), $min, $max, $key));
                } else {
                    $next[$key] = (int) $value;
                }
            } elseif ($key === 'currency') {
                $value = strtoupper($value);
                if (!preg_match('/^[A-Z]{3}$/D', $value)) {
                    $errors->add('tuxano_invalid_settings', __('Currency must be a three-letter ISO code, such as USD.', 'tuxano-booking'));
                } else {
                    $next[$key] = $value;
                }
            } elseif (in_array($key, ['admin_email', 'support_email', 'from_email'], true)) {
                if (($value === '' && $key === 'admin_email') || strlen($value) > 254 || strpbrk($value, "\r\n") !== false || ($value !== '' && !is_email($value))) {
                    $errors->add('tuxano_invalid_settings', sprintf(__('Enter a valid email address for %s.', 'tuxano-booking'), $key));
                } else {
                    $next[$key] = $value === '' && $key === 'from_email' ? self::defaults()['from_email'] : sanitize_email($value);
                }
            } elseif (in_array($key, ['website', 'terms_url', 'privacy_url', 'email_logo_url'], true)) {
                $url = $value === '' ? '' : esc_url_raw($value, ['http', 'https']);
                $parts = $url !== '' ? wp_parse_url($url) : [];
                if (strlen($value) > 2048 || ($key === 'email_logo_url' && preg_match('/[\x00-\x20\x7f]/', $value)) || ($value !== '' && (!preg_match('#^https?://#i', $value) || !$url || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || ($key === 'email_logo_url' && isset($parts['fragment']))))) {
                    $errors->add('tuxano_invalid_settings', sprintf(__('Enter a valid HTTP or HTTPS URL for %s.', 'tuxano-booking'), $key));
                } else {
                    $next[$key] = $url;
                }
            } elseif (isset($text_bounds[$key])) {
                if (strlen($value) > $text_bounds[$key] || strpbrk($value, "\r\n") !== false || ($key === 'company_name' && $value === '')) {
                    $errors->add('tuxano_invalid_settings', sprintf(__('Enter a valid value for %s.', 'tuxano-booking'), $key));
                } else {
                    $clean = sanitize_text_field($value);
                    if ($key === 'company_name' && $clean === '') {
                        $errors->add('tuxano_invalid_settings', __('Company name cannot be empty.', 'tuxano-booking'));
                    } else {
                        $next[$key] = $clean;
                    }
                }
            }
        }

        foreach (['browser_key', 'routes_key'] as $key) {
            if (isset($input['clear_' . $key]) && in_array($input['clear_' . $key], [true, 1, '1'], true)) {
                $next[$key] = '';
            }
        }
        if ($next['min_hours'] > $next['max_hours']) {
            $errors->add('tuxano_invalid_settings', __('Minimum service hours cannot exceed maximum service hours.', 'tuxano-booking'));
        }
        if ($errors->has_errors()) {
            return $errors;
        }

        // false explicitly prevents the private key from being autoloaded site-wide.
        if (!update_option(self::OPTION, $next, false) && get_option(self::OPTION, []) !== $next) {
            return new \WP_Error('tuxano_settings_storage', __('Settings could not be saved. Please try again.', 'tuxano-booking'), ['status' => 500]);
        }
        return true;
    }

    /** @return array<string,mixed> */
    public static function public_data(): array
    {
        $settings = self::get();
        $mapping = [
            'currency' => 'currency', 'currency_symbol' => 'currencySymbol',
            'meet_price' => 'meetPrice', 'first_seat_price' => 'firstSeatPrice',
            'additional_seat_price' => 'additionalSeatPrice', 'default_gratuity' => 'defaultGratuity',
            'company_name' => 'companyName', 'support_email' => 'supportEmail',
            'support_phone' => 'supportPhone', 'website' => 'website',
            'terms_url' => 'termsUrl', 'privacy_url' => 'privacyUrl',
            'max_stops' => 'maxStops', 'min_hours' => 'minHours', 'max_hours' => 'maxHours',
        ];
        $public = [];
        foreach ($mapping as $private_key => $public_key) {
            $public[$public_key] = $settings[$private_key];
        }
        $public['formColors'] = [];
        foreach ([
            'form_title_color' => 'title', 'form_subtitle_color' => 'subtitle',
            'form_step_label_color' => 'stepLabel', 'form_active_step_label_color' => 'activeStepLabel',
            'form_connector_color' => 'connector', 'form_circle_background' => 'circleBackground',
            'form_circle_text_color' => 'circleText', 'form_circle_border_color' => 'circleBorder',
            'form_active_circle_background' => 'activeCircleBackground', 'form_active_circle_text_color' => 'activeCircleText',
        ] as $private_key => $public_key) {
            $color = $settings[$private_key];
            $public['formColors'][$public_key] = is_string($color) && preg_match('/^#[A-Fa-f0-9]{6}$/D', $color) ? strtolower($color) : self::FORM_COLORS[$private_key];
        }
        $public['timezone'] = wp_timezone_string();
        $public['bookingPageUrl'] = self::booking_page_url((int) $settings['booking_page_id']);
        $public['availabilityChecks'] = true;
        return $public;
    }

    /** Display-only email branding; no remote file is fetched by the server. */
    public static function email_logo_url(array $settings): string
    {
        $value = $settings['email_logo_url'] ?? '';
        if (is_string($value) && $value !== '' && strlen($value) <= 2048 && !preg_match('/[\x00-\x20\x7f]/', $value)) {
            $url = esc_url_raw($value, ['http', 'https']);
            $parts = $url !== '' ? wp_parse_url($url) : [];
            if (preg_match('#^https?://#i', $value) && is_array($parts) && !empty($parts['host']) && !isset($parts['user']) && !isset($parts['pass']) && !isset($parts['fragment'])) {
                return $url;
            }
        }
        $version = defined('TUXANO_BOOKING_VERSION') ? TUXANO_BOOKING_VERSION : '2.3.1';
        $file = defined('TUXANO_BOOKING_FILE') ? TUXANO_BOOKING_FILE : dirname(__DIR__) . '/tuxano-booking.php';
        return plugins_url('public/' . $version . '/assets/tuxano-wordmark.png', $file);
    }

    /** Only an existing public page on this origin can receive quick trips. */
    public static function booking_page_url(?int $page_id = null): string
    {
        if ($page_id === null) { $page_id = (int) self::get()['booking_page_id']; }
        if ($page_id < 1) { return ''; }
        $page = get_post($page_id);
        if (!$page || $page->post_type !== 'page' || $page->post_status !== 'publish' || $page->post_password !== '') { return ''; }
        $url = get_permalink($page);
        if (!is_string($url) || strlen($url) > 2048) { return ''; }
        $target = wp_parse_url($url);
        $home = wp_parse_url(home_url('/'));
        if (!is_array($target) || !is_array($home) || isset($target['user']) || isset($target['pass']) || isset($target['fragment'])) { return ''; }
        $scheme = strtolower((string) ($target['scheme'] ?? ''));
        $home_scheme = strtolower((string) ($home['scheme'] ?? ''));
        $port = (int) ($target['port'] ?? ($scheme === 'https' ? 443 : 80));
        $home_port = (int) ($home['port'] ?? ($home_scheme === 'https' ? 443 : 80));
        if (!in_array($scheme, ['http', 'https'], true) || $scheme !== $home_scheme || strtolower((string) ($target['host'] ?? '')) !== strtolower((string) ($home['host'] ?? '')) || $port !== $home_port) { return ''; }
        return esc_url_raw($url, ['http', 'https']);
    }

    /** Pricing changes invalidate previously issued route quotes. */
    public static function revision(): string
    {
        $settings = self::get();
        $prices = array_intersect_key($settings, array_flip([
            'currency', 'currency_symbol', 'meet_price', 'first_seat_price',
            'additional_seat_price', 'default_gratuity', 'min_hours', 'max_hours', 'max_stops',
        ]));
        $vehicles = array_map(static fn(array $vehicle): array => [
            'id' => $vehicle['id'], 'name' => $vehicle['name'], 'display' => $vehicle['display'],
            'models' => $vehicle['models'], 'features' => $vehicle['features'], 'category' => $vehicle['category'],
            'thumbnail' => (int) get_post_thumbnail_id((int) $vehicle['id']), 'capacity' => $vehicle['capacity'],
            'luggageCapacity' => $vehicle['luggageCapacity'], 'tariff' => $vehicle['tariff'],
        ], Vehicles::all());
        usort($vehicles, static fn(array $a, array $b): int => strcmp($a['id'], $b['id']));
        $version = defined('TUXANO_BOOKING_VERSION') ? TUXANO_BOOKING_VERSION : 'development';
        return hash('sha256', (string) wp_json_encode([$version, $prices, $vehicles], JSON_PRESERVE_ZERO_FRACTION));
    }

    /**
     * A bounded decimal parser shared by admin fleet input.
     *
     * @param mixed $value Untrusted scalar amount.
     */
    public static function decimal($value, float $maximum = 1000000): ?float
    {
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return null;
        }
        $value = trim((string) $value);
        if (!preg_match('/^\d{1,10}(?:\.\d{1,4})?$/D', $value)) {
            return null;
        }
        $number = (float) $value;
        return is_finite($number) && $number >= 0 && $number <= $maximum ? $number : null;
    }
}
