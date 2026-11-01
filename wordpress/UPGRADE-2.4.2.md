# TUXANO Booking 2.4.2 — nearby suggested pickup

The owner requested an automatically filled nearby place when a computer cannot provide an exact GPS/address, with a simple way to correct it in both quick and main booking.

Changes:

- Preserve fresh high-accuracy positioning, the brief refinement window and normal accurate reverse-geocoded pickup behavior.
- When the reading stays approximate, or a precise reading has no usable street address, select the nearest valid real Google place/address around the detected area. Search is bounded to 500 m then 1,500 m and ten seconds; a genuine reverse-geocoded address Place ID is an optional fallback.
- Fill pickup with that canonical place’s name/address, Place ID and its actual coordinates. A coarse device estimate is never passed off as exact GPS or paired with another place’s identity.
- Show a compact **Suggested pickup nearby. Check or adjust on map.** notice and immediate map adjustment. The large accuracy warning/correction map does not open when a usable suggestion is found.
- Preserve suggested provenance across canonical restoration and the one-use quick-to-main handoff. Editing pickup or explicitly confirming a map point clears the suggestion notice. A cancelled adjustment retains the existing pickup.
- Calculate routes, fares and pickup timezone for the selected canonical point. Quick handoff carries no trusted quote, price, contact data or device-accuracy claim; the main page obtains a fresh quote.
- Retain the searchable correction map when Google cannot provide a usable suggestion. Denied location access still allows manual address entry. Cancelled, retried or obsolete provider callbacks cannot replace a newer pickup.

No booking/email/pricing rules, saved settings, fleet or existing submission records are changed. Existing Maps/Places configuration is reused. A nearby suggestion reflects the area reported by the device; check it before continuing, especially on a PC with an approximate location service.

## Install

WordPress → Plugins → Add New → Upload Plugin → select `tuxano-booking-2.4.2.zip` → Replace current with uploaded. Clear page/browser cache after replacing the plugin. Keep 2.4.1 for rollback.

Test the current-location icon in both home quick booking and the main form. Check the filled suggested address, use Adjust on map to change or keep it, and continue to a fresh vehicle quote. A genuinely accurate device reading retains its ordinary automatic address behavior.

## Verification

All **160 Node checks** passed, including canonical nearest-place selection, genuine address fallback, bounded searches, timeout/abort cleanup and one-use handoff sanitization. The **75 focused quick/main browser cases** passed, covering suggested canonical routing and refreshed fares, precise-address fallback, same-point confirmation, map refinement, stale callbacks/cancel/retry, reload provenance, provider attribution, phone fit and fresh quick-to-main canonical/timezone quoting. Four successful desktop/phone screenshots were inspected.

The actual local WordPress installation loaded active **2.4.2**, rendered its standalone frame and quick shortcode, served all nine shared modules byte-for-byte, and returned its native public REST session. Seven isolated PHP 8.3 fixture suites passed **722 assertions**; all **14 plugin PHP files** linted cleanly on PHP 7.4. Test notifications were intercepted locally; no real customer mail or reservation was created for HTTP smoke testing.

ZIP integrity, all-source/nine-module parity and the checksum sidecar passed: **60 files / 33,514,258 bytes**, SHA-256 **`14d9bfac4b5c6435f93da3ec71abd54a769bffef3d8f7362dca08747baafda12`**. A complete unauthenticated HTTPS200 application/zip download matched every byte and hash. Source/release commit: `b34c74669cbd962f6f790825effb062314d9f5ca`.

[Direct verified ZIP download](https://raw.githubusercontent.com/dev-najmul/car-pro-form/b34c74669cbd962f6f790825effb062314d9f5ca/releases/tuxano-booking-2.4.2.zip). Live-site installation is not claimed: the current cloud network policy still excludes the owner’s site. Deliver this ZIP for manual replacement. Automated device tests simulate readings; a nearby suggestion does not improve hardware GPS accuracy.

The complete local browser regression passed **225/225 cases** in **8.7 minutes**, with no skips or unresolved failures. Together with 160 Node and 722 PHP assertions, **1,107 distinct local automated checks passed**. Existing dates/hourly controls, maps/stops, fares/extras/toggles, country validation, submissions, notifications and availability stayed green.

Hosted [WordPress run 41291606473](https://github.com/dev-najmul/car-pro-form/actions/runs/41291606473) and [Browser run 41291606457](https://github.com/dev-najmul/car-pro-form/actions/runs/41291606457) both **succeeded** for exact source/release commit `b34c74669cbd962f6f790825effb062314d9f5ca`. The WordPress matrix covers PHP 7.4/8.1 with WordPress 6.6 and PHP 8.3/8.5 with current WordPress, including all existing backend fixtures and the complete browser suite. The 1,107 distinct checks count repeated compatibility runs once. The separate optional GitHub Pages preview is not required by the WordPress plugin.
