# Tuxano Booking 2.1.1 — seven final refinements

Owner request: 23 October 2026. Direct live update and testing are authorized. The previous 2.1.0 ZIP is retained for rollback; existing content, bookings, keys and tariffs must be preserved.

- [x] 1. Transparent form html/body/iframe. The full-page template uses an isolated iframe with WordPress head/body/footer hooks and optional Elementor page CSS, allowing the outer page background without theme CSS affecting the form. Normal shortcodes stay transparent too.
- [x] 2. Remove the T monogram and “TUXANO · BOOKING WORKSPACE” text from every admin page.
- [x] 3. Refine the admin hierarchy, spacing and controls; readable 15px primary text/14px tables, with smaller auxiliary descriptions.
- [x] 4. Recent submissions defaults to newest three. Settings → Dashboard → Recent submissions to display supports 1–20. This private setting neither enters frontend configuration nor changes fare revisions.
- [x] 5. Match native Vehicles/Collections list and edit screens to the booking shell/navigation. Preserve core CRUD, notices, media, nonces and capabilities; unrelated admin screens remain unaffected.
- [x] 6. Choosing a map-search suggestion or named map place previews its actual location and keeps the map open. Confirm the exact Place ID, or move the pin and confirm the actual coordinates. Search results stay above the map in a bounded list; first-load input readiness and stale-search guards prevent lost/obsolete selections. Main address autocomplete remains direct.
- [x] 7. Restore the supplied original desktop/phone thank-you image hero, white receipt background, original typography and spacing. Dynamic booking details and current route/fare remain authoritative.

## Verification

Targeted checks passed: 97 Node assertions; 94 data/settings/fleet/pricing assertions on PHP 7.4.33 and PHP 8.3.35; 48 existing/new map browser cases; 10 frontend cases, including transparent parent background and 1440px/390px original thank-you heroes. Local actual WordPress wrapper confirmed parent background, iframe CSS isolation, resize, no overflow and one title. Twelve native administrator desktop/phone layouts passed, with default/control bounds and unrelated-screen isolation verified. Full regression, hosted compatibility, final archive and live update outcomes will be recorded after completion.
