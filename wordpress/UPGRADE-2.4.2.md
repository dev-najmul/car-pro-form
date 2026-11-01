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
