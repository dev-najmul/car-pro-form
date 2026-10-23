# Tuxano Booking 2.1.2 — four final refinements

Owner request: 24 October 2026 (Asia/Dhaka). Existing update/live testing authorization continues; retain 2.1.1 as rollback and preserve owner content, records, keys and tariffs.

- [x] 1. Ten strict six-digit hex color controls under Settings → Form appearance cover the form title, subtitle, inactive/active step labels, connectors and step-circle background/text/border. A fixed public palette feeds form-only CSS variables; colors cannot inject arbitrary CSS or change fare revisions. Use light heading/navigation text for the owner's dark home-page background.
- [x] 2. Full-width map predictions sit below the input. Unselected maps start in the United States, while global/known-country searches remain supported. After debouncing, typing previews a real provider prediction without choosing it, setting a booking point or enabling confirmation. Explicit result/pin selection is still required. Guards cover newer input, map interactions, country changes and unmounting; only transient bounded details are reused and provider attribution is displayed safely.
- [x] 3. Keep the navy thank-you footer and remove only the extra owner-homepage tail. Diagnosis: an Elementor Text Editor paragraph containing only a nonbreaking space after the embed added 38.4px. Matching authenticated frame view/resize messages hide only an empty trailing editor paragraph run for thank-you, restoring its inline display on reset. Real content and unrelated widgets remain intact; page data is not rewritten.
- [x] 4. Remove both 1500px admin layout caps and use available WordPress content width with balanced gutters. Refine the navy/gold hierarchy, navigation, cards, tables/statuses and surfaces while preserving 15px primary text/14px tables and existing controls.

## Verification

Targeted results: 97 Node checks; 109 settings/fleet/pricing assertions on actual PHP 7.4/8.3; 14 frontend browser cases; 52 map/device regressions plus the final affected 12-case picker run; three iframe-tail geometry/security/restoration cases. Eighteen native admin layouts passed at 1920/1440/390 with no overflow or JavaScript errors, and unrelated Posts remains unaffected. Read-only source review found no concrete release blocker. The full 112-case browser suite, hosted compatibility and live deployment outcomes will be recorded after completion.
