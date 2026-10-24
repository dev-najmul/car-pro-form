# Tuxano Booking 2.1.3 — phone map confirmation and alignment

Owner request: 24 October 2026 (Asia/Dhaka). The owner authorized a tested live update; retain 2.1.2 for rollback and preserve current content, records, settings and prices.

1. Fix phone map confirmation after search/preview. Reproduce real touch interactions and preserve deliberate address confirmation, exact provider identity, country consistency and cancellation guards. Never silently commit a typed prediction.
2. Align phone step 4 billing fields and step 5 review content with their section icons, preserving desktop layout.

Both changes are implemented. Map confirmation now uses a separate validated preview and a synchronous guarded selection getter. Keyboard dismissal closes predictions while keeping the visible preview available for an explicit tap on “Use this map point.” Query/generation/country/actual-center checks reject stale or moving-map confirmation; remounts clear stale preview UI. Exact Place IDs are preserved; only actual manual pin selection produces raw coordinates. Default US view remains unselected. Disabled buttons now appear disabled.

Phone billing section bodies and review details/vehicle/contact bodies use the icons' left edge through 639px. Desktop indentation and passenger layouts are retained.

Targeted checks passed: **97 Node**, **19 map-picker browser cases**, **17 frontend cases**. Seven new picker regressions include touch-enabled preview/blur/scroll confirmation across all three fields, deliberate second-suggestion selection, motion/country/edit cancellation and remount/late-response guards. New 320/390px geometry checks reproduced the old 44px offset and passed after the fix; desktop spacing remains unchanged. Independent source review found no remaining concrete blocker. The complete **122-case browser suite passed locally in 4.9 minutes**.

[Hosted compatibility run 40071123077](https://github.com/dev-najmul/car-pro-form/actions/runs/40071123077) passed for application commit `437e7c8178a00556927c7f9066538ef1f268f381`: PHP 7.4/8.1 on WordPress 6.6 and PHP 8.3/8.5 on current WordPress. Each linted 12 real plugin PHP files and passed 97 Node + 109 data + 114 REST + 158 integrity assertions; PHP 8.3 also passed all 122 browser cases. **600 distinct automated checks passed**, counting compatibility repetitions once. All four generated ZIP hashes match the release. The separate browser workflow also passed all 122 cases.

## Live update

The actual 2.1.3 ZIP is installed and active on the supplied site. Three pages' raw content/status/slug/template, all 32 existing non-key settings (including the ten appearance colors), six vehicle configurations and four global prices match the pre-update snapshots. The ordinary homepage and form use 2.1.3; served parent bridge bytes also match the canonical source. Current hosting remains PHP 8.5.12 / WordPress 7.1.3.

Real Google testing used touch-enabled Chromium phone emulation at 393px (coarse pointer and touch support enabled), plus 320px layout checks. Pickup Times Square, drop-off JFK and stop Brooklyn Bridge each passed **type → resolved preview → blur/keyboard dismissal → scroll → tap Use this map point**. The main input stayed unchanged until the explicit tap; every resulting Place identity/country was correct. Disabled buttons appeared gray and became enabled only for a ready preview/selection. Direct route: **25,535m / 2,179s**; via Brooklyn Bridge: **37,171m / 3,159s**, plus exactly **900s** waiting. All six displayed vehicle fares matched independent calculations.

All four Contact section bodies and four Review section bodies matched the icon left edge at **393px and 320px**, pricing rows aligned, and there was no parent/child horizontal overflow. The Luxury SUV review image decoded correctly (331×223). An independent 1440px desktop explicit-suggestion/confirmation check passed. **No booking POST, submission, email or JavaScript error occurred**; this release's live QA was read-only. Detailed evidence is ignored under `wordpress-test-results/live-213/`, `frontend-213/` and `full-browser-213/`.

[Download 2.1.3 ZIP](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.1.3.zip): Media attachment **53**, **11,496,004 bytes**, **47 files**, SHA-256 `c0d769e9d334b3c3acf62381943eb1beb3abb3b1a10446facd8823ea771fd7c7`. An unauthenticated HTTPS download returned 200/application-zip with exact bytes/hash; integrity and complete source parity passed. Version 2.1.2 remains available for rollback. Both owner requests are complete and ready for manual phone review.
