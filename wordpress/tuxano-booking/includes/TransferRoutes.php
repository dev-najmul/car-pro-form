<?php
/** Server-measured positioning and passenger routes for one-way transfers. */
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class TransferRoutes
{
    private const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
    private const MASK = 'routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration,routes.legs.startLocation.latLng,routes.legs.endLocation.latLng';

    /**
     * The callback charges the existing provider budget before every Google
     * request. No positioning metric is guessed when a route is unavailable.
     *
     * @return array|\WP_Error
     */
    public static function measure(array $points, array $trip, string $key, callable $budget, bool $admin = false)
    {
        $settings = Settings::get();
        $base = $settings['transfer_base_address'] ?? '';
        if (!is_string($base) || trim($base) === '' || strlen($base) > 512 || preg_match('/[\x00-\x1f\x7f<>]/', $base)) {
            return self::error('tuxano_transfer_base', 'The service-base address must be configured before this transfer can be priced.', 503);
        }
        $pickup = self::waypoint($points['origin']);
        $dropoff = self::waypoint($points['destination']);
        $stops = array_map([self::class, 'waypoint'], $points['stops']);
        $base_point = ['address' => $base];
        // This probe supplies all positioning geometry and an initial base
        // departure estimate. Its durations never become the billed forecast.
        $probe = self::request($base_point, $base_point, array_merge([$pickup], $stops, [$dropoff]), null, $key, $budget, count($stops) + 3);
        if (is_wp_error($probe)) { return $probe; }
        try {
            $origin = isset($points['origin']['placeId']) ? self::point($probe['legs'][1]['startLocation']['latLng'] ?? null) : $points['origin'];
            $zone = Timezones::resolve($origin['latitude'], $origin['longitude']);
        } catch (\InvalidArgumentException $error) {
            return self::error('tuxano_google_origin', 'Google could not verify the passenger pickup location. Select an exact pickup and try again.', 502);
        } catch (\RuntimeException $error) {
            return self::error('tuxano_timezone_unavailable', 'The pickup time zone could not be verified. Please try again.', 503);
        }
        try { $scheduled = Timezones::local($trip['date'], $trip['time'], $zone); }
        catch (\InvalidArgumentException $error) { return self::error('tuxano_transfer_schedule', 'Choose a valid, unambiguous local pickup date and time.'); }
        $scheduled_at = $scheduled->getTimestamp();
        $now = time();
        if (!$admin && ($scheduled_at <= $now || $scheduled_at > $now + 5 * YEAR_IN_SECONDS)) {
            return self::error('tuxano_transfer_schedule', 'Choose a future pickup date and time within five years, in the pickup location time zone.');
        }
        // Google DRIVE requests cannot forecast a past departure. An explicit
        // historical admin recalculation uses current traffic and records that
        // basis; ordinary historical/contact edits never invoke this method.
        $historical = $admin && $scheduled_at <= $now;
        $passenger_departure = max($scheduled_at, $now + 5);
        $base_departure = max($now + 5, (int) floor($passenger_departure - $probe['legs'][0]['durationSeconds']));
        $passenger = self::request($pickup, $dropoff, $stops, $passenger_departure, $key, $budget, count($stops) + 1);
        if (is_wp_error($passenger)) { return $passenger; }
        $base_departure = max(time() + 5, $base_departure);
        $positioning = self::request($base_point, $pickup, [], $base_departure, $key, $budget, 1);
        if (is_wp_error($positioning)) { return $positioning; }
        $return_departure = max(time() + 5, (int) ceil($passenger_departure + $passenger['durationSeconds'] + array_sum($trip['waitMinutes']) * 60));
        $return = self::request($dropoff, $base_point, [], $return_departure, $key, $budget, 1);
        if (is_wp_error($return)) { return $return; }
        return [
            'distanceMeters' => $passenger['distanceMeters'],
            'durationSeconds' => $passenger['durationSeconds'],
            'provider' => 'google', 'calculatedAt' => gmdate('c'),
            'pickupTimezone' => $zone, 'pickupTimezoneLabel' => Timezones::label($zone),
            'transferLegs' => [
                'pickup' => ['distanceMeters' => $positioning['distanceMeters'], 'durationSeconds' => $positioning['durationSeconds']],
                'return' => ['distanceMeters' => $return['distanceMeters'], 'durationSeconds' => $return['durationSeconds']],
            ],
            'trafficAware' => true,
            'trafficBasis' => $historical ? 'current-for-historical-pickup' : 'pickup',
            'scheduledPickupUtc' => gmdate('c', $scheduled_at),
            'passengerDepartureUtc' => gmdate('c', $passenger_departure),
            'baseDepartureUtc' => gmdate('c', $base_departure),
            'returnDepartureUtc' => gmdate('c', $return_departure),
        ];
    }

    private static function waypoint(array $point): array
    {
        return isset($point['placeId']) ? ['placeId' => $point['placeId']] : ['location' => ['latLng' => ['latitude' => $point['latitude'], 'longitude' => $point['longitude']]]];
    }

    private static function point($point): array
    {
        if (!is_array($point) || !isset($point['latitude'], $point['longitude']) || !is_numeric($point['latitude']) || !is_numeric($point['longitude'])) {
            throw new \InvalidArgumentException('Missing pickup geometry.');
        }
        $lat = (float) $point['latitude']; $lng = (float) $point['longitude'];
        if (!is_finite($lat) || !is_finite($lng) || abs($lat) > 90 || abs($lng) > 180) { throw new \InvalidArgumentException('Invalid pickup geometry.'); }
        return ['latitude' => $lat, 'longitude' => $lng];
    }

    /** @return array|\WP_Error */
    private static function request(array $origin, array $destination, array $stops, ?int $departure, string $key, callable $budget, int $leg_count)
    {
        if (!$budget()) { return self::error('tuxano_rate', 'The route request limit has been reached. Please try again later.', 429); }
        $payload = [
            'origin' => $origin, 'destination' => $destination, 'intermediates' => $stops,
            'travelMode' => 'DRIVE', 'routingPreference' => $departure === null ? 'TRAFFIC_UNAWARE' : 'TRAFFIC_AWARE',
            'computeAlternativeRoutes' => false, 'optimizeWaypointOrder' => false, 'units' => 'METRIC',
        ];
        if ($departure !== null) { $payload['departureTime'] = gmdate('Y-m-d\TH:i:s\Z', $departure); }
        $response = wp_remote_post(self::ENDPOINT, [
            'timeout' => 12, 'redirection' => 0, 'sslverify' => true, 'limit_response_size' => 262144,
            'headers' => ['Content-Type' => 'application/json', 'X-Goog-Api-Key' => $key, 'X-Goog-FieldMask' => self::MASK],
            'body' => wp_json_encode($payload),
        ]);
        if (is_wp_error($response)) { return self::error('tuxano_google_unavailable', 'Google could not complete the service-base and passenger routes. Please try again or contact the transportation team.', 502); }
        $data = json_decode(wp_remote_retrieve_body($response), true);
        $route = $data['routes'][0] ?? null;
        if (wp_remote_retrieve_response_code($response) !== 200 || !is_array($route) || !is_array($route['legs'] ?? null) || count($route['legs']) !== $leg_count) {
            return self::error('tuxano_transfer_route', 'No complete driving route was found between the service base, pickup and destination. Please check the locations or contact the transportation team.', 502);
        }
        try {
            $legs = [];
            foreach ($route['legs'] as $leg) {
                if (!is_array($leg)) { throw new \InvalidArgumentException('Incomplete route leg.'); }
                $legs[] = array_merge($leg, self::metrics($leg, true));
            }
            // Protobuf JSON may omit a scalar distance when every verified leg
            // is genuinely zero-length. It is never inferred from missing legs.
            if (!array_key_exists('distanceMeters', $route) && preg_match('/^0(?:\.0+)?s$/D', (string) ($route['duration'] ?? ''))) {
                $all_zero = true;
                foreach ($legs as $leg) { if ($leg['distanceMeters'] !== 0.0 || $leg['durationSeconds'] !== 0.0) { $all_zero = false; break; } }
                if ($all_zero) { $route['distanceMeters'] = 0; }
            }
            $result = self::metrics($route);
            $result['legs'] = $legs;
            return $result;
        } catch (\InvalidArgumentException $error) {
            return self::error('tuxano_transfer_route', 'Google returned incomplete transfer route measurements. Please try again.', 502);
        }
    }

    private static function metrics(array $value, bool $leg = false): array
    {
        $distance = $value['distanceMeters'] ?? null; $duration = $value['duration'] ?? null;
        if (!is_string($duration) || !preg_match('/^(\d+(?:\.\d+)?)s$/D', $duration, $match)) { throw new \InvalidArgumentException('Missing route measurements.'); }
        $seconds = (float) $match[1];
        if ($leg && !array_key_exists('distanceMeters', $value) && $seconds === 0.0) {
            $start = self::point($value['startLocation']['latLng'] ?? null);
            $end = self::point($value['endLocation']['latLng'] ?? null);
            if (abs($start['latitude'] - $end['latitude']) < 0.00000001 && abs($start['longitude'] - $end['longitude']) < 0.00000001) { $distance = 0; }
        }
        if (!is_numeric($distance)) { throw new \InvalidArgumentException('Missing route distance.'); }
        $distance = (float) $distance;
        if (!is_finite($distance) || !is_finite($seconds) || $distance < 0 || $distance > 100000000 || $seconds < 0 || $seconds > 31536000) { throw new \InvalidArgumentException('Route measurements are out of range.'); }
        return ['distanceMeters' => $distance, 'durationSeconds' => $seconds];
    }

    private static function error(string $code, string $message, int $status = 400): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status]);
    }
}
