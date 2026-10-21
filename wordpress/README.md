# Tuxano Booking 2.0.1

Installable WordPress conversion of the existing five-step form. The static prototype remains available in the repository. WordPress uses its own PHP Routes backend and database; it does not depend on the temporary GitHub preview server.

[Download the plugin ZIP](../releases/tuxano-booking-2.0.1.zip) · [SHA-256](../releases/tuxano-booking-2.0.1.zip.sha256)

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
| Submissions | Search, status/pickup-date filters, pagination, full details, exact Google point links, private notes, status, deletion and failed/stalled notification retry |
| Vehicles | Native add/edit/draft/trash, media photo, title/models/features, passenger/bag capacities, category and all six tariff components |
| Collections | Native category name/description management |
| Pricing | Meet & greet, first/additional child/booster seat, default gratuity and vehicle tariff overview |
| Settings | API keys, currency/branding/support, hours/stops, policies, notifications/sender, retention and API/request budgets |

An admin status change does not automatically email the customer. Customer thank-you and new-request admin emails use a basic branded HTML template; custom template design remains deferred. A request is not a confirmed reservation or payment.

## Pricing and integrity

- Transfer: `max(minimum, base + miles × per-mile + driving-minutes × per-driving-minute)`, plus stop waiting.
- Hourly: `max(booked-hours, driving-hours) × hourly-rate + miles × per-mile`, plus stop waiting.
- First child/booster seat surcharge is charged once across both types. Gratuity is calculated on transportation only.
- Google supplies measured route metrics. Live traffic and pickup-date traffic forecasting are excluded and labelled accordingly.
- A 15-minute server quote binds exact pickup/destination/ordered stops, measured metrics, session and vehicle/pricing revision. Server validation rejects changed routes, invalid fields/capacities, expired quotes and changed fleet/prices. Client totals are discarded.
- Persisted requests have unique server references and idempotency keys. Retries cannot duplicate the booking or its normal notifications. Original route, pricing and vehicle/tariff snapshots survive later fleet changes.
- Device positions require fresh accuracy checks and confirmation. An inaccurate PC estimate cannot become a pickup automatically; users can search and choose an exact map point.

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
```

The **Verify WordPress plugin** workflow installs the actual ZIP into WordPress 6.6/PHP 7.4 and PHP 8.1, plus current WordPress/PHP 8.3, verifies core checksums, checks PHP syntax, runs PHP fixtures and the shared browser suite. No real Maps key or SMTP account is needed for deterministic CI tests. Actual Google-provider/local WordPress evidence is recorded separately in [project.md](../project.md#17-wordpress-plugin-conversion--version-200).

Version 2.0.1 was installed and activated on the authorized PHP 7.4.33 test site. The [live booking test page](https://bdreadyweb.com/carbook/tuxano-booking-test/) passed actual Google route/stop calculations, all six fleet prices, durable submission, responsive thank-you and admin readback. [Direct test-site ZIP download](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.0.1-1.zip). Full hosted compatibility and live verification evidence is in [project.md Section 18](../project.md#18-php-74-compatibility-and-live-site-installation--21-october-2026).
