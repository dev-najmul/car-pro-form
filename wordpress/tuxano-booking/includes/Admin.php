<?php
/** Administration screens and capability-checked actions. */
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Admin {
    private const PAGE = 'tuxano-booking';
    private const PER_PAGE = 20;

    public static function register(): void {
        add_action('admin_menu', [self::class, 'menus']);
        add_action('admin_menu', [self::class, 'order_menu'], 99);
        add_action('admin_enqueue_scripts', [self::class, 'assets']);
        add_action('admin_notices', [self::class, 'native_header'], 1);
        add_filter('admin_body_class', [self::class, 'body_class']);
        add_action('admin_post_tuxano_save_settings', [self::class, 'save_settings']);
        add_action('admin_post_tuxano_update_booking', [self::class, 'update_booking']);
        add_action('admin_post_tuxano_delete_booking', [self::class, 'delete_booking']);
        add_action('admin_post_tuxano_retry_notifications', [self::class, 'retry_notifications']);
        add_action('admin_post_tuxano_edit_booking', [self::class, 'edit_booking']);
        add_action('admin_post_tuxano_bulk_bookings', [self::class, 'bulk_bookings']);
        add_filter('parent_file', [self::class, 'parent_menu']);
        add_filter('submenu_file', [self::class, 'submenu_menu']);
    }

    public static function menus(): void {
        add_menu_page(__('Tuxano Booking', 'tuxano-booking'), __('Tuxano Booking', 'tuxano-booking'), 'manage_options', self::PAGE, [self::class, 'dashboard'], 'dashicons-calendar-alt', 26);
        add_submenu_page(self::PAGE, __('Dashboard', 'tuxano-booking'), __('Dashboard', 'tuxano-booking'), 'manage_options', self::PAGE, [self::class, 'dashboard']);
        add_submenu_page(self::PAGE, __('Submissions', 'tuxano-booking'), __('Submissions', 'tuxano-booking'), 'manage_options', 'tuxano-submissions', [self::class, 'submissions']);
        add_submenu_page(self::PAGE, __('Vehicle Collections', 'tuxano-booking'), __('Collections', 'tuxano-booking'), 'manage_options', 'edit-tags.php?taxonomy=tuxano_collection&post_type=tuxano_vehicle');
        add_submenu_page(self::PAGE, __('Pricing', 'tuxano-booking'), __('Pricing', 'tuxano-booking'), 'manage_options', 'tuxano-pricing', [self::class, 'pricing']);
        add_submenu_page(self::PAGE, __('Settings', 'tuxano-booking'), __('Settings', 'tuxano-booking'), 'manage_options', 'tuxano-settings', [self::class, 'settings']);
    }

    public static function assets(string $hook): void {
        $screen = get_current_screen();
        if (strpos($hook, 'tuxano') === false && (!$screen || ($screen->post_type !== 'tuxano_vehicle' && $screen->taxonomy !== 'tuxano_collection'))) {
            return;
        }
        wp_enqueue_style('tuxano-booking-admin', TUXANO_BOOKING_URL . 'assets/admin.css', [], TUXANO_BOOKING_VERSION);
        wp_enqueue_script('tuxano-booking-admin', TUXANO_BOOKING_URL . 'assets/admin.js', [], TUXANO_BOOKING_VERSION, true);
        $settings = Settings::get();
        $boot = ['restUrl' => rest_url('tuxano-booking/v1/'), 'nonce' => wp_create_nonce('wp_rest'), 'assetUrl' => TUXANO_BOOKING_URL . 'public/' . TUXANO_BOOKING_VERSION . '/'];
        wp_add_inline_script('tuxano-booking-admin', 'globalThis.TuxanoAdmin=' . wp_json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
        if (self::get_query('edit') === '1' && absint(self::get_query('booking_id')) > 0) {
            $boot['browserKey'] = $settings['browser_key'];
            $boot['maxStops'] = (int) $settings['max_stops'];
            wp_enqueue_script('tuxano-booking-editor', TUXANO_BOOKING_URL . 'assets/admin-booking.js', ['tuxano-booking-admin'], TUXANO_BOOKING_VERSION, true);
            wp_add_inline_script('tuxano-booking-editor', 'globalThis.TuxanoEditor=' . wp_json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';', 'before');
        }
        if ($screen && $screen->post_type === 'tuxano_vehicle' && $screen->base === 'post') { wp_enqueue_media(); }
    }

    private static function native_screen(): bool {
        $screen = get_current_screen();
        return $screen && ($screen->post_type === 'tuxano_vehicle' || $screen->taxonomy === 'tuxano_collection');
    }

    public static function body_class(string $classes): string {
        if (self::native_screen()) { return $classes . ' tuxano-admin-screen tuxano-native-screen'; }
        $page = self::get_query('page');
        return in_array($page, [self::PAGE, 'tuxano-submissions', 'tuxano-pricing', 'tuxano-settings'], true) ? $classes . ' tuxano-admin-screen' : $classes;
    }

    /** Add the same navigation to native fleet screens without wrapping WP forms. */
    public static function native_header(): void {
        if (!self::native_screen() || !current_user_can('manage_options')) { return; }
        $screen = get_current_screen();
        $collections = $screen && $screen->taxonomy === 'tuxano_collection';
        echo '<div class="wrap tuxano-admin tuxano-native-header"><header class="tuxano-heading"><p class="tuxano-intro">' . esc_html($collections ? __('Organize your fleet into collections shown in the booking form.', 'tuxano-booking') : __('Manage vehicle details, photos, capacities and transportation rates.', 'tuxano-booking')) . '</p><span class="tuxano-version">' . esc_html__('Version', 'tuxano-booking') . ' ' . esc_html(TUXANO_BOOKING_VERSION) . '</span></header>';
        self::tabs($collections ? 'collections' : 'vehicles');
        echo '</div>';
    }

    public static function order_menu(): void {
        global $submenu;
        if (empty($submenu[self::PAGE])) { return; }
        $order = array_flip([self::PAGE, 'tuxano-submissions', 'edit.php?post_type=tuxano_vehicle', 'edit-tags.php?taxonomy=tuxano_collection&post_type=tuxano_vehicle', 'tuxano-pricing', 'tuxano-settings']);
        usort($submenu[self::PAGE], static fn(array $a, array $b): int => ($order[$a[2]] ?? 99) <=> ($order[$b[2]] ?? 99));
    }

    public static function parent_menu(string $parent): string {
        $screen = get_current_screen();
        return $screen && ($screen->post_type === 'tuxano_vehicle' || $screen->taxonomy === 'tuxano_collection') ? self::PAGE : $parent;
    }

    public static function submenu_menu($submenu) {
        $screen = get_current_screen();
        if ($screen && $screen->taxonomy === 'tuxano_collection') { return 'edit-tags.php?taxonomy=tuxano_collection&post_type=tuxano_vehicle'; }
        if ($screen && $screen->post_type === 'tuxano_vehicle') { return 'edit.php?post_type=tuxano_vehicle'; }
        return $submenu;
    }

    private static function authorize(): void {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to manage bookings.', 'tuxano-booking'), '', ['response' => 403]);
        }
    }

    private static function url(string $page, array $args = []): string {
        return add_query_arg(array_merge(['page' => $page], $args), admin_url('admin.php'));
    }

    private static function open(string $title, string $description = ''): void {
        self::authorize();
        echo '<div class="wrap tuxano-admin"><header class="tuxano-heading"><div><h1>' . esc_html($title) . '</h1>';
        if ($description !== '') { echo '<p class="tuxano-intro">' . esc_html($description) . '</p>'; }
        echo '</div><span class="tuxano-version">' . esc_html__('Version', 'tuxano-booking') . ' ' . esc_html(TUXANO_BOOKING_VERSION) . '</span></header>';
        self::tabs(self::get_query('page'));
        self::notices();
    }

    private static function tabs(string $current): void {
        echo '<nav class="tuxano-tabs" aria-label="' . esc_attr__('Booking administration', 'tuxano-booking') . '">';
        $links = [
            [self::PAGE, __('Overview', 'tuxano-booking'), self::url(self::PAGE)],
            ['tuxano-submissions', __('Submissions', 'tuxano-booking'), self::url('tuxano-submissions')],
            ['vehicles', __('Vehicles', 'tuxano-booking'), admin_url('edit.php?post_type=tuxano_vehicle')],
            ['collections', __('Collections', 'tuxano-booking'), admin_url('edit-tags.php?taxonomy=tuxano_collection&post_type=tuxano_vehicle')],
            ['tuxano-pricing', __('Pricing', 'tuxano-booking'), self::url('tuxano-pricing')],
            ['tuxano-settings', __('Settings', 'tuxano-booking'), self::url('tuxano-settings')],
        ];
        foreach ($links as [$key, $label, $url]) {
            echo '<a href="' . esc_url($url) . '"' . ($current === $key ? ' aria-current="page"' : '') . '>' . esc_html($label) . '</a>';
        }
        echo '</nav>';
    }

    private static function notices(): void {
        $notice = isset($_GET['tuxano_notice']) && is_string($_GET['tuxano_notice']) ? sanitize_key(wp_unslash($_GET['tuxano_notice'])) : '';
        $messages = [
            'saved' => __('Settings saved.', 'tuxano-booking'),
            'updated' => __('Submission updated.', 'tuxano-booking'),
            'deleted' => __('Submission permanently deleted.', 'tuxano-booking'),
            'notifications' => __('Notification retry completed. Review the delivery status below.', 'tuxano-booking'),
            'edited' => __('Booking changes saved. Review the updated estimate and notification status below.', 'tuxano-booking'),
            'bulk_deleted' => __('Selected submissions were permanently deleted.', 'tuxano-booking'),
        ];
        if (isset($messages[$notice])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html($messages[$notice]) . '</p></div>';
        }
        if ($notice === 'error') {
            $key = 'tuxano_admin_error_' . get_current_user_id();
            $message = get_transient($key);
            delete_transient($key);
            echo '<div class="notice notice-error"><p>' . esc_html(is_string($message) ? $message : __('The action could not be completed. Please try again.', 'tuxano-booking')) . '</p></div>';
        }
    }

    private static function finish(string $page, string $notice, array $args = [], ?\WP_Error $error = null): void {
        if ($error) {
            set_transient('tuxano_admin_error_' . get_current_user_id(), $error->get_error_message(), MINUTE_IN_SECONDS);
            $notice = 'error';
        }
        wp_safe_redirect(self::url($page, array_merge($args, ['tuxano_notice' => $notice])));
        exit;
    }

    private static function status_label(string $status): string {
        $labels = [
            'new' => __('New', 'tuxano-booking'),
            'reviewing' => __('Reviewing', 'tuxano-booking'),
            'confirmed' => __('Confirmed', 'tuxano-booking'),
            'cancelled' => __('Cancelled', 'tuxano-booking'),
            'completed' => __('Completed', 'tuxano-booking'),
        ];
        return $labels[$status] ?? $status;
    }

    private static function badge(string $status): string {
        return '<span class="tuxano-status tuxano-status-' . esc_attr(sanitize_html_class($status)) . '">' . esc_html(self::status_label($status)) . '</span>';
    }

    /** @param mixed $value */
    private static function scalar($value, string $fallback = '—'): string {
        return is_scalar($value) && (string) $value !== '' ? (string) $value : $fallback;
    }

    /** @param mixed $amount */
    private static function money($amount, string $currency): string {
        return $currency . ' ' . number_format_i18n(is_numeric($amount) ? (float) $amount : 0, 2);
    }

    /** @param mixed $date */
    private static function date_label($date, bool $utc = true): string {
        if (!is_string($date) || $date === '') {
            return '—';
        }
        try {
            $parsed = new \DateTimeImmutable($date, $utc ? new \DateTimeZone('UTC') : wp_timezone());
            return wp_date(get_option('date_format') . ' ' . get_option('time_format'), $parsed->getTimestamp());
        } catch (\Exception $error) {
            return '—';
        }
    }

    public static function dashboard(): void {
        self::open(__('Tuxano Booking', 'tuxano-booking'), __('Manage reservation requests, your fleet, pricing, and booking settings.', 'tuxano-booking'));
        $counts = Database::counts();
        echo '<div class="tuxano-stats">';
        foreach (array_merge(['total'], Database::STATUSES) as $status) {
            $label = $status === 'total' ? __('Total submissions', 'tuxano-booking') : self::status_label($status);
            $args = $status === 'total' ? [] : ['status' => $status];
            echo '<a class="tuxano-stat" href="' . esc_url(self::url('tuxano-submissions', $args)) . '"><span>' . esc_html($label) . '</span><strong>' . esc_html(number_format_i18n((int) ($counts[$status] ?? 0))) . '</strong></a>';
        }
        echo '</div><div class="tuxano-dashboard-grid"><section class="tuxano-card"><h2>' . esc_html__('Recent submissions', 'tuxano-booking') . '</h2>';
        $settings = Settings::get();
        $recent = Database::listing(['page' => 1, 'per_page' => max(1, min(20, (int) $settings['dashboard_recent_limit']))]);
        self::submission_table($recent['items']);
        echo '<p><a class="button" href="' . esc_url(self::url('tuxano-submissions')) . '">' . esc_html__('View all submissions', 'tuxano-booking') . '</a></p></section><section class="tuxano-card"><h2>' . esc_html__('Booking setup', 'tuxano-booking') . '</h2><p>' . esc_html__('Add the shortcode below to a WordPress page to display the booking form.', 'tuxano-booking') . '</p><p><code>[tuxano_booking]</code></p>';
        echo '<ul class="tuxano-checklist"><li>' . esc_html__('Google Maps browser key:', 'tuxano-booking') . ' <strong>' . esc_html($settings['browser_key'] !== '' ? __('Configured', 'tuxano-booking') : __('Not configured', 'tuxano-booking')) . '</strong></li><li>' . esc_html__('Routes server key:', 'tuxano-booking') . ' <strong>' . esc_html($settings['routes_key'] !== '' ? __('Configured', 'tuxano-booking') : __('Not configured', 'tuxano-booking')) . '</strong></li><li>' . esc_html__('Published vehicles:', 'tuxano-booking') . ' <strong>' . esc_html((string) count(Vehicles::all())) . '</strong></li></ul><p><a class="button" href="' . esc_url(self::url('tuxano-settings')) . '">' . esc_html__('Manage settings', 'tuxano-booking') . '</a> <a class="button" href="' . esc_url(admin_url('edit.php?post_type=tuxano_vehicle')) . '">' . esc_html__('Manage fleet', 'tuxano-booking') . '</a></p><p class="description">' . esc_html__('Submissions are reservation requests. Confirmation and payment arrangements are handled by your team.', 'tuxano-booking') . '</p></section></div></div>';
    }

    private static function get_query(string $key): string {
        return isset($_GET[$key]) && is_string($_GET[$key]) ? sanitize_text_field(wp_unslash($_GET[$key])) : '';
    }

    private static function filter_date(string $date): string {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $matches)) {
            return '';
        }
        return checkdate((int) $matches[2], (int) $matches[3], (int) $matches[1]) ? $date : '';
    }

    /** @param mixed $value */
    public static function per_page($value): int {
        if ((!is_string($value) && !is_int($value)) || !preg_match('/^\d+$/D', (string) $value)) { return self::PER_PAGE; }
        $number = (int) $value;
        return in_array($number, [10, 20, 50, 100], true) ? $number : self::PER_PAGE;
    }

    /** @param mixed $value @return int[] */
    public static function bulk_ids($value): array {
        if (!is_array($value) || !$value || count($value) > 100) { return []; }
        $ids = [];
        foreach ($value as $id) {
            if ((!is_int($id) && !is_string($id)) || !preg_match('/^[1-9]\d{0,17}$/D', (string) $id)) { return []; }
            $number = (int) $id;
            if ($number < 1) { return []; }
            $ids[] = $number;
        }
        return array_values(array_unique($ids));
    }

    public static function submissions(): void {
        self::authorize();
        $id = absint(self::get_query('booking_id'));
        if ($id > 0) {
            if (self::get_query('edit') === '1') { self::editor($id); } else { self::detail($id); }
            return;
        }
        self::open(__('Submissions', 'tuxano-booking'), __('Your reservation requests in one place. Search, review, update, and keep customers informed.', 'tuxano-booking'));
        $filters = ['search' => mb_substr(self::get_query('s'), 0, 200), 'status' => self::get_query('status'), 'from' => self::filter_date(self::get_query('from')), 'to' => self::filter_date(self::get_query('to')), 'page' => max(1, absint(self::get_query('paged'))), 'per_page' => self::per_page(self::get_query('per_page'))];
        if (!in_array($filters['status'], Database::STATUSES, true)) { $filters['status'] = ''; }
        $result = Database::listing($filters);
        $pages = max(1, (int) ceil($result['total'] / $filters['per_page']));
        if ($filters['page'] > $pages) { $filters['page'] = $pages; $result = Database::listing($filters); }
        echo '<form method="get" action="' . esc_url(admin_url('admin.php')) . '" class="tuxano-filters"><input type="hidden" name="page" value="tuxano-submissions"><div class="tuxano-filter-search"><label for="tuxano-search">' . esc_html__('Search submissions', 'tuxano-booking') . '</label><input id="tuxano-search" type="search" name="s" value="' . esc_attr($filters['search']) . '" placeholder="' . esc_attr__('Reference, customer, email or vehicle', 'tuxano-booking') . '"></div><div><label for="tuxano-status">' . esc_html__('Status', 'tuxano-booking') . '</label><select id="tuxano-status" name="status"><option value="">' . esc_html__('All statuses', 'tuxano-booking') . '</option>';
        foreach (Database::STATUSES as $status) { echo '<option value="' . esc_attr($status) . '" ' . selected($filters['status'], $status, false) . '>' . esc_html(self::status_label($status)) . '</option>'; }
        echo '</select></div><div><label for="tuxano-from">' . esc_html__('Pickup from', 'tuxano-booking') . '</label><input id="tuxano-from" type="date" name="from" value="' . esc_attr($filters['from']) . '"></div><div><label for="tuxano-to">' . esc_html__('Pickup to', 'tuxano-booking') . '</label><input id="tuxano-to" type="date" name="to" value="' . esc_attr($filters['to']) . '"></div><div><label for="tuxano-per-page">' . esc_html__('Per page', 'tuxano-booking') . '</label><select id="tuxano-per-page" name="per_page">';
        foreach ([10, 20, 50, 100] as $number) { echo '<option value="' . esc_attr((string) $number) . '" ' . selected($filters['per_page'], $number, false) . '>' . esc_html((string) $number) . '</option>'; }
        echo '</select></div><button class="button button-primary" type="submit">' . esc_html__('Filter', 'tuxano-booking') . '</button><a class="button" href="' . esc_url(self::url('tuxano-submissions')) . '">' . esc_html__('Reset', 'tuxano-booking') . '</a></form>';
        $first = $result['total'] ? ($filters['page'] - 1) * $filters['per_page'] + 1 : 0;
        $last = min($result['total'], $filters['page'] * $filters['per_page']);
        echo '<div class="tuxano-list-meta"><p>' . esc_html(sprintf(__('Showing %1$s–%2$s of %3$s submissions', 'tuxano-booking'), number_format_i18n($first), number_format_i18n($last), number_format_i18n($result['total']))) . '</p><span>' . esc_html__('Select rows to manage multiple requests.', 'tuxano-booking') . '</span></div><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" class="tuxano-bulk-form" data-confirm="' . esc_attr__('Permanently delete all selected submissions and their personal information? This cannot be undone.', 'tuxano-booking') . '">';
        wp_nonce_field('tuxano_bulk_bookings');
        echo '<input type="hidden" name="action" value="tuxano_bulk_bookings"><div class="tuxano-bulk-tools"><label class="screen-reader-text" for="tuxano-bulk-action">' . esc_html__('Bulk action', 'tuxano-booking') . '</label><select name="bulk_action" id="tuxano-bulk-action"><option value="">' . esc_html__('Bulk actions', 'tuxano-booking') . '</option><option value="delete">' . esc_html__('Delete selected', 'tuxano-booking') . '</option></select><button class="button" type="submit">' . esc_html__('Apply', 'tuxano-booking') . '</button><span data-tuxano-selected aria-live="polite">' . esc_html__('0 selected', 'tuxano-booking') . '</span></div>';
        self::submission_table($result['items'], true);
        echo '</form>';
        if ($pages > 1) {
            $args = array_filter(['s' => $filters['search'], 'status' => $filters['status'], 'from' => $filters['from'], 'to' => $filters['to'], 'per_page' => $filters['per_page']], static fn($value) => $value !== '');
            echo '<nav class="tuxano-pagination" aria-label="' . esc_attr__('Submissions pagination', 'tuxano-booking') . '">';
            echo wp_kses_post(paginate_links(['base' => str_replace('999999999', '%#%', self::url('tuxano-submissions', array_merge($args, ['paged' => 999999999]))), 'format' => '', 'current' => $filters['page'], 'total' => $pages, 'prev_text' => __('Previous', 'tuxano-booking'), 'next_text' => __('Next', 'tuxano-booking')]) ?: '');
            echo '</nav>';
        }
        echo '</div>';
    }

    private static function submission_table(array $items, bool $bulk = false): void {
        echo '<div class="tuxano-table-scroll"><table class="widefat striped tuxano-submissions-table"><thead><tr>';
        if ($bulk) { echo '<td class="check-column"><input type="checkbox" data-tuxano-select-all aria-label="' . esc_attr__('Select all submissions on this page', 'tuxano-booking') . '"></td>'; }
        foreach ([__('Reference', 'tuxano-booking'), __('Customer', 'tuxano-booking'), __('Pickup', 'tuxano-booking'), __('Vehicle', 'tuxano-booking'), __('Total', 'tuxano-booking'), __('Status', 'tuxano-booking'), __('Actions', 'tuxano-booking')] as $label) { echo '<th scope="col">' . esc_html($label) . '</th>'; }
        echo '</tr></thead><tbody>';
        if (!$items) { echo '<tr><td colspan="' . ($bulk ? '8' : '7') . '"><div class="tuxano-empty"><span class="dashicons dashicons-calendar-alt" aria-hidden="true"></span><strong>' . esc_html__('No submissions found', 'tuxano-booking') . '</strong><p>' . esc_html__('New requests will appear here. Try adjusting your filters.', 'tuxano-booking') . '</p></div></td></tr>'; }
        foreach ($items as $row) {
            $view = self::url('tuxano-submissions', ['booking_id' => (int) $row['id']]);
            $edit = self::url('tuxano-submissions', ['booking_id' => (int) $row['id'], 'edit' => 1]);
            echo '<tr>';
            if ($bulk) { echo '<th scope="row" class="check-column"><input type="checkbox" name="booking_ids[]" value="' . esc_attr((string) $row['id']) . '" data-tuxano-row aria-label="' . esc_attr(sprintf(__('Select %s', 'tuxano-booking'), self::scalar($row['reference']))) . '"></th>'; }
            echo '<td><a class="tuxano-reference" href="' . esc_url($view) . '">' . esc_html(self::scalar($row['reference'])) . '</a><small class="tuxano-table-subtitle">' . esc_html(self::date_label($row['created_at'] ?? '')) . '</small></td><td><strong>' . esc_html(self::scalar($row['customer_name'] ?? '')) . '</strong><small class="tuxano-table-subtitle">' . esc_html(self::scalar($row['customer_email'] ?? '')) . '</small></td><td>' . esc_html(self::date_label($row['pickup_at'] ?? '', false)) . '</td><td>' . esc_html(self::scalar($row['vehicle_name'] ?? '')) . '</td><td class="tuxano-nowrap"><strong>' . esc_html(self::money($row['total'] ?? 0, self::scalar($row['currency'] ?? '', ''))) . '</strong></td><td>' . self::badge(self::scalar($row['status'] ?? '', 'new')) . '</td><td><div class="tuxano-row-actions"><a class="button button-small" href="' . esc_url($view) . '">' . esc_html__('View', 'tuxano-booking') . '</a><a class="button button-small" href="' . esc_url($edit) . '">' . esc_html__('Edit', 'tuxano-booking') . '</a></div></td></tr>';
        }
        echo '</tbody></table></div>';
    }

    private static function information(array $rows): void {
        echo '<dl class="tuxano-information">';
        foreach ($rows as $label => $value) {
            echo '<div><dt>' . esc_html($label) . '</dt><dd>' . nl2br(esc_html(self::scalar($value))) . '</dd></div>';
        }
        echo '</dl>';
    }

    private static function detail(int $id): void {
        $row = Database::find($id);
        if (!$row) {
            wp_die(esc_html__('This submission was not found.', 'tuxano-booking'), '', ['response' => 404]);
        }
        self::open(sprintf(__('Submission %s', 'tuxano-booking'), self::scalar($row['reference'] ?? '')), __('Review the request and record your team’s status and internal notes.', 'tuxano-booking'));
        echo '<div class="tuxano-context-actions"><a class="button" href="' . esc_url(self::url('tuxano-submissions')) . '">← ' . esc_html__('All submissions', 'tuxano-booking') . '</a><a class="button button-primary" href="' . esc_url(self::url('tuxano-submissions', ['booking_id' => $id, 'edit' => 1])) . '">' . esc_html__('Edit booking', 'tuxano-booking') . '</a></div>';
        $booking = is_array($row['payload'] ?? null) ? $row['payload'] : [];
        $booking = is_array($booking['booking'] ?? null) ? $booking['booking'] : $booking;
        $trip = is_array($booking['trip'] ?? null) ? $booking['trip'] : [];
        $billing = is_array($booking['billing'] ?? null) ? $booking['billing'] : [];
        $passenger = is_array($booking['passenger'] ?? null) ? $booking['passenger'] : [];
        $pricing = is_array($row['pricing'] ?? null) ? $row['pricing'] : [];
        $route = is_array($row['route'] ?? null) ? $row['route'] : [];
        echo '<div class="tuxano-detail-grid"><div class="tuxano-detail-main"><section class="tuxano-card"><h2>' . esc_html__('Trip details', 'tuxano-booking') . '</h2>';
        self::information([
            __('Service', 'tuxano-booking') => ($trip['service'] ?? '') === 'hourly' ? sprintf(__('Hourly (%s hours)', 'tuxano-booking'), self::scalar($trip['hours'] ?? '')) : __('Transfer', 'tuxano-booking'),
            __('Pickup address', 'tuxano-booking') => $trip['pickup'] ?? '',
            __('Drop-off address', 'tuxano-booking') => $trip['dropoff'] ?? '',
            __('Requested pickup', 'tuxano-booking') => trim(self::scalar($trip['date'] ?? '', '') . ' ' . self::scalar($trip['time'] ?? '', '')),
            __('Vehicle', 'tuxano-booking') => $row['vehicle_name'] ?? '',
            __('Passengers / luggage', 'tuxano-booking') => self::scalar($booking['passengers'] ?? '') . ' / ' . self::scalar($booking['luggage'] ?? ''),
            __('Flight type', 'tuxano-booking') => ($booking['flightType'] ?? '') === 'private' ? __('Private aviation', 'tuxano-booking') : __('Commercial flight', 'tuxano-booking'),
            __('Airline / operator', 'tuxano-booking') => $booking['airline'] ?? '',
            __('Flight / tail number', 'tuxano-booking') => $booking['flight'] ?? '',
            __('Special requests', 'tuxano-booking') => $booking['special'] ?? '',
        ]);
        if (!empty($trip['stops']) && is_array($trip['stops'])) {
            echo '<h3>' . esc_html__('Stops in journey order', 'tuxano-booking') . '</h3><ol class="tuxano-stops">';
            foreach ($trip['stops'] as $stop) {
                if (!is_array($stop)) {
                    continue;
                }
                echo '<li>' . esc_html(self::scalar($stop['text'] ?? '')) . ' <span class="description">(' . esc_html(sprintf(__('%s min waiting', 'tuxano-booking'), self::scalar($stop['waitMinutes'] ?? 0))) . ')</span></li>';
            }
            echo '</ol>';
        }
        self::location_coordinates($trip);
        echo '</section><div class="tuxano-contact-grid"><section class="tuxano-card"><h2>' . esc_html__('Billing contact', 'tuxano-booking') . '</h2>';
        $address = array_filter(array_map(static fn($key) => self::scalar($billing[$key] ?? '', ''), ['street', 'unit', 'city', 'region', 'zip', 'country']), static fn($value) => $value !== '');
        self::information([
            __('Name', 'tuxano-booking') => trim(self::scalar($billing['first'] ?? '', '') . ' ' . self::scalar($billing['last'] ?? '', '')),
            __('Email', 'tuxano-booking') => $billing['email'] ?? '',
            __('Phone', 'tuxano-booking') => $billing['phone'] ?? '',
            __('Company', 'tuxano-booking') => $billing['company'] ?? '',
            __('Billing address', 'tuxano-booking') => implode(', ', $address),
            __('Billing notes', 'tuxano-booking') => $billing['notes'] ?? '',
        ]);
        echo '</section><section class="tuxano-card"><h2>' . esc_html__('Primary passenger', 'tuxano-booking') . '</h2>';
        self::information([
            __('Name', 'tuxano-booking') => trim(self::scalar($passenger['first'] ?? '', '') . ' ' . self::scalar($passenger['last'] ?? '', '')),
            __('Email', 'tuxano-booking') => $passenger['email'] ?? '',
            __('Mobile', 'tuxano-booking') => $passenger['mobile'] ?? '',
            __('Meet & greet', 'tuxano-booking') => !empty($booking['meet']) ? __('Yes', 'tuxano-booking') : __('No', 'tuxano-booking'),
            __('Car seats / booster seats', 'tuxano-booking') => self::scalar($booking['carSeats'] ?? 0) . ' / ' . self::scalar($booking['boosterSeats'] ?? 0),
            __('Terms accepted', 'tuxano-booking') => !empty($booking['consent']) ? __('Yes', 'tuxano-booking') : __('No', 'tuxano-booking'),
        ]);
        echo '</section></div><section class="tuxano-card"><h2>' . esc_html__('Saved pricing and route', 'tuxano-booking') . '</h2>';
        $currency = self::scalar($row['currency'] ?? '', '');
        $price_rows = [];
        foreach (['transportation' => __('Transportation', 'tuxano-booking'), 'meet' => __('Meet & greet', 'tuxano-booking'), 'carCost' => __('Car seats', 'tuxano-booking'), 'boosterCost' => __('Booster seats', 'tuxano-booking'), 'tip' => __('Gratuity', 'tuxano-booking'), 'total' => __('Total', 'tuxano-booking')] as $key => $label) {
            $price_rows[$label] = self::money($pricing[$key] ?? ($key === 'total' ? $row['total'] : 0), $currency);
        }
        $price_rows[__('Gratuity percentage', 'tuxano-booking')] = self::scalar($pricing['percent'] ?? 0) . '%';
        $price_rows[__('Distance', 'tuxano-booking')] = isset($route['distanceMeters']) && is_numeric($route['distanceMeters']) ? number_format_i18n((float) $route['distanceMeters'] / 1000, 1) . ' km / ' . number_format_i18n((float) $route['distanceMeters'] / 1609.344, 1) . ' mi' : '—';
        $price_rows[__('Baseline driving time', 'tuxano-booking')] = isset($route['durationSeconds']) && is_numeric($route['durationSeconds']) ? sprintf(__('%s min', 'tuxano-booking'), number_format_i18n((int) ceil((float) $route['durationSeconds'] / 60))) : '—';
        self::information($price_rows);
        echo '<p class="description">' . esc_html__('Amounts are stored with the request and do not change when tariffs are edited. Route estimates exclude live traffic.', 'tuxano-booking') . '</p></section></div><aside class="tuxano-detail-sidebar"><section class="tuxano-card"><h2>' . esc_html__('Request management', 'tuxano-booking') . '</h2><p>' . self::badge(self::scalar($row['status'] ?? '', 'new')) . '</p><p class="description">' . esc_html__('Submitted:', 'tuxano-booking') . ' ' . esc_html(self::date_label($row['created_at'] ?? '')) . '</p><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('tuxano_update_booking_' . $id);
        echo '<input type="hidden" name="action" value="tuxano_update_booking"><input type="hidden" name="booking_id" value="' . esc_attr((string) $id) . '"><p><label for="tuxano-booking-status">' . esc_html__('Status', 'tuxano-booking') . '</label><select class="widefat" id="tuxano-booking-status" name="status">';
        foreach (Database::STATUSES as $status) {
            echo '<option value="' . esc_attr($status) . '" ' . selected($row['status'], $status, false) . '>' . esc_html(self::status_label($status)) . '</option>';
        }
        echo '</select></p><p><label for="tuxano-booking-notes">' . esc_html__('Internal notes', 'tuxano-booking') . '</label><textarea class="widefat" id="tuxano-booking-notes" name="notes" rows="8" maxlength="5000">' . esc_textarea(self::scalar($row['notes'] ?? '', '')) . '</textarea><span class="description">' . esc_html__('Visible only to administrators. Updating status does not send an email.', 'tuxano-booking') . '</span></p>';
        submit_button(__('Save request', 'tuxano-booking'), 'primary', 'submit', false);
        echo '</form></section><section class="tuxano-card"><h2>' . esc_html__('Email notifications', 'tuxano-booking') . '</h2>';
        self::information([
            __('Customer receipt', 'tuxano-booking') => self::mail_label(self::scalar($row['customer_mail'] ?? '', 'pending')),
            __('Admin notification', 'tuxano-booking') => self::mail_label(self::scalar($row['admin_mail'] ?? '', 'pending')),
            __('Latest customer update', 'tuxano-booking') => self::mail_label(self::scalar($row['update_mail'] ?? '', 'disabled')),
        ]);
        echo '<p class="description">' . esc_html__('Accepted means the WordPress mail transport accepted the message; it does not confirm inbox delivery. A sender left in progress for over 10 minutes can be retried. Delivery from an interrupted attempt is uncertain, so that retry can send a duplicate email.', 'tuxano-booking') . '</p><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('tuxano_retry_notifications_' . $id);
        echo '<input type="hidden" name="action" value="tuxano_retry_notifications"><input type="hidden" name="booking_id" value="' . esc_attr((string) $id) . '">';
        submit_button(__('Retry pending / failed / stalled emails', 'tuxano-booking'), 'secondary', 'submit', false);
        echo '</form></section><section class="tuxano-card tuxano-danger"><h2>' . esc_html__('Delete submission', 'tuxano-booking') . '</h2><p>' . esc_html__('Permanently removes this request and its personal information. This action cannot be undone.', 'tuxano-booking') . '</p><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" data-confirm="' . esc_attr__('Permanently delete this submission and its personal information?', 'tuxano-booking') . '">';
        wp_nonce_field('tuxano_delete_booking_' . $id);
        echo '<input type="hidden" name="action" value="tuxano_delete_booking"><input type="hidden" name="booking_id" value="' . esc_attr((string) $id) . '">';
        submit_button(__('Delete permanently', 'tuxano-booking'), 'delete', 'submit', false);
        echo '</form></section></aside></div></div>';
    }

    private static array $editor_errors = [];

    private static function editor_field(string $path, string $label, $value, string $type = 'text', array $options = [], array $attrs = []): void {
        $id = 'tuxano-edit-' . str_replace('.', '-', $path);
        $name = 'booking[' . implode('][', explode('.', $path)) . ']';
        $error = isset(self::$editor_errors[$path]) && is_string(self::$editor_errors[$path]) ? self::$editor_errors[$path] : '';
        $attributes = '';
        foreach ($attrs as $key => $attribute) {
            if (in_array($key, ['min', 'max', 'step', 'maxlength', 'required', 'autocomplete', 'data-tuxano-place', 'list', 'placeholder'], true)) { $attributes .= ' ' . esc_attr($key) . '="' . esc_attr((string) $attribute) . '"'; }
        }
        if (isset($attrs['data-tuxano-place'])) { $attributes .= ' readonly aria-busy="true"'; }
        if ($error !== '') { $attributes .= ' aria-invalid="true" aria-describedby="' . esc_attr($id . '-error') . '"'; }
        echo '<div class="tuxano-editor-field' . ($type === 'textarea' ? ' tuxano-field-wide' : '') . ($error !== '' ? ' is-invalid' : '') . (isset($attrs['data-tuxano-place']) ? ' location-input' : '') . '"><label for="' . esc_attr($id) . '">' . esc_html($label) . (isset($attrs['required']) ? ' <span aria-hidden="true">*</span>' : '') . '</label>';
        if ($type === 'select') {
            echo '<select id="' . esc_attr($id) . '" name="' . esc_attr($name) . '" data-booking-path="' . esc_attr($path) . '"' . $attributes . '>';
            foreach ($options as $key => $text) { echo '<option value="' . esc_attr((string) $key) . '" ' . selected(self::scalar($value, ''), (string) $key, false) . '>' . esc_html((string) $text) . '</option>'; }
            echo '</select>';
        } elseif ($type === 'textarea') {
            echo '<textarea id="' . esc_attr($id) . '" name="' . esc_attr($name) . '" data-booking-path="' . esc_attr($path) . '" rows="3"' . $attributes . '>' . esc_textarea(self::scalar($value, '')) . '</textarea>';
        } else {
            echo '<input id="' . esc_attr($id) . '" type="' . esc_attr($type) . '" name="' . esc_attr($name) . '" value="' . esc_attr(self::scalar($value, '')) . '" data-booking-path="' . esc_attr($path) . '"' . $attributes . '>';
        }
        if (isset($attrs['data-tuxano-place'])) { echo '<div class="tuxano-admin-suggestions" role="listbox" hidden></div><span class="description">' . esc_html__('Choose an exact address suggestion when changing this location.', 'tuxano-booking') . '</span>'; }
        echo '<span class="tuxano-field-error" id="' . esc_attr($id . '-error') . '"' . ($error === '' ? ' hidden' : '') . '>' . esc_html($error) . '</span></div>';
    }

    private static function editor_toggle(string $path, string $label, bool $value, string $description = ''): void {
        $id = 'tuxano-edit-' . str_replace('.', '-', $path);
        $name = 'booking[' . implode('][', explode('.', $path)) . ']';
        echo '<label class="tuxano-editor-toggle" for="' . esc_attr($id) . '"><input type="hidden" name="' . esc_attr($name) . '" value="0"><input id="' . esc_attr($id) . '" type="checkbox" name="' . esc_attr($name) . '" value="1" data-booking-path="' . esc_attr($path) . '" ' . checked($value, true, false) . '><span><strong>' . esc_html($label) . '</strong>' . ($description !== '' ? '<small>' . esc_html($description) . '</small>' : '') . '</span></label>';
    }

    private static function editor_point(string $target, $point): void {
        echo '<input type="hidden" name="points[' . esc_attr($target) . ']" data-tuxano-point="' . esc_attr($target) . '" value="' . esc_attr(wp_json_encode(is_array($point) ? $point : null)) . '">';
    }

    private static function editor_stop($index, array $stop): void {
        echo '<div class="tuxano-admin-stop" data-tuxano-stop><div class="tuxano-stop-heading"><strong data-tuxano-stop-title>' . esc_html(sprintf(__('Stop %s', 'tuxano-booking'), is_numeric($index) ? (int) $index + 1 : '')) . '</strong><button type="button" class="button-link-delete" data-tuxano-remove-stop>' . esc_html__('Remove', 'tuxano-booking') . '</button></div><div class="tuxano-editor-grid">';
        self::editor_field('trip.stops.' . $index . '.text', __('Stop address', 'tuxano-booking'), $stop['text'] ?? '', 'text', [], ['maxlength' => 1024, 'required' => 'required', 'autocomplete' => 'off', 'data-tuxano-place' => 'stop-' . $index]);
        $waits = [];
        foreach ([0, 5, 10, 15, 20, 30, 45, 60, 90, 120] as $minutes) { $waits[$minutes] = sprintf(__('%s minutes', 'tuxano-booking'), $minutes); }
        self::editor_field('trip.stops.' . $index . '.waitMinutes', __('Waiting time', 'tuxano-booking'), $stop['waitMinutes'] ?? 0, 'select', $waits);
        echo '</div>';
        self::editor_point('stop-' . $index, $stop['place'] ?? null);
        echo '</div>';
    }

    private static function editor(int $id): void {
        $row = Database::find($id);
        if (!$row) { wp_die(esc_html__('This submission was not found.', 'tuxano-booking'), '', ['response' => 404]); }
        $draft_key = 'tuxano_editor_' . get_current_user_id() . '_' . $id;
        $draft = get_transient($draft_key);
        delete_transient($draft_key);
        $booking = is_array($row['payload'] ?? null) ? $row['payload'] : [];
        if (is_array($booking['booking'] ?? null)) { $booking = $booking['booking']; }
        if (is_array($draft) && is_array($draft['booking'] ?? null)) { $booking = $draft['booking']; }
        self::$editor_errors = is_array($draft['fields'] ?? null) ? $draft['fields'] : [];
        $trip = is_array($booking['trip'] ?? null) ? $booking['trip'] : [];
        $settings = Settings::get();
        $revision = is_array($draft) && isset($draft['revision']) ? (string) $draft['revision'] : BookingUpdates::revision($row);
        self::open(sprintf(__('Edit %s', 'tuxano-booking'), self::scalar($row['reference'])), __('Update the trip and contact details, review the fare, and choose whether to email the customer.', 'tuxano-booking'));
        echo '<div class="tuxano-context-actions"><a class="button" href="' . esc_url(self::url('tuxano-submissions', ['booking_id' => $id])) . '">← ' . esc_html__('View submission', 'tuxano-booking') . '</a><span class="tuxano-revision">' . esc_html(sprintf(__('Revision %s', 'tuxano-booking'), $revision)) . '</span></div><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" data-tuxano-editor novalidate><input type="hidden" name="action" value="tuxano_edit_booking"><input type="hidden" name="booking_id" value="' . esc_attr((string) $id) . '"><input type="hidden" name="revision" value="' . esc_attr($revision) . '"><input type="hidden" name="booking[consent]" value="' . (!empty($booking['consent']) ? '1' : '0') . '">';
        wp_nonce_field('tuxano_edit_booking_' . $id);
        echo '<div class="tuxano-detail-grid"><div class="tuxano-detail-main"><section class="tuxano-card"><div class="tuxano-section-heading"><span class="dashicons dashicons-location" aria-hidden="true"></span><div><h2>' . esc_html__('Trip & itinerary', 'tuxano-booking') . '</h2><p>' . esc_html__('Pickup times use the website timezone: ', 'tuxano-booking') . esc_html(wp_timezone_string()) . '.</p></div></div><div class="tuxano-editor-grid">';
        self::editor_field('trip.service', __('Service type', 'tuxano-booking'), $trip['service'] ?? 'transfer', 'select', ['transfer' => __('Transfer', 'tuxano-booking'), 'hourly' => __('Hourly', 'tuxano-booking')]);
        self::editor_field('trip.hours', __('Booked hours', 'tuxano-booking'), $trip['hours'] ?? $settings['min_hours'], 'number', [], ['min' => 1, 'max' => 24, 'step' => 1, 'required' => 'required']);
        self::editor_field('trip.date', __('Pickup date', 'tuxano-booking'), $trip['date'] ?? '', 'date', [], ['required' => 'required']);
        self::editor_field('trip.time', __('Pickup time', 'tuxano-booking'), $trip['time'] ?? '', 'time', [], ['required' => 'required']);
        self::editor_field('trip.pickup', __('Pickup address', 'tuxano-booking'), $trip['pickup'] ?? '', 'text', [], ['maxlength' => 1024, 'required' => 'required', 'autocomplete' => 'off', 'data-tuxano-place' => 'pickup']);
        self::editor_field('trip.dropoff', __('Drop-off address', 'tuxano-booking'), $trip['dropoff'] ?? '', 'text', [], ['maxlength' => 1024, 'required' => 'required', 'autocomplete' => 'off', 'data-tuxano-place' => 'dropoff']);
        echo '</div>';
        self::editor_point('pickup', $trip['pickupPlace'] ?? null);
        self::editor_point('dropoff', $trip['dropoffPlace'] ?? null);
        echo '<div data-tuxano-stops>';
        foreach (is_array($trip['stops'] ?? null) ? $trip['stops'] : [] as $index => $stop) { if (is_array($stop)) { self::editor_stop($index, $stop); } }
        echo '</div><button type="button" class="button" data-tuxano-add-stop>+ ' . esc_html__('Add stop', 'tuxano-booking') . '</button><template data-tuxano-stop-template>';
        self::editor_stop('__index__', []);
        echo '</template><p class="description">' . esc_html__('Changing the selected route fetches a fresh driving estimate. Live traffic is not included.', 'tuxano-booking') . '</p></section><section class="tuxano-card"><div class="tuxano-section-heading"><span class="dashicons dashicons-car" aria-hidden="true"></span><div><h2>' . esc_html__('Vehicle, passengers & extras', 'tuxano-booking') . '</h2><p>' . esc_html__('Changes to these items recalculate the estimate with the current approved rates.', 'tuxano-booking') . '</p></div></div><div class="tuxano-editor-grid">';
        $vehicles = [];
        $selected_vehicle = self::scalar($booking['vehicle'] ?? '', '');
        foreach (Vehicles::all() as $vehicle) { $vehicles[$vehicle['id']] = $vehicle['name']; }
        if (!isset($vehicles[$selected_vehicle])) { $vehicles[$selected_vehicle] = self::scalar($row['vehicle_name']) . ' — ' . __('saved vehicle', 'tuxano-booking'); }
        self::editor_field('vehicle', __('Vehicle', 'tuxano-booking'), $booking['vehicle'] ?? '', 'select', $vehicles, ['required' => 'required']);
        self::editor_field('passengers', __('Passengers', 'tuxano-booking'), $booking['passengers'] ?? 1, 'number', [], ['min' => 1, 'max' => 100, 'step' => 1, 'required' => 'required']);
        self::editor_field('luggage', __('Luggage', 'tuxano-booking'), $booking['luggage'] ?? 0, 'number', [], ['min' => 0, 'max' => 100, 'step' => 1, 'required' => 'required']);
        self::editor_field('flightType', __('Flight type', 'tuxano-booking'), $booking['flightType'] ?? 'commercial', 'select', ['commercial' => __('Commercial flight', 'tuxano-booking'), 'private' => __('Private aviation', 'tuxano-booking')]);
        self::editor_field('airline', __('Airline / operator', 'tuxano-booking'), $booking['airline'] ?? '', 'text', [], ['maxlength' => 120]);
        self::editor_field('flight', __('Flight / tail number', 'tuxano-booking'), $booking['flight'] ?? '', 'text', [], ['maxlength' => 80]);
        self::editor_field('carSeats', __('Car seats', 'tuxano-booking'), $booking['carSeats'] ?? 0, 'number', [], ['min' => 0, 'max' => 100, 'step' => 1]);
        self::editor_field('boosterSeats', __('Booster seats', 'tuxano-booking'), $booking['boosterSeats'] ?? 0, 'number', [], ['min' => 0, 'max' => 100, 'step' => 1]);
        $gratuity = ['custom' => __('Custom percentage', 'tuxano-booking')];
        foreach (array_unique([10, 15, 20, 25, (float) $settings['default_gratuity']]) as $percent) { $gratuity[(string) $percent] = $percent . '%'; }
        $saved_gratuity = self::scalar($booking['gratuity'] ?? '', '');
        if ($saved_gratuity !== '' && is_numeric($saved_gratuity) && !isset($gratuity[$saved_gratuity])) { $gratuity[$saved_gratuity] = $saved_gratuity . '%'; }
        self::editor_field('gratuity', __('Gratuity', 'tuxano-booking'), $booking['gratuity'] ?? (string) $settings['default_gratuity'], 'select', $gratuity);
        self::editor_field('custom', __('Custom gratuity (%)', 'tuxano-booking'), $booking['custom'] ?? 0, 'number', [], ['min' => 0, 'max' => 100, 'step' => '0.01']);
        self::editor_field('special', __('Special requests', 'tuxano-booking'), $booking['special'] ?? '', 'textarea', [], ['maxlength' => 250]);
        echo '</div><div class="tuxano-editor-toggles">';
        self::editor_toggle('meet', __('Meet & greet', 'tuxano-booking'), !empty($booking['meet']));
        self::editor_toggle('child', __('Child seats requested', 'tuxano-booking'), !empty($booking['child']));
        self::editor_toggle('inPerson', __('Gratuity paid in person', 'tuxano-booking'), !empty($booking['inPerson']));
        echo '</div></section><section class="tuxano-card"><div class="tuxano-section-heading"><span class="dashicons dashicons-id-alt" aria-hidden="true"></span><div><h2>' . esc_html__('Contact & billing', 'tuxano-booking') . '</h2><p>' . esc_html__('Customer updates are sent to the billing email after the changes have been saved.', 'tuxano-booking') . '</p></div></div><div class="tuxano-editor-grid">';
        $billing = is_array($booking['billing'] ?? null) ? $booking['billing'] : [];
        foreach (['first' => __('Billing first name', 'tuxano-booking'), 'last' => __('Billing last name', 'tuxano-booking'), 'email' => __('Billing email', 'tuxano-booking'), 'phone' => __('Billing phone', 'tuxano-booking'), 'company' => __('Company', 'tuxano-booking'), 'street' => __('Street address', 'tuxano-booking'), 'unit' => __('Unit / suite', 'tuxano-booking'), 'city' => __('City', 'tuxano-booking'), 'region' => __('State / Province', 'tuxano-booking'), 'zip' => __('ZIP / Postal Code', 'tuxano-booking'), 'country' => __('Country', 'tuxano-booking'), 'notes' => __('Billing notes', 'tuxano-booking')] as $key => $label) {
            $attrs = ['maxlength' => $key === 'notes' ? 500 : ($key === 'email' ? 254 : 200)];
            if (!in_array($key, ['company', 'unit', 'notes', 'region', 'zip'], true)) { $attrs['required'] = 'required'; }
            if ($key === 'country') {
                $countries = [];
                foreach (Countries::all() as $country) { $countries[$country] = $country; }
                $selected_country = Countries::normalize($billing[$key] ?? '') ?: self::scalar($billing[$key] ?? '', '');
                if ($selected_country !== '' && !isset($countries[$selected_country])) { $countries[$selected_country] = $selected_country; }
                self::editor_field('billing.' . $key, $label, $selected_country, 'select', $countries, $attrs);
            } else {
                self::editor_field('billing.' . $key, $label, $billing[$key] ?? '', $key === 'notes' ? 'textarea' : ($key === 'email' ? 'email' : ($key === 'phone' ? 'tel' : 'text')), [], $attrs);
            }
        }
        echo '</div><datalist id="tuxano-editor-countries"></datalist><h3>' . esc_html__('Primary passenger', 'tuxano-booking') . '</h3>';
        self::editor_toggle('same', __('Same as billing contact', 'tuxano-booking'), !empty($booking['same']));
        echo '<div class="tuxano-editor-grid">';
        $passenger = is_array($booking['passenger'] ?? null) ? $booking['passenger'] : [];
        foreach (['first' => __('Passenger first name', 'tuxano-booking'), 'last' => __('Passenger last name', 'tuxano-booking'), 'email' => __('Passenger email', 'tuxano-booking'), 'mobile' => __('Passenger mobile', 'tuxano-booking')] as $key => $label) {
            $attrs = ['maxlength' => $key === 'email' ? 254 : 200];
            if ($key !== 'email') { $attrs['required'] = 'required'; }
            self::editor_field('passenger.' . $key, $label, $passenger[$key] ?? '', $key === 'email' ? 'email' : ($key === 'mobile' ? 'tel' : 'text'), [], $attrs);
        }
        echo '</div></section></div><aside class="tuxano-detail-sidebar"><section class="tuxano-card tuxano-save-card"><div class="tuxano-eyebrow">' . esc_html__('SAVED ESTIMATE', 'tuxano-booking') . '</div><strong class="tuxano-editor-total">' . esc_html(self::money($row['total'], $row['currency'])) . '</strong><p class="description">' . esc_html__('Contact and status edits keep the saved fare. Route, vehicle and extra changes recalculate the estimate.', 'tuxano-booking') . '</p><label for="tuxano-editor-status">' . esc_html__('Status', 'tuxano-booking') . '</label><select name="status" id="tuxano-editor-status">';
        foreach (Database::STATUSES as $status) { echo '<option value="' . esc_attr($status) . '" ' . selected($draft['status'] ?? $row['status'], $status, false) . '>' . esc_html(self::status_label($status)) . '</option>'; }
        echo '</select><label for="tuxano-editor-notes">' . esc_html__('Internal notes', 'tuxano-booking') . '</label><textarea id="tuxano-editor-notes" name="notes" rows="5" maxlength="5000">' . esc_textarea(self::scalar($draft['notes'] ?? $row['notes'], '')) . '</textarea><p class="description">' . esc_html__('Private to administrators. Never included in customer emails.', 'tuxano-booking') . '</p><label class="tuxano-save-option"><input type="checkbox" name="reprice" value="1"> <span>' . esc_html__('Recalculate using current rates', 'tuxano-booking') . '</span></label><label class="tuxano-save-option"><input type="checkbox" name="notify_customer" value="1"> <span>' . esc_html__('Email the updated booking and itemized estimate to the customer', 'tuxano-booking') . '</span></label><div class="tuxano-editor-summary-error" role="alert" hidden></div>';
        submit_button(__('Save booking changes', 'tuxano-booking'), 'primary', 'submit', false);
        echo '<a class="button" href="' . esc_url(self::url('tuxano-submissions', ['booking_id' => $id])) . '">' . esc_html__('Cancel', 'tuxano-booking') . '</a></section><section class="tuxano-card"><h2>' . esc_html__('Change history', 'tuxano-booking') . '</h2>';
        $history = is_array($row['history'] ?? null) ? array_reverse($row['history']) : [];
        if (!$history) { echo '<p class="description">' . esc_html__('Saved updates will appear here.', 'tuxano-booking') . '</p>'; }
        foreach (array_slice($history, 0, 10) as $entry) {
            if (!is_array($entry)) { continue; }
            echo '<div class="tuxano-history-item"><strong>' . esc_html(sprintf(__('Revision %s', 'tuxano-booking'), self::scalar($entry['revision'] ?? '', '—'))) . '</strong><small>' . esc_html(self::scalar($entry['at'] ?? $entry['updated_at'] ?? '', '')) . '</small>';
            if (!empty($entry['summary']) && is_string($entry['summary'])) { echo '<p>' . esc_html($entry['summary']) . '</p>'; }
            echo '</div>';
        }
        echo '</section></aside></div></form><section class="tuxano-card tuxano-danger"><h2>' . esc_html__('Delete submission', 'tuxano-booking') . '</h2><p>' . esc_html__('Permanently remove this request and its personal information. This action cannot be undone.', 'tuxano-booking') . '</p><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" data-confirm="' . esc_attr__('Permanently delete this submission?', 'tuxano-booking') . '">';
        wp_nonce_field('tuxano_delete_booking_' . $id);
        echo '<input type="hidden" name="action" value="tuxano_delete_booking"><input type="hidden" name="booking_id" value="' . esc_attr((string) $id) . '">';
        submit_button(__('Delete permanently', 'tuxano-booking'), 'delete', 'submit', false);
        echo '</form></section></div>';
    }

    private static function editor_booking(array $raw, array $points): array {
        foreach (['passengers', 'luggage', 'carSeats', 'boosterSeats'] as $key) {
            if (isset($raw[$key]) && is_string($raw[$key]) && preg_match('/^\d{1,3}$/D', $raw[$key])) { $raw[$key] = (int) $raw[$key]; }
        }
        foreach (['meet', 'child', 'inPerson', 'same', 'consent'] as $key) { $raw[$key] = isset($raw[$key]) && $raw[$key] === '1'; }
        if (isset($raw['custom']) && is_string($raw['custom']) && preg_match('/^\d+(?:\.\d+)?$/D', $raw['custom'])) { $raw['custom'] = (float) $raw['custom']; }
        if (!isset($raw['trip']) || !is_array($raw['trip'])) { $raw['trip'] = []; }
        if (isset($raw['trip']['hours']) && is_string($raw['trip']['hours']) && preg_match('/^\d{1,2}$/D', $raw['trip']['hours'])) { $raw['trip']['hours'] = (int) $raw['trip']['hours']; }
        $decode = static function ($point) { return is_string($point) && strlen($point) <= 4096 ? json_decode($point, true) : null; };
        $raw['trip']['pickupPlace'] = $decode($points['pickup'] ?? null);
        $raw['trip']['dropoffPlace'] = $decode($points['dropoff'] ?? null);
        $stops = isset($raw['trip']['stops']) && is_array($raw['trip']['stops']) ? array_values($raw['trip']['stops']) : [];
        foreach ($stops as $index => &$stop) {
            if (!is_array($stop)) { continue; }
            if (isset($stop['waitMinutes']) && is_string($stop['waitMinutes']) && preg_match('/^\d{1,3}$/D', $stop['waitMinutes'])) { $stop['waitMinutes'] = (int) $stop['waitMinutes']; }
            $stop['place'] = $decode($points['stop-' . $index] ?? null);
        }
        unset($stop);
        $raw['trip']['stops'] = $stops;
        if ($raw['same'] && isset($raw['billing']) && is_array($raw['billing'])) {
            $raw['passenger'] = ['first' => $raw['billing']['first'] ?? '', 'last' => $raw['billing']['last'] ?? '', 'email' => $raw['billing']['email'] ?? '', 'mobile' => $raw['billing']['phone'] ?? ''];
        }
        return $raw;
    }

    public static function edit_booking(): void {
        self::authorize();
        $id = self::posted_id();
        check_admin_referer('tuxano_edit_booking_' . $id);
        $raw = isset($_POST['booking']) && is_array($_POST['booking']) ? wp_unslash($_POST['booking']) : [];
        $points = isset($_POST['points']) && is_array($_POST['points']) ? wp_unslash($_POST['points']) : [];
        $booking = self::editor_booking($raw, $points);
        $revision = isset($_POST['revision']) && is_string($_POST['revision']) ? wp_unslash($_POST['revision']) : '';
        $status = isset($_POST['status']) && is_string($_POST['status']) ? sanitize_key(wp_unslash($_POST['status'])) : '';
        $notes = isset($_POST['notes']) && is_string($_POST['notes']) ? wp_unslash($_POST['notes']) : '';
        $notify = isset($_POST['notify_customer']) && $_POST['notify_customer'] === '1';
        $reprice = isset($_POST['reprice']) && $_POST['reprice'] === '1';
        $result = strlen((string) wp_json_encode($booking)) > 65536 ? new \WP_Error('tuxano_edit_size', __('Keep booking details within 64 KB.', 'tuxano-booking')) : BookingUpdates::save($id, $booking, $revision, $status, $notes, $notify, $reprice);
        if (is_wp_error($result)) {
            $data = $result->get_error_data();
            set_transient('tuxano_editor_' . get_current_user_id() . '_' . $id, ['booking' => $booking, 'revision' => $revision, 'status' => $status, 'notes' => $notes, 'fields' => is_array($data) && is_array($data['fields'] ?? null) ? $data['fields'] : []], 15 * MINUTE_IN_SECONDS);
            self::finish('tuxano-submissions', 'error', ['booking_id' => $id, 'edit' => 1], $result);
        }
        self::finish('tuxano-submissions', 'edited', ['booking_id' => $id]);
    }

    public static function bulk_bookings(): void {
        self::authorize();
        check_admin_referer('tuxano_bulk_bookings');
        $ids = self::bulk_ids(isset($_POST['booking_ids']) ? wp_unslash($_POST['booking_ids']) : null);
        $action = isset($_POST['bulk_action']) && is_string($_POST['bulk_action']) ? wp_unslash($_POST['bulk_action']) : '';
        if ($action !== 'delete' || !$ids) { self::finish('tuxano-submissions', 'error', [], new \WP_Error('tuxano_bulk_selection', __('Choose Delete selected and at least one valid submission (up to 100).', 'tuxano-booking'))); }
        $result = Database::bulk_delete($ids);
        if (is_wp_error($result)) { self::finish('tuxano-submissions', 'error', [], $result); }
        self::finish('tuxano-submissions', 'bulk_deleted');
    }

    private static function location_coordinates(array $trip): void {
        $points = [[__('Pickup point', 'tuxano-booking'), $trip['pickupPlace'] ?? null, $trip['pickup'] ?? 'Pickup'], [__('Drop-off point', 'tuxano-booking'), $trip['dropoffPlace'] ?? null, $trip['dropoff'] ?? 'Destination']];
        foreach ($trip['stops'] ?? [] as $index => $stop) { $points[] = [sprintf(__('Stop %d point', 'tuxano-booking'), $index + 1), $stop['place'] ?? null, $stop['text'] ?? 'Stop']; }
        foreach ($points as [$label, $point, $text]) {
            if (!is_array($point)) { continue; }
            if (!empty($point['placeId']) && is_string($point['placeId'])) {
                $query = ['api' => 1, 'query' => mb_substr((string) $text, 0, 100), 'query_place_id' => $point['placeId']];
                $caption = __('View selected place in Google Maps', 'tuxano-booking');
            } elseif (isset($point['latitude'], $point['longitude']) && is_numeric($point['latitude']) && is_numeric($point['longitude']) && abs((float) $point['latitude']) <= 90 && abs((float) $point['longitude']) <= 180) {
                $caption = sprintf('%.6f,%.6f', (float) $point['latitude'], (float) $point['longitude']);
                $query = ['api' => 1, 'query' => $caption];
            } else { continue; }
            echo '<p><strong>' . esc_html($label) . ':</strong> <a href="' . esc_url(add_query_arg($query, 'https://www.google.com/maps/search/')) . '" target="_blank" rel="noopener noreferrer">' . esc_html($caption) . '</a></p>';
        }
    }

    private static function mail_label(string $value): string {
        return [
            'pending' => __('Pending', 'tuxano-booking'),
            'sending' => __('Sending — stalled attempts can be retried after 10 minutes', 'tuxano-booking'),
            'accepted' => __('Accepted by mail transport', 'tuxano-booking'),
            'failed' => __('Failed — retry available', 'tuxano-booking'),
            'disabled' => __('Disabled in settings', 'tuxano-booking'),
            'skipped' => __('Disabled in settings', 'tuxano-booking'),
        ][$value] ?? $value;
    }

    private static function settings_form_open(string $section): void {
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        wp_nonce_field('tuxano_save_settings_' . $section);
        echo '<input type="hidden" name="action" value="tuxano_save_settings"><input type="hidden" name="section" value="' . esc_attr($section) . '">';
    }

    private static function field(array $settings, string $name, string $label, string $type = 'text', string $description = '', array $attrs = []): void {
        $attributes = '';
        foreach ($attrs as $key => $value) {
            if (in_array($key, ['min', 'max', 'step', 'maxlength', 'pattern', 'placeholder', 'required'], true)) {
                $attributes .= ' ' . esc_attr($key) . '="' . esc_attr((string) $value) . '"';
            }
        }
        echo '<tr><th scope="row"><label for="tuxano-' . esc_attr($name) . '">' . esc_html($label) . '</label></th><td><input class="regular-text" type="' . esc_attr($type) . '" name="' . esc_attr($name) . '" id="tuxano-' . esc_attr($name) . '" value="' . esc_attr(self::scalar($settings[$name] ?? '', '')) . '"' . $attributes . '>';
        if ($description !== '') {
            echo '<p class="description">' . esc_html($description) . '</p>';
        }
        echo '</td></tr>';
    }

    private static function toggle(array $settings, string $name, string $label): void {
        echo '<tr><th scope="row">' . esc_html($label) . '</th><td><label><input type="hidden" name="' . esc_attr($name) . '" value="0"><input type="checkbox" name="' . esc_attr($name) . '" value="1" ' . checked(!empty($settings[$name]), true, false) . '> ' . esc_html__('Enabled', 'tuxano-booking') . '</label></td></tr>';
    }

    public static function pricing(): void {
        self::open(__('Pricing', 'tuxano-booking'), __('Control global extras here and vehicle-specific transportation tariffs in the fleet editor.', 'tuxano-booking'));
        $settings = Settings::get();
        self::settings_form_open('pricing');
        echo '<section class="tuxano-card"><h2>' . esc_html__('Extras and gratuity', 'tuxano-booking') . '</h2><p>' . esc_html(sprintf(__('All amounts use %s. Change currency in Settings.', 'tuxano-booking'), $settings['currency'])) . '</p><table class="form-table" role="presentation">';
        self::field($settings, 'meet_price', __('Meet & greet', 'tuxano-booking'), 'number', __('One charge per reservation when selected.', 'tuxano-booking'), ['min' => 0, 'max' => 1000000, 'step' => '0.01', 'required' => 'required']);
        self::field($settings, 'first_seat_price', __('First child seat', 'tuxano-booking'), 'number', __('Applied once to the first car seat or booster seat.', 'tuxano-booking'), ['min' => 0, 'max' => 1000000, 'step' => '0.01', 'required' => 'required']);
        self::field($settings, 'additional_seat_price', __('Each additional child seat', 'tuxano-booking'), 'number', __('Applies to every remaining car seat or booster seat.', 'tuxano-booking'), ['min' => 0, 'max' => 1000000, 'step' => '0.01', 'required' => 'required']);
        self::field($settings, 'default_gratuity', __('Default gratuity (%)', 'tuxano-booking'), 'number', __('Optional customer gratuity, calculated on transportation only.', 'tuxano-booking'), ['min' => 0, 'max' => 100, 'step' => '0.5', 'required' => 'required']);
        echo '</table>';
        submit_button(__('Save pricing', 'tuxano-booking'));
        echo '</section></form><section class="tuxano-card"><h2>' . esc_html__('Vehicle tariffs', 'tuxano-booking') . '</h2><p>' . esc_html__('Transfer = the greater of the minimum fare or base + distance charge + driving-time charge, plus stop waiting. Hourly = the greater of booked hours or driving hours × hourly rate, plus distance and stop waiting.', 'tuxano-booking') . '</p><div class="tuxano-table-scroll"><table class="widefat striped"><thead><tr>';
        foreach ([__('Vehicle', 'tuxano-booking'), __('Base', 'tuxano-booking'), __('Per mile', 'tuxano-booking'), __('Per driving minute', 'tuxano-booking'), __('Minimum', 'tuxano-booking'), __('Per waiting minute', 'tuxano-booking'), __('Hourly', 'tuxano-booking')] as $heading) {
            echo '<th scope="col">' . esc_html($heading) . '</th>';
        }
        echo '</tr></thead><tbody>';
        $vehicles = Vehicles::all(false);
        if (!$vehicles) {
            echo '<tr><td colspan="7">' . esc_html__('No vehicles yet. Add a vehicle to configure its tariffs.', 'tuxano-booking') . '</td></tr>';
        }
        foreach ($vehicles as $vehicle) {
            echo '<tr><td><a href="' . esc_url(get_edit_post_link((int) $vehicle['id'], 'raw') ?: admin_url('edit.php?post_type=tuxano_vehicle')) . '">' . esc_html(self::scalar($vehicle['name'] ?? '')) . '</a></td>';
            foreach (['base', 'perMile', 'perDrivingMinute', 'minimum', 'perWaitingMinute', 'hourly'] as $key) {
                echo '<td class="tuxano-nowrap">' . esc_html(self::money($vehicle['tariff'][$key] ?? 0, $settings['currency'])) . '</td>';
            }
            echo '</tr>';
        }
        echo '</tbody></table></div><p><a class="button" href="' . esc_url(admin_url('edit.php?post_type=tuxano_vehicle')) . '">' . esc_html__('Manage vehicles and tariffs', 'tuxano-booking') . '</a></p><p class="description">' . esc_html__('Editing pricing invalidates outstanding quotes. Customers must refresh their route before submitting; existing submissions retain their saved prices.', 'tuxano-booking') . '</p></section></div>';
    }

    public static function settings(): void {
        self::open(__('Booking settings', 'tuxano-booking'), __('Configure your business, maps, booking limits, email notifications, and data retention.', 'tuxano-booking'));
        $settings = Settings::get();
        self::settings_form_open('settings');
        echo '<section class="tuxano-card"><h2>' . esc_html__('Business and support', 'tuxano-booking') . '</h2><table class="form-table" role="presentation">';
        self::field($settings, 'company_name', __('Company name', 'tuxano-booking'), 'text', '', ['maxlength' => 120, 'required' => 'required']);
        self::field($settings, 'support_email', __('Support email', 'tuxano-booking'), 'email', __('Shown to customers for booking questions.', 'tuxano-booking'), ['maxlength' => 254]);
        self::field($settings, 'support_phone', __('Support phone', 'tuxano-booking'), 'text', '', ['maxlength' => 60]);
        self::field($settings, 'website', __('Company website', 'tuxano-booking'), 'url', '', ['maxlength' => 2048]);
        self::field($settings, 'currency', __('Currency code', 'tuxano-booking'), 'text', __('Three-letter code, for example USD or BDT. Changing it does not convert existing numeric tariff amounts.', 'tuxano-booking'), ['maxlength' => 3, 'pattern' => '[A-Za-z]{3}', 'required' => 'required']);
        self::field($settings, 'currency_symbol', __('Currency symbol', 'tuxano-booking'), 'text', __('Displayed with amounts in the booking form.', 'tuxano-booking'), ['maxlength' => 12, 'required' => 'required']);
        echo '</table></section><section class="tuxano-card"><h2>' . esc_html__('Dashboard', 'tuxano-booking') . '</h2><table class="form-table" role="presentation">';
        self::field($settings, 'dashboard_recent_limit', __('Recent submissions to display', 'tuxano-booking'), 'number', __('Show the newest requests on the dashboard. Choose 1–20; the default is 3. All requests remain available in Submissions.', 'tuxano-booking'), ['min' => 1, 'max' => 20, 'step' => 1, 'required' => 'required']);
        echo '</table></section><section class="tuxano-card"><h2>' . esc_html__('Google Maps API', 'tuxano-booking') . '</h2><p>' . esc_html__('A green tick means a key is securely saved. Use Test key to check its configuration, Replace key to change it, or Remove saved key to clear it. The Routes key stays private on your server.', 'tuxano-booking') . '</p><table class="form-table" role="presentation">';
        self::key_field($settings, 'browser_key', __('Maps browser API key', 'tuxano-booking'), __('Enable Maps JavaScript API and Places API (New). Restrict this browser key to the domains where this form is embedded.', 'tuxano-booking'));
        self::key_field($settings, 'routes_key', __('Routes server API key', 'tuxano-booking'), __('Enable Routes API. This key is used only for server-to-server route requests and is never returned to the form.', 'tuxano-booking'));
        self::field($settings, 'route_daily_limit', __('Daily Google route request budget', 'tuxano-booking'), 'number', __('Site-wide provider attempts per UTC day, including failed provider requests. Increase to match your booking volume and API budget.', 'tuxano-booking'), ['min' => 1, 'max' => 100000, 'step' => 1, 'required' => 'required']);
        self::field($settings, 'route_minute_limit', __('Route requests per visitor / minute', 'tuxano-booking'), 'number', '', ['min' => 1, 'max' => 120, 'step' => 1, 'required' => 'required']);
        self::field($settings, 'session_hourly_limit', __('New sessions per network / hour', 'tuxano-booking'), 'number', __('Visitors sharing an internet connection share this limit.', 'tuxano-booking'), ['min' => 1, 'max' => 1000, 'step' => 1, 'required' => 'required']);
        self::field($settings, 'booking_hourly_limit', __('Submissions per network / hour', 'tuxano-booking'), 'number', '', ['min' => 1, 'max' => 1000, 'step' => 1, 'required' => 'required']);
        echo '</table></section><section class="tuxano-card"><h2>' . esc_html__('Booking limits and policies', 'tuxano-booking') . '</h2><table class="form-table" role="presentation">';
        self::field($settings, 'max_stops', __('Maximum intermediate stops', 'tuxano-booking'), 'number', '', ['min' => 0, 'max' => 5, 'step' => 1, 'required' => 'required']);
        self::field($settings, 'min_hours', __('Minimum hourly booking', 'tuxano-booking'), 'number', __('Hours. Must not exceed the maximum.', 'tuxano-booking'), ['min' => 1, 'max' => 24, 'step' => 1, 'required' => 'required']);
        self::field($settings, 'max_hours', __('Maximum hourly booking', 'tuxano-booking'), 'number', __('Hours.', 'tuxano-booking'), ['min' => 1, 'max' => 24, 'step' => 1, 'required' => 'required']);
        self::field($settings, 'terms_url', __('Terms of use URL', 'tuxano-booking'), 'url', __('Use your published business terms page.', 'tuxano-booking'), ['maxlength' => 2048]);
        self::field($settings, 'privacy_url', __('Privacy policy URL', 'tuxano-booking'), 'url', __('Use your published privacy policy page.', 'tuxano-booking'), ['maxlength' => 2048]);
        echo '</table></section><section class="tuxano-card"><h2>' . esc_html__('Email notifications', 'tuxano-booking') . '</h2><p>' . esc_html__('New requests and customer updates use your branded HTML email template. Delivery status is recorded separately from the saved booking.', 'tuxano-booking') . '</p><table class="form-table" role="presentation">';
        self::toggle($settings, 'email_customer', __('Customer thank-you email', 'tuxano-booking'));
        self::toggle($settings, 'email_admin', __('Admin submission notification', 'tuxano-booking'));
        self::field($settings, 'admin_email', __('Notification recipient', 'tuxano-booking'), 'email', __('One email address for new-submission notifications.', 'tuxano-booking'), ['maxlength' => 254, 'required' => 'required']);
        self::field($settings, 'sender_name', __('Sender name', 'tuxano-booking'), 'text', '', ['maxlength' => 120]);
        self::field($settings, 'from_email', __('Sender email', 'tuxano-booking'), 'email', __('Leave blank for the default WordPress domain address. Use an address authorized by your mail provider.', 'tuxano-booking'), ['maxlength' => 254]);
        echo '</table></section><section class="tuxano-card"><h2>' . esc_html__('Personal data retention', 'tuxano-booking') . '</h2><table class="form-table" role="presentation">';
        self::field($settings, 'retention_days', __('Automatically delete after (days)', 'tuxano-booking'), 'number', __('0 keeps submissions until an administrator deletes them. A positive value permanently deletes older submissions during scheduled WordPress cleanup; choose a period that meets your business obligations.', 'tuxano-booking'), ['min' => 0, 'max' => 3650, 'step' => 1, 'required' => 'required']);
        echo '</table></section>';
        submit_button(__('Save settings', 'tuxano-booking'));
        echo '</form></div>';
    }

    private static function key_field(array $settings, string $name, string $label, string $description): void {
        $configured = is_string($settings[$name] ?? null) && $settings[$name] !== '';
        $kind = $name === 'browser_key' ? 'browser' : 'routes';
        echo '<tr><th scope="row"><label for="tuxano-' . esc_attr($name) . '">' . esc_html($label) . '</label></th><td><div class="tuxano-api-key" data-tuxano-key data-configured="' . ($configured ? '1' : '0') . '"><div class="tuxano-key-status ' . ($configured ? 'is-configured' : 'is-missing') . '" data-tuxano-key-status><span class="dashicons ' . ($configured ? 'dashicons-yes-alt' : 'dashicons-minus') . '" aria-hidden="true"></span><strong>' . esc_html($configured ? __('Saved and configured', 'tuxano-booking') : __('Not configured', 'tuxano-booking')) . '</strong></div>';
        if ($configured) {
            echo '<div class="tuxano-key-current" data-tuxano-key-current><span class="tuxano-key-mask" aria-label="' . esc_attr__('Saved key is hidden', 'tuxano-booking') . '">••••••••••••••••</span><button type="button" class="button button-small" data-tuxano-key-replace>' . esc_html__('Replace key', 'tuxano-booking') . '</button><button type="button" class="button-link-delete" data-tuxano-key-clear>' . esc_html__('Remove saved key', 'tuxano-booking') . '</button></div>';
        }
        echo '<input class="regular-text" type="password" autocomplete="new-password" name="' . esc_attr($name) . '" id="tuxano-' . esc_attr($name) . '" value="" placeholder="' . esc_attr($configured ? __('Saved — leave empty to keep', 'tuxano-booking') : __('Paste your Google API key', 'tuxano-booking')) . '" pattern="AIza[A-Za-z0-9_-]{35}" maxlength="200" data-tuxano-key-input' . ($configured ? ' hidden' : '') . '><input type="hidden" name="clear_' . esc_attr($name) . '" value="0" data-tuxano-key-clear-value><p class="description">' . esc_html($description) . '</p><div class="tuxano-key-tools"><button type="button" class="button" data-tuxano-test-key="' . esc_attr($kind) . '">' . esc_html($configured ? __('Test saved key', 'tuxano-booking') : __('Test key', 'tuxano-booking')) . '</button><span class="description">' . esc_html__('Save settings to apply a replacement or removal.', 'tuxano-booking') . '</span></div><p class="tuxano-key-result" data-tuxano-key-result role="status" aria-live="polite" hidden></p></div></td></tr>';
    }

    public static function save_settings(): void {
        self::authorize();
        $section = isset($_POST['section']) && is_string($_POST['section']) ? sanitize_key(wp_unslash($_POST['section'])) : '';
        if (!in_array($section, ['settings', 'pricing'], true)) {
            wp_die(esc_html__('Invalid settings section.', 'tuxano-booking'), '', ['response' => 400]);
        }
        check_admin_referer('tuxano_save_settings_' . $section);
        $keys = $section === 'pricing'
            ? ['meet_price', 'first_seat_price', 'additional_seat_price', 'default_gratuity']
            : ['company_name', 'support_email', 'support_phone', 'website', 'currency', 'currency_symbol', 'browser_key', 'routes_key', 'clear_browser_key', 'clear_routes_key', 'max_stops', 'min_hours', 'max_hours', 'terms_url', 'privacy_url', 'email_customer', 'email_admin', 'admin_email', 'sender_name', 'from_email', 'retention_days', 'route_daily_limit', 'route_minute_limit', 'session_hourly_limit', 'booking_hourly_limit', 'dashboard_recent_limit'];
        $values = [];
        foreach ($keys as $key) {
            if (!isset($_POST[$key])) {
                continue;
            }
            if (!is_string($_POST[$key])) {
                self::finish('tuxano-' . $section, 'error', [], new \WP_Error('tuxano_invalid_form', __('Invalid settings value.', 'tuxano-booking')));
            }
            $values[$key] = wp_unslash($_POST[$key]);
        }
        $result = Settings::save($values);
        self::finish('tuxano-' . $section, 'saved', [], is_wp_error($result) ? $result : null);
    }

    private static function posted_id(): int {
        $id = isset($_POST['booking_id']) && is_string($_POST['booking_id']) ? absint($_POST['booking_id']) : 0;
        if ($id < 1 || !Database::find($id)) {
            wp_die(esc_html__('This submission was not found.', 'tuxano-booking'), '', ['response' => 404]);
        }
        return $id;
    }

    public static function update_booking(): void {
        self::authorize();
        $id = self::posted_id();
        check_admin_referer('tuxano_update_booking_' . $id);
        $status = isset($_POST['status']) && is_string($_POST['status']) ? sanitize_key(wp_unslash($_POST['status'])) : '';
        $notes = isset($_POST['notes']) && is_string($_POST['notes']) ? sanitize_textarea_field(wp_unslash($_POST['notes'])) : '';
        if (!in_array($status, Database::STATUSES, true) || preg_match_all('/./us', $notes) > 5000) {
            self::finish('tuxano-submissions', 'error', ['booking_id' => $id], new \WP_Error('tuxano_invalid_submission', __('Choose a valid status and keep notes within 5,000 characters.', 'tuxano-booking')));
        }
        $result = Database::update($id, ['status' => $status, 'notes' => $notes]);
        $error = is_wp_error($result) ? $result : ($result === false ? new \WP_Error('tuxano_update_failed', __('The submission could not be updated.', 'tuxano-booking')) : null);
        self::finish('tuxano-submissions', 'updated', ['booking_id' => $id], $error);
    }

    public static function delete_booking(): void {
        self::authorize();
        $id = self::posted_id();
        check_admin_referer('tuxano_delete_booking_' . $id);
        if (!Database::delete($id)) {
            self::finish('tuxano-submissions', 'error', ['booking_id' => $id], new \WP_Error('tuxano_delete_failed', __('The submission could not be deleted.', 'tuxano-booking')));
        }
        self::finish('tuxano-submissions', 'deleted');
    }

    public static function retry_notifications(): void {
        self::authorize();
        $id = self::posted_id();
        check_admin_referer('tuxano_retry_notifications_' . $id);
        Notifications::send($id, true);
        $row = Database::find($id);
        if ($row && (int) ($row['update_mail_revision'] ?? 0) > 0) { Notifications::send_update($id, (int) $row['update_mail_revision'], true); }
        self::finish('tuxano-submissions', 'notifications', ['booking_id' => $id]);
    }
}
