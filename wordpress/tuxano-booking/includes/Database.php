<?php
namespace Tuxano\Booking;

defined('ABSPATH') || exit;

final class Database
{
    public const STATUSES = ['new', 'reviewing', 'confirmed', 'cancelled', 'completed'];

    public static function table(): string
    {
        global $wpdb;
        return $wpdb->prefix . 'tuxano_bookings';
    }

    public static function install(): void
    {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = self::table();
        $collation = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            reference varchar(40) NOT NULL,
            request_key char(64) NOT NULL,
            request_hash char(64) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'new',
            created_at datetime NOT NULL,
            pickup_at datetime NOT NULL,
            customer_name varchar(200) NOT NULL,
            customer_email varchar(254) NOT NULL,
            vehicle_name varchar(200) NOT NULL,
            total decimal(14,2) NOT NULL,
            currency char(3) NOT NULL,
            payload longtext NOT NULL,
            pricing longtext NOT NULL,
            route longtext NOT NULL,
            notes text NOT NULL,
            customer_mail varchar(20) NOT NULL DEFAULT 'pending',
            admin_mail varchar(20) NOT NULL DEFAULT 'pending',
            customer_mail_started datetime DEFAULT NULL,
            admin_mail_started datetime DEFAULT NULL,
            revision bigint(20) unsigned NOT NULL DEFAULT 1,
            updated_at datetime DEFAULT NULL,
            history longtext DEFAULT NULL,
            update_mail varchar(20) NOT NULL DEFAULT 'disabled',
            update_mail_revision bigint(20) unsigned NOT NULL DEFAULT 0,
            update_mail_started datetime DEFAULT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY reference (reference),
            UNIQUE KEY request_key (request_key),
            KEY status_created (status,created_at),
            KEY customer_email (customer_email(100)),
            KEY pickup_at (pickup_at)
        ) {$collation};");
        update_option('tuxano_booking_db_version', TUXANO_BOOKING_VERSION, false);
    }

    public static function find(int $id): ?array
    {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE id = %d', $id), ARRAY_A);
        if (!$row) { return null; }
        foreach (['payload', 'pricing', 'route', 'history'] as $column) {
            $row[$column] = json_decode((string) ($row[$column] ?? ''), true) ?: [];
        }
        $row['revision'] = max(1, (int) ($row['revision'] ?? 1));
        return $row;
    }

    public static function by_request(string $key): ?array
    {
        global $wpdb;
        $id = $wpdb->get_var($wpdb->prepare('SELECT id FROM ' . self::table() . ' WHERE request_key = %s', $key));
        return $id ? self::find((int) $id) : null;
    }

    /** @return int|\WP_Error */
    public static function insert(array $row)
    {
        global $wpdb;
        // Suppress duplicate-key SQL output; a racing retry reads the winning row.
        $previous = $wpdb->suppress_errors(true);
        $success = $wpdb->insert(self::table(), $row);
        $wpdb->suppress_errors($previous);
        return $success ? (int) $wpdb->insert_id : new \WP_Error('booking_save_failed', __('The request could not be saved. Please retry; your details are still on this page.', 'tuxano-booking'), ['status' => 503]);
    }

    public static function listing(array $filters = []): array
    {
        global $wpdb;
        $where = ['1=1']; $values = [];
        if (!empty($filters['search'])) {
            $where[] = '(reference LIKE %s OR customer_name LIKE %s OR customer_email LIKE %s OR vehicle_name LIKE %s)';
            $term = '%' . $wpdb->esc_like(mb_substr((string) $filters['search'], 0, 200)) . '%';
            array_push($values, $term, $term, $term, $term);
        }
        if (in_array($filters['status'] ?? '', self::STATUSES, true)) { $where[] = 'status = %s'; $values[] = $filters['status']; }
        foreach (['from' => '>=', 'to' => '<='] as $key => $operator) {
            $date = $filters[$key] ?? '';
            if (is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date)) {
                $where[] = 'pickup_at ' . $operator . ' %s'; $values[] = $date . ($key === 'from' ? ' 00:00:00' : ' 23:59:59');
            }
        }
        $clause = implode(' AND ', $where);
        $base = ' FROM ' . self::table() . ' WHERE ' . $clause;
        $query = static fn(string $sql, array $args): string => $args ? $wpdb->prepare($sql, ...$args) : $sql;
        $total = (int) $wpdb->get_var($query('SELECT COUNT(*)' . $base, $values));
        $limit = max(1, min(100, (int) ($filters['per_page'] ?? 20)));
        $page = max(1, min(max(1, (int) ceil($total / $limit)), (int) ($filters['page'] ?? 1)));
        $items = $wpdb->get_results($query('SELECT id,reference,status,created_at,pickup_at,customer_name,customer_email,vehicle_name,total,currency,customer_mail,admin_mail' . $base . ' ORDER BY id DESC LIMIT %d OFFSET %d', array_merge($values, [$limit, ($page - 1) * $limit])), ARRAY_A);
        return ['items' => $items ?: [], 'total' => $total, 'page' => $page];
    }

    public static function counts(): array
    {
        global $wpdb;
        $counts = array_fill_keys(array_merge(['total'], self::STATUSES), 0);
        foreach ($wpdb->get_results('SELECT status,COUNT(*) AS count FROM ' . self::table() . ' GROUP BY status', ARRAY_A) ?: [] as $row) {
            $counts['total'] += (int) $row['count'];
            if (isset($counts[$row['status']])) { $counts[$row['status']] = (int) $row['count']; }
        }
        return $counts;
    }

    /** @return bool|\WP_Error */
    public static function update(int $id, array $changes)
    {
        global $wpdb;
        $clean = [];
        if (isset($changes['status'])) {
            if (!in_array($changes['status'], self::STATUSES, true)) { return new \WP_Error('invalid_status', __('Invalid request status.', 'tuxano-booking')); }
            $clean['status'] = $changes['status'];
        }
        if (isset($changes['notes'])) { $clean['notes'] = mb_substr(sanitize_textarea_field((string) $changes['notes']), 0, 10000); }
        $row = self::find($id);
        if (!$clean || !$row) { return new \WP_Error('missing_booking', __('Request not found.', 'tuxano-booking')); }
        $entry = ['changes' => []];
        foreach ($clean as $key => $value) {
            if ($row[$key] !== $value) { $entry['changes'][$key] = ['old' => $row[$key], 'new' => $value]; }
        }
        if (!$entry['changes']) { return true; }
        $result = self::revise($id, (int) $row['revision'], $clean, $entry);
        return is_wp_error($result) ? $result : true;
    }

    /**
     * Atomically replace an administrator revision and its audit entry. All
     * checks and the audit append are persisted in one compare-and-swap write.
     * This internal data method is called only by capability-checked services.
     *
     * @return array|\WP_Error
     */
    public static function revise(int $id, int $expected, array $changes, array $entry)
    {
        global $wpdb;
        $row = self::find($id);
        if (!$row) { return new \WP_Error('tuxano_booking_missing', __('Request not found.', 'tuxano-booking'), ['status' => 404]); }
        if ($expected < 1 || (int) $row['revision'] !== $expected) {
            return new \WP_Error('tuxano_edit_conflict', __('This request was changed by another administrator. Reload it before saving your changes.', 'tuxano-booking'), ['status' => 409]);
        }
        $allowed = ['status', 'notes', 'pickup_at', 'customer_name', 'customer_email', 'vehicle_name', 'total', 'currency', 'payload', 'pricing', 'route', 'update_mail', 'update_mail_revision', 'update_mail_started'];
        $clean = array_intersect_key($changes, array_flip($allowed));
        if (!$clean) { return new \WP_Error('tuxano_edit_validation', __('There are no request changes to save.', 'tuxano-booking'), ['status' => 400]); }
        $next = $expected + 1;
        $entry['revision'] = $next;
        $entry['actor'] = get_current_user_id();
        $entry['at'] = current_time('mysql', true);
        $history = is_array($row['history']) ? $row['history'] : [];
        if (!$history) {
            // Keep the original accepted request even after contact, itinerary
            // or rate changes. It is never returned by the public API.
            $entry['original'] = array_intersect_key($row, array_flip(['payload', 'pricing', 'route', 'status', 'notes', 'customer_name', 'customer_email', 'vehicle_name', 'pickup_at']));
        }
        $history[] = $entry;
        foreach (['payload', 'pricing', 'route'] as $column) {
            if (isset($clean[$column]) && is_array($clean[$column])) { $clean[$column] = wp_json_encode($clean[$column]); }
        }
        $clean['revision'] = $next;
        $clean['updated_at'] = $entry['at'];
        $clean['history'] = wp_json_encode($history);
        $success = $wpdb->update(self::table(), $clean, ['id' => $id, 'revision' => $expected]);
        if ($success === false) { return new \WP_Error('tuxano_edit_storage', __('The request could not be updated. Your previous saved request is unchanged.', 'tuxano-booking'), ['status' => 503]); }
        if ($success !== 1) { return new \WP_Error('tuxano_edit_conflict', __('This request was changed by another administrator. Reload it before saving your changes.', 'tuxano-booking'), ['status' => 409]); }
        return self::find($id);
    }

    /** @return int|\WP_Error */
    public static function bulk_delete(array $ids)
    {
        if (!current_user_can('manage_options')) { return new \WP_Error('tuxano_admin_forbidden', __('You cannot delete requests.', 'tuxano-booking'), ['status' => 403]); }
        if (!$ids || count($ids) > 100) { return new \WP_Error('tuxano_bulk_selection', __('Select between 1 and 100 requests to delete.', 'tuxano-booking'), ['status' => 400]); }
        $clean = [];
        foreach ($ids as $id) {
            if ((!is_int($id) && !is_string($id)) || !preg_match('/^[1-9][0-9]{0,18}$/D', (string) $id) || filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                return new \WP_Error('tuxano_bulk_selection', __('A selected request ID is invalid.', 'tuxano-booking'), ['status' => 400]);
            }
            $clean[] = (int) $id;
        }
        $clean = array_values(array_unique($clean));
        global $wpdb;
        $placeholders = implode(',', array_fill(0, count($clean), '%d'));
        $deleted = $wpdb->query($wpdb->prepare('DELETE FROM ' . self::table() . " WHERE id IN ({$placeholders})", ...$clean));
        return $deleted === false ? new \WP_Error('tuxano_bulk_storage', __('The selected requests could not be deleted.', 'tuxano-booking'), ['status' => 503]) : (int) $deleted;
    }

    public static function delete(int $id): bool
    {
        global $wpdb;
        return $wpdb->delete(self::table(), ['id' => $id], ['%d']) === 1;
    }

    public static function maintenance(): void
    {
        global $wpdb;
        Rest::clean_rates();
        $days = (int) (Settings::get()['retention_days'] ?? 0);
        if ($days > 0) {
            // Bound each run; WP-Cron is best effort, never an exact retention deadline.
            $cutoff = gmdate('Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS);
            $wpdb->query($wpdb->prepare('DELETE FROM ' . self::table() . ' WHERE created_at < %s LIMIT 500', $cutoff));
        }
    }

    public static function privacy_export(string $email, int $page = 1): array
    {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare('SELECT id FROM ' . self::table() . ' WHERE customer_email = %s ORDER BY id LIMIT 50 OFFSET %d', sanitize_email($email), max(0, $page - 1) * 50), ARRAY_A);
        $data = [];
        foreach ($rows ?: [] as $item) {
            $row = self::find((int) $item['id']);
            // Private internal notes and server/request tokens are deliberately excluded.
            $data[] = ['group_id' => 'tuxano-bookings', 'group_label' => __('Transportation requests', 'tuxano-booking'), 'item_id' => 'tuxano-' . $row['id'], 'data' => [
                ['name' => 'Reference', 'value' => $row['reference']], ['name' => 'Created (UTC)', 'value' => $row['created_at']],
                ['name' => 'Request', 'value' => wp_json_encode($row['payload'])], ['name' => 'Pricing', 'value' => wp_json_encode($row['pricing'])],
            ]];
        }
        return ['data' => $data, 'done' => count($rows ?: []) < 50];
    }

    public static function privacy_erase(string $email, int $page = 1): array
    {
        global $wpdb;
        // Delete the first remaining batch each time so deletions cannot skip rows.
        $ids = $wpdb->get_col($wpdb->prepare('SELECT id FROM ' . self::table() . ' WHERE customer_email = %s ORDER BY id LIMIT 50', sanitize_email($email)));
        $removed = false;
        foreach ($ids ?: [] as $id) { $removed = self::delete((int) $id) || $removed; }
        return ['items_removed' => $removed, 'items_retained' => false, 'messages' => [], 'done' => count($ids ?: []) < 50];
    }
}
