# TUXANO Booking 2.4.0 — client document checklist

Source: `TUXANO_Booking_Form_Changes_10.28.2026 (1).docx`, reviewed including all embedded screenshots on 31 October 2026.

| Requested change | Implementation |
| --- | --- |
| GPS permission then address | Fresh precise locations are truly reverse-geocoded and fill the pickup automatically in quick/main. Exact device coordinates stay authoritative. Coarse/denied/unavailable results retain explicit search/map/review feedback. |
| Date/time appearance | Both forms show `Nov 18, 2026` / `12:21 PM` and retain native pickers/canonical values. |
| Hourly control | Editable −/+ quantity, default/minimum 3 and maximum 24, integer/range feedback and correction, supplied longer/multiple-day Trip Notes helper. |
| Step 2 action | SELECT & CONTINUE on each vehicle; no separate bottom Continue. Fresh availability succeeds or pending warning is acknowledged before automatic Step 3. Confirmed conflicts remain blocked. |
| Pickup timezone | Bundled geographic boundaries resolve IANA zones without another timezone API/key. Server quote binds provider-resolved origin zone; saved UTC availability uses reservation-date DST rules. Full labels throughout summaries/admin/emails; historical schedules retained on unrelated edits. |
| Receipt wording | Presentation-only name casing, exact requested review/payment paragraph, Pending Confirmation and full durable request ID in subject/body. |
| Email schedule | Same long US date, 12-hour time and full pickup-zone label in banner and Trip Details. Branded header remains #0a121f. |

## Integrity and compatibility

- No client-supplied timezone or extra Place coordinates can override server quote authority. Availability requires a same-session quote and final save independently rechecks the slot.
- New DST gaps/repeated hours require an unambiguous alternative. Existing historical folds/fixed-offset schedules are retained during unrelated edits.
- Expired availability quotes refresh once before retry. Wrong/late pickup previews, routes or availability results cannot auto-advance a changed trip.
- Invalid admin fields fail before any paid provider lookup. Initial receipt/idempotent retry, status-mail leases, accepted historical pricing and audit history remain intact.
- Geographic data includes source hashes, ODbL/Unicode/MIT notices and reproducible conversion instructions. Binary rings retain source precision and stream with bounded memory.

## Verification

Local acceptance passed **1,041 distinct automated checks**: 129 Node; 138 WordPress data/settings/fleet; 118 REST/persistence/notifications; 159 administrative integrity; 31 logo; 88 email templates; 98 availability/concurrency/status email; 90 pickup-timezone; and 190 browser cases (the complete 187-case suite plus three new DST/expired-quote regressions, with all 13 new main-form cases rerun). All seven PHP suites passed actual PHP 7.4 and 8.3 / WordPress 7.1.4; all 14 plugin PHP files passed PHP 7.4 syntax checks.

An independent comparison against the pinned upstream data passed **5,092 geographic points**, including 4,073 boundary-tile samples and 23 deliberately ambiguous results handled safely. The actual PHP resolver matched all 5,092 under a 64 MiB limit; peak memory was 32 MiB for the standalone batch and execution 33.65 seconds. Runtime groups decode to at most 1 MiB and individual binary tiles to 77,804 bytes.

Twenty desktop/phone email renders passed across customer/admin/confirmed/cancelled/completed templates for Indianapolis and Chicago, including requested wording, complete IDs, full-zone dates, logo, #0a121f, privacy and overflow checks. Local email QA captures templates only; it sends no email.

Release: **60 files / 33,508,665 bytes**, SHA-256 **`7f3b37b984bad75b74a556107a64b3d4d9d7f784addd1200ed8b0b9d82473d5e`**. Archive integrity and parity with every plugin source/shared module passed.

Live deployment requires the environment's existing reviewed network draft to be published because the current enforced policy rejects the authorized site with HTTPS proxy 403. No live change or deployment is claimed before that access and actual acceptance checks.

## Installation and rollback

Use `releases/tuxano-booking-2.4.0.zip` and keep 2.3.1 for rollback. In the authorized test site's Settings, set service hours to 3–24 as requested, while retaining unrelated settings, keys, records, prices, fleet and pages. Existing installed saved limits are not silently overwritten. Exclude standalone form/session/route/timezone/availability endpoints from caching.

Reverse geocoding uses the existing Google Maps browser key. If its project rejects the Geocoding service, the form shows a safe manual/map fallback; live Google authorization must be verified separately from mocked tests. No new timezone API is required.
