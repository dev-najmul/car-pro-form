# Tuxano Booking 2.1.0

Installable WordPress conversion of the existing five-step form. The static prototype remains available in the repository. WordPress uses its own PHP Routes backend and database; it does not depend on the temporary GitHub preview server.

[Download the plugin ZIP](../releases/tuxano-booking-2.1.0.zip) · [SHA-256](../releases/tuxano-booking-2.1.0.zip.sha256)

## Install and configure

1. WordPress **Plugins → Add New → Upload Plugin**, select the ZIP and activate. Requires WordPress 6.6+ and PHP 7.4+. Activate per site; network-wide activation is deliberately rejected.
2. **Tuxano Booking → Settings**: add the Maps JavaScript/Places browser key and separate Routes server key. The latter stays on the WordPress server. Saved keys are write-only; empty inputs preserve them, explicit Clear removes them. Use suitable domain/API restrictions and enabled Google billing/APIs.
3. Review **Vehicles**, **Collections** and **Pricing**. Six existing vehicles and sample tariffs are seeded once. Replace the sample amounts with approved business prices. Currency changes do not perform foreign-exchange conversion.
4. Set business/contact details, public terms/privacy URLs, email recipient/sender, optional retention, route budgets and booking limits. Set the WordPress site timezone; the form displays that timezone for pickup date/time.
5. Add `[tuxano_booking]` to a page. It embeds a responsive same-origin form isolated from theme CSS. For the original complete page design, choose the **Tuxano Booking — full page** template. A standalone form is also available at `/?tuxano_booking_form=1`.
6. Test a request, inspect its submission and confirm delivery to both intended inboxes. The plugin uses `wp_mail`; configure a WordPress SMTP/mail transport when needed. Local tests intercept mail rather than sending it to real recipients.

## Admin controls

| Menu | Controls |
| --- | --- |
| Dashboard | Total/status counts, recent requests, configuration summary |
| Submissions | Search, status/pickup-date filters, page sizes 10/20/50/100, View/Edit, full booking corrections, audit/revision history, exact Google point links, private notes, status, confirmed selected-row deletion and notification retry |
| Vehicles | Native add/edit/draft/trash, media photo, title/models/features, passenger/bag capacities, category and all six tariff components |
| Collections | Native category name/description management |
| Pricing | Meet & greet, first/additional child/booster seat, default gratuity and vehicle tariff overview |
| Settings | API keys, currency/branding/support, hours/stops, policies, notifications/sender, retention and API/request budgets |

An admin status change does not automatically email the customer. The full editor includes an explicit customer-notification checkbox for the committed update and itemized estimate. Customer thank-you, administrator and update emails use branded responsive HTML with a plain-text alternative. A request is not a confirmed reservation or payment.

Contact-only edits preserve the original fare even after fleet prices change. Changes that affect the fare, route or an explicit Recalculate selection use validated server metrics/tariffs. Historical dates and archived vehicles remain editable. Revision checks reject stale forms instead of overwriting another administrator's work. The immutable original snapshot and change history remain private; an original visitor retry still receives the original receipt.

API cards show a masked configured value and deliberate Replace/Remove controls. Removing a key takes effect on Save. Test connection verifies Routes on the server or Maps/Places in a fresh isolated browser frame; a configured key is not automatically an authorized connection. Candidate tests do not save or echo the private Routes key. Each tariff component can be None/not charged, with explanations and a sample calculation.

## Pricing and integrity

