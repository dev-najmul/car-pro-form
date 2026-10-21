<?php
/** Server-authoritative fare calculation shared with the frontend's documented formula. */

namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Pricing
{
    private const METERS_PER_MILE = 1609.344;

    /**
     * Client-supplied prices are intentionally ignored. Monetary amounts are
     * rounded at the same stages as the shared JavaScript pricing module.
     *
     * @throws \InvalidArgumentException For an invalid route, tariff or option.
     * @return array<string,mixed>
     */
    public static function calculate(array $vehicle, array $route, array $booking, array $settings): array
    {
        $distance = self::number($route['distanceMeters'] ?? null, 0, 1000000000, 'route distance');
        $duration = self::number($route['durationSeconds'] ?? null, 0, 60000000, 'route duration');
        $tariff = $vehicle['tariff'] ?? null;
        if (!is_array($tariff)) {
            throw new \InvalidArgumentException('A complete vehicle tariff is required.');
        }
        foreach (['base', 'perMile', 'perDrivingMinute', 'minimum', 'perWaitingMinute', 'hourly'] as $key) {
            $tariff[$key] = self::number($tariff[$key] ?? null, 0, 1000000, 'vehicle tariff');
        }
        $trip = $booking['trip'] ?? null;
        if (!is_array($trip)) {
            throw new \InvalidArgumentException('Trip details are required.');
        }
        $service = $trip['service'] ?? 'transfer';
        if (!in_array($service, ['transfer', 'hourly'], true)) {
            throw new \InvalidArgumentException('Unknown service type.');
        }
        $stops = $trip['stops'] ?? [];
        $max_stops = self::integer($settings['max_stops'] ?? 5, 0, 5, 'maximum stops');
        if (!is_array($stops) || $stops !== array_values($stops) || count($stops) > $max_stops) {
            throw new \InvalidArgumentException('Too many stops.');
        }
        $waiting_minutes = 0;
        foreach ($stops as $stop) {
            if (!is_array($stop)) {
                throw new \InvalidArgumentException('Invalid stop.');
            }
            $waiting_minutes += self::integer($stop['waitMinutes'] ?? null, 0, 120, 'stop waiting time');
        }
        if ($waiting_minutes > 600) {
            throw new \InvalidArgumentException('Stop waiting time exceeds the allowed maximum.');
        }
        $miles = $distance / self::METERS_PER_MILE;
        $driving_minutes = $duration / 60;
        if ($service === 'hourly') {
            $min_hours = self::integer($settings['min_hours'] ?? 2, 1, 24, 'minimum hours');
            $max_hours = self::integer($settings['max_hours'] ?? 12, $min_hours, 24, 'maximum hours');
            $hours = self::integer($trip['hours'] ?? null, $min_hours, $max_hours, 'booked hours');
            $driving_charge = max($hours, $driving_minutes / 60) * $tariff['hourly'] + $miles * $tariff['perMile'];
        } else {
            $driving_charge = max($tariff['minimum'], $tariff['base'] + $miles * $tariff['perMile'] + $driving_minutes * $tariff['perDrivingMinute']);
        }
        $waiting_charge = $waiting_minutes * $tariff['perWaitingMinute'];
        $transportation = self::round($driving_charge + $waiting_charge);

        $capacity = self::integer($vehicle['capacity'] ?? null, 1, 100, 'passenger capacity');
        $child = self::boolean($booking['child'] ?? false, 'child-seat option');
        $car = self::integer($booking['carSeats'] ?? 0, 0, $capacity, 'car seats');
        $booster = self::integer($booking['boosterSeats'] ?? 0, 0, $capacity, 'booster seats');
        if ($car + $booster > $capacity) {
            throw new \InvalidArgumentException('Child seats exceed the vehicle capacity.');
        }
        if (!$child) {
            $car = 0;
            $booster = 0;
        }
        $first = self::number($settings['first_seat_price'] ?? 75, 0, 1000000, 'first-seat price');
        $additional = self::number($settings['additional_seat_price'] ?? 50, 0, 1000000, 'additional-seat price');
        // The first-seat surcharge is allocated to a car seat, or to the first
        // booster if no car seat was requested. It is charged once per booking.
        $car_cost = self::round($car ? $first + ($car - 1) * $additional : 0);
        $booster_cost = self::round($booster ? ($car ? $booster * $additional : $first + ($booster - 1) * $additional) : 0);
        $meet = self::boolean($booking['meet'] ?? false, 'meet-and-greet option')
            ? self::round(self::number($settings['meet_price'] ?? 50, 0, 1000000, 'meet-and-greet price')) : 0.0;
        $in_person = self::boolean($booking['inPerson'] ?? false, 'in-person gratuity option');
        $gratuity = $booking['gratuity'] ?? ($settings['default_gratuity'] ?? 20);
        $percent = $in_person ? 0.0 : self::number(
            $gratuity === 'custom' ? ($booking['custom'] ?? null) : $gratuity,
            0,
            100,
            'gratuity percentage'
        );
        // Equivalent to Math.round(transportation * percent) / 100.
        $tip = floor($transportation * $percent + 0.5) / 100;
        $total = self::round($transportation + $car_cost + $booster_cost + $meet + $tip);
        if (!is_finite($total) || $total > 9999999999.99) {
            throw new \InvalidArgumentException('This journey exceeds the maximum supported fare.');
        }
        $currency = $settings['currency'] ?? 'USD';
        if (!is_string($currency) || !preg_match('/^[A-Z]{3}$/D', $currency)) {
            throw new \InvalidArgumentException('A valid currency is required.');
        }
        return [
            'transportation' => $transportation,
            'carCost' => $car_cost,
            'boosterCost' => $booster_cost,
            'seats' => self::round($car_cost + $booster_cost),
            'meet' => $meet,
            'percent' => $percent,
            'tip' => $tip,
            'total' => $total,
            'currency' => $currency,
            'fare' => [
                'drivingCharge' => self::round($driving_charge),
                'waitingCharge' => self::round($waiting_charge),
                'transportation' => $transportation,
                'miles' => $miles,
                'kilometers' => $distance / 1000,
                'drivingMinutes' => $driving_minutes,
                'waitingMinutes' => $waiting_minutes,
                'totalDurationSeconds' => $duration + $waiting_minutes * 60,
            ],
        ];
    }

    /** @param mixed $value Untrusted numeric input. */
    private static function number($value, float $min, float $max, string $label): float
    {
        if ((!is_int($value) && !is_float($value) && !is_string($value)) || (is_string($value) && !preg_match('/^\d+(?:\.\d+)?$/D', $value))) {
            throw new \InvalidArgumentException('Invalid ' . $label . '.');
        }
        $value = (float) $value;
        if (!is_finite($value) || $value < $min || $value > $max) {
            throw new \InvalidArgumentException('Invalid ' . $label . '.');
        }
        return $value;
    }

    /** @param mixed $value Untrusted integer input. */
    private static function integer($value, int $min, int $max, string $label): int
    {
        $number = self::number($value, $min, $max, $label);
        if (floor($number) !== $number) {
            throw new \InvalidArgumentException('Invalid ' . $label . '.');
        }
        return (int) $number;
    }

    /** @param mixed $value Untrusted boolean input. */
    private static function boolean($value, string $label): bool
    {
        if (!is_bool($value)) {
            throw new \InvalidArgumentException('Invalid ' . $label . '.');
        }
        return $value;
    }

    private static function round(float $value): float
    {
        return floor(($value + PHP_FLOAT_EPSILON) * 100 + 0.5) / 100;
    }
}
