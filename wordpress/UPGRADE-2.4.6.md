# TUXANO Booking 2.4.6 — session recovery and original UI refinements

## Requested behavior

- Resume the same booking session after a mobile IP change or an expired/evicted cache lease, preserving entered fields and duplicate-submit protection. Public booking requests do not rely on stale WordPress login nonces. Expired quotes refresh without a failed manual retry when displayed prices and the pickup time zone are unchanged; changed tariffs, route fares or pickup zones require reviewing the new estimate with contact details retained.
- Settings provide separate **Main title**, **Field label** and **Main button** spacing. Existing saved values remain. Suggestions, input values, body text, map links, Edit and other secondary actions use normal spacing.
- All Choose on map controls use matching 13 px text without underlines. Waiting selects fill available space, hourly quantity uses the full form width, and stop validation remains below the input row. Tapping a map action does not insert a moving validation message before the native click.
- Show 24-hour time only in summaries, thank-you and emails. Step 1, quick booking, the compact trip bar and availability popups keep the primary 12-hour clock.
- Restore the original compact desktop trip bar. Long addresses use bounded previews with full title/accessible text; phone addresses remain fully visible. Date/time and the 14 px Edit action keep their own space.

## Session safeguards

Sessions retain their random identity across renewal; signed recovery proofs are bounded to seven days and the current site/protocol, while active cache leases slide for two hours. New sessions require token and proof. Credentials stay in memory/headers, with no new mandatory cookie or persistent browser storage. Origin/JSON checks, IP/session/global budgets, price authority and idempotent receipts remain enforced. A real provider/network failure can still require retry; entered details are retained instead of instructing the user to discard the form.

## Install

Upload `tuxano-booking-2.4.6.zip` through WordPress → Plugins → Add New → Upload Plugin → Replace current with uploaded. Clear page/browser cache. Existing settings, keys, fleet and submissions remain. Keep 2.4.5 for rollback.

## Verification

Syntax checks and all **185 Node checks** passed. Seven sequential WordPress fixture suites passed on both PHP **7.4** and **8.3**, **835 assertions per version**: data/settings 199, REST/integration 155, updates 159, email logo 31, notifications 98, availability 98 and timezones 95. All 14 plugin PHP files lint on PHP 7.4. Fixtures capture mail locally and clean up their records.

Native WordPress Settings save/reload verified the three separate controls, range/step validation, zero/blank and phone fit; original settings were restored. Actual HTTP tests passed for both a logged-in administrator and an anonymous browser: new session creation, stale nonce omission, timezone lookup, deliberate cache eviction and same-token recovery. The temporary local administrator and authentication state were removed.

ZIP integrity and complete plugin/ten-shared-module/asset byte parity passed: **54 files / 25,018,001 bytes**, SHA-256 **`f802d200539d87813d982db19c4cae85dee15e0fb77aa904a6a879485b53f091`**. The eight timezone data/resolver files are unchanged from 2.4.5. Private credentials, local helpers and reports are excluded. The managed network policy excludes the live site; this release is supplied for the owner's manual replacement and acceptance check.

The complete local regression and focused reruns cover **299 distinct browser cases**. The final 80-case affected suite passed, followed by all 14 session/quote safety cases against the last source. These include native quick pickers, desktop/phone map confirmation, long multilingual addresses, spacing scopes, unchanged-fare retry, changed route fares/timezones, failed refreshes and lost-reply duplicate protection. Actual WordPress serves all ten final public modules byte-for-byte. No unresolved local test failure remains.

Source/release: `0fea53021da4ba71ebcb6d2b3117189de032b337`. The complete unauthenticated HTTPS200 application/zip download matched every byte and SHA-256: [verified direct ZIP](https://raw.githubusercontent.com/dev-najmul/car-pro-form/0fea53021da4ba71ebcb6d2b3117189de032b337/releases/tuxano-booking-2.4.6.zip).

Hosted verification also passed for exact source `0fea53021da4ba71ebcb6d2b3117189de032b337`: [WordPress run 41977923091](https://github.com/dev-najmul/car-pro-form/actions/runs/41977923091) and [Browser run 41977923102](https://github.com/dev-najmul/car-pro-form/actions/runs/41977923102) both **succeeded**. All four WordPress targets passed: PHP 7.4/8.1 with WordPress 6.6 and PHP 8.3/8.5 with current WordPress. **1,319 distinct automated checks passed**: 185 Node + 835 PHP assertions + 299 browser cases, counting compatibility repetitions once. The source, checksum, direct download and final package are preserved on main; no live installation is claimed.
