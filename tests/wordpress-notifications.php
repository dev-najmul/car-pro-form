<?php
/** Read-only email rendering assertions. No real mail or booking is created. */
use Tuxano\Booking\Notifications;
use Tuxano\Booking\Settings;

if (!defined('WP_CLI') || !WP_CLI || wp_get_environment_type() !== 'local') {
    exit('Run only with WP-CLI in the isolated local WordPress installation.');
}
$checks = 0;
$check = static function (bool $condition, string $message) use (&$checks): void {
    if (!$condition) { throw new RuntimeException($message); }
    ++$checks;
};
$settings = array_replace(Settings::defaults(), ['company_name' => 'TUXANO', 'support_email' => 'support@example.test', 'support_phone' => '+1 717 555 0100', 'website' => 'https://example.test/']);
$row = [
    'id' => 900001, 'reference' => 'TUX-2026-NOTIFICATIONTEST', 'status' => 'new', 'revision' => 1,
    'customer_email' => 'rider@example.test', 'vehicle_name' => 'Luxury SUV', 'currency' => 'USD',
    'pricing' => ['currency' => 'USD', 'transportation' => 175, 'meet' => 50, 'carCost' => 75, 'boosterCost' => 0, 'percent' => 20, 'tip' => 35, 'total' => 335, 'fare' => ['waitingCharge' => 15]],
    'route' => ['distanceMeters' => 32186.88, 'durationSeconds' => 1800],
    'notes' => 'INTERNAL_SECRET_NOTE', 'request_key' => 'PRIVATE_IDEMPOTENCY_KEY',
    'payload' => [
        'trip' => ['service' => 'transfer', 'date' => '2027-11-08', 'time' => '14:30', 'timezone' => 'America/New_York', 'pickup' => 'Pickup & Plaza, New York', 'dropoff' => 'JFK Airport, Queens', 'stops' => [['text' => 'A customer stop', 'waitMinutes' => 5]]],
        'vehicle' => '111', 'passengers' => 3, 'luggage' => 2, 'carSeats' => 1, 'boosterSeats' => 0,
        'billing' => ['first' => 'Ada & Co', 'last' => 'Customer', 'email' => 'rider@example.test', 'phone' => '+1 717 555 0100', 'street' => '123 Test Street', 'city' => 'New York', 'country' => 'United States', 'notes' => 'Customer-visible billing note'],
        'passenger' => ['first' => 'Ada', 'last' => 'Customer', 'mobile' => '+1 717 555 0101'],
        'special' => 'Customer-visible request',
        'vehicleSnapshot' => ['id' => '111', 'image' => 'https://example.test/car.png', 'models' => ['GMC Yukon Denali'], 'capacity' => 6, 'luggageCapacity' => 6],
    ],
    'history' => [],
];
foreach (['customer', 'admin'] as $kind) {
    $html = Notifications::template($row, $settings, $kind);
    $plain = Notifications::plain_text($row, $settings, $kind);
    foreach (['#0a121f', 'tuxano-wordmark.png', 'TUX-2026-NOTIFICATIONTEST', 'Ada &amp; Co', 'Pickup &amp; Plaza', 'USD 335.00', 'Pricing summary', 'Vehicle selected', 'November 8, 2027 at 2:30 PM (Eastern Time)'] as $needle) {
        $check(strpos($html, $needle) !== false, 'Initial ' . $kind . ' email must include ' . $needle);
    }
    $check(($kind === 'admin') === (strpos($html, 'Review in WordPress') !== false), 'Private administrator link must be scoped to admin mail.');
    $check(($kind === 'customer') === (strpos($html, 'WHAT HAPPENS NEXT?') !== false), 'Next steps belong only to the initial customer request.');
    $check(strpos($plain, 'ESTIMATED TOTAL: USD 335.00') !== false && strpos($plain, 'Vehicle: Luxury SUV') !== false && strpos($plain, 'not a payment receipt') !== false, 'The plain alternative must include the estimate and payment qualification.');
    foreach (['INTERNAL_SECRET_NOTE', 'PRIVATE_IDEMPOTENCY_KEY', 'beforePricing', 'notificationRequested'] as $private) {
        $check(strpos($html . $plain, $private) === false, 'Private storage data must not enter email.');
    }
}
$custom = $settings;
$custom['company_name'] = 'A Different Company';
$custom['email_logo_url'] = 'https://example.test/custom-logo.png?variant=white&size=2';
$html = Notifications::template($row, $custom, 'customer');
$check(strpos($html, 'custom-logo.png?variant=white&#038;size=2') !== false, 'A configured logo must render even when the company name is changed.');
$check(strpos($html, 'alt="A Different Company') !== false, 'Custom image must retain useful company alternative text.');
$check(strpos($html, 'tuxano-wordmark.png') === false, 'A selected email logo must replace the bundled logo.');

