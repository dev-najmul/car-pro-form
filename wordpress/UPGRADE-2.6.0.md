# TUXANO Booking 2.6.0 — separate service pricing

The two client documents describe alternative **Transfer** methods. Customers still choose Transfer or Hourly. Administrators choose the Transfer method for each vehicle; Mileage-Based is the default. Hourly controls are separate and its existing calculation remains in place.

| Service or method | Calculation before waiting, extras and gratuity |
| --- | --- |
| Mileage-Based Transfer | `max(minimum fare, (max(0, pickup miles − free pickup miles) + passenger miles + max(0, return miles − free return miles)) × per-mile rate)` |
| Time-Based Transfer | `max(minimum minutes, max(0, pickup minutes − free pickup minutes) + ceil(passenger minutes / increment) × increment + max(0, return minutes − free return minutes)) / 60 × Transfer hourly rate` |
| Hourly Booking | `max(booked hours, passenger driving hours) × Hourly rate + passenger miles × Hourly mileage rate` |

Transfer pickup and return allowances are independent. All passenger stops are included; passenger driving time is rounded once, while positioning time and miles are not rounded early. Legacy base and driving-minute fields stay saved but are inactive in both new Transfer methods. The Transfer per-mile rate and mileage minimum each have one saved value. Selected stop waiting, extras and customer-selected gratuity are added once.

## Controls and defaults

Open **Vehicles → Edit → Booking Vehicle & Pricing** for separate Transfer and Hourly groups. Pricing shows both groups by vehicle, calculation examples, global extras and the editable service base.

- Service base: **304 Sype Dr., Carol Stream, IL 60188, USA**.
- Default Transfer method: **Mileage-Based**.
- Free pickup/return travel: **20 miles each**, or **30 minutes each** in Time-Based mode.
- Time increment: **15 minutes**; combined minimum charged time: **60 minutes**.
- Premium SUV Transfer: **$3/mile**, **$150 minimum**, **$150/hour** in Time-Based mode and **$2.50 per waiting minute**.
- Premium SUV Hourly rate: **$150/hour**. Existing Hourly mileage/waiting rates are copied into their separate controls.
- Other vehicles retain their saved numeric rates. Their Transfer fare changes according to the new formula; preserving rates does not mean preserving the old mixed-formula result.

An idempotent migration preserves vehicle IDs, images, content, capacities and historical booking JSON. Existing inactive legacy base/driving-minute values remain saved. Fresh Premium defaults use the mockup's zero base and $2.50 driving-minute value, both inactive. A private `_tuxano_pricing_pre_260` backup retains pre-migration rates. Later admin edits and reactivation do not reapply the defaults. An old open pricing editor must reload before saving so it cannot overwrite the new profile.

## Routing and saved requests

New Transfer quotes use verified Google driving routes for base → pickup, passenger journey and drop-off → base. The passenger segment departs at the selected pickup time in the authoritative pickup timezone. Positioning uses an estimated earlier departure; return departs after passenger driving and selected stop waiting. A bounded probe establishes pickup geography and positioning time. Each provider attempt counts against the configured budget; a Transfer quote uses up to four calls, while Hourly remains one baseline passenger-route call.

Three verified segments are required. Unreachable base travel or a provider failure cannot become zero positioning cost or a fallback fare. Consequently, the Chicago base cannot quote an unrelated overseas driving trip; change the test base or use a reachable Chicago-area trip.

Quotes bind the service, schedule, ordered waiting times and pricing revision. Changed dates/times/waits cancel stale frontend work. Incomplete Hourly schedules can preview without being treated as malformed final quotes. The server calculates final prices and checks duplicate receipts before quote validation, preserving lost-response retry safety.

Contact/status-only edits retain accepted prices, routes and timezone interpretation. Explicit repricing or priced itinerary changes use the current applicable model and verified routes. A new traffic-based Transfer's date/time change also recalculates its estimate. Legacy flat snapshots remain supported, including archived vehicles. A complete current-model reprice adopts verified geographic pickup time; a past admin pickup uses clearly labelled current traffic rather than claiming a historical forecast. Confirmed-slot protection remains enforced.

## Install and rollback

Back up the existing plugin and database, upload `tuxano-booking-2.6.0.zip`, choose **Replace current**, and clear page/browser cache. Review the service base and per-vehicle groups before accepting new quotes. No notification is sent merely by migration.

Old bookings remain intact. Reinstalling an older ZIP alone does not restore old rate values; a rate rollback needs the database backup or a deliberate restore of the per-vehicle pre-migration values. Deactivation never restores or overwrites rates automatically.


## Verification

All **217 Node checks** passed. Ten sequential native WordPress/PHP suites passed on both **PHP 7.4 and 8.3**, **1,455 assertions per version**: data201, calculators308, migration/admin/history122, routing179, integration156, updates159, email-logo31, notifications106, availability98 and timezones95. All 15 plugin PHP files lint on PHP 7.4. Complete JavaScript/PHP calculator parity covers 334 fields across 27 literal vectors, including the four client examples and fractional boundaries.

The full browser suite passed **314/314 cases in 13.8 minutes**, including all 15 new v2 cases. These cover mode/service isolation, complete schedule binding, date/time/wait changes, quick handoff, unreachable/missing positioning data, unchanged legacy flows and a server receipt with waiting charged once. **1,988 distinct automated checks passed**, counting compatibility repetitions once.

Package verification passed: **55 files / 25,032,103 bytes**, SHA-256 **`6c0f5f42a27168d381805a709c07c019bb6208e010e6b9cec02a883da076d3e9`**. ZIP integrity and complete plugin/ten-module/asset byte parity passed; all eight timezone data/resolver files and both public frontend CSS files are identical to 2.5.0. Private helpers, credentials and client document uploads are excluded. Provider tests use deterministic Google responses; the managed policy excludes the live site and Google Routes, so no live-provider or live-site deployment is claimed.


Actual local WordPress browser verification passed: native vehicle method previews ($150/$525/$643.20), independent Transfer/Hourly save and reload, and 390px fit. The real HTTP bootstrap/session/route/availability/bookings flow saved the expected **$335** receipt ($150 driving + $25 waiting + $50 meet & greet + $75 seat + $35 gratuity). Only upstream Google/SDK responses were mocked; public REST was exercised directly. Temporary users, vehicle, request, upstream fixture and browser authentication were removed, and no customer mail was sent. Two additional admin-preview regressions passed, bringing the current browser collection to **316** cases; the complete 314-case run plus those two targeted cases are green locally.
