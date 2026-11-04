# TUXANO Booking 2.4.4 — dual clocks, letter spacing and Safari location requests

## Changes

- Keep the existing 12-hour pickup clock and show a smaller 24-hour clock beneath it, with the same pickup timezone. Selected-time controls, trip summaries, review, receipt and email schedules use the same underlying saved time; no booking instant or fare is changed.
- Under **Tuxano Booking → Settings → Form appearance → Letter spacing**, set title, text and button spacing separately. Values range from −1 to 5 px in 0.1 px steps. Blank retains the current design; 0 is a valid explicit choice. Suggested starting values are 1.0 px for text and 2.0 px for buttons. Settings apply to main and quick booking; email typography remains independent.
- Request native geolocation synchronously with `getCurrentPosition` inside the location-button tap. Start tracking only when a coarse/invalid reading or a recoverable availability error needs refinement. Preserve bounded accuracy/freshness checks, cancellation, late-response guards and nearby-place fallback.
- Distinguish insecure-page or explicit page-policy blocks. A real location permission denial stops the request and supplies browser/device recovery instructions; there is no automatic re-prompt loop or fake location.

## Safari checks

Safari website permission and iPhone/iPad **Settings → Privacy & Security → Location Services → Safari Websites** are separate controls. JavaScript cannot override an OS/site denial or force the permission sheet to reappear. After allowing access, return to the site and tap the location button again; manual address/map entry remains available.

The reported screenshot does not by itself prove a particular Safari engine defect. The previous helper preferred `watchPosition`; the new one-shot-first flow follows the normal explicit-request path while preserving refinement. Physical iPhone permission behavior must be checked by the owner; simulated browser readings do not establish that a real OS prompt appeared.

## Install

Upload `tuxano-booking-2.4.4.zip` in WordPress → Plugins → Add New → Upload Plugin and choose Replace current with uploaded. Clear page/browser cache. Existing settings, keys, fleet, submissions and timezone data remain. Keep 2.4.3 for rollback.

## Focused and native verification

All **170 Node checks** passed, including ten new one-shot/watch compatibility cases alongside the existing refinement/cancellation tests. The **27 focused new browser cases** passed: eight dual-clock, eight location-request and eleven typography/quick-clock cases. Custom 1/1/2 px spacing was exercised through complete 320px/390px journeys, including DOMRange checks for adjacent navigation-text overlap after fonts loaded. Visual review caught narrow navigation overlap; navigation now uses text spacing, and labels wrap inside their columns while action buttons retain button spacing.

The actual local WordPress installation loaded active **2.4.4**. Seven sequential PHP 8.3 suites passed **796 assertions**: settings/data197, integration118, updates159, email-logo31, notifications98, availability98 and timezones95. All **14 plugin PHP files** linted cleanly on PHP 7.4. Native Settings save/reload verified 1/1/2 values, range/step checks, zero and blank reset, public configuration and phone fit. Original settings were restored. Ten email fixtures rendered without sending mail; saved dual clocks and desktop/phone fit were verified, and the phone email screenshot was inspected.

Safari-related browser cases used Chromium with an iPhone Safari user agent and controlled native-provider callbacks. They prove synchronous request order, current-location accuracy/nearby behavior, true-denial/manual-retry/cancellation guards, and no forced watch on an accurate reading; they are not a real Safari/iPhone permission-sheet test. No physical iPhone or WebKit binary was available, and the cloud policy excludes the live host. Owner validation of actual device permissions remains necessary.

## Release integrity

**53 files / 25,012,591 bytes**; SHA-256 **`746d81c51684d6f52694b3bcb56cb7d45f961c7e3dba4f88aed8f44691b1843d`**. CRC, complete plugin/nine-shared-module/asset parity and private-file/credential scans passed. All eight timezone data files remain byte-identical to 2.4.3. A complete unauthenticated HTTPS200 application/zip download matched exact bytes/hash.

Source/release commit: `43ed20ee805b6078dcf5e5b1188beafeb80a4bef`. [Direct verified ZIP download](https://raw.githubusercontent.com/dev-najmul/car-pro-form/43ed20ee805b6078dcf5e5b1188beafeb80a4bef/releases/tuxano-booking-2.4.4.zip). The plugin was not installed on the live site; deliver this ZIP for owner manual replacement and cache clearing. Keep 2.4.3 for rollback.

The complete local browser regression passed **274/274 cases in 12.3 minutes**, with no skips or unresolved failures. **1,240 distinct local automated checks passed**: 170 Node + 796 PHP assertions + 274 browser cases. Existing backgrounds, maps, quick handoff, dates/hourly controls, pricing/extras/toggles, submissions, availability and historical notifications stayed green. Both old watch-only and current-position-only providers remain supported.

Hosted [WordPress run 41800452208](https://github.com/dev-najmul/car-pro-form/actions/runs/41800452208) and [Browser run 41800452182](https://github.com/dev-najmul/car-pro-form/actions/runs/41800452182) both **succeeded** for exact source/release `43ed20ee805b6078dcf5e5b1188beafeb80a4bef`. The WordPress matrix covers PHP 7.4/8.1 with WordPress 6.6 and PHP 8.3/8.5 with current WordPress, all existing backend fixtures and the full browser suite. The 1,240 distinct checks count repeated compatibility runs once. Actual iPhone Safari permission-sheet behavior remains an owner/device validation step; these hosted Chromium checks do not establish an observed Safari OS prompt.
