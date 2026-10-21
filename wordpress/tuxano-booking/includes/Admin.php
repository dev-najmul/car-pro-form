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
        add_action('admin_post_tuxano_save_settings', [self::class, 'save_settings']);
        add_action('admin_post_tuxano_update_booking', [self::class, 'update_booking']);
        add_action('admin_post_tuxano_delete_booking', [self::class, 'delete_booking']);
        add_action('admin_post_tuxano_retry_notifications', [self::class, 'retry_notifications']);
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
        if ($screen && $screen->post_type === 'tuxano_vehicle' && $screen->base === 'post') { wp_enqueue_media(); }
    }

    public static function order_menu(): void {
        global $submenu;
        if (empty($submenu[self::PAGE])) { return; }
        $order = array_flip([self::PAGE, 'tuxano-submissions', 'edit.php?post_type=tuxano_vehicle', 'edit-tags.php?taxonomy=tuxano_collection&post_type=tuxano_vehicle', 'tuxano-pricing', 'tuxano-settings']);
        usort($submenu[self::PAGE], static fn(array $a, array $b): int => ($order[$a[2]] ?? 99) <=> ($order[$b[2]] ?? 99));
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
        echo '<div class="wrap tuxano-admin"><h1>' . esc_html($title) . '</h1>';
        if ($description !== '') {
            echo '<p class="tuxano-intro">' . esc_html($description) . '</p>';
        }
        self::notices();
    }

    private static function notices(): void {
        $notice = isset($_GET['tuxano_notice']) && is_string($_GET['tuxano_notice']) ? sanitize_key(wp_unslash($_GET['tuxano_notice'])) : '';
        $messages = [
            'saved' => __('Settings saved.', 'tuxano-booking'),
            'updated' => __('Submission updated.', 'tuxano-booking'),
            'deleted' => __('Submission permanently deleted.', 'tuxano-booking'),
            'notifications' => __('Notification retry completed. Review the delivery status below.', 'tuxano-booking'),
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
        $recent = Database::listing(['page' => 1, 'per_page' => 5]);
        self::submission_table($recent['items']);
        echo '<p><a class="button" href="' . esc_url(self::url('tuxano-submissions')) . '">' . esc_html__('View all submissions', 'tuxano-booking') . '</a></p></section><section class="tuxano-card"><h2>' . esc_html__('Booking setup', 'tuxano-booking') . '</h2><p>' . esc_html__('Add the shortcode below to a WordPress page to display the booking form.', 'tuxano-booking') . '</p><p><code>[tuxano_booking]</code></p>';
        $settings = Settings::get();
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

    public static function submissions(): void {
        self::authorize();
        $id = absint(self::get_query('booking_id'));
        if ($id > 0) {
            self::detail($id);
            return;
        }
        self::open(__('Submissions', 'tuxano-booking'), __('Search and review stored reservation requests. Date filters use the requested pickup date.', 'tuxano-booking'));
        $filters = [
            'search' => preg_replace('/^(.{0,200}).*$/us', '$1', self::get_query('s')) ?? '',
            'status' => self::get_query('status'),
            'from' => self::filter_date(self::get_query('from')),
            'to' => self::filter_date(self::get_query('to')),
            'page' => max(1, absint(self::get_query('paged'))),
            'per_page' => self::PER_PAGE,
        ];
        if (!in_array($filters['status'], Database::STATUSES, true)) {
            $filters['status'] = '';
        }
        $result = Database::listing($filters);
        $pages = max(1, (int) ceil($result['total'] / self::PER_PAGE));
        if ($filters['page'] > $pages) {
            $filters['page'] = $pages;
            $result = Database::listing($filters);
        }
        echo '<form method="get" action="' . esc_url(admin_url('admin.php')) . '" class="tuxano-filters"><input type="hidden" name="page" value="tuxano-submissions"><div><label for="tuxano-search">' . esc_html__('Search submissions', 'tuxano-booking') . '</label><input id="tuxano-search" type="search" name="s" value="' . esc_attr($filters['search']) . '" placeholder="' . esc_attr__('Reference, name, or email', 'tuxano-booking') . '"></div><div><label for="tuxano-status">' . esc_html__('Status', 'tuxano-booking') . '</label><select id="tuxano-status" name="status"><option value="">' . esc_html__('All statuses', 'tuxano-booking') . '</option>';
        foreach (Database::STATUSES as $status) {
            echo '<option value="' . esc_attr($status) . '" ' . selected($filters['status'], $status, false) . '>' . esc_html(self::status_label($status)) . '</option>';
        }
        echo '</select></div><div><label for="tuxano-from">' . esc_html__('From', 'tuxano-booking') . '</label><input id="tuxano-from" type="date" name="from" value="' . esc_attr($filters['from']) . '"></div><div><label for="tuxano-to">' . esc_html__('To', 'tuxano-booking') . '</label><input id="tuxano-to" type="date" name="to" value="' . esc_attr($filters['to']) . '"></div><button class="button button-primary" type="submit">' . esc_html__('Filter', 'tuxano-booking') . '</button><a class="button" href="' . esc_url(self::url('tuxano-submissions')) . '">' . esc_html__('Reset', 'tuxano-booking') . '</a></form>';
        echo '<p>' . esc_html(sprintf(_n('%s submission', '%s submissions', (int) $result['total'], 'tuxano-booking'), number_format_i18n((int) $result['total']))) . '</p>';
        self::submission_table($result['items']);
        if ($pages > 1) {
            $args = array_filter(['s' => $filters['search'], 'status' => $filters['status'], 'from' => $filters['from'], 'to' => $filters['to']], static fn($value) => $value !== '');
            echo '<nav class="tuxano-pagination" aria-label="' . esc_attr__('Submissions pagination', 'tuxano-booking') . '">';
            echo wp_kses_post(paginate_links([
                'base' => str_replace('999999999', '%#%', self::url('tuxano-submissions', array_merge($args, ['paged' => 999999999]))),
                'format' => '', 'current' => $filters['page'], 'total' => $pages,
                'prev_text' => __('Previous', 'tuxano-booking'), 'next_text' => __('Next', 'tuxano-booking'),
            ]) ?: '');
            echo '</nav>';
        }
        echo '</div>';
    }

    private static function submission_table(array $items): void {
        echo '<div class="tuxano-table-scroll"><table class="widefat striped"><thead><tr><th scope="col">' . esc_html__('Reference', 'tuxano-booking') . '</th><th scope="col">' . esc_html__('Customer', 'tuxano-booking') . '</th><th scope="col">' . esc_html__('Pickup', 'tuxano-booking') . '</th><th scope="col">' . esc_html__('Vehicle', 'tuxano-booking') . '</th><th scope="col">' . esc_html__('Total', 'tuxano-booking') . '</th><th scope="col">' . esc_html__('Status', 'tuxano-booking') . '</th><th scope="col">' . esc_html__('Submitted', 'tuxano-booking') . '</th></tr></thead><tbody>';
        if (!$items) {
            echo '<tr><td colspan="7">' . esc_html__('No submissions found.', 'tuxano-booking') . '</td></tr>';
        }
        foreach ($items as $row) {
            echo '<tr><td><a class="tuxano-reference" href="' . esc_url(self::url('tuxano-submissions', ['booking_id' => (int) $row['id']])) . '">' . esc_html(self::scalar($row['reference'] ?? '')) . '</a></td><td>' . esc_html(self::scalar($row['customer_name'] ?? '')) . '<br><span class="description">' . esc_html(self::scalar($row['customer_email'] ?? '')) . '</span></td><td>' . esc_html(self::date_label($row['pickup_at'] ?? '', false)) . '</td><td>' . esc_html(self::scalar($row['vehicle_name'] ?? '')) . '</td><td class="tuxano-nowrap">' . esc_html(self::money($row['total'] ?? 0, self::scalar($row['currency'] ?? '', ''))) . '</td><td>' . self::badge(self::scalar($row['status'] ?? '', 'new')) . '</td><td>' . esc_html(self::date_label($row['created_at'] ?? '')) . '</td></tr>';
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
        echo '<p><a href="' . esc_url(self::url('tuxano-submissions')) . '">← ' . esc_html__('All submissions', 'tuxano-booking') . '</a></p>';
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
        echo '</table></section><section class="tuxano-card"><h2>' . esc_html__('Google Maps API', 'tuxano-booking') . '</h2><p>' . esc_html__('Keys are write-only here. Leave a field empty to keep the saved key, or explicitly select Clear saved key. The browser key is public by design; the Routes key stays on your WordPress server.', 'tuxano-booking') . '</p><table class="form-table" role="presentation">';
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
        echo '</table></section><section class="tuxano-card"><h2>' . esc_html__('Email notifications', 'tuxano-booking') . '</h2><p>' . esc_html__('A saved request can send a customer receipt and an admin notification through WordPress mail. Custom template design can be added later.', 'tuxano-booking') . '</p><table class="form-table" role="presentation">';
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
        echo '<tr><th scope="row"><label for="tuxano-' . esc_attr($name) . '">' . esc_html($label) . '</label></th><td><input class="regular-text" type="password" autocomplete="new-password" name="' . esc_attr($name) . '" id="tuxano-' . esc_attr($name) . '" value="" placeholder="' . esc_attr($configured ? __('Saved — leave empty to keep', 'tuxano-booking') : __('Not configured', 'tuxano-booking')) . '" maxlength="200"><p class="description">' . esc_html($description) . '</p><p><label><input type="checkbox" name="clear_' . esc_attr($name) . '" value="1"> ' . esc_html__('Clear saved key', 'tuxano-booking') . '</label></p></td></tr>';
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
            : ['company_name', 'support_email', 'support_phone', 'website', 'currency', 'currency_symbol', 'browser_key', 'routes_key', 'clear_browser_key', 'clear_routes_key', 'max_stops', 'min_hours', 'max_hours', 'terms_url', 'privacy_url', 'email_customer', 'email_admin', 'admin_email', 'sender_name', 'from_email', 'retention_days', 'route_daily_limit', 'route_minute_limit', 'session_hourly_limit', 'booking_hourly_limit'];
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
        self::finish('tuxano-submissions', 'notifications', ['booking_id' => $id]);
    }
}
