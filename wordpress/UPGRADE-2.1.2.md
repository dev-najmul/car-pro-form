# Tuxano Booking 2.1.2 — four final refinements

Owner request: 24 October 2026 (Asia/Dhaka). Existing update/live testing authorization continues; retain 2.1.1 as rollback and preserve owner content, records, keys and tariffs.

- [x] 1. Ten strict six-digit hex color controls under Settings → Form appearance cover the form title, subtitle, inactive/active step labels, connectors and step-circle background/text/border. A fixed public palette feeds form-only CSS variables; colors cannot inject arbitrary CSS or change fare revisions. Use light heading/navigation text for the owner's dark home-page background.
- [x] 2. Full-width map predictions sit below the input. Unselected maps start in the United States, while global/known-country searches remain supported. After debouncing, typing previews a real provider prediction without choosing it, setting a booking point or enabling confirmation. Explicit result/pin selection is still required. Guards cover newer input, map interactions, country changes and unmounting; only transient bounded details are reused and provider attribution is displayed safely.
- [x] 3. Keep the navy thank-you footer and remove only the extra owner-homepage tail. Diagnosis: an Elementor Text Editor paragraph containing only a nonbreaking space after the embed added 38.4px. Matching authenticated frame view/resize messages hide only an empty trailing editor paragraph run for thank-you, restoring its inline display on reset. Real content and unrelated widgets remain intact; page data is not rewritten.
- [x] 4. Remove both 1500px admin layout caps and use available WordPress content width with balanced gutters. Refine the navy/gold hierarchy, navigation, cards, tables/statuses and surfaces while preserving 15px primary text/14px tables and existing controls.

## Verification

The complete **112-case browser suite passed** locally. Targeted results: 97 Node checks; 109 settings/fleet/pricing assertions on actual PHP 7.4/8.3; 14 frontend browser cases; 52 map/device regressions plus the final affected 12-case picker run; three iframe-tail geometry/security/restoration cases. Eighteen native admin layouts passed at 1920/1440/390 with no overflow or JavaScript errors, and unrelated Posts remains unaffected. Read-only source review found no concrete release blocker.

[Hosted run 40010679045](https://github.com/dev-najmul/car-pro-form/actions/runs/40010679045) passed all four targets: PHP 7.4/8.1 with WordPress 6.6, and PHP 8.3/8.5 with current WordPress. Every target linted all 12 real plugin PHP files and passed 97 Node + 109 data/settings/fleet/pricing + 114 REST/database/notification + 158 update/integrity assertions. PHP 8.3 passed all 112 browser cases. **590 distinct automated checks passed**, counting compatibility repetitions once. All four built ZIP hashes match the release.

## Live update and review

Installed/activated 2.1.2 on the authorized site. Site Health currently reports PHP **8.5.12**, WordPress **7.1.3**; this task did not change the hosting runtime. The three pages' raw content/status/slug/template, six vehicle configurations, 22 existing non-key settings and four global pricing fields match the pre-upgrade snapshots. Both saved API keys remain configured/masked.

Settings → Form appearance exposes ten controls. Saved white title/subtitle/inactive and active labels plus light connectors for the owner's dark [home-page section](https://bdreadyweb.com/carbook/), retaining circle colors and recent-count 3. Live admin layouts use 1720/1740px of WordPress content at 1920px, 1240/1260px at 1440px and 370/380px at 390px, with balanced gutters and no overflow. Primary text remains 15px; fleet table text is 14px.

The ordinary anonymous homepage was verified with parent `embed.js?ver=2.1.2`, without a cache-busting URL. During deployment an older full-page response remained cached; homepage-only LiteSpeed purge and native Elementor cache regeneration were attempted, and final checks waited for the ordinary URL to serve the new bridge. Owner post content was not rewritten.

Actual Google typing previews and explicit confirmations passed for Bangladesh pickup/stop/drop-off and US pickup/drop-off. A fresh empty picker, after SDK readiness, independently showed US center **39.8283, -98.5795, zoom 4**, with confirmation disabled. Predictions are full-width below the input; typing moves the live map while the main field stays unchanged and confirmation stays disabled until a deliberate selection. Bangladesh measured 166,685m/12,370s directly and 166,796m/12,443s via Bhanga, plus exactly 15 minutes waiting. A separate read-only Times Square → JFK scenario measured 25,535m/2,179s with both country components US. All six prices matched independent calculations for both routes.

One labelled synthetic request saved as **ID 7**, **`TUX-2026-AB7D9387F3CE`**, example total **USD 1,236.70**. Native admin readback passed. Customer/admin notifications both reported **Accepted by mail transport**; real inbox delivery is not verified. No additional US booking was submitted.

Desktop/phone thank-you heroes retain the original design (477.984px/352px). Both footer-to-widget tails measured **0px**; the navy footer remains. Reset restored the original empty editor paragraph and 38.39px form-view spacing. Phone overflow, inline email validation, 249 countries, optional region/postal and server receipt/reset checks passed with no JavaScript errors.

[Download 2.1.2 ZIP](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.1.2.zip): Media attachment 51, 11,494,792 bytes, 47 files, SHA-256 `8b872a0f7e5467e581ad81859ee4591079b7b56261ac0ef7212e4899bf3d870c`. An unauthenticated HTTPS download returned 200/application-zip with exact bytes/hash; ZIP integrity and source parity passed. Version 2.1.1 remains available for rollback. Private credentials/helpers/reports are excluded.

All four requested changes are complete and ready for the owner's final manual review. Detailed evidence is in ignored `wordpress-test-results/live-212/`, `admin-212/` and `full-browser-212/`. Existing business-rate/policy approval and actual inbox delivery remain owner acceptance items.
