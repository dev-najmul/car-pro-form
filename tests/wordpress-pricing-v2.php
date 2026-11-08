<?php
/** Read-only calculator cases; run directly with PHP CLI or through local WP-CLI. */
use Tuxano\Booking\Pricing;

if (PHP_SAPI !== 'cli') { exit('CLI calculator checks only.'); }
if (!defined('ABSPATH')) { define('ABSPATH', dirname(__DIR__) . '/'); }
if (!class_exists(Pricing::class)) { require_once dirname(__DIR__) . '/wordpress/tuxano-booking/includes/Pricing.php'; }

$fixture = json_decode((string) file_get_contents(__DIR__ . '/fixtures/pricing-v2.json'), true);
if (!is_array($fixture) || !isset($fixture['cases'], $fixture['baseTariff'], $fixture['settings'])) { throw new RuntimeException('Missing service-pricing fixture.'); }
$checks = 0;
$assert = static function (bool $condition, string $message) use (&$checks): void {
    $checks++;
    if (!$condition) { throw new RuntimeException($message); }
};
$close = static function ($actual, $expected): bool {
    return is_numeric($actual) && is_numeric($expected) && abs((float) $actual - (float) $expected) < 0.00000001;
};
$tariff_for = static function (array $sample) use ($fixture): array {
    return $sample['legacyTariff'] ?? array_replace_recursive($fixture['baseTariff'], $sample['tariff'] ?? []);
};
$calculate = static function (array $sample, ?array $tariff = null, ?array $route = null) use ($fixture, $tariff_for): array {
    return Pricing::calculate(['capacity' => 6, 'tariff' => $tariff ?? $tariff_for($sample)], $route ?? $sample['route'], $sample['booking'], $fixture['settings']);
};
$throws = static function (callable $operation, string $message) use ($assert): void {
    try { $operation(); }
    catch (InvalidArgumentException $error) { $assert(true, $message); return; }
    $assert(false, $message);
};

foreach ($fixture['cases'] as $sample) {
    $tariff = $tariff_for($sample); $original_tariff = $tariff; $route = $sample['route']; $original_route = $route;
    $result = $calculate($sample, $tariff, $route);
    foreach ($sample['expectedFare'] as $field => $expected) {
        $actual = $result['fare'][$field] ?? null;
        $assert(is_numeric($expected) ? $close($actual, $expected) : $actual === $expected, $sample['name'] . ': incorrect fare ' . $field);
    }
    foreach ($sample['expectedPricing'] as $field => $expected) {
        $assert($close($result[$field] ?? null, $expected), $sample['name'] . ': incorrect full price ' . $field);
    }
    $assert($tariff === $original_tariff && $route === $original_route, $sample['name'] . ': accepted snapshots were mutated');
    $assert($close($result['fare']['totalDurationSeconds'], $route['durationSeconds'] + $result['fare']['waitingMinutes'] * 60), $sample['name'] . ': waiting must contribute once to customer journey time');
}

$sample = $fixture['cases'][2];
$invalid = [
    static function (array &$tariff): void { unset($tariff['hourlyBooking']); },
    static function (array &$tariff): void { unset($tariff['transfer']); },
    static function (array &$tariff): void { $tariff['transfer'] = null; },
    static function (array &$tariff): void { $tariff['transfer']['version'] = 3; },
    static function (array &$tariff): void { $tariff['transfer']['version'] = '2'; },
    static function (array &$tariff): void { $tariff['transfer']['mode'] = 'combined'; },
    static function (array &$tariff): void { $tariff['hourlyBooking'] = []; },
    static function (array &$tariff): void { $tariff['hourlyBooking']['perMile'] = -1; },
    static function (array &$tariff): void { $tariff['hourlyBooking']['hourly'] = 1000001; },
    static function (array &$tariff): void { $tariff['transfer']['pickupFreeMinutes'] = -1; },
    static function (array &$tariff): void { $tariff['transfer']['returnFreeMinutes'] = 1441; },
    static function (array &$tariff): void { $tariff['transfer']['pickupFreeMiles'] = INF; },
    static function (array &$tariff): void { $tariff['transfer']['returnFreeMiles'] = 100001; },
    static function (array &$tariff): void { $tariff['transfer']['roundingMinutes'] = 0; },
    static function (array &$tariff): void { $tariff['transfer']['roundingMinutes'] = 1.5; },
    static function (array &$tariff): void { $tariff['transfer']['minimumMinutes'] = 0; },
    static function (array &$tariff): void { $tariff['transfer']['minimumMinutes'] = 1441; },
];
foreach ($invalid as $mutate) {
    $tariff = $tariff_for($sample); $mutate($tariff);
    $throws(static fn() => $calculate($sample, $tariff), 'Invalid or incomplete modern profiles must not become legacy fares.');
}
foreach (['mileage', 'time'] as $mode) {
    $tariff = $tariff_for($sample); $tariff['transfer']['mode'] = $mode;
    foreach ([
        static function (array &$route): void { unset($route['transferLegs']); },
        static function (array &$route): void { unset($route['transferLegs']['return']); },
        static function (array &$route): void { $route['transferLegs']['pickup'] = null; },
        static function (array &$route): void { $route['transferLegs']['return']['durationSeconds'] = -1; },
        static function (array &$route): void { $route['transferLegs']['pickup']['distanceMeters'] = INF; },
        static function (array &$route): void { $route['transferLegs']['pickup']['durationSeconds'] = 60000001; },
        static function (array &$route): void { $route['transferLegs']['return']['distanceMeters'] = 1000000001; },
    ] as $mutate) {
        $route = $sample['route']; $mutate($route);
        $throws(static fn() => $calculate($sample, $tariff, $route), 'New transfers require both verified nonnegative service-base legs.');
    }
}

$hourly_sample = $fixture['cases'][13];
$original = $calculate($hourly_sample);
$tariff = $tariff_for($hourly_sample);
$tariff['hourly'] = 999; $tariff['perMile'] = 888; $tariff['perWaitingMinute'] = 777; $tariff['minimum'] = 666;
$route = $hourly_sample['route']; $route['transferLegs'] = ['pickup' => null, 'return' => null];
$assert($calculate($hourly_sample, $tariff, $route) === $original, 'Hourly prices must use their own rates and ignore deadhead legs.');

$tariff = $tariff_for($sample); $tariff['perMile'] = 1000000;
$route = $sample['route']; $route['distanceMeters'] = 1000000000;
$throws(static fn() => $calculate($sample, $tariff, $route), 'Unrepresentable modern fares must be rejected.');

echo 'Success: Read-only Transfer/Hourly calculator checks passed: ' . $checks . PHP_EOL;