- Transfer: `max(minimum, base + miles × per-mile + driving-minutes × per-driving-minute)`, plus stop waiting.
- Hourly: `max(booked-hours, driving-hours) × hourly-rate + miles × per-mile`, plus stop waiting.
- First child/booster seat surcharge is charged once across both types. Gratuity is calculated on transportation only.
- Google supplies measured route metrics. Live traffic and pickup-date traffic forecasting are excluded and labelled accordingly.
- A 15-minute server quote binds exact pickup/destination/ordered stops, measured metrics, session and vehicle/pricing revision. Server validation rejects changed routes, invalid fields/capacities, expired quotes and changed fleet/prices. Client totals are discarded.
- Persisted requests have unique server references and idempotency keys. Retries cannot duplicate the booking or its normal notifications. Original route, pricing and vehicle/tariff snapshots survive later fleet changes.
- Device positions require fresh accuracy checks and confirmation. An inaccurate PC estimate cannot become a pickup automatically; users can search and choose an exact map point.
- Map selection is available for pickup, every stop and drop-off. Choosing an address/POI commits its exact Place ID; arbitrary coordinates still require confirmation. Actual Google country components restrict subsequent suggestions and reject known conflicts. Country hints are a usability check, not independently verified server geographic authority; unknown coordinate countries are not guessed.
- The public form uses a plain background, a 1200px maximum for steps 2–5, compact responsive controls, secure parent-frame top scrolling and accessible inline validation. All 249 ISO countries are available; State/Province is always text, and region/postal code are optional internationally.

## Security, personal data and mail

Only administrators with `manage_options` can view/manage records and settings. Admin writes require WordPress nonces. Public writes require a same-origin session, bounded JSON, session/IP limits and a submission honeypot/elapsed-time guard. There is no public submission-reading API. Google requests use a fixed HTTPS endpoint, TLS verification, no redirects and bounded responses/timeouts; a visitor cannot choose the server request URL.

The server key is not returned in frontend configuration, HTML, receipts or emails. Options containing API keys are not autoloaded. WordPress database/hosting/backups remain part of the site's trust boundary. Protect those systems and use HTTPS.

WordPress mode keeps contact drafts and receipts in memory, not browser storage. Refresh starts a new form. Booking details are stored privately and emailed to the configured recipients. WordPress privacy export/erase hooks operate on the booking contact email. Retention defaults to manual deletion; optional scheduled deletion uses WP-Cron and therefore is best effort.

Deactivation and uninstall retain data by default. To explicitly remove plugin-owned data, define `TUXANO_BOOKING_REMOVE_DATA` as `true` in `wp-config.php` before uninstalling. Uploaded media remain in the media library. Preserve needed records before deletion.

Email statuses describe transport acceptance, not verified inbox delivery. Pending/failed messages can be retried. Explicit admin retry can recover a sender stalled over ten minutes; delivery from an interrupted attempt is uncertain and that retry can duplicate a message.

## Development and verification

```sh
npm ci
npm run check
npm run test:unit
npm test
npm run build:wordpress
```

The build copies the shared frontend and assets into `build/tuxano-booking`, normalizes runtime permissions, versions the complete module/asset directory to prevent stale imports after updates, scans the release for private files/Google keys, and creates a deterministic ZIP plus checksum. Build output is ignored; plugin source stays in `wordpress/tuxano-booking`. No local credentials or testing MU plugins are included.

PHP fixture tests require an isolated WordPress installation with `WP_ENVIRONMENT_TYPE=local`; they refuse production environments:

```sh
wp eval-file /path/to/repo/tests/wordpress-data.php
wp eval-file /path/to/repo/tests/wordpress-integration.php
wp eval-file /path/to/repo/tests/wordpress-updates.php
```

The **Verify WordPress plugin** workflow installs the actual ZIP into WordPress 6.6/PHP 7.4 and PHP 8.1, plus current WordPress/PHP 8.3 and PHP 8.5, verifies core checksums, checks PHP syntax, runs PHP fixtures and the shared browser suite. No real Maps key or SMTP account is needed for deterministic CI tests. Run fixture suites sequentially on disposable local databases. The complete current scope and concrete verification outcomes are in [UPGRADE-2.1.md](UPGRADE-2.1.md) and [project.md](../project.md#19-full-frontendadmin-upgrade--22-october-2026).

Version 2.0.1 was installed and activated on the authorized PHP 7.4.33 test site. The [live booking test page](https://bdreadyweb.com/carbook/tuxano-booking-test/) passed actual Google route/stop calculations, all six fleet prices, durable submission, responsive thank-you and admin readback. [Direct test-site ZIP download](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.0.1-1.zip). Full hosted compatibility and live verification evidence is in [project.md Section 18](../project.md#18-php-74-compatibility-and-live-site-installation--21-october-2026).
