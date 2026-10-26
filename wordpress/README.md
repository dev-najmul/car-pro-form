# Tuxano Booking 2.3.1

Installable WordPress conversion of the existing five-step form. The static prototype remains available in the repository. WordPress uses its own PHP Routes backend and database; it does not depend on the temporary GitHub preview server.

[Download the plugin ZIP](../releases/tuxano-booking-2.3.1.zip) · [SHA-256](../releases/tuxano-booking-2.3.1.zip.sha256)

## Install and configure

1. WordPress **Plugins → Add New → Upload Plugin**, select the ZIP and activate. Requires WordPress 6.6+ and PHP 7.4+. Activate per site; network-wide activation is deliberately rejected.
2. **Tuxano Booking → Settings**: add the Maps JavaScript/Places browser key and separate Routes server key. The latter stays on the WordPress server. Saved keys are write-only; empty inputs preserve them, explicit Clear removes them. Use suitable domain/API restrictions and enabled Google billing/APIs.
3. Under **Settings → Form appearance**, choose heading, subtitle, step-label, connector and circle colors to suit your page background. Then review **Vehicles**, **Collections** and **Pricing**. Six existing vehicles and sample tariffs are seeded once. Replace the sample amounts with approved business prices. Currency changes do not perform foreign-exchange conversion.
4. Set business/contact details, public terms/privacy URLs, email recipient/sender, optional retention, route budgets and booking limits. Set the WordPress site timezone; the form displays that timezone for pickup date/time.
5. Add `[tuxano_booking]` to a page. It embeds a responsive same-origin form isolated from theme CSS. For the complete page, choose the **Tuxano Booking — full page** template. Its WordPress/Elementor host preserves page backgrounds while the transparent isolated form keeps theme CSS from changing its controls. A standalone form is also available at `/?tuxano_booking_form=1`.
6. Test a request, inspect its submission and confirm delivery to both intended inboxes. The plugin uses `wp_mail`; configure a WordPress SMTP/mail transport when needed. Local tests intercept mail rather than sending it to real recipients.

## Home quick booking

Place `[tuxano_quick_booking]` in your home hero or page-builder section, and `[tuxano_booking]` on the main booking page. Under **Tuxano Booking → Settings → Quick booking**, select the published main booking page. The destination can change on another site without editing code. Protected, unpublished and external destinations are rejected.

The inline quick card has a dark glass/blurred desktop background and a white phone background, scoped controls, Google-selected pickup/drop-off, Transfer/Hourly, hourly duration, date/time and CHECK PRICE. Its host section supplies the hero photograph; the plugin does not add marketing text or a background image. Multiple cards keep their selections independent.

CHECK PRICE transfers only trip intent within the same browser tab. The destination restores canonical Google places and obtains a fresh server quote before opening vehicle selection (step 2). A malformed, expired or unresolvable transfer stays on step 1 with feedback. It does not create a booking, send an email or carry contact details, consent, a trusted price or an old quote. Handoff data expires after ten minutes and is consumed once; only an opaque random reference appears in the URL fragment. Browser session storage must be available.

Use the current-location button only after granting permission and checking its detected pickup. A fresh accurate reading requires explicit confirmation; an approximate PC position cannot silently become a pickup. Address suggestions remain available.

## Admin controls

| Menu | Controls |
| --- | --- |
| Dashboard | Total/status counts, newest three requests by default, configuration summary; change recent count (1–20) under Settings → Dashboard |
| Submissions | Search, status/pickup-date filters, page sizes 10/20/50/100, View/Edit, full booking corrections, audit/revision history, exact Google point links, private notes, status, confirmed selected-row deletion and notification retry |
| Vehicles | Native add/edit/draft/trash, media photo, title/models/features, passenger/bag capacities, category and all six tariff components |
| Collections | Native category name/description management |
| Pricing | Meet & greet, first/additional child/booster seat, default gratuity and vehicle tariff overview |
| Settings | Quick-booking destination page, API keys, header/progress colors, dashboard recent count, currency/branding/support, hours/stops, policies, notifications/sender, retention and API/request budgets |

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
- Map selection is available for pickup, every stop and drop-off. Unselected maps start with the US view. Typing previews the current provider prediction after a debounce without selecting a booking point. Once the map settles at that address, explicitly use the map point to add it, choose another result or move the pin before confirming. Phone keyboard dismissal/scrolling preserves the current preview; editing/Escape/map interactions invalidate obsolete previews. Choosing an address/POI inside the map keeps the map open for inspection. Confirmation retains its exact Place ID; a moved pin uses its actual coordinates. Main address autocomplete remains direct. Actual Google country components restrict subsequent suggestions and reject known conflicts. Country hints are a usability check, not independently verified server geographic authority; unknown coordinate countries are not guessed.
- The public form uses a transparent background, a 1200px maximum for steps 2–5, compact responsive controls, secure parent-frame top scrolling and accessible inline validation. All 249 ISO countries are available; State/Province is always text, and region/postal code are optional internationally. The thank-you page restores the supplied original desktop/phone photographic hero and white receipt layout.

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

The **Verify WordPress plugin** workflow installs the actual ZIP into WordPress 6.6/PHP 7.4 and PHP 8.1, plus current WordPress/PHP 8.3 and PHP 8.5, verifies core checksums, checks PHP syntax, runs PHP fixtures and the shared browser suite. No real Maps key or SMTP account is needed for deterministic CI tests. Run fixture suites sequentially on disposable local databases. The email and availability upgrade is in [UPGRADE-2.3.1.md](UPGRADE-2.3.1.md). The quick date/time activation fix is in [UPGRADE-2.2.1.md](UPGRADE-2.2.1.md). The new feature and fixes are in [UPGRADE-2.2.0.md](UPGRADE-2.2.0.md). The preceding phone fixes are in [UPGRADE-2.1.3.md](UPGRADE-2.1.3.md). The preceding four refinements are in [UPGRADE-2.1.2.md](UPGRADE-2.1.2.md); the preceding seven refinements are in [UPGRADE-2.1.1.md](UPGRADE-2.1.1.md). The previous major upgrade and its verification outcomes are in [UPGRADE-2.1.md](UPGRADE-2.1.md) and [project.md](../project.md#19-full-frontendadmin-upgrade--22-october-2026).

Version **2.3.1** adds branded receipts and concise automatic customer status emails, Settings email-logo selection and per-vehicle pickup-slot availability. One confirmed booking blocks that vehicle at the same pickup minute; pending requests warn and require acknowledgement; another vehicle remains available. UTC schedule indexes preserve recorded local dates/timezones. Both final submission and admin confirmation enforce the slot through a short database lock and a unique confirmed-slot key. No notification is sent merely by upgrading. Current verification and live deployment outcomes are recorded in [UPGRADE-2.3.1.md](UPGRADE-2.3.1.md).

[Direct plugin ZIP download](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.3.1.zip) · [Live booking dashboard](https://bdreadyweb.com/carbook/wp-admin/admin.php?page=tuxano-booking). The unauthenticated downloaded ZIP matches the committed SHA-256. Prior customer/admin QA notifications were accepted by mail transport; actual inbox delivery still needs the owner's test with a real address. Previous major-release evidence is in [project.md Section 23](../project.md#23-reliable-map-confirmation-visible-toggles-and-quick-booking--25-october-2026); version 2.2.1 is retained for rollback. Set approved business rates and published policy URLs before customer quoting.
