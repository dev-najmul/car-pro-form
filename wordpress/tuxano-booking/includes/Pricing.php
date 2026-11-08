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
        $profiles = self::service_profiles($tariff);
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
        $breakdown = [];
        $waiting_rate = $tariff['perWaitingMinute'];
        if ($service === 'hourly') {
            $min_hours = self::integer($settings['min_hours'] ?? 3, 1, 24, 'minimum hours');
            $max_hours = self::integer($settings['max_hours'] ?? 24, $min_hours, 24, 'maximum hours');
            $hours = self::integer($trip['hours'] ?? null, $min_hours, $max_hours, 'booked hours');
            $hourly = $profiles ? $profiles['hourlyBooking'] : $tariff;
            $driving_charge = max($hours, $driving_minutes / 60) * $hourly['hourly'] + $miles * $hourly['perMile'];
            $waiting_rate = $hourly['perWaitingMinute'];
            if ($profiles) { $breakdown['pricingMode'] = 'hourly'; }
        } elseif ($profiles) {
            $transfer = $profiles['transfer'];
            $legs = self::transfer_legs($route);
            $breakdown['pricingMode'] = $transfer['mode'];
            if ($transfer['mode'] === 'time') {
                $pickup_minutes = max(0, $legs['pickup']['durationSeconds'] / 60 - $transfer['pickupFreeMinutes']);
                $passenger_minutes = ceil($driving_minutes / $transfer['roundingMinutes']) * $transfer['roundingMinutes'];
                $return_minutes = max(0, $legs['return']['durationSeconds'] / 60 - $transfer['returnFreeMinutes']);
                $billable_minutes = $pickup_minutes + $passenger_minutes + $return_minutes;
                $charged_minutes = max($transfer['minimumMinutes'], $billable_minutes);
                $driving_charge = $charged_minutes / 60 * $tariff['hourly'];
                $breakdown += ['billablePickupMinutes' => $pickup_minutes, 'roundedPassengerMinutes' => $passenger_minutes, 'billableReturnMinutes' => $return_minutes, 'billableMinutes' => $billable_minutes, 'chargedMinutes' => $charged_minutes];
            } else {
                $pickup_miles = max(0, $legs['pickup']['distanceMeters'] / self::METERS_PER_MILE - $transfer['pickupFreeMiles']);
                $return_miles = max(0, $legs['return']['distanceMeters'] / self::METERS_PER_MILE - $transfer['returnFreeMiles']);
                $billable_miles = $pickup_miles + $miles + $return_miles;
                $driving_charge = max($tariff['minimum'], $billable_miles * $tariff['perMile']);
                $breakdown += ['billablePickupMiles' => $pickup_miles, 'passengerMiles' => $miles, 'billableReturnMiles' => $return_miles, 'billableMiles' => $billable_miles];
            }
        } else {
            // Flat-only saved snapshots keep their original accepted formula.
            $driving_charge = max($tariff['minimum'], $tariff['base'] + $miles * $tariff['perMile'] + $driving_minutes * $tariff['perDrivingMinute']);
        }
        $waiting_charge = $waiting_minutes * $waiting_rate;
        if ($profiles && $service === 'transfer') {
            $driving_charge = self::round($driving_charge);
            $waiting_charge = self::round($waiting_charge);
        }
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
            ] + $breakdown,
        ];
    }

    /** Old flat snapshots stay legacy; a partially present new profile is invalid. */
    private static function service_profiles(array $tariff): ?array
    {
        if (!array_key_exists('transfer', $tariff) && !array_key_exists('hourlyBooking', $tariff)) { return null; }
        $transfer = $tariff['transfer'] ?? null;
        $hourly = $tariff['hourlyBooking'] ?? null;
        if (!is_array($transfer) || ($transfer['version'] ?? null) !== 2 || !in_array($transfer['mode'] ?? null, ['time', 'mileage'], true) || !is_array($hourly)) {
            throw new \InvalidArgumentException('Complete Transfer and Hourly pricing settings are required.');
        }
        foreach (['pickupFreeMinutes', 'returnFreeMinutes'] as $key) { $transfer[$key] = self::number($transfer[$key] ?? null, 0, 1440, 'complimentary travel minutes'); }
        foreach (['pickupFreeMiles', 'returnFreeMiles'] as $key) { $transfer[$key] = self::number($transfer[$key] ?? null, 0, 100000, 'complimentary travel miles'); }
        foreach (['roundingMinutes', 'minimumMinutes'] as $key) { $transfer[$key] = self::integer($transfer[$key] ?? null, 1, 1440, 'transfer charged minutes'); }
        foreach (['hourly', 'perMile', 'perWaitingMinute'] as $key) { $hourly[$key] = self::number($hourly[$key] ?? null, 0, 1000000, 'hourly booking tariff'); }
        return ['transfer' => $transfer, 'hourlyBooking' => $hourly];
    }

    /** Service-base legs are supplied by a verified route, never defaulted to zero. */
    private static function transfer_legs(array $route): array
    {
        $legs = $route['transferLegs'] ?? null;
        if (!is_array($legs) || !is_array($legs['pickup'] ?? null) || !is_array($legs['return'] ?? null)) {
            throw new \InvalidArgumentException('Verified service-base pickup and return routes are required.');
        }
        foreach (['pickup', 'return'] as $key) {
            $legs[$key]['distanceMeters'] = self::number($legs[$key]['distanceMeters'] ?? null, 0, 1000000000, 'service-base route distance');
            $legs[$key]['durationSeconds'] = self::number($legs[$key]['durationSeconds'] ?? null, 0, 60000000, 'service-base route duration');
        }
        return $legs;
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
