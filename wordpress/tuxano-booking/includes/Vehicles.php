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

    /** A zero rate deliberately switches that component off; it is never a missing tariff. */
    private static function pricing_fields(array $data): void
    {
        $settings = Settings::get();
        $currency = $settings['currency'];
        $help = [
            'base' => __('A single starting charge for each transfer. It does not apply to hourly hire.', 'tuxano-booking'),
            'perMile' => __('Charged for each driving mile, on transfers and hourly hire. One mile is about 1.609 km.', 'tuxano-booking'),
            'perDrivingMinute' => __('Charged for each minute of driving on a transfer. Stop waiting is not included here.', 'tuxano-booking'),
            'minimum' => __('The smallest transfer driving charge. Waiting and optional extras are added afterwards.', 'tuxano-booking'),
            'perWaitingMinute' => __('Charged once per selected stop-waiting minute, for transfers and hourly hire.', 'tuxano-booking'),
            'hourly' => __('Charged per booked hour or actual driving hour, whichever is greater. Mileage and stop waiting are added.', 'tuxano-booking'),
        ];
        $units = ['base' => __('per transfer', 'tuxano-booking'), 'perMile' => __('per mile', 'tuxano-booking'), 'perDrivingMinute' => __('per driving minute', 'tuxano-booking'), 'minimum' => __('minimum driving charge', 'tuxano-booking'), 'perWaitingMinute' => __('per waiting minute', 'tuxano-booking'), 'hourly' => __('per hour', 'tuxano-booking')];
        $tariff = $data['tariff'];
        $example = max((float) $tariff['minimum'], (float) $tariff['base'] + 20 * (float) $tariff['perMile'] + 30 * (float) $tariff['perDrivingMinute']) + 15 * (float) $tariff['perWaitingMinute'];
        ?>
        <section class="tuxano-vehicle-pricing" aria-labelledby="tuxano-pricing-title" data-tuxano-currency="<?php echo esc_attr($currency); ?>">
            <h3 id="tuxano-pricing-title"><?php esc_html_e('Set this vehicle’s prices', 'tuxano-booking'); ?></h3>
            <p><?php echo esc_html(sprintf(__('All amounts are in %s. Turn off any component with “None / not charged”, or leave its amount blank to save it as zero.', 'tuxano-booking'), $currency)); ?></p>
            <div class="tuxano-pricing-guide">
                <p><strong><?php esc_html_e('Transfer', 'tuxano-booking'); ?></strong> — <?php esc_html_e('Start with the base fare, add distance and driving time, then apply the minimum if higher. Add stop waiting once.', 'tuxano-booking'); ?></p>
                <p><strong><?php esc_html_e('Hourly', 'tuxano-booking'); ?></strong> — <?php esc_html_e('Multiply the higher of booked hours or driving hours by the hourly rate, then add mileage and stop waiting.', 'tuxano-booking'); ?></p>
                <p class="description"><?php esc_html_e('Meet & greet, child seats and gratuity are configured under Pricing. If every vehicle component is off, its transportation charge is zero. Keep an unfinished vehicle in Draft.', 'tuxano-booking'); ?></p>
            </div>
            <div class="tuxano-rate-grid">
            <?php foreach (self::TARIFF_FIELDS as $field => $label) : $off = (float) $tariff[$field] === 0.0; ?>
                <div class="tuxano-rate-field<?php echo $off ? ' is-disabled' : ''; ?>">
                    <label for="tuxano-rate-<?php echo esc_attr($field); ?>"><strong><?php echo esc_html($label); ?></strong></label>
                    <p id="tuxano-rate-help-<?php echo esc_attr($field); ?>" class="description"><?php echo esc_html($help[$field]); ?></p>
                    <div class="tuxano-rate-amount"><input id="tuxano-rate-<?php echo esc_attr($field); ?>" name="tuxano_vehicle[tariff][<?php echo esc_attr($field); ?>]" data-tuxano-rate="<?php echo esc_attr($field); ?>" aria-describedby="tuxano-rate-help-<?php echo esc_attr($field); ?>" type="number" min="0" max="1000000" step="0.0001" placeholder="0.00" value="<?php echo esc_attr((string) $tariff[$field]); ?>"><span><?php echo esc_html($currency . ' ' . $units[$field]); ?></span></div>
                    <label class="tuxano-rate-none"><input type="checkbox" name="tuxano_vehicle[disabled_tariff][<?php echo esc_attr($field); ?>]" data-tuxano-rate-toggle="<?php echo esc_attr($field); ?>" value="1" <?php checked($off); ?>> <?php esc_html_e('None / not charged', 'tuxano-booking'); ?></label>
                </div>
            <?php endforeach; ?>
            </div>
            <div class="tuxano-rate-preview" data-tuxano-rate-preview aria-live="polite">
                <strong><?php esc_html_e('Example transfer', 'tuxano-booking'); ?></strong>
                <p><?php esc_html_e('20 miles · 30 driving minutes · 15 minutes of stop waiting', 'tuxano-booking'); ?></p>
                <p><strong data-tuxano-example-total><?php echo esc_html($currency . ' ' . number_format($example, 2, '.', ',')); ?></strong> <span class="description"><?php esc_html_e('transportation only, before extras and gratuity', 'tuxano-booking'); ?></span></p>
            </div>
        </section>
        <?php
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
        $data['tariff'] = array_replace($defaults['tariff'], is_array($data['tariff']) ? array_intersect_key($data['tariff'], $defaults['tariff']) : []);
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
            'models' => $row[5], 'features' => $row[6], 'tariff' => array_combine(array_keys(self::TARIFF_FIELDS), $row[7]),
        ], $records);
    }
}
