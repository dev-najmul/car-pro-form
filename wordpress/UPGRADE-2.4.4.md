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