foreach (['confirmed', 'cancelled', 'completed'] as $status) {
    $status_row = $row;
    $status_row['status'] = $status;
    $status_row['revision'] = 2;
    $status_row['history'] = [['revision' => 2, 'changes' => ['status' => ['old' => 'new', 'new' => $status]], 'beforePricing' => ['total' => 300, 'currency' => 'USD']]];
    $html = Notifications::template($status_row, $settings, 'update');
    $plain = Notifications::plain_text($status_row, $settings, 'update');
    foreach (['TUX-2026-NOTIFICATIONTEST', 'support@example.test', '#0a121f', 'tuxano-wordmark.png'] as $needle) {
        $check(strpos($html, $needle) !== false, 'Status email must retain request/brand/support.');
    }
    $check(strpos($html, 'Contact &amp; billing') === false && strpos($html, 'Pricing summary') === false && strpos($html, 'Customer-visible billing note') === false, 'Lifecycle mail must stay concise without the full receipt or billing details.');
    $check(strpos($html . $plain, 'INTERNAL_SECRET_NOTE') === false && strpos($html . $plain, 'PRIVATE_IDEMPOTENCY_KEY') === false, 'Lifecycle email must not expose private data.');
    $check(strpos($plain, $row['reference']) !== false, 'Plain lifecycle email must retain request reference.');
    if ($status === 'confirmed') {
        foreach (['Your reservation is confirmed', 'Ada &amp; co', 'Pickup &amp; Plaza', 'JFK Airport', 'November 8, 2027', '2:30 PM (Eastern Time)', 'Luxury SUV', 'USD 335.00', 'not a payment receipt'] as $needle) {
            $check(strpos($html, $needle) !== false, 'Confirmed notification must include ' . $needle);
        }
        $check(strpos($plain, 'USD 335.00') !== false && strpos($plain, 'Pickup & Plaza') !== false, 'Confirmed plain text retains authoritative trip and price.');
    } elseif ($status === 'cancelled') {
        $check(strpos($html, 'Sorry, Ada &amp; co') !== false && strpos($html, 'has been cancelled') !== false && strpos($html, 'Questions about this cancellation') !== false, 'Cancelled mail needs a short apology and help invitation.');
        $check(strpos($html . $plain, 'USD 335.00') === false && strpos($html . $plain, 'Pickup & Plaza') === false && strpos($html, 'Pickup &amp; Plaza') === false, 'Cancellation message must not resend a long itinerary/estimate.');
    } else {
        $check(strpos($html, 'Thank you for travelling with us') !== false && strpos($html, 'next journey') !== false, 'Completed mail thanks the customer and welcomes another journey.');
        $check(strpos($html . $plain, 'USD 335.00') === false && strpos($html, 'JFK Airport') === false, 'Completion message must remain short.');
    }
    $generic_row = $status_row;
    $generic_row['revision'] = 3;
    $generic_row['history'][] = ['revision' => 3, 'changes' => ['billing.phone' => ['old' => '123', 'new' => '456']]];
    $generic = Notifications::template($generic_row, $settings, 'update');
    $check(strpos($generic, 'Your request has been updated') !== false && strpos($generic, 'Updated details:') !== false && strpos($generic, 'USD 335.00') !== false, 'An ordinary edit after a lifecycle transition retains a detailed revision notification.');
}
$hostile = $row;
$hostile['payload']['billing']['first'] = '<img src=x onerror=alert(1)>';
$hostile['payload']['trip']['pickup'] = '<script>bad()</script>';
$hostile['payload']['vehicleSnapshot']['image'] = 'javascript:alert(1)';
$html = Notifications::template($hostile, $settings, 'customer');
$check(strpos($html, '<img src=x') === false && strpos($html, '&lt;img src=x') !== false && strpos($html, '<script>bad()') === false && strpos($html, 'javascript:alert') === false, 'Stored user content/image URL must be safely escaped.');

