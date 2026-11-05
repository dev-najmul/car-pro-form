<?php
/** Signed capabilities for isolated fixtures that deliberately age anti-bot clocks. */
if (!defined('WP_CLI') || !WP_CLI || wp_get_environment_type() !== 'local') { exit('Local WP-CLI fixtures only.'); }

function tuxano_test_session_proof(string $token, int $created, ?int $expires = null, ?string $site = null): string
{
    $expires = $expires ?? time() + 7 * DAY_IN_SECONDS;
    $payload = 'tuxano-session-v1|' . ($site ?? home_url('/')) . '|' . $token . '|' . $created . '|' . $expires;
    return 'v1.' . $created . '.' . $expires . '.' . hash_hmac('sha256', $payload, wp_salt('secure_auth'));
}

/** Functional fixtures supply a valid capability unless explicitly testing rejection. */
function tuxano_test_session_headers(string $token, array $headers): array
{
    foreach (array_keys($headers) as $name) {
        if (strtolower((string) $name) === 'x-tuxano-recovery') { return $headers; }
    }
    $session = $token !== '' ? get_transient('tuxano_session_' . hash('sha256', $token)) : false;
    if (is_array($session) && ($session['protocol'] ?? '') === 'v1' && is_int($session['created'] ?? null)) {
        $headers['X-Tuxano-Recovery'] = tuxano_test_session_proof($token, $session['created']);
    }
    return $headers;
}
