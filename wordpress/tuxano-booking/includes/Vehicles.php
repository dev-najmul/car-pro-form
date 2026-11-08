<?php
/** Private fleet records and their native WordPress editing interface. */

namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Vehicles
{
    public const POST_TYPE = 'tuxano_vehicle';
    public const TAXONOMY = 'tuxano_collection';
    private const META = '_tuxano_vehicle_data';
    private const SEEDED = 'tuxano_booking_fleet_seeded';
    private const PRICING_UPGRADE = 'tuxano_booking_transfer_pricing_version';
    public const TRANSFER_DEFAULTS = ['version' => 2, 'mode' => 'mileage', 'pickupFreeMinutes' => 30.0, 'returnFreeMinutes' => 30.0, 'roundingMinutes' => 15, 'minimumMinutes' => 60, 'pickupFreeMiles' => 20.0, 'returnFreeMiles' => 20.0];
    private const TARIFF_FIELDS = [
        'base' => 'Base fare', 'perMile' => 'Per mile', 'perDrivingMinute' => 'Per driving minute',
        'minimum' => 'Minimum transfer fare', 'perWaitingMinute' => 'Per stop waiting minute', 'hourly' => 'Hourly rate',
    ];

    public static function register(): void
    {
        register_post_type(self::POST_TYPE, [
            'labels' => [
                'name' => __('Vehicles', 'tuxano-booking'), 'singular_name' => __('Vehicle', 'tuxano-booking'),
                'add_new_item' => __('Add Vehicle', 'tuxano-booking'), 'edit_item' => __('Edit Vehicle', 'tuxano-booking'),
                'new_item' => __('New Vehicle', 'tuxano-booking'), 'search_items' => __('Search Vehicles', 'tuxano-booking'),
                'not_found' => __('No vehicles found.', 'tuxano-booking'),
            ],
            'public' => false, 'publicly_queryable' => false, 'exclude_from_search' => true,
            'show_ui' => true, 'show_in_menu' => 'tuxano-booking', 'show_in_rest' => false,
            'supports' => ['title', 'thumbnail', 'page-attributes'], 'rewrite' => false,
            'query_var' => false, 'can_export' => false, 'map_meta_cap' => false,
            'capabilities' => array_fill_keys([
                'edit_post', 'read_post', 'delete_post', 'edit_posts', 'edit_others_posts',
                'publish_posts', 'read_private_posts', 'delete_posts', 'delete_private_posts',
                'delete_published_posts', 'delete_others_posts', 'edit_private_posts',
                'edit_published_posts', 'create_posts',
            ], 'manage_options'),
        ]);
        register_taxonomy(self::TAXONOMY, self::POST_TYPE, [
            'labels' => ['name' => __('Vehicle Collections', 'tuxano-booking'), 'singular_name' => __('Vehicle Collection', 'tuxano-booking')],
            'public' => false, 'show_ui' => true, 'show_in_rest' => false,
            'show_admin_column' => true, 'hierarchical' => true, 'rewrite' => false,
            'query_var' => false, 'meta_box_cb' => false,
            'capabilities' => array_fill_keys(['manage_terms', 'edit_terms', 'delete_terms', 'assign_terms'], 'manage_options'),
        ]);
        add_action('add_meta_boxes_' . self::POST_TYPE, [self::class, 'add_meta_box']);
        add_action('save_post_' . self::POST_TYPE, [self::class, 'save_meta'], 10, 3);
        add_action('admin_notices', [self::class, 'notices']);
    }

    public static function add_meta_box(): void
    {
        add_meta_box('tuxano-vehicle-details', __('Booking Vehicle & Pricing', 'tuxano-booking'), [self::class, 'meta_box'], self::POST_TYPE, 'normal', 'high');
    }

    public static function meta_box(\WP_Post $post): void
    {
        $data = self::metadata($post->ID);
        wp_nonce_field('tuxano_save_vehicle_' . $post->ID, 'tuxano_vehicle_nonce');
        $terms = wp_get_object_terms($post->ID, self::TAXONOMY, ['fields' => 'ids']);
        $collection = !is_wp_error($terms) && $terms ? (int) $terms[0] : 0;
        ?>
        <p><?php esc_html_e('Published vehicles are available in the booking form. Draft or trash a vehicle to remove it. Existing submission snapshots are preserved.', 'tuxano-booking'); ?></p>
        <table class="form-table" role="presentation"><tbody>
        <tr><th><label for="tuxano-display"><?php esc_html_e('Display name', 'tuxano-booking'); ?></label></th><td><input class="regular-text" id="tuxano-display" name="tuxano_vehicle[display]" maxlength="120" value="<?php echo esc_attr($data['display']); ?>"><p class="description"><?php esc_html_e('Optional friendly name; the vehicle title is used when blank.', 'tuxano-booking'); ?></p></td></tr>
        <tr><th><label for="tuxano-collection"><?php esc_html_e('Collection', 'tuxano-booking'); ?></label></th><td><?php wp_dropdown_categories(['taxonomy' => self::TAXONOMY, 'hide_empty' => false, 'name' => 'tuxano_vehicle[collection]', 'id' => 'tuxano-collection', 'selected' => $collection, 'show_option_none' => __('Uncategorized', 'tuxano-booking'), 'option_none_value' => '0', 'hierarchical' => true]); ?><p class="description"><a href="<?php echo esc_url(admin_url('edit-tags.php?taxonomy=' . self::TAXONOMY . '&post_type=' . self::POST_TYPE)); ?>"><?php esc_html_e('Manage collections and their descriptions', 'tuxano-booking'); ?></a></p></td></tr>
        <?php foreach (['capacity' => __('Passenger capacity', 'tuxano-booking'), 'luggageCapacity' => __('Luggage capacity', 'tuxano-booking')] as $field => $label) : ?>
        <tr><th><label for="tuxano-<?php echo esc_attr($field); ?>"><?php echo esc_html($label); ?></label></th><td><input id="tuxano-<?php echo esc_attr($field); ?>" name="tuxano_vehicle[<?php echo esc_attr($field); ?>]" type="number" min="<?php echo $field === 'capacity' ? '1' : '0'; ?>" max="100" step="1" required value="<?php echo esc_attr((string) $data[$field]); ?>"></td></tr>
        <?php endforeach; ?>
        <tr><th><label for="tuxano-image"><?php esc_html_e('Photo URL', 'tuxano-booking'); ?></label></th><td><input id="tuxano-image" name="tuxano_vehicle[image]" type="text" class="large-text" maxlength="2048" value="<?php echo esc_attr($data['image']); ?>"><p><button type="button" class="button" data-tuxano-select-image><?php esc_html_e('Choose from Media Library', 'tuxano-booking'); ?></button></p><p class="description"><?php esc_html_e('Use an HTTPS image URL, or a bundled assets/ filename. A Featured Image takes precedence. Upload an image in Media and paste its file URL here.', 'tuxano-booking'); ?></p></td></tr>
        <?php foreach (['models' => __('Models / use cases', 'tuxano-booking'), 'features' => __('Features', 'tuxano-booking')] as $field => $label) : ?>
        <tr><th><label for="tuxano-<?php echo esc_attr($field); ?>"><?php echo esc_html($label); ?></label></th><td><textarea class="large-text" rows="5" id="tuxano-<?php echo esc_attr($field); ?>" name="tuxano_vehicle[<?php echo esc_attr($field); ?>]"><?php echo esc_textarea(implode("\n", $data[$field])); ?></textarea><p class="description"><?php esc_html_e('One item per line. Up to 20 items, 200 characters per item.', 'tuxano-booking'); ?></p></td></tr>
        <?php endforeach; ?>
        </tbody></table>
        <?php self::pricing_fields($data); ?>
        <?php
    }

    /** Saved transfer and hourly rates are edited independently. */
    private static function pricing_fields(array $data): void
    {
        $settings = Settings::get();
        $currency = $settings['currency'];
        $tariff = $data['tariff'];
        $transfer = $tariff['transfer'];
        $hourly = $tariff['hourlyBooking'];
        ?>
        <section class="tuxano-vehicle-pricing" aria-labelledby="tuxano-pricing-title" data-tuxano-currency="<?php echo esc_attr($currency); ?>">
            <h3 id="tuxano-pricing-title"><?php esc_html_e('Set this vehicle’s prices', 'tuxano-booking'); ?></h3>
            <p><?php echo esc_html(sprintf(__('All amounts are in %s. Transfer and Hourly have separate rates. Existing reservations retain their saved estimates.', 'tuxano-booking'), $currency)); ?></p>
            <section class="tuxano-service-pricing" aria-labelledby="tuxano-transfer-title">
                <h4 id="tuxano-transfer-title"><?php esc_html_e('Transfer pricing', 'tuxano-booking'); ?></h4>
                <p><?php esc_html_e('A one-way transfer includes travel from the service base to pickup, the passenger journey and return to base. Only the selected calculation method is charged.', 'tuxano-booking'); ?></p>
                <input type="hidden" name="tuxano_vehicle[tariff][transfer][version]" value="2">
                <label class="tuxano-transfer-method" for="tuxano-transfer-mode"><strong><?php esc_html_e('Transfer pricing method', 'tuxano-booking'); ?></strong>
                    <select id="tuxano-transfer-mode" name="tuxano_vehicle[tariff][transfer][mode]" data-tuxano-transfer-mode>
                        <option value="mileage" <?php selected($transfer['mode'], 'mileage'); ?>><?php esc_html_e('Mileage-Based Pricing', 'tuxano-booking'); ?></option>
                        <option value="time" <?php selected($transfer['mode'], 'time'); ?>><?php esc_html_e('Time-Based Pricing', 'tuxano-booking'); ?></option>
                    </select>
                </label>
                <p class="description"><?php esc_html_e('Service base and traffic-aware routing are configured under Tuxano Booking → Pricing. Unused method values stay saved when you switch methods.', 'tuxano-booking'); ?></p>
                <div class="tuxano-transfer-methods">
                    <section class="tuxano-method-pricing" data-tuxano-method-section="mileage">
                        <h4><?php esc_html_e('Mileage-Based settings', 'tuxano-booking'); ?> <span data-tuxano-method-status></span></h4>
                        <p class="description"><?php esc_html_e('Add billable pickup miles, all passenger miles and billable return miles, then apply the minimum fare once. No driving-time charge is added.', 'tuxano-booking'); ?></p>
                        <div class="tuxano-rate-grid">
                            <?php self::rate_field('perMile', __('Transfer price per mile', 'tuxano-booking'), $tariff['perMile'], $currency, __('per mile', 'tuxano-booking'), __('The single saved mileage rate for transfers. Time-Based transfers do not use it.', 'tuxano-booking')); ?>
                            <?php self::rate_field('minimum', __('Minimum transfer fare', 'tuxano-booking'), $tariff['minimum'], $currency, __('minimum fare', 'tuxano-booking'), __('Applied after summing all three billable mileage segments, before waiting and extras.', 'tuxano-booking')); ?>
                            <?php self::rule_field('pickupFreeMiles', __('Complimentary miles to pickup', 'tuxano-booking'), $transfer['pickupFreeMiles'], __('miles', 'tuxano-booking'), 0, 100000, '0.0001'); ?>
                            <?php self::rule_field('returnFreeMiles', __('Complimentary return miles', 'tuxano-booking'), $transfer['returnFreeMiles'], __('miles', 'tuxano-booking'), 0, 100000, '0.0001'); ?>
                        </div>
                    </section>
                    <section class="tuxano-method-pricing" data-tuxano-method-section="time">
                        <h4><?php esc_html_e('Time-Based settings', 'tuxano-booking'); ?> <span data-tuxano-method-status></span></h4>
                        <p class="description"><?php esc_html_e('Round only passenger driving time up by the selected increment. Add pickup and return time above their separate allowances, then apply the minimum charged time once.', 'tuxano-booking'); ?></p>
                        <div class="tuxano-rate-grid">
                            <?php self::rate_field('hourly', __('Time-Based transfer hourly rate', 'tuxano-booking'), $tariff['hourly'], $currency, __('per hour', 'tuxano-booking'), __('Used only for Time-Based transfers; the Hourly Booking rate below is independent.', 'tuxano-booking')); ?>
                            <?php self::rule_field('pickupFreeMinutes', __('Complimentary travel to pickup', 'tuxano-booking'), $transfer['pickupFreeMinutes'], __('minutes', 'tuxano-booking'), 0, 1440, '0.0001'); ?>
                            <?php self::rule_field('returnFreeMinutes', __('Complimentary return travel', 'tuxano-booking'), $transfer['returnFreeMinutes'], __('minutes', 'tuxano-booking'), 0, 1440, '0.0001'); ?>
                            <?php self::rule_field('roundingMinutes', __('Passenger trip rounding increment', 'tuxano-booking'), $transfer['roundingMinutes'], __('minutes · round up', 'tuxano-booking'), 1, 1440, '1'); ?>
                            <?php self::rule_field('minimumMinutes', __('Minimum charged transfer time', 'tuxano-booking'), $transfer['minimumMinutes'], __('minutes', 'tuxano-booking'), 1, 1440, '1'); ?>
                        </div>
                    </section>
                </div>
                <div class="tuxano-rate-grid tuxano-transfer-waiting">
                    <?php self::rate_field('perWaitingMinute', __('Transfer stop waiting rate', 'tuxano-booking'), $tariff['perWaitingMinute'], $currency, __('per waiting minute', 'tuxano-booking'), __('Added once for selected stop waiting, after either transfer method calculates the driving fare.', 'tuxano-booking')); ?>
                </div>
                <details class="tuxano-legacy-rates"><summary><?php esc_html_e('Retained legacy transfer fields', 'tuxano-booking'); ?></summary><p class="description"><?php esc_html_e('These saved values are retained for compatibility. Neither Base fare nor Per driving minute is added to Time-Based or Mileage-Based transfers.', 'tuxano-booking'); ?></p><div class="tuxano-rate-grid">
                    <?php self::rate_field('base', __('Base fare', 'tuxano-booking'), $tariff['base'], $currency, __('per transfer', 'tuxano-booking'), __('Retained setting; not charged by either new transfer method.', 'tuxano-booking')); ?>
                    <?php self::rate_field('perDrivingMinute', __('Per driving minute', 'tuxano-booking'), $tariff['perDrivingMinute'], $currency, __('per minute', 'tuxano-booking'), __('Retained setting; not added on top of either new transfer method.', 'tuxano-booking')); ?>
                </div></details>
                <div class="tuxano-rate-preview" data-tuxano-rate-preview aria-live="polite">
                    <strong><?php esc_html_e('Transfer calculation preview', 'tuxano-booking'); ?></strong>
                    <p><?php esc_html_e('Driving fare only, before stop waiting, optional extras and gratuity. Routes below are fixed examples, not live traffic quotes.', 'tuxano-booking'); ?></p>
                    <div class="tuxano-preview-grid"><div><h4><?php esc_html_e('Short local transfer', 'tuxano-booking'); ?></h4><p data-tuxano-example-detail></p><strong data-tuxano-example-total><?php echo esc_html($currency . ' ' . number_format(self::transfer_preview($tariff, false), 2, '.', ',')); ?></strong></div><div><h4><?php esc_html_e('Long-distance transfer', 'tuxano-booking'); ?></h4><p data-tuxano-example-long-detail></p><strong data-tuxano-example-long><?php echo esc_html($currency . ' ' . number_format(self::transfer_preview($tariff, true), 2, '.', ',')); ?></strong></div></div>
                </div>
            </section>
            <section class="tuxano-service-pricing" aria-labelledby="tuxano-hourly-title">
                <h4 id="tuxano-hourly-title"><?php esc_html_e('Hourly Booking pricing', 'tuxano-booking'); ?></h4>
                <p><?php esc_html_e('The higher of booked hours or passenger driving hours × this hourly rate, plus passenger mileage and selected stop waiting. Transfer methods and complimentary transfer allowances do not apply.', 'tuxano-booking'); ?></p>
                <div class="tuxano-rate-grid">
                    <?php self::rate_field('hourly', __('Hourly Booking rate', 'tuxano-booking'), $hourly['hourly'], $currency, __('per hour', 'tuxano-booking'), __('Independent from the Time-Based transfer rate.', 'tuxano-booking'), true); ?>
                    <?php self::rate_field('perMile', __('Hourly Booking mileage rate', 'tuxano-booking'), $hourly['perMile'], $currency, __('per passenger mile', 'tuxano-booking'), __('Hourly mileage only. Choose None / not charged when hourly mileage is included.', 'tuxano-booking'), true); ?>
                    <?php self::rate_field('perWaitingMinute', __('Hourly Booking stop waiting rate', 'tuxano-booking'), $hourly['perWaitingMinute'], $currency, __('per waiting minute', 'tuxano-booking'), __('Hourly stop waiting only; never charged again by Transfer settings.', 'tuxano-booking'), true); ?>
                </div>
                <div class="tuxano-rate-preview" aria-live="polite"><strong><?php esc_html_e('Example Hourly Booking', 'tuxano-booking'); ?></strong><p><?php esc_html_e('3 booked hours · 20 passenger miles · 30 driving minutes · 15 minutes of stop waiting', 'tuxano-booking'); ?></p><strong data-tuxano-hourly-example><?php echo esc_html($currency . ' ' . number_format(3 * $hourly['hourly'] + 20 * $hourly['perMile'] + 15 * $hourly['perWaitingMinute'], 2, '.', ',')); ?></strong><span class="description"> <?php esc_html_e('transportation only, before extras and gratuity', 'tuxano-booking'); ?></span></div>
            </section>
        </section>
        <?php
    }

    private static function rate_field(string $field, string $label, float $value, string $currency, string $unit, string $help, bool $hourly = false): void
    {
        $prefix = $hourly ? 'hourly-' : '';
        $id = 'tuxano-rate-' . $prefix . $field;
        $rate_attr = $hourly ? 'data-tuxano-hourly-rate' : 'data-tuxano-rate';
        $toggle_attr = $hourly ? 'data-tuxano-hourly-toggle' : 'data-tuxano-rate-toggle';
        $name = $hourly ? 'tuxano_vehicle[tariff][hourlyBooking][' . $field . ']' : 'tuxano_vehicle[tariff][' . $field . ']';
        $toggle_name = 'tuxano_vehicle[' . ($hourly ? 'disabled_hourly' : 'disabled_tariff') . '][' . $field . ']';
        $off = $value === 0.0;
        ?>
        <div class="tuxano-rate-field<?php echo $off ? ' is-disabled' : ''; ?>"><label for="<?php echo esc_attr($id); ?>"><strong><?php echo esc_html($label); ?></strong></label><p id="<?php echo esc_attr($id); ?>-help" class="description"><?php echo esc_html($help); ?></p><div class="tuxano-rate-amount"><input id="<?php echo esc_attr($id); ?>" name="<?php echo esc_attr($name); ?>" <?php echo esc_attr($rate_attr); ?>="<?php echo esc_attr($field); ?>" aria-describedby="<?php echo esc_attr($id); ?>-help" type="number" min="0" max="1000000" step="0.0001" placeholder="0.00" value="<?php echo esc_attr((string) $value); ?>"><span><?php echo esc_html($currency . ' ' . $unit); ?></span></div><label class="tuxano-rate-none"><input type="checkbox" name="<?php echo esc_attr($toggle_name); ?>" <?php echo esc_attr($toggle_attr); ?>="<?php echo esc_attr($field); ?>" value="1" <?php checked($off); ?>> <?php esc_html_e('None / not charged', 'tuxano-booking'); ?></label></div>
        <?php
    }

    private static function rule_field(string $key, string $label, $value, string $unit, int $min, int $max, string $step): void
    {
        ?>
        <div class="tuxano-rate-field tuxano-rule-field"><label for="tuxano-transfer-<?php echo esc_attr($key); ?>"><strong><?php echo esc_html($label); ?></strong></label><div class="tuxano-rate-amount"><input id="tuxano-transfer-<?php echo esc_attr($key); ?>" name="tuxano_vehicle[tariff][transfer][<?php echo esc_attr($key); ?>]" data-tuxano-transfer-rule="<?php echo esc_attr($key); ?>" type="number" min="<?php echo esc_attr((string) $min); ?>" max="<?php echo esc_attr((string) $max); ?>" step="<?php echo esc_attr($step); ?>" required value="<?php echo esc_attr((string) $value); ?>"><span><?php echo esc_html($unit); ?></span></div></div>
        <?php
    }

    private static function transfer_preview(array $tariff, bool $long): float
    {
        $rules = $tariff['transfer'];
        if ($rules['mode'] === 'time') {
            $minutes = max(0, ($long ? 120 : 35) - $rules['pickupFreeMinutes']) + ceil(($long ? 104 : 30) / $rules['roundingMinutes']) * $rules['roundingMinutes'] + max(0, ($long ? 45 : 15) - $rules['returnFreeMinutes']);
            return round(max($rules['minimumMinutes'], $minutes) / 60 * $tariff['hourly'], 2);
        }
        $miles = max(0, ($long ? 123 : 15) - $rules['pickupFreeMiles']) + ($long ? 96.5 : 30) + max(0, ($long ? 34.9 : 10) - $rules['returnFreeMiles']);
        return round(max($tariff['minimum'], $miles * $tariff['perMile']), 2);
    }

    public static function save_meta(int $post_id, \WP_Post $post, bool $update): void
    {
        if ((defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) || wp_is_post_revision($post_id) || $post->post_type !== self::POST_TYPE || !current_user_can('manage_options') || !current_user_can('edit_post', $post_id)) {
            return;
        }
        $nonce = $_POST['tuxano_vehicle_nonce'] ?? null;
        if (!is_string($nonce) || !wp_verify_nonce(wp_unslash($nonce), 'tuxano_save_vehicle_' . $post_id)) {
            return;
        }
        $input = isset($_POST['tuxano_vehicle']) && is_array($_POST['tuxano_vehicle']) ? wp_unslash($_POST['tuxano_vehicle']) : [];
        $stored = get_post_meta($post_id, self::META, true);
        if (is_array($stored['tariff'] ?? null) && (array_key_exists('transfer', $stored['tariff']) || array_key_exists('hourlyBooking', $stored['tariff'])) && is_array($input['tariff'] ?? null) && (!array_key_exists('transfer', $input['tariff']) || !array_key_exists('hourlyBooking', $input['tariff']))) {
            set_transient('tuxano_vehicle_error_' . get_current_user_id(), __('Pricing settings have changed. Reload this vehicle editor before saving; no vehicle details were changed.', 'tuxano-booking'), 60);
            return;
        }
        $data = self::validate($input);
        if (is_wp_error($data)) {
            set_transient('tuxano_vehicle_error_' . get_current_user_id(), $data->get_error_message(), 60);
            return;
        }
        $collection = isset($input['collection']) && is_scalar($input['collection']) ? (string) $input['collection'] : '';
        if (!preg_match('/^\d{1,10}$/D', $collection) || ((int) $collection !== 0 && !term_exists((int) $collection, self::TAXONOMY))) {
            set_transient('tuxano_vehicle_error_' . get_current_user_id(), __('Choose a valid vehicle collection. Vehicle details were not changed.', 'tuxano-booking'), 60);
            return;
        }
        $result = wp_set_object_terms($post_id, (int) $collection > 0 ? [(int) $collection] : [], self::TAXONOMY);
        if (is_wp_error($result)) {
            set_transient('tuxano_vehicle_error_' . get_current_user_id(), __('The collection could not be saved. Vehicle details were not changed.', 'tuxano-booking'), 60);
            return;
        }
        if (!update_post_meta($post_id, self::META, $data) && get_post_meta($post_id, self::META, true) !== $data) {
            set_transient('tuxano_vehicle_error_' . get_current_user_id(), __('Vehicle details could not be saved. Please try again.', 'tuxano-booking'), 60);
        }
    }

    public static function notices(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $key = 'tuxano_vehicle_error_' . get_current_user_id();
        $message = get_transient($key);
        if (is_string($message) && $message !== '') {
            delete_transient($key);
            echo '<div class="notice notice-error"><p>' . esc_html($message) . '</p></div>';
        }
    }

    /** @return array<int,array<string,mixed>> */
    public static function all(bool $active_only = true): array
    {
        $posts = get_posts([
            'post_type' => self::POST_TYPE, 'post_status' => $active_only ? 'publish' : ['publish', 'draft', 'pending', 'private', 'future'],
            'posts_per_page' => -1, 'orderby' => ['menu_order' => 'ASC', 'title' => 'ASC', 'ID' => 'ASC'],
            'no_found_rows' => true, 'suppress_filters' => false,
        ]);
        return array_values(array_filter(array_map([self::class, 'frontend_record'], $posts)));
    }

    /** Only active, complete records may be booked. */
    public static function find(string $id): ?array
    {
        if (!preg_match('/^[1-9]\d{0,18}$/D', $id) || (string) (int) $id !== $id) {
            return null;
        }
        $post = get_post((int) $id);
        return $post && $post->post_type === self::POST_TYPE && $post->post_status === 'publish' ? self::frontend_record($post) : null;
    }

    /** @return array<string,mixed>|null */
    private static function frontend_record(\WP_Post $post): ?array
    {
        $stored = get_post_meta($post->ID, self::META, true);
        // A new published record without saved tariffs must not offer an accidental free ride.
        if (!is_array($stored)) {
            return null;
        }
        $data = self::validate($stored);
        if (is_wp_error($data)) {
            return null;
        }
        $terms = wp_get_object_terms($post->ID, self::TAXONOMY, ['orderby' => 'term_id', 'order' => 'ASC']);
        $term = !is_wp_error($terms) && $terms ? $terms[0] : null;
        $image = '';
        $attachment = (int) get_post_thumbnail_id($post->ID);
        if ($attachment && wp_attachment_is_image($attachment)) {
            $image = (string) wp_get_attachment_image_url($attachment, 'large');
            $image = self::image($image) ?? '';
        }
        $image = $image ?: $data['image'];
        if ($image !== '' && !preg_match('#^https://#i', $image)) {
            $version = defined('TUXANO_BOOKING_VERSION') ? TUXANO_BOOKING_VERSION : '2.0.0';
            $image = plugins_url('public/' . $version . '/' . $image, dirname(__DIR__) . '/tuxano-booking.php');
        }
        return [
            'id' => (string) $post->ID,
            'name' => sanitize_text_field($post->post_title),
            'display' => $data['display'] ?: sanitize_text_field($post->post_title),
            'capacity' => $data['capacity'], 'luggageCapacity' => $data['luggageCapacity'],
            'image' => $image, 'models' => $data['models'], 'features' => $data['features'],
            'category' => $term ? sanitize_text_field($term->name) : __('VEHICLES', 'tuxano-booking'),
            'categoryDescription' => $term ? sanitize_textarea_field($term->description) : '',
            'tariff' => $data['tariff'],
        ];
    }

    /** @return array<string,mixed> */
    private static function metadata(int $id): array
    {
        $stored = get_post_meta($id, self::META, true);
        $defaults = ['display' => '', 'capacity' => 6, 'luggageCapacity' => 6, 'image' => '', 'models' => [], 'features' => [], 'tariff' => array_fill_keys(array_keys(self::TARIFF_FIELDS), 0.0)];
        $data = array_replace($defaults, is_array($stored) ? array_intersect_key($stored, $defaults) : []);
        $saved_rates = is_array($data['tariff']) ? $data['tariff'] : [];
        $data['tariff'] = $defaults['tariff'];
        foreach (self::TARIFF_FIELDS as $key => $_label) { $data['tariff'][$key] = Settings::decimal($saved_rates[$key] ?? null) ?? 0.0; }
        $profile = self::profile_tariff($data['tariff']);
        // Repair controls use safe view defaults; frontend_record validates raw
        // stored profiles and never silently substitutes these values for a quote.
        $data['tariff']['transfer'] = self::TRANSFER_DEFAULTS;
        $saved_transfer = is_array($saved_rates['transfer'] ?? null) ? $saved_rates['transfer'] : [];
        if (in_array($saved_transfer['mode'] ?? null, ['mileage', 'time'], true)) { $data['tariff']['transfer']['mode'] = $saved_transfer['mode']; }
        foreach (['pickupFreeMinutes' => 1440, 'returnFreeMinutes' => 1440, 'pickupFreeMiles' => 100000, 'returnFreeMiles' => 100000, 'roundingMinutes' => 1440, 'minimumMinutes' => 1440] as $key => $max) {
            $number = Settings::decimal($saved_transfer[$key] ?? null, $max);
            $integer = in_array($key, ['roundingMinutes', 'minimumMinutes'], true);
            if ($number !== null && (!$integer || ($number >= 1 && floor($number) === $number))) { $data['tariff']['transfer'][$key] = $integer ? (int) $number : $number; }
        }
        $data['tariff']['hourlyBooking'] = $profile['hourlyBooking'];
        $saved_hourly = is_array($saved_rates['hourlyBooking'] ?? null) ? $saved_rates['hourlyBooking'] : [];
        foreach (['hourly', 'perMile', 'perWaitingMinute'] as $key) { $number = Settings::decimal($saved_hourly[$key] ?? null); if ($number !== null) { $data['tariff']['hourlyBooking'][$key] = $number; } }
        return $data;
    }

    /** @return array<string,mixed>|\WP_Error */
    private static function validate(array $input)
    {
        $error = static fn(string $message): \WP_Error => new \WP_Error('tuxano_invalid_vehicle', $message);
        $result = [];
        if (!isset($input['display']) || !is_string($input['display']) || strlen($input['display']) > 120) {
            return $error(__('Display name must be 120 characters or fewer.', 'tuxano-booking'));
        }
        $result['display'] = sanitize_text_field($input['display']);
        foreach (['capacity' => 1, 'luggageCapacity' => 0] as $key => $min) {
            $value = $input[$key] ?? null;
            if ((!is_int($value) && !is_string($value)) || !preg_match('/^\d{1,3}$/D', (string) $value) || (int) $value < $min || (int) $value > 100) {
                return $error(__('Passenger capacity must be 1–100; luggage capacity must be 0–100.', 'tuxano-booking'));
            }
            $result[$key] = (int) $value;
        }
        $result['image'] = self::image($input['image'] ?? null);
        if ($result['image'] === null) {
            return $error(__('Photo must be an HTTPS URL or a bundled assets/ image filename.', 'tuxano-booking'));
        }
        foreach (['models', 'features'] as $key) {
            $lines = $input[$key] ?? null;
            if (is_string($lines) && strlen($lines) <= 5000) {
                $lines = preg_split('/\R/', $lines);
            }
            if (!is_array($lines) || count($lines) > 20) {
                return $error(__('Models and features accept up to 20 lines each.', 'tuxano-booking'));
            }
            $result[$key] = [];
            foreach ($lines as $line) {
                if (!is_string($line) || strlen($line) > 200) {
                    return $error(__('Each model or feature must be 200 characters or fewer.', 'tuxano-booking'));
                }
                $line = sanitize_text_field($line);
                if ($line !== '') {
                    $result[$key][] = $line;
                }
            }
        }
        $rates = $input['tariff'] ?? [];
        $disabled = $input['disabled_tariff'] ?? [];
        if (!is_array($rates) || !is_array($disabled)) {
            return $error(__('Check the vehicle amounts and their None / not charged options.', 'tuxano-booking'));
        }
        foreach ($disabled as $field => $value) {
            if (!array_key_exists($field, self::TARIFF_FIELDS) || !in_array($value, [true, false, 1, 0, '1', '0'], true)) {
                return $error(__('Choose a valid None / not charged option.', 'tuxano-booking'));
            }
        }
        $result['tariff'] = [];
        foreach (self::TARIFF_FIELDS as $field => $_label) {
            $off = in_array($disabled[$field] ?? false, [true, 1, '1'], true);
            if (!$off && !array_key_exists($field, $rates)) {
                return $error(__('Enter each vehicle amount or explicitly choose None / not charged.', 'tuxano-booking'));
            }
            $value = $rates[$field] ?? null;
            if (array_key_exists($field, $rates) && (!is_string($value) && !is_int($value) && !is_float($value))) {
                return $error(__('Tariffs must be numbers, or blank for no charge.', 'tuxano-booking'));
            }
            $number = $off || (is_string($value) && trim($value) === '') ? 0.0 : Settings::decimal($value);
            if ($number === null) {
                return $error(__('Tariffs must be numbers between 0 and 1,000,000, with up to four decimal places.', 'tuxano-booking'));
            }
            $result['tariff'][$field] = $number;
        }
        if (array_key_exists('transfer', $rates) || array_key_exists('hourlyBooking', $rates)) {
            $transfer = $rates['transfer'] ?? null;
            $hourly = $rates['hourlyBooking'] ?? null;
            if (!is_array($transfer) || !is_array($hourly) || !in_array($transfer['version'] ?? null, [2, '2'], true) || !in_array($transfer['mode'] ?? null, ['mileage', 'time'], true)) {
                return $error(__('Choose a complete Transfer pricing method and a separate Hourly Booking profile.', 'tuxano-booking'));
            }
            $result['tariff']['transfer'] = ['version' => 2, 'mode' => $transfer['mode']];
            foreach (['pickupFreeMinutes' => 1440, 'returnFreeMinutes' => 1440, 'pickupFreeMiles' => 100000, 'returnFreeMiles' => 100000, 'roundingMinutes' => 1440, 'minimumMinutes' => 1440] as $field => $max) {
                $number = Settings::decimal($transfer[$field] ?? null, $max);
                $integer = in_array($field, ['roundingMinutes', 'minimumMinutes'], true);
                if ($number === null || ($integer && ($number < 1 || floor($number) !== $number))) {
                    return $error(__('Check transfer allowances, rounding increment and minimum charged time. Enter valid non-negative values; rounding and minimum time must be whole positive minutes.', 'tuxano-booking'));
                }
                $result['tariff']['transfer'][$field] = $integer ? (int) $number : $number;
            }
            $hourly_disabled = $input['disabled_hourly'] ?? [];
            if (!is_array($hourly_disabled)) { return $error(__('Check the Hourly Booking amounts and their None / not charged options.', 'tuxano-booking')); }
            foreach ($hourly_disabled as $field => $value) {
                if (!in_array($field, ['hourly', 'perMile', 'perWaitingMinute'], true) || !in_array($value, [true, false, 1, 0, '1', '0'], true)) { return $error(__('Choose a valid Hourly Booking None / not charged option.', 'tuxano-booking')); }
            }
            $result['tariff']['hourlyBooking'] = [];
            foreach (['hourly', 'perMile', 'perWaitingMinute'] as $field) {
                $off = in_array($hourly_disabled[$field] ?? false, [true, 1, '1'], true);
                if (!$off && !array_key_exists($field, $hourly)) { return $error(__('Complete all three Hourly Booking rates or explicitly choose None / not charged.', 'tuxano-booking')); }
                $value = $hourly[$field] ?? null;
                if (array_key_exists($field, $hourly) && !is_string($value) && !is_int($value) && !is_float($value)) { return $error(__('Hourly Booking rates must be numeric amounts.', 'tuxano-booking')); }
                $number = $off || (is_string($value) && trim($value) === '') ? 0.0 : Settings::decimal($value);
                if ($number === null) { return $error(__('Hourly Booking rates must be between 0 and 1,000,000, with up to four decimal places.', 'tuxano-booking')); }
                $result['tariff']['hourlyBooking'][$field] = $number;
            }
        }
        return $result;
    }

    /** @param mixed $value Untrusted photo input. */
    private static function image($value): ?string
    {
        if (!is_string($value) || strlen($value) > 2048) {
            return null;
        }
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        if (preg_match('#^assets/[a-zA-Z0-9/_\-.]+\.(?:png|jpe?g|webp|gif|avif)$#D', $value) && strpos($value, '..') === false) {
            return $value;
        }
        if (!preg_match('#^https://#i', $value)) {
            return null;
        }
        $url = esc_url_raw($value, ['https']);
        $parts = wp_parse_url($url);
        return $url !== '' && is_array($parts) && ($parts['scheme'] ?? '') === 'https' && !empty($parts['host']) && !isset($parts['user']) && !isset($parts['pass']) ? $url : null;
    }

    /** Defaults describe transfer rules only; money stays in the six saved fields. */
    private static function profile_tariff(array $tariff, bool $premium = false, bool $fresh = false): array
    {
        $hourly = ['hourly' => $tariff['hourly'], 'perMile' => $tariff['perMile'], 'perWaitingMinute' => $tariff['perWaitingMinute']];
        if ($premium) {
            $tariff['perMile'] = 3.0;
            $tariff['minimum'] = 150.0;
            $tariff['perWaitingMinute'] = 2.5;
            $tariff['hourly'] = 150.0;
            $hourly['hourly'] = 150.0;
            // Existing inactive values are retained; fresh examples use the mockup.
            if ($fresh) { $tariff['base'] = 0.0; $tariff['perDrivingMinute'] = 2.5; }
        }
        $tariff['transfer'] = self::TRANSFER_DEFAULTS;
        $tariff['hourlyBooking'] = $hourly;
        return $tariff;
    }

    /** One-time fleet upgrade; accepted booking snapshots are never rewritten. */
    public static function upgrade_pricing(): void
    {
        if ((int) get_option(self::PRICING_UPGRADE, 0) >= 2) { return; }
        $posts = get_posts(['post_type' => self::POST_TYPE, 'post_status' => ['publish', 'draft', 'pending', 'private', 'future', 'trash', 'auto-draft'], 'posts_per_page' => -1, 'no_found_rows' => true, 'suppress_filters' => false]);
        $complete = true;
        foreach ($posts as $post) {
            $stored = get_post_meta($post->ID, self::META, true);
            if (!is_array($stored) || !is_array($stored['tariff'] ?? null)) { continue; }
            // A present profile is authoritative even if invalid; never repair or
            // overwrite an administrator's saved profile by guessing defaults.
            if (array_key_exists('transfer', $stored['tariff']) || array_key_exists('hourlyBooking', $stored['tariff'])) { continue; }
            $valid = self::validate($stored);
            if (is_wp_error($valid)) { continue; }
            $updated = $stored;
            $updated['tariff'] = self::profile_tariff($valid['tariff'], $post->post_name === 'tuxano-premium');
            add_post_meta($post->ID, '_tuxano_pricing_pre_260', $valid['tariff'], true);
            // Conditional replacement does not clobber a concurrent editor save.
            $saved = update_post_meta($post->ID, self::META, wp_slash($updated), $stored);
            if (!$saved && get_post_meta($post->ID, self::META, true) !== $updated) { $complete = false; }
        }
        if ($complete) { update_option(self::PRICING_UPGRADE, 2, false); }
    }

    /** Initial data only: reactivation never overwrites edits or restores deleted defaults. */
    public static function seed(): void
    {
        if (get_option(self::SEEDED, false)) {
            return;
        }
        if (!post_type_exists(self::POST_TYPE)) {
            self::register();
        }
        $groups = [
            'suv-collection' => ['SUV COLLECTION', 'Spacious, comfortable, and perfect for everyday executive travel,'],
            'rolls-royce-collection' => ['ROLLS-ROYCE COLLECTION', 'The ultimate in luxury, prestige, and refinement.'],
        ];
        $terms = [];
        foreach ($groups as $slug => [$name, $description]) {
            $existing = get_term_by('slug', $slug, self::TAXONOMY);
            $result = $existing ? ['term_id' => $existing->term_id] : wp_insert_term($name, self::TAXONOMY, ['slug' => $slug, 'description' => $description]);
            if (is_wp_error($result)) {
                return;
            }
            $terms[$slug] = (int) $result['term_id'];
        }
        foreach (self::seed_records() as $index => $vehicle) {
            $existing = get_page_by_path($vehicle['slug'], OBJECT, self::POST_TYPE);
            if ($existing) {
                continue;
            }
            $id = wp_insert_post(['post_type' => self::POST_TYPE, 'post_status' => 'publish', 'post_title' => $vehicle['name'], 'post_name' => $vehicle['slug'], 'menu_order' => $index], true);
            if (is_wp_error($id) || !$id) {
                return;
            }
            update_post_meta($id, self::META, array_intersect_key($vehicle, array_flip(['display', 'capacity', 'luggageCapacity', 'image', 'models', 'features', 'tariff'])));
            $assigned = wp_set_object_terms($id, [$terms[$index < 3 ? 'suv-collection' : 'rolls-royce-collection']], self::TAXONOMY);
            if (is_wp_error($assigned)) {
                return;
            }
        }
        update_option(self::SEEDED, true, false);
    }

    private static function seed_records(): array
    {
        $records = [
            ['premium', 'PREMIUM SUV', 'Premium SUV', 6, 'premium-suv.png', ['Chevrolet Suburban', 'Ford Expedition MAX', 'GMC Yukon XL or similar'], ['Full-size extended-wheelbase SUVs', 'Spacious luggage capacity', 'Professional chauffeur service', 'Airport and business travel focused'], [65, 2, 3, 100, 1, 95]],
            ['luxury', 'LUXURY SUV', 'Luxury SUV', 6, 'luxury-suv.png', ['Lincoln Navigator Reserve L', 'Cadillac Escalade ESV Luxury', 'GMC Yukon Denali XL or similar'], ['Second-row captain’s chairs', 'Premium leather interiors', 'Professional chauffeur service', 'Enhanced ride quality'], [75, 3, 3, 125, 1.5, 115]],
            ['executive', 'EXECUTIVE SUV', 'Executive SUV', 6, 'executive-suv.png', ['Lincoln Navigator Black Label L', 'Cadillac Escalade ESV Platinum Luxury', 'GMC Yukon Denali Ultimate XL or similar'], ['Executive second-row captain’s chairs', 'Massage seating functions', 'Top-tier premium trim packages', 'Highest level of interior refinement'], [105, 3.5, 3, 150, 2, 135]],
            ['ghost', 'ROLLS-ROYCE GHOST', 'Rolls-Royce Ghost', 3, 'rolls-royce-ghost.png', ['Executive transportation', 'Private events', 'Fine dining'], ['Handcrafted luxury interior', 'Near-silent ride quality', 'Rear executive comfort settings', 'Advanced technology integration'], [500, 15, 15, 600, 5, 500]],
            ['cullinan', 'ROLLS-ROYCE CULLINAN', 'Rolls-Royce Cullinan', 3, 'rolls-royce-cullinan.png', ['VIP transportation', 'Private aviation', 'VIP Travel'], ['Ultra-luxury SUV presence', 'Bespoke handcrafted leather', 'Exceptional ride quality over any terrain', 'Iconic Spirit of Ecstasy presence'], [700, 20, 25, 900, 7.5, 750]],
            ['phantom', 'ROLLS-ROYCE PHANTOM', 'Rolls-Royce Phantom', 3, 'rolls-royce-phantom.png', ['Weddings', 'Red Carpet Events', 'Flagship Occasions'], ['Iconic flagship presence', 'Famous Starlight Headliner', 'Ultimate rear passenger sanctuary', 'Unmatched ride refinement'], [1000, 30, 55, 1500, 10, 1250]],
        ];
        return array_map(static fn(array $row): array => [
            'slug' => 'tuxano-' . $row[0], 'name' => $row[1], 'display' => $row[2],
            'capacity' => $row[3], 'luggageCapacity' => $row[3], 'image' => 'assets/' . $row[4],
            'models' => $row[5], 'features' => $row[6], 'tariff' => self::profile_tariff(array_combine(array_keys(self::TARIFF_FIELDS), $row[7]), $row[0] === 'premium', true),
        ], $records);
    }
}