// Client-approved receipt wording, without changing stored contact spelling.
$receipt = $row;
$receipt['reference'] = 'TUX-2026-C0010D4E7BDA';
$receipt['payload']['billing']['first'] = 'PAVEL';
$receipt['payload']['trip'] = array_replace($row['payload']['trip'], ['date' => '2026-10-30', 'time' => '17:50', 'timezone' => 'America/Indiana/Indianapolis']);
$html = Notifications::template($receipt, $settings, 'customer');
$plain = Notifications::plain_text($receipt, $settings, 'customer');
$expected_pickup = 'October 30, 2026 at 5:50 PM (Eastern Time)';
$expected_intro = "We've received your reservation request. Our team will review the details and contact you to confirm availability and arrange payment.";
$check(strpos($html, 'Thank you, Pavel.') !== false && strpos($plain, 'Thank you, Pavel.') !== false, 'The receipt greeting must use sentence case and a full stop.');
$check(strpos($html, esc_html($expected_intro)) !== false && strpos($plain, $expected_intro) !== false, 'The customer receipt must use the approved review and payment explanation.');
$check(strpos($html, 'Status: Pending Confirmation') !== false && strpos($plain, 'Status: Pending Confirmation') !== false, 'A new request is explicitly pending confirmation.');
$check(substr_count($html, $expected_pickup) === 2 && substr_count($plain, $expected_pickup) === 1, 'The banner and trip details must show the identical formatted pickup-local schedule.');
$check(strpos($html . $plain, '17:50') === false && strpos($html . $plain, 'America/Indiana') === false && strpos($html . $plain, '2026-10-30') === false, 'Human-readable email dates must not expose raw storage dates or timezone identifiers.');
$check(strpos($html, 'Booking contact</th>') !== false && strpos($html, 'PAVEL Customer') !== false, 'Greeting presentation must preserve the original stored contact name.');
$check(strpos($html, $receipt['reference']) !== false && strpos($plain, $receipt['reference']) !== false, 'The complete request reference must be retained in both alternatives.');
foreach (['ÉMILIE' => 'Émilie', '李明' => '李明', '' => 'there'] as $input_name => $greeting_name) {
    $receipt['payload']['billing']['first'] = $input_name;
    $check(strpos(Notifications::plain_text($receipt, $settings, 'customer'), 'Thank you, ' . $greeting_name . '.') !== false, 'Greeting formatting must safely handle Unicode names and an empty legacy name.');
}
foreach (['America/Chicago' => 'Central Time', 'America/Los_Angeles' => 'Pacific Time', 'America/Phoenix' => 'Mountain Time'] as $zone => $label) {
    $receipt['payload']['trip']['timezone'] = $zone;
    $expected = 'October 30, 2026 at 5:50 PM (' . $label . ')';
    $check(substr_count(Notifications::template($receipt, $settings, 'customer'), $expected) === 2, 'The receipt must consistently honor its saved pickup timezone: ' . $zone);
}
$receipt['payload']['trip']['timezone'] = 'Invalid/Timezone';
$check(substr_count(Notifications::template($receipt, $settings, 'customer'), 'Pickup schedule unavailable') === 2, 'A corrupt legacy timezone must not crash rendering or invent an unrelated pickup time.');
WP_CLI::success('WordPress email template checks passed: ' . $checks);
