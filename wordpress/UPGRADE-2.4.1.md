# TUXANO Booking 2.4.1 — GPS recovery

The supplied main/quick screenshots report device accuracy **within 100 km**. Version 2.4.0 correctly prevented that estimate from silently becoming an exact rental pickup, but its quick-form error and separate main-form correction action made the button appear unusable.

Changes:

- Prefer a high-accuracy `watchPosition` reading, retain the best fresh result and wait at most six seconds for improvement after the first coarse result. Precise fixes resolve immediately. A hard 20-second deadline covers silent native providers. Current-position-only providers remain supported.
- Abort and clear tracking, timers and listeners on completion, permission errors, cancel, retry, pickup edit, map opening and navigation. Ignore stale positioning/address callbacks.
- If a fix remains approximate, automatically open a searchable map centered on the estimate in **both quick and main forms**. A readable estimated-area label is optional context; it never replaces the selected pickup.
- Require a deliberate search result, map tap or settled pan followed by confirmation. The untouched estimated center cannot be confirmed, and an unresolved map cannot silently progress using an old pickup. Existing route/prices remain unchanged until a valid selection.
- A confirmed quick map pin preserves exact coordinates or canonical Place identity and proceeds through a one-use opaque handoff to a fresh main quote/timezone/Step 2. It does not pretend to be an accurate GPS reading.
- Preserve precise GPS automatic reverse-geocoded address behavior, native date/time pickers, hourly controls, all prices, bookings, status notifications, admin controls and saved configuration.

## Verification

Results are recorded after the final regression run. Actual browser/device services determine physical accuracy. Automated tests simulate device readings; live Google authorization and physical GPS accuracy are distinct. The authorized site's cloud access remains blocked, so this release is delivered as a verified ZIP for manual upload.

## Install

WordPress → Plugins → Add New → Upload Plugin → select `tuxano-booking-2.4.1.zip` → Replace current with uploaded. Existing settings/keys/data remain in place. Keep 2.4.0 for rollback.

Click current location in either form: an accurate reading fills the address; an approximate reading opens the correction map. Search/tap your exact pickup, then confirm. A computer without an accurate location service still needs that deliberate choice.
