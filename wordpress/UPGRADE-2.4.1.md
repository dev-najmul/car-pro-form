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

Local verification passed **145 Node checks and all 207 browser cases** (7.9 minutes), including desktop/touch refinement, cancellation, coarse map correction, stale callbacks, exact quick-to-main handoff, existing maps/places/countries, fares/extras, scheduling, submissions and native pickers. Three focused map screenshots were inspected; both desktop glass and narrow-phone white cards fit without horizontal overflow.

The actual local WordPress installation loaded active **2.4.1**, served its standalone frame and all six checked versioned map/quick modules, and returned the existing public booking capabilities. No reservation was submitted by these native HTTP checks. All 14 plugin PHP files passed PHP 7.4 lint; backend business logic is unchanged from 2.4.0.

ZIP integrity and all-source/shared-module parity passed: **60 files / 33,511,756 bytes**, SHA-256 **`bbb21fcbf2ba9fd125e7306683ff1e8fd9276899384c9f2d147959ed6f5c4020`**. Unauthenticated HTTPS returned application/zip and the complete download matched those exact bytes/hash. Implementation/release commit: `e84e386f333575fb408b5ef1f36b5d7145e13aaf`. Keep 2.4.0 for rollback.

Hosted [WordPress run41273365271](https://github.com/dev-najmul/car-pro-form/actions/runs/41273365271) and [Browser run41273365176](https://github.com/dev-najmul/car-pro-form/actions/runs/41273365176) both succeeded for that exact commit. The WordPress workflow covers PHP7.4/8.1 with WP6.6 and PHP8.3/8.5 with current WordPress, all existing backend fixtures and the full browser suite. **1,074 distinct automated checks passed**, counting compatibility repetitions once: 145 Node +722 PHP assertions +207 browser cases. The separate legacy GitHub Pages workflow failed in its optional two-hour Routes-preview startup, before publishing; the WordPress plugin uses its own PHP backend and does not depend on that temporary preview.
 Actual browser/device services determine physical accuracy. Automated tests simulate device readings; live Google authorization and physical GPS accuracy are distinct. The authorized site's cloud access remains blocked, so this release is delivered as a verified ZIP for manual upload.

## Install

WordPress → Plugins → Add New → Upload Plugin → select `tuxano-booking-2.4.1.zip` → Replace current with uploaded. Existing settings/keys/data remain in place. Keep 2.4.0 for rollback.

Click current location in either form: an accurate reading fills the address; an approximate reading opens the correction map. Search/tap your exact pickup, then confirm. A computer without an accurate location service still needs that deliberate choice.
