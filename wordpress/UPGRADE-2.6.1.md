# TUXANO Booking 2.6.1 — focused form revisions

This update applies the requested concepts from **Form Changes 11.06.2026** within the current booking design. The mockups are content and interaction references; they do not replace the existing theme, five-step flow, typography controls, button palette or responsive layout.

## Quick booking

- Add and remove ordered stops before drop-off, within the existing administrator stop limit. Selected Google places and waiting choices travel with the one-use trip intent; the main form still restores canonical locations and obtains its own current server quote.
- Remove the routine pickup-timezone disclosure and the estimated-pricing footer. Geographic pickup-timezone lookup and validation remain active.
- Show numbers only between the Hourly minus/plus controls. The duration label matches the other quick fields, the minimum/maximum note is compact, and the Trip Notes helper has no surrounding frame.
- The upgrade applies the requested **3–24 hours** range once, including installations with an older saved 12-hour maximum. Previous limits are backed up, and later administrator changes remain effective without being reset on reactivation.

## Main Step 1

- Remove repeated gray selected-location panels and repeated per-address Google Maps links. Retain one pickup search instruction, autocomplete and accessible map adjustment icons for pickup, stops and drop-off.
- Remove repeated map-choice text, routine timezone prose, Terms/Privacy links and redundant route explanations from this step. Keep Google branding/provider attribution where required and actionable loading or failure feedback.
- For **Transfer**, replace the detailed travel breakdown with a compact **Trip Estimate**: passenger distance in miles, estimated travel time including selected stop waiting, and estimated arrival. Keep the Google route link.
- Offer Transfer stop waiting choices **15, 30, 45, 60, 75, 90 and 120 minutes**, starting at 15. The server and administrator editor also retain older valid waiting values so historical records remain editable.
- For **Hourly**, retain stops for route planning but remove their waiting selectors. New public Hourly trips pass zero explicit stop waiting through route context, estimates and submission, so an invisible waiting surcharge cannot remain after switching service or restoring a draft.
- Use a numeric-only full-width Hourly control and a compact service note. The **Hourly Summary** shows booked service, pickup-local service start and estimated service end instead of passenger travel metrics. The driving route is still calculated internally for the unchanged Hourly pricing formula, and its Google Maps route link remains available.

Estimated times use the verified pickup timezone, rather than the visitor's device timezone. Elapsed travel/service time is added to the pickup instant; a date change is indicated when the estimate crosses midnight. Existing daylight-saving validation remains in place. Chicago pickups retain Central Time and Indianapolis pickups Eastern Time in summaries and confirmation.

## Pickup-time selection

Main and quick forms share a compact **hour / minute / AM–PM** chooser. New minute selections are **00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50 and 55**. The field continues to store the existing canonical `HH:mm` value. The date field retains its working native date picker.

The controlled chooser avoids relying on an iPhone's native 12/24-hour preference. Existing saved times are not silently rounded when opened or cancelled. Secondary 24-hour clocks remain limited to the existing summaries, thank-you page and email locations.

## Vehicle pricing and review

Remove the “Includes … min waiting” note from vehicle cards. Show nonzero selected waiting in the itemized price summary without adding it twice or changing the all-inclusive total.

The final checkbox reads **“I agree to the Terms & Conditions.”** A separate **View Terms** link appears below it when a valid Terms URL is configured in **Tuxano Booking → Settings → Terms of use URL**. As explicitly requested by the owner, it opens a new tab; this update adds no PDF download, document viewer or replacement legal text. Clicking the link does not accept consent or submit the booking.

## Preservation and installation

The separate Transfer/Hourly rates, service base and pricing migration from [2.6.0](UPGRADE-2.6.0.md) remain intact. No fleet rates are reset. Accepted historical prices, original route/tariff snapshots, existing administrator waiting values, slot protection and duplicate-safe submission handling remain supported. Hiding new public Hourly waiting does not rewrite older accepted bookings.

Back up the current plugin and database, upload `tuxano-booking-2.6.1.zip` under **Plugins → Add New → Upload Plugin**, choose **Replace current**, and clear site/browser caches. Review the existing Terms URL. The service-hour range becomes 3–24 once during this upgrade and remains editable afterwards. Test the default Chicago service base with a reachable US trip. Preserve the 2.6.0 ZIP and database backup for rollback.

## Verification

All **225 Node checks** passed. The ten native backend suites passed on both **PHP 7.4 and 8.3**, totaling **1,508 assertions per version** after the updated 217-assertion settings suite. All **15 plugin PHP files** lint cleanly on PHP 7.4. The complete local browser suite passed **338/338 cases in 16.1 minutes**, covering compact estimates, both DST transitions, midnight rollover, waiting itemization, Hourly zero-wait transitions/drafts, quick-stop import, Terms, picker interactions and existing booking flows. **2,071 distinct automated checks passed**, counting repeated PHP compatibility runs once. The exact release source also passed the [complete hosted Browser run](https://github.com/dev-najmul/car-pro-form/actions/runs/42581507624).

Review caught and fixed duplicate map controls during GPS preview and a service rerender. Three affected regressions passed after the correction. Stop-bearing quick intents use protocol version 2 so a cached older consumer rejects them instead of silently dropping the stops; new consumers continue accepting older no-stop intents. Both updated stop handoff journeys passed.

The final ZIP contains **57 files / 25,039,775 bytes**, SHA-256 **`e2c136aa0c179e4a582e822b5374b48e3c56e35cc10a90f5934bdb3f7ffe9ddb`**. CRC, complete plugin-source and twelve shared frontend-file byte parity passed. Original images and geographic timezone data remain unchanged. Desktop and phone screenshots were inspected; temporary helpers, credentials and uploaded client documents are excluded. Actual local WordPress HTTP/browser verification confirmed the native frame, real session, all twelve served JS/CSS files, the 3–24-hour range and touch AM/PM selection without public REST mocks, external provider requests, booking creation or mail.

A real iPhone Safari permission/picker session, live Google-provider acceptance and live-site installation must not be inferred from controlled automated browser tests. This ZIP is prepared for manual replacement; the verified pinned download and final hosted checks are recorded below.

Final hosted verification succeeded on exact source/release `ef582d8379fe8fd9c37f5fa0c6148a167ea44671`: [Browser checks](https://github.com/dev-najmul/car-pro-form/actions/runs/42581507624) and [WordPress verification](https://github.com/dev-najmul/car-pro-form/actions/runs/42581507633) both passed. All four compatibility targets completed: PHP 7.4/8.1 with WordPress 6.6 and PHP 8.3/8.5 with current WordPress. The complete 338-case browser suite and packaged ZIP activation passed. CI uses a fixed Ubuntu 24.04 runner and checksum-pinned WP-CLI 2.12.0 invoked through PHP.

[Download the verified 2.6.1 ZIP](https://raw.githubusercontent.com/dev-najmul/car-pro-form/ef582d8379fe8fd9c37f5fa0c6148a167ea44671/releases/tuxano-booking-2.6.1.zip). The full public download matches all **25,039,775 bytes** and SHA-256 **`e2c136aa0c179e4a582e822b5374b48e3c56e35cc10a90f5934bdb3f7ffe9ddb`**. Source, ZIP and checksum are preserved on main; no live-site installation is claimed.
