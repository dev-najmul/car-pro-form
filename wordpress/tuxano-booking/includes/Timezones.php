<?php
/** Offline, exact geographic pickup zones and date-aware schedule formatting. */
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Timezones
{
    public const DEFAULT_ZONE = 'America/New_York';
    private static $index;
    private static $names;

    /** Resolve a selected coordinate without another API, key or remote service. */
    public static function resolve(float $latitude, float $longitude): string
    {
        if (!is_finite($latitude) || !is_finite($longitude) || abs($latitude) > 90 || abs($longitude) > 180) { throw new \InvalidArgumentException('Choose a valid pickup point to determine its time zone.'); }
        if (self::$index === null) {
            $raw = file_get_contents(TUXANO_BOOKING_DIR . 'data/timezones/index.json');
            self::$index = is_string($raw) ? json_decode($raw, true, 64) : null;
        }
        if (!is_array(self::$index) || !isset(self::$index['lookup'], self::$index['timezones'])) { throw new \RuntimeException('Pickup time-zone data is unavailable.'); }
        $lat = max(-89.9999, min(89.9999, $latitude)); $lon = max(-179.9999, min(179.9999, $longitude));
        $top = 89.9999; $bottom = -89.9999; $left = -179.9999; $right = 179.9999;
        $node = self::$index['lookup'];
        for ($depth = 0; $depth < 32; ++$depth) {
            $mid_lat = ($top + $bottom) / 2; $mid_lon = ($left + $right) / 2;
            if ($lat >= $mid_lat && $lon >= $mid_lon) { $quad = 'a'; $bottom = $mid_lat; $left = $mid_lon; }
            elseif ($lat >= $mid_lat) { $quad = 'b'; $bottom = $mid_lat; $right = $mid_lon; }
            elseif ($lon < $mid_lon) { $quad = 'c'; $top = $mid_lat; $right = $mid_lon; }
            else { $quad = 'd'; $top = $mid_lat; $left = $mid_lon; }
            $node = is_array($node) ? ($node[$quad] ?? null) : null;
            if (!$node) { return self::ocean($longitude); }
            if (isset($node['pos'], $node['len'])) {
                $file = fopen(TUXANO_BOOKING_DIR . 'data/timezones/tiles.dat', 'rb');
                if (!$file) { throw new \RuntimeException('Pickup time-zone boundaries are unavailable.'); }
                try {
                    if (fseek($file, (int) $node['pos']) !== 0) { throw new \RuntimeException('Pickup time-zone boundaries could not be read.'); }
                    $bytes = ''; $length = (int) $node['len'];
                    while (strlen($bytes) < $length && !feof($file)) { $part = fread($file, $length - strlen($bytes)); if ($part === false || $part === '') { break; } $bytes .= $part; }
                } finally { fclose($file); }
                if (strlen($bytes) !== $length) { throw new \RuntimeException('Pickup time-zone boundaries are incomplete.'); }
                $decoded = gzdecode($bytes, 2097152);
                if (!is_string($decoded)) { throw new \RuntimeException('Pickup time-zone boundaries are invalid.'); }
                if ((self::$index['format'] ?? '') !== 'tzb1-grouped-v1') { throw new \RuntimeException('Pickup time-zone data version is unsupported.'); }
                $tile = substr($decoded, (int) $node['offset'], (int) $node['bytes']);
                $matches = self::binary_zones($tile, $longitude, $latitude);
                return $matches ? self::one_zone($matches) : self::ocean($longitude);
            }
            if (isset($node[0]) && is_int($node[0])) {
                $zones = [];
                foreach ($node as $id) { if (isset(self::$index['timezones'][$id])) { $zones[] = self::$index['timezones'][$id]; } }
                return self::one_zone($zones);
            }
        }
        throw new \RuntimeException('Pickup time-zone lookup exceeded its data bounds.');
    }

    private static function one_zone(array $zones): string
    {
        $zones = array_values(array_unique($zones));
        if (count($zones) !== 1) { throw new \InvalidArgumentException('This point is on a time-zone boundary. Choose an exact pickup address away from the boundary, or contact the booking team.'); }
        try { new \DateTimeZone($zones[0]); } catch (\Exception $error) { throw new \RuntimeException('This pickup time zone is not supported by the server.'); }
        return $zones[0];
    }

    private static function ocean(float $longitude): string
    {
        $offset = (int) floor(($longitude + 7.5) / 15);
        $offset = max(-12, min(12, $offset));
        return $offset === 0 ? 'Etc/GMT' : 'Etc/GMT' . ($offset > 0 ? '-' : '+') . abs($offset);
    }

    /** Read the compact lossless tile in constant space, including its holes. */
    private static function binary_zones(string $tile, float $x, float $y): array
    {
        if (substr($tile, 0, 4) !== 'TZB1') { throw new \RuntimeException('Pickup time-zone tile is invalid.'); }
        $cursor = 4; $matches = []; $features = self::uint($tile, $cursor);
        for ($feature = 0; $feature < $features; ++$feature) {
            $zone = self::uint($tile, $cursor); $polygons = self::uint($tile, $cursor); $contains = false;
            for ($polygon = 0; $polygon < $polygons; ++$polygon) {
                $rings = self::uint($tile, $cursor); $outer = false; $hole = false;
                for ($ring = 0; $ring < $rings; ++$ring) {
                    $inside = self::binary_ring($tile, $cursor, $x, $y);
                    if ($ring === 0) { $outer = $inside; } elseif ($inside) { $hole = true; }
                }
                if ($outer && !$hole) { $contains = true; }
            }
            if ($contains && isset(self::$index['timezones'][$zone])) { $matches[] = self::$index['timezones'][$zone]; }
        }
        if ($cursor !== strlen($tile)) { throw new \RuntimeException('Pickup time-zone tile has invalid bounds.'); }
        return $matches;
    }

    private static function uint(string $bytes, int &$cursor): int
    {
        $value = 0;
        for ($shift = 0; $shift <= 28 && $cursor < strlen($bytes); $shift += 7) {
            $byte = ord($bytes[$cursor++]); $value |= ($byte & 127) << $shift;
            if (($byte & 128) === 0) { return $value; }
        }
        throw new \RuntimeException('Pickup time-zone tile is truncated.');
    }

    private static function binary_ring(string $tile, int &$cursor, float $x, float $y): bool
    {
        $count = self::uint($tile, $cursor); $lng = 0; $lat = 0; $inside = false; $boundary = false; $xj = 0.0; $yj = 0.0; $first_x = 0.0; $first_y = 0.0;
        if ($count < 3) { throw new \RuntimeException('Pickup time-zone ring is invalid.'); }
        for ($point = 0; $point <= $count; ++$point) {
            if ($point === $count) { $xi = $first_x; $yi = $first_y; }
            else {
                $dx = self::uint($tile, $cursor); $dy = self::uint($tile, $cursor);
                $lng += ($dx & 1) ? -intdiv($dx + 1, 2) : intdiv($dx, 2);
                $lat += ($dy & 1) ? -intdiv($dy + 1, 2) : intdiv($dy, 2);
                $xi = $lng / 1000000; $yi = $lat / 1000000;
                if ($point === 0) { $first_x = $xi; $first_y = $yi; }
            }
            if ($point > 0) {
                $cross = ($x - $xi) * ($yj - $yi) - ($y - $yi) * ($xj - $xi);
                if (abs($cross) < 1.0e-12 && $x >= min($xi, $xj) && $x <= max($xi, $xj) && $y >= min($yi, $yj) && $y <= max($yi, $yj)) { $boundary = true; }
                if (($yi > $y) !== ($yj > $y) && $x < ($xj - $xi) * ($y - $yi) / ($yj - $yi) + $xi) { $inside = !$inside; }
            }
            $xj = $xi; $yj = $yi;
        }
        return $boundary || $inside;
    }

    /** Validate wall time, rejecting both DST gaps and repeated ambiguous hours. */
    public static function local(string $date, string $time, ?string $timezone = null, bool $allow_legacy_fold = false): \DateTimeImmutable
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $time)) { throw new \InvalidArgumentException('Choose a valid pickup date and time.'); }
        try { $zone = new \DateTimeZone($timezone ?: self::DEFAULT_ZONE); }
        catch (\Exception $error) { throw new \InvalidArgumentException('The pickup time zone is invalid. Contact the booking team.'); }
        $wall = $date . ' ' . $time;
        $local = \DateTimeImmutable::createFromFormat('!Y-m-d H:i', $wall, $zone);
        if (!$local || $local->format('Y-m-d H:i') !== $wall || (int) $local->format('Y') < 1970 || (int) $local->format('Y') > 2100) { throw new \InvalidArgumentException('This pickup date or time does not exist in the pickup time zone. Choose another time.'); }
        $transitions = $zone->getTransitions($local->getTimestamp() - 172800, $local->getTimestamp() + 172800);
        if (is_array($transitions) && !$allow_legacy_fold) {
            $naive = \DateTimeImmutable::createFromFormat('!Y-m-d H:i', $wall, new \DateTimeZone('UTC'))->getTimestamp();
            $candidates = [];
            foreach ($transitions as $transition) {
                $stamp = $naive - (int) $transition['offset'];
                if ((new \DateTimeImmutable('@' . $stamp))->setTimezone($zone)->format('Y-m-d H:i') === $wall) { $candidates[$stamp] = true; }
            }
            if (count($candidates) > 1) { throw new \InvalidArgumentException('This pickup time occurs twice when daylight saving time ends. Choose a time outside the repeated hour, or contact the booking team.'); }
        }
        return $local;
    }

    public static function label(string $timezone, ?string $date = null): string
    {
        if (preg_match('~^(?:US/(?:Eastern|Michigan)|America/(?:New_York|Detroit|Indiana/(?:Indianapolis|Marengo|Petersburg|Vevay|Vincennes|Winamac)|Kentucky/(?:Louisville|Monticello)))$~D', $timezone)) { return 'Eastern Time'; }
        if (preg_match('~^(?:US/Central|America/(?:Chicago|Menominee|Indiana/(?:Knox|Tell_City)|North_Dakota/(?:Beulah|Center|New_Salem)))$~D', $timezone)) { return 'Central Time'; }
        if (in_array($timezone, ['America/Denver', 'America/Boise', 'America/Phoenix', 'US/Mountain', 'US/Arizona'], true)) { return 'Mountain Time'; }
        if (in_array($timezone, ['America/Los_Angeles', 'US/Pacific'], true)) { return 'Pacific Time'; }
        if (in_array($timezone, ['America/Anchorage', 'America/Juneau', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska'], true)) { return 'Alaska Time'; }
        if (in_array($timezone, ['Pacific/Honolulu', 'US/Hawaii'], true)) { return 'Hawaii-Aleutian Time'; }
        if (in_array($timezone, ['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', '+00:00'], true)) { return 'Coordinated Universal Time'; }
        if (self::$names === null) { $raw = file_get_contents(TUXANO_BOOKING_DIR . 'data/timezones/names.json'); self::$names = is_string($raw) ? json_decode($raw, true) : []; }
        if (isset(self::$names[$timezone]) && is_string(self::$names[$timezone])) { return self::$names[$timezone]; }
        if (class_exists('IntlTimeZone')) { $name = \IntlTimeZone::createTimeZone($timezone)->getDisplayName(false, \IntlTimeZone::GENERIC_LONG, 'en'); if (is_string($name) && $name !== '') { return $name; } }
        try { $zone = new \DateTimeZone($timezone); $offset = $zone->getOffset(new \DateTimeImmutable(($date ?: 'now') . ($date ? ' 12:00:00' : ''), $zone)); }
        catch (\Exception $error) { return 'Time zone unavailable'; }
        return 'UTC' . ($offset < 0 ? '−' : '+') . sprintf('%02d:%02d', intdiv(abs($offset), 3600), intdiv(abs($offset) % 3600, 60));
    }

    public static function display(string $date, string $time, ?string $timezone = null): string
    {
        $zone = $timezone ?: self::DEFAULT_ZONE;
        return self::local($date, $time, $zone, true)->format('F j, Y \a\t g:i A') . ' (' . self::label($zone, $date) . ')';
    }
}
