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

Targeted results: **109 Node checks**, **137 data/settings/fleet assertions on actual PHP 7.4 and 8.3**, **12 quick browser cases**, **28 map-picker cases**, and **three toggle cases** passed. Native WordPress HTTP rendering confirmed the real CSS/module enqueue, 440px desktop card with blur14 and a white phone card without overflow; its temporary local page and setting were restored. Independent read-only review found no concrete remaining blocker. Full 146-browser compatibility and live outcomes will be recorded after completion.
