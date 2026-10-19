<?php
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Rest
{
    private const NAMESPACE = 'tuxano-booking/v1';
    private const MAX_BODY = 65536;
    private const WAIT_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];

    public static function register(): void
    {
        register_rest_route(self::NAMESPACE, '/session', ['methods' => 'POST', 'callback' => [self::class, 'session'], 'permission_callback' => [self::class, 'origin']]);
        foreach (['route', 'bookings'] as $path) {
            register_rest_route(self::NAMESPACE, '/' . $path, ['methods' => 'POST', 'callback' => [self::class, $path], 'permission_callback' => [self::class, 'permission']]);
        }
        add_filter('rest_post_dispatch', static function ($response, $server, $request) {
            if (str_starts_with($request->get_route(), '/' . self::NAMESPACE . '/')) {
                $response->header('Cache-Control', 'private, no-store, max-age=0');
                $response->header('X-Content-Type-Options', 'nosniff');
            }
            return $response;
        }, 10, 3);
    }

    private static function fail(string $code, string $message, int $status = 400): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status]);
    }

    public static function origin(\WP_REST_Request $request): bool|\WP_Error
    {
        $origin = $request->get_header('origin');
        $site = wp_parse_url(home_url('/'));
        $expected = ($site['scheme'] ?? 'https') . '://' . ($site['host'] ?? '') . (isset($site['port']) ? ':' . $site['port'] : '');
        if ($origin !== $expected || in_array($request->get_header('sec-fetch-site'), ['cross-site', 'same-site'], true)) {
            return self::fail('tuxano_origin', 'Please use the booking form on this website.', 403);
        }
        if (strlen($request->get_body()) > self::MAX_BODY || !preg_match('/^application\/json(?:\s*;|$)/i', (string) $request->get_header('content-type'))) {
            return self::fail('tuxano_body', 'Send a valid JSON request of at most 64 KB.', 413);
        }
        return true;
    }

    private static function client(): string
    {
        // Never trust arbitrary forwarded headers supplied by visitors.
        return hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), wp_salt('auth'));
    }

    private static function rate(string $scope, string $identity, int $limit, int $window): bool
    {
        // Atomic DB counter: transients alone lose concurrent increments.
        global $wpdb;
        $bucket = (int) floor(time() / $window);
        $name = '_tuxano_rate_' . hash('sha256', $scope . $identity . $bucket);
        $expires = ($bucket + 2) * $window;
        $initial = wp_json_encode(['count' => 1, 'expires' => $expires]);
        if (add_option($name, $initial, '', false)) { return true; }
        // The value is plugin-created JSON; compare-and-swap is bounded under load.
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $old = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $name));
            $value = json_decode((string) $old, true);
            if (!is_array($value) || (int) ($value['count'] ?? $limit) >= $limit) { return false; }
            $value['count']++;
            $updated = $wpdb->query($wpdb->prepare("UPDATE {$wpdb->options} SET option_value=%s WHERE option_name=%s AND option_value=%s", wp_json_encode($value), $name, $old));
            if ($updated === 1) { wp_cache_delete($name, 'options'); return true; }
        }
        return false;
    }

    public static function clean_rates(): void
    {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare("SELECT option_name,option_value FROM {$wpdb->options} WHERE option_name LIKE %s LIMIT 2000", $wpdb->esc_like('_tuxano_rate_') . '%'), ARRAY_A);
        foreach ($rows ?: [] as $row) {
            $value = json_decode($row['option_value'], true);
            if (is_array($value) && (int) ($value['expires'] ?? 0) < time()) { delete_option($row['option_name']); }
        }
    }

    private static function token(\WP_REST_Request $request): string
    {
        $token = (string) $request->get_header('x-tuxano-session');
        return preg_match('/^[a-f0-9]{64}$/D', $token) ? $token : '';
    }

    public static function permission(\WP_REST_Request $request): bool|\WP_Error
    {
        $origin = self::origin($request);
        if (is_wp_error($origin)) { return $origin; }
        $token = self::token($request);
        $session = $token ? get_transient('tuxano_session_' . hash('sha256', $token)) : false;
        if (!$session || !hash_equals($session['client'], self::client())) {
            return self::fail('tuxano_session', 'Your booking session has expired. Refresh this page to start a new session.', 403);
        }
        return true;
    }

    public static function session(\WP_REST_Request $request): array|\WP_Error
    {
        if (!self::rate('session', self::client(), (int) Settings::get()['session_hourly_limit'], HOUR_IN_SECONDS)) { return self::fail('tuxano_rate', 'Too many booking sessions. Please try again later.', 429); }
        $vehicles = Vehicles::all();
        $settings = Settings::get();
        $token = bin2hex(random_bytes(32));
        set_transient('tuxano_session_' . hash('sha256', $token), ['client' => self::client(), 'created' => time()], 2 * HOUR_IN_SECONDS);
        return ['token' => $token, 'vehicles' => $vehicles, 'settings' => Settings::public_data(), 'restUrl' => rest_url(self::NAMESPACE . '/'), 'maps' => [
            'browserKey' => $settings['browser_key'], 'browserConfigured' => !empty($settings['browser_key']),
            'routesConfigured' => !empty($settings['routes_key']), 'providerMode' => 'remote', 'routeEndpoint' => rest_url(self::NAMESPACE . '/route'),
        ]];
    }

    private static function point(mixed $point): array
    {
        if (!is_array($point) || array_is_list($point)) { throw new \InvalidArgumentException('Select valid pickup, stop and destination points.'); }
        if (isset($point['placeId'])) {
            if (count($point) !== 1 || !is_string($point['placeId']) || !preg_match('/^[a-zA-Z0-9_-]{3,512}$/D', $point['placeId'])) {
                throw new \InvalidArgumentException('Select a valid Google location.');
            }
            return ['placeId' => $point['placeId']];
        }
        if (count($point) !== 2 || !isset($point['latitude'], $point['longitude']) || !is_numeric($point['latitude']) || !is_numeric($point['longitude']) || is_string($point['latitude']) || is_string($point['longitude'])) {
            throw new \InvalidArgumentException('Select a valid map position.');
        }
        $latitude = (float) $point['latitude']; $longitude = (float) $point['longitude'];
        if (!is_finite($latitude) || !is_finite($longitude) || abs($latitude) > 90 || abs($longitude) > 180) { throw new \InvalidArgumentException('Map position is out of range.'); }
        return ['latitude' => $latitude, 'longitude' => $longitude];
    }

    private static function route_request(array $body): array
    {
        $stops = $body['stops'] ?? [];
        if (!is_array($stops) || !array_is_list($stops) || count($stops) > (int) Settings::get()['max_stops']) { throw new \InvalidArgumentException('Check the number and order of your stops.'); }
        return ['origin' => self::point($body['origin'] ?? null), 'destination' => self::point($body['destination'] ?? null), 'stops' => array_map([self::class, 'point'], $stops)];
    }

    private static function google_waypoint(array $point): array
    {
        return isset($point['placeId']) ? $point : ['location' => ['latLng' => $point]];
    }

    public static function route(\WP_REST_Request $request): array|\WP_Error
    {
        try {
            $body = $request->get_json_params();
            if (!is_array($body) || array_diff(array_keys($body), ['origin', 'destination', 'stops'])) { throw new \InvalidArgumentException('Invalid route request.'); }
            $points = self::route_request($body);
        } catch (\InvalidArgumentException $error) { return self::fail('tuxano_route_input', $error->getMessage()); }
        $settings = Settings::get();
        if (empty($settings['routes_key'])) { return self::fail('tuxano_not_configured', 'Route calculation is not configured. Please contact the transportation team.', 503); }
        if (!self::rate('route-session', hash('sha256', self::token($request)), (int) $settings['route_minute_limit'], MINUTE_IN_SECONDS) || !self::rate('route-client', self::client(), 120, MINUTE_IN_SECONDS) || !self::rate('route-global', 'all', (int) $settings['route_daily_limit'], DAY_IN_SECONDS)) {
            return self::fail('tuxano_rate', 'The route request limit has been reached. Please try again later.', 429);
        }
        $payload = ['origin' => self::google_waypoint($points['origin']), 'destination' => self::google_waypoint($points['destination']), 'intermediates' => array_map([self::class, 'google_waypoint'], $points['stops']), 'travelMode' => 'DRIVE', 'routingPreference' => 'TRAFFIC_UNAWARE', 'computeAlternativeRoutes' => false, 'optimizeWaypointOrder' => false, 'units' => 'METRIC'];
        // This endpoint is fixed, never visitor-controlled, and redirects are
        // disabled. The normal HTTP API also supports managed proxies with
        // remote DNS; wp_safe_remote_post would require unrelated local DNS.
        $response = wp_remote_post('https://routes.googleapis.com/directions/v2:computeRoutes', ['timeout' => 15, 'redirection' => 0, 'sslverify' => true, 'limit_response_size' => 262144, 'headers' => ['Content-Type' => 'application/json', 'X-Goog-Api-Key' => $settings['routes_key'], 'X-Goog-FieldMask' => 'routes.distanceMeters,routes.duration'], 'body' => wp_json_encode($payload)]);
        if (is_wp_error($response)) { return self::fail('tuxano_google_unavailable', 'Google Routes is temporarily unavailable. Please try again.', 502); }
        $status = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        $route = $data['routes'][0] ?? null;
        if ($status !== 200 || !is_array($route) || !isset($route['distanceMeters'], $route['duration']) || !is_numeric($route['distanceMeters']) || !preg_match('/^(\d+(?:\.\d+)?)s$/D', (string) $route['duration'], $match) || (float) $route['distanceMeters'] < 0 || (float) $route['distanceMeters'] > 100000000 || (float) $match[1] > 31536000) {
            return self::fail('tuxano_google_route', $status === 200 ? 'No driving route was found. Please check your selected locations.' : 'Google could not calculate this route. Please try again or contact the transportation team.', 502);
        }
        $metrics = ['distanceMeters' => (float) $route['distanceMeters'], 'durationSeconds' => (float) $match[1], 'provider' => 'google', 'calculatedAt' => gmdate('c')];
        $quote = bin2hex(random_bytes(32));
        set_transient('tuxano_quote_' . hash('sha256', $quote), ['session' => hash('sha256', self::token($request)), 'points' => $points, 'route' => $metrics, 'revision' => Settings::revision()], 15 * MINUTE_IN_SECONDS);
        return array_merge($metrics, ['quoteToken' => $quote]);
    }

    private static function text(mixed $value, int $max, bool $required = false, bool $multiline = false): string
    {
        if (!is_string($value) || mb_strlen($value) > $max || str_contains($value, "\0")) { throw new \InvalidArgumentException('Please check the length and format of your booking details.'); }
        $value = trim($multiline ? sanitize_textarea_field($value) : sanitize_text_field($value));
        if ($required && $value === '') { throw new \InvalidArgumentException('Please complete all required booking details.'); }
        return $value;
    }

    private static function integer(mixed $value, int $min, int $max): int
    {
        if (!is_int($value) || $value < $min || $value > $max) { throw new \InvalidArgumentException('Check passenger, luggage, seat and hour quantities.'); }
        return $value;
    }

    private static function boolean(array $body, string $key): bool
    {
        if (!isset($body[$key]) || !is_bool($body[$key])) { throw new \InvalidArgumentException('Check the booking options and consent.'); }
        return $body[$key];
    }

    private static function selected(mixed $point): array
    {
        if (!is_array($point)) { throw new \InvalidArgumentException('Choose each location from suggestions or a confirmed map point.'); }
        return isset($point['placeId']) ? self::point(['placeId' => $point['placeId']]) : self::point(['latitude' => $point['latitude'] ?? null, 'longitude' => $point['longitude'] ?? null]);
    }

    private static function booking(array $body, array $quote): array
    {
        $settings = Settings::get();
        $trip = $body['trip'] ?? null;
        if (!is_array($trip) || !is_array($trip['stops'] ?? null) || !array_is_list($trip['stops'])) { throw new \InvalidArgumentException('Complete the trip details.'); }
        $points = self::route_request(['origin' => self::selected($trip['pickupPlace'] ?? null), 'destination' => self::selected($trip['dropoffPlace'] ?? null), 'stops' => array_map(static fn($stop) => self::selected(is_array($stop) ? ($stop['place'] ?? null) : null), $trip['stops'])]);
        if (wp_json_encode($points) !== wp_json_encode($quote['points'])) { throw new \InvalidArgumentException('Your route changed. Calculate the route again before submitting.'); }
        $service = $trip['service'] ?? '';
        if (!in_array($service, ['transfer', 'hourly'], true)) { throw new \InvalidArgumentException('Choose a valid service.'); }
        $hours = self::integer($trip['hours'] ?? null, (int) $settings['min_hours'], (int) $settings['max_hours']);
        $date = self::text($trip['date'] ?? '', 10, true); $time = self::text($trip['time'] ?? '', 5, true);
        $scheduled = \DateTimeImmutable::createFromFormat('!Y-m-d H:i', $date . ' ' . $time, wp_timezone());
        if (!$scheduled || $scheduled->format('Y-m-d H:i') !== $date . ' ' . $time || $scheduled->getTimestamp() <= time() || $scheduled->getTimestamp() > time() + 5 * YEAR_IN_SECONDS) { throw new \InvalidArgumentException('Choose a future pickup date and time within five years, in the booking website timezone.'); }
        $vehicle = Vehicles::find(self::text($body['vehicle'] ?? '', 20, true));
        if (!$vehicle) { throw new \InvalidArgumentException('This vehicle is no longer available. Please choose another vehicle.'); }
        $clean = ['trip' => ['service' => $service, 'hours' => $hours, 'date' => $date, 'time' => $time, 'pickup' => self::text($trip['pickup'] ?? '', 1024, true), 'dropoff' => self::text($trip['dropoff'] ?? '', 1024, true), 'pickupPlace' => $points['origin'], 'dropoffPlace' => $points['destination'], 'stops' => []], 'vehicle' => $vehicle['id'], 'passengers' => self::integer($body['passengers'] ?? null, 1, $vehicle['capacity']), 'luggage' => self::integer($body['luggage'] ?? null, 0, $vehicle['luggageCapacity'])];
        foreach ($trip['stops'] as $index => $stop) {
            $wait = self::integer($stop['waitMinutes'] ?? null, 0, 120);
            if (!in_array($wait, self::WAIT_OPTIONS, true)) { throw new \InvalidArgumentException('Select an available stop waiting time.'); }
            $clean['trip']['stops'][] = ['text' => self::text($stop['text'] ?? '', 1024, true), 'waitMinutes' => $wait, 'place' => $points['stops'][$index]];
        }
        foreach (['meet', 'child', 'inPerson', 'same', 'consent'] as $key) { $clean[$key] = self::boolean($body, $key); }
        if (!$clean['consent']) { throw new \InvalidArgumentException('Please agree to the reservation terms before submitting.'); }
        $clean['carSeats'] = self::integer($body['carSeats'] ?? null, 0, 100);
        $clean['boosterSeats'] = self::integer($body['boosterSeats'] ?? null, 0, 100);
        if ($clean['child'] && $clean['carSeats'] + $clean['boosterSeats'] > $clean['passengers']) { throw new \InvalidArgumentException('Child seats cannot exceed passenger count.'); }
        if (!$clean['child']) { $clean['carSeats'] = 0; $clean['boosterSeats'] = 0; }
        $gratuity = $body['gratuity'] ?? '';
        $presets = array_map('strval', array_unique([10, 15, 20, 25, (float) $settings['default_gratuity']]));
        if (!is_string($gratuity) || ($gratuity !== 'custom' && !in_array($gratuity, $presets, true))) { throw new \InvalidArgumentException('Choose a valid gratuity.'); }
        $custom = $body['custom'] ?? 0;
        if ((!is_int($custom) && !is_float($custom)) || !is_finite((float) $custom) || $custom < 0 || $custom > 100) { throw new \InvalidArgumentException('Custom gratuity must be between 0 and 100 percent.'); }
        $clean['gratuity'] = $gratuity; $clean['custom'] = $custom;
        $clean['flightType'] = in_array($body['flightType'] ?? '', ['commercial', 'private'], true) ? $body['flightType'] : 'commercial';
        foreach (['airline' => 120, 'flight' => 80, 'special' => 250] as $key => $limit) { $clean[$key] = self::text($body[$key] ?? '', $limit, false, $key === 'special'); }
        foreach (['billing', 'passenger'] as $section) {
            if (!is_array($body[$section] ?? null)) { throw new \InvalidArgumentException('Complete the contact and billing details.'); }
            $fields = $section === 'billing' ? ['first', 'last', 'email', 'phone', 'company', 'street', 'unit', 'city', 'region', 'zip', 'country', 'notes'] : ['first', 'last', 'email', 'mobile'];
            $optional = $section === 'billing' ? ['company', 'unit', 'notes'] : ['email'];
            $clean[$section] = [];
            foreach ($fields as $key) { $clean[$section][$key] = self::text($body[$section][$key] ?? '', $key === 'notes' ? 500 : ($key === 'email' ? 254 : 200), !in_array($key, $optional, true), $key === 'notes'); }
        }
        if ($clean['same']) { $clean['passenger'] = ['first' => $clean['billing']['first'], 'last' => $clean['billing']['last'], 'email' => $clean['billing']['email'], 'mobile' => $clean['billing']['phone']]; }
        foreach ([$clean['billing']['email'], $clean['passenger']['email']] as $email) { if ($email !== '' && !is_email($email)) { throw new \InvalidArgumentException('Enter valid contact email addresses.'); } }
        foreach ([$clean['billing']['phone'], $clean['passenger']['mobile']] as $phone) { $length = strlen(preg_replace('/\D/', '', $phone)); if ($length < 7 || $length > 15) { throw new \InvalidArgumentException('Enter valid contact phone numbers.'); } }
        $clean['vehicleSnapshot'] = $vehicle;
        return [$clean, $vehicle, $scheduled->format('Y-m-d H:i:s')];
    }

    public static function bookings(\WP_REST_Request $request): array|\WP_Error
    {
        $body = $request->get_json_params();
        if (!is_array($body) || !is_array($body['booking'] ?? null) || !is_string($body['requestKey'] ?? null) || !preg_match('/^[a-zA-Z0-9_-]{16,100}$/D', $body['requestKey']) || !empty($body['website'])) { return self::fail('tuxano_booking_input', 'Please submit the completed booking form.'); }
        $session = get_transient('tuxano_session_' . hash('sha256', self::token($request)));
        if (!$session || time() - $session['created'] < 2 || !self::rate('booking', self::client(), (int) Settings::get()['booking_hourly_limit'], HOUR_IN_SECONDS)) { return self::fail('tuxano_booking_rate', 'Please wait before submitting another request.', 429); }
        $key = hash_hmac('sha256', $body['requestKey'], wp_salt('secure_auth'));
        // Include session binding so a guessed key never exposes another visitor's receipt.
        $hash = hash('sha256', self::token($request) . wp_json_encode($body['booking']));
        $previous = Database::by_request($key);
        if ($previous) {
            return hash_equals($previous['request_hash'], $hash) ? self::receipt($previous) : self::fail('tuxano_idempotency', 'This request key was already used with different details. Start a new request.', 409);
        }
        $quoteToken = $body['quoteToken'] ?? '';
        $quote = is_string($quoteToken) && preg_match('/^[a-f0-9]{64}$/D', $quoteToken) ? get_transient('tuxano_quote_' . hash('sha256', $quoteToken)) : false;
        if (!$quote || !hash_equals($quote['session'], hash('sha256', self::token($request)))) { return self::fail('tuxano_quote_expired', 'Your route quote has expired. Recalculate the route and try again.', 409); }
        if (!hash_equals($quote['revision'], Settings::revision())) { return self::fail('tuxano_pricing_changed', 'Vehicle or pricing settings changed. Refresh the page to obtain the current quote.', 409); }
        try { [$booking, $vehicle, $pickup] = self::booking($body['booking'], $quote); $pricing = Pricing::calculate($vehicle, $quote['route'], $booking, Settings::get()); }
        catch (\InvalidArgumentException $error) { return self::fail('tuxano_booking_validation', $error->getMessage()); }
        $reference = 'TUX-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(6)));
        $settings = Settings::get();
        $id = Database::insert(['reference' => $reference, 'request_key' => $key, 'request_hash' => $hash, 'status' => 'new', 'created_at' => current_time('mysql', true), 'pickup_at' => $pickup, 'customer_name' => trim($booking['billing']['first'] . ' ' . $booking['billing']['last']), 'customer_email' => $booking['billing']['email'], 'vehicle_name' => $vehicle['display'], 'total' => $pricing['total'], 'currency' => $pricing['currency'], 'payload' => wp_json_encode($booking), 'pricing' => wp_json_encode($pricing), 'route' => wp_json_encode($quote['route']), 'notes' => '', 'customer_mail' => !empty($settings['email_customer']) ? 'pending' : 'disabled', 'admin_mail' => !empty($settings['email_admin']) ? 'pending' : 'disabled']);
        if (is_wp_error($id)) {
            $previous = Database::by_request($key);
            return $previous && hash_equals($previous['request_hash'], $hash) ? self::receipt($previous) : $id;
        }
        // Save first. Mail transport failure cannot remove a received request.
        Notifications::send($id);
        return self::receipt(Database::find($id));
    }

    private static function receipt(array $row): array
    {
        return ['requestId' => $row['reference'], 'pricing' => $row['pricing'], 'route' => $row['route']];
    }
}
