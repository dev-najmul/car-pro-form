# Tuxano Booking 2.2.0 — reliable selection and quick booking

Owner request: 25 October 2026 (Asia/Dhaka). Direct live update and the home/booking form placements are authorized. Retain 2.1.3 as rollback and preserve unrelated content, existing records/settings/fleet/prices/keys.

- Fix named-place/manual-pin confirmation when Google camera rounding or motion prevents using a valid selected location.
- Make Meet & Greet and Child Seats switches visibly match their actual state.
- Add native inline `[tuxano_quick_booking]`, with glass desktop and white phone styling from the supplied references.
- Add Settings booking-page selection and a bounded one-use same-origin trip handoff that revalidates canonical places and obtains a fresh route before step 2.
- Place quick booking on the supplied home URL and the main form on `/booking/`, retaining unrelated page/builder content.

All features are implemented. The map defect was reproduced against actual Google: a valid BM College Mosque longitude `90.3542209` returned as the equivalent camera world `-269.6457791`, which the previous center-equality check rejected. Camera readiness now follows movement/idle and explicit user intent, preserving canonical Place identity. SDK-only longitude normalization supports wrapped manual pins; OverlayView anchors the visible pin to the actual selected coordinate. A browser-only new-module probe confirmed the mosque can be added while the server still ran 2.1.3.

Toggle indicators now use a general sibling selector: inline validation inserts a hidden paragraph between input and track, which broke the old adjacent selector. Desktop/touch/keyboard visual and functional regressions passed.

The quick card uses native inline rendering, scoped desktop glass/phone white CSS, fresh public configuration and a one-use ten-minute same-origin trip handoff. Only an opaque reference enters the URL; the main form restores canonical places and fetches its own authoritative route before step 2. Settings destination validation, configuration retries, storage errors, stale restores and Back/BFCache recovery are covered. Normal booking and consent/submission behavior remain separate.

Targeted results: **109 Node checks**, **137 data/settings/fleet assertions on actual PHP 7.4 and 8.3**, **12 quick browser cases**, **28 map-picker cases**, **69 affected map/device/address cases**, and **three toggle cases** passed. Native WordPress HTTP rendering confirmed the real CSS/module enqueue, 440px desktop card with blur14 and a white phone card without overflow; its temporary local page and setting were restored. Independent read-only review found no concrete remaining blocker. The **complete 146-browser suite passed locally in 5.8 minutes**.

[Hosted run 40191011012](https://github.com/dev-najmul/car-pro-form/actions/runs/40191011012) passed for application commit `c07b91f752dff52bbbbfc267dd0a8de1ec95a1c0`. Each PHP 7.4/8.1 (WordPress 6.6) and PHP 8.3/8.5 (current WordPress) target genuinely linted 12 real PHP files and passed 109 Node + 137 data + 114 REST + 158 integrity checks; PHP 8.3 passed all 146 browser cases. **664 distinct automated checks passed**, counting compatibility repetitions once. All four built ZIPs matched the canonical release hash; the artifact uploaded successfully. The separate browser workflow also passed all 146 cases.

## Live configuration and acceptance checks

Installed/activated the actual 2.2.0 ZIP on the authorized PHP 8.5.12 / WordPress 7.1.3 site. The owner had already moved the main form to existing **Booking17** and created empty **Home54**. Through native Settings selected Booking17 as destination, then changed only Home54 content to `[tuxano_quick_booking]`. Booking17 raw content and Elementor metadata stayed unchanged. All four pages, 32 prior non-key settings (including appearance), both saved/configured keys, six vehicle/collection/status configurations and four global prices matched the snapshots. All submission status/count aggregates remained identical: **9 → 9**.

Installed-source Google checks confirmed BM College Mosque on touch phone and desktop while the SDK camera longitude remained `-269.6457791`; the selected Place and projected pin correctly retained `90.3542209`. Pickup, drop-off and stop each confirmed exact BD identities. Direct route measured 167,583m/12,662s; via Bhanga 167,694m/12,735s plus exactly 900s waiting. All six displayed fares matched the validated metrics/tariffs. Toggle tracks/knobs correctly showed checked navy and unchecked gray after inline validation and quantity rerenders.

The ordinary home URL rendered the actual native glass desktop card and white 393px/320px phone card. Desktop Transfer and touch-enabled phone Hourly (5h) each transferred canonical US pickup/drop-off, service, date `2026-11-08`, time `14:30` and hours to **step 2**, using a genuinely fresh main session and route quote. Google measured 25,535m/2,179s; all six fares matched. The opaque reference was consumed once and removed, Edit Trip showed the transferred fields, native Back history returned to a usable planner, and visiting Booking normally started at step 1. Browser history checks account for the iframe's legitimate same-document entries. No booking POST, email or JavaScript error occurred.

[Home quick planner](https://bdreadyweb.com/carbook/) · [Main booking form](https://bdreadyweb.com/carbook/booking/) · [Settings](https://bdreadyweb.com/carbook/wp-admin/admin.php?page=tuxano-settings).

[Download 2.2.0 ZIP](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.2.0.zip): Media attachment **58**, **11,511,188 bytes**, **50 files**, SHA-256 `413f483db2c278ee34d9a555ac92b5fe4e86130e5f60a3e4a324b1501adb960a`. Unauthenticated HTTPS download returned 200/application-zip with exact bytes/hash. Integrity and parity for all plugin sources and nine shared modules passed. Keep 2.1.3 for rollback. Detailed evidence remains ignored under `wordpress-test-results/live-220/`, `quick-220/`, `map-probe-220/` and `full-browser-220/`; private credentials/helpers are excluded from the release.

All requested changes are complete and ready for the owner's desktop/physical-phone review. The quick shortcode can be inserted in the owner's real photo hero; the supplied test Home was empty, so this task added only the form, not unrelated marketing text or a hero photograph.
