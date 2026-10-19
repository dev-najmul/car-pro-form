<?php
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Frontend
{
    public static function register(): void
    {
        add_shortcode('tuxano_booking', [self::class, 'shortcode']);
        add_filter('theme_page_templates', static function (array $templates): array {
            $templates['tuxano-booking-full-page.php'] = __('Tuxano Booking — full page', 'tuxano-booking');
            return $templates;
        });
        add_action('template_redirect', [self::class, 'frame']);
        add_action('admin_init', static function (): void {
            if (function_exists('wp_add_privacy_policy_content')) {
                wp_add_privacy_policy_content('Tuxano Booking', '<p>Transportation requests contain contact, passenger, billing, itinerary and pricing details. Google Maps/Places/Routes receive location queries and chosen points. The current-location button uses optional browser geolocation. Requests are available only to authorized site administrators and notified email recipients. Configure retention and mail recipients in Tuxano Booking settings. Email transport providers may also process these details. No card or payment information is collected by this plugin.</p>');
            }
        });
    }

    public static function shortcode(): string
    {
        $id = wp_unique_id('tuxano-frame-');
        $url = add_query_arg(['tuxano_booking_form' => '1', 'frame_id' => $id], home_url('/'));
        wp_enqueue_script('tuxano-booking-embed', TUXANO_BOOKING_URL . 'assets/embed.js', [], TUXANO_BOOKING_VERSION, true);
        return '<div class="tuxano-booking-embed" style="width:100%;max-width:none"><iframe id="' . esc_attr($id) . '" data-tuxano-booking-frame src="' . esc_url($url) . '" title="' . esc_attr__('Transportation reservation request', 'tuxano-booking') . '" allow="geolocation" style="display:block;width:100%;height:1300px;border:0;max-width:100%" loading="eager"></iframe><noscript>' . esc_html__('Enable JavaScript to use the reservation form.', 'tuxano-booking') . '</noscript></div>';
    }

    public static function frame(): void
    {
        $standalone = isset($_GET['tuxano_booking_form']) && $_GET['tuxano_booking_form'] === '1';
        $full_page = is_page() && get_page_template_slug(get_queried_object_id()) === 'tuxano-booking-full-page.php';
        if (!$standalone && !$full_page) { return; }
        if (!defined('DONOTCACHEPAGE')) { define('DONOTCACHEPAGE', true); }
        if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) { status_header(405); header('Allow: GET, HEAD'); exit; }
        nocache_headers();
        header('Content-Type: text/html; charset=' . get_bloginfo('charset'));
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('X-Frame-Options: SAMEORIGIN');
        $frame = isset($_GET['frame_id']) && is_string($_GET['frame_id']) ? preg_replace('/[^A-Za-z0-9_-]/', '', substr($_GET['frame_id'], 0, 100)) : '';
        $assets = TUXANO_BOOKING_URL . 'public/' . TUXANO_BOOKING_VERSION . '/';
        $boot = ['restUrl' => rest_url('tuxano-booking/v1/'), 'nonce' => wp_create_nonce('wp_rest'), 'assetUrl' => $assets, 'frameId' => $frame, 'timezone' => wp_timezone_string()];
        $settings = Settings::get();
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') { exit; }
        ?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title><?php echo esc_html($settings['company_name']); ?> Reservation Request</title><link rel="stylesheet" href="<?php echo esc_url($assets . 'styles.css'); ?>"></head>
<body><a href="#main" class="skip-link">Skip to form</a><div id="app"><p class="route-status" role="status">Loading reservation form…</p></div><div id="announcement" class="sr-only" role="status" aria-live="polite"></div><noscript><p>Please enable JavaScript to use this reservation request form.</p></noscript>
<script>globalThis.TuxanoBookingBoot=<?php echo wp_json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;</script><script type="module" src="<?php echo esc_url(TUXANO_BOOKING_URL . 'assets/bootstrap.js?ver=' . TUXANO_BOOKING_VERSION); ?>"></script></body></html><?php
        exit;
    }
}
