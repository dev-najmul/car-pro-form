# TUXANO Booking 2.4.3 — smaller package and background settings

Seven unused lobby images have been removed. They no longer had any active form, template or vehicle references, and accounted for about 8.5 MB of the old ZIP. Used vehicle images, logos, fonts and the original thank-you photographs remain. Geographic timezone data stays unchanged to preserve scheduling accuracy.

## Background settings

Open **Tuxano Booking → Settings → Background images**.

- Main booking: keep the host page background, or select a custom desktop image and optional mobile image.
- Thank-you hero: retain the original design, select custom desktop/mobile images, or use no image with the existing navy hero.
- Select from the Media Library or paste a public HTTP/HTTPS image URL. Empty custom mobile fields use the desktop image. Custom mode requires a desktop image.
- Save settings to apply. Media Library images remain in WordPress uploads and do not increase the plugin ZIP. The quick card’s hero background remains controlled by its home-page section.

Defaults preserve the current appearance. Background changes do not alter pricing, routes, timezones, saved bookings or notifications.

## Install

Upload `tuxano-booking-2.4.3.zip` through WordPress → Plugins → Add New → Upload Plugin and choose Replace current with uploaded. Clear page/browser cache. Existing settings, keys, fleet and submissions are preserved. Keep 2.4.2 for rollback.

## Package and focused verification

The new ZIP contains **53 files / 25,009,197 bytes**, down from 33,514,258 bytes: **8,505,061 bytes smaller (25.38%)**. All seven unused lobby images are absent; active asset references resolve. ZIP CRC, source/nine-module/asset parity and checksum checks passed. SHA-256: **`0f38b179db14f50a8da62733f3c3177f20aca08cad0083fa4684faf0c517675d`**.

All 160 Node checks, 14 frontend-background browser cases and 14 focused admin cases (8 new background cases plus existing email/API regressions) passed. Actual authenticated local WordPress Media Library selection, saving/reloading both backgrounds, responsive layout, mobile fallback and public configuration checks passed. Temporary local media/settings were restored. All 14 plugin PHP files linted cleanly on PHP 7.4. Background preferences do not change an active pricing revision.

The seven isolated PHP 8.3 fixture suites passed **754 assertions**, including the strengthened 170-check data/settings suite; the data suite also passed on PHP 7.4. Local mail was intercepted, and native UI/HTTP checks did not create customer bookings or send real emails.

Source/release commit: `cfeb6b23402c0bf022d93b983387068b5b2d1012`. A complete public HTTPS200 application/zip download matched the exact bytes and hash: [Direct verified ZIP](https://raw.githubusercontent.com/dev-najmul/car-pro-form/cfeb6b23402c0bf022d93b983387068b5b2d1012/releases/tuxano-booking-2.4.3.zip). The final verification commit includes one additional test-only active-pricing assertion; package bytes are unchanged. Live-site installation is not claimed; deliver the ZIP for manual replacement because the current cloud policy excludes the live host.

The complete local browser regression passed **247/247 cases in 8.9 minutes**, with no skips or unresolved failures. **1,161 distinct local automated checks passed**: 160 Node + 754 PHP assertions + 247 browser cases. Existing GPS/map confirmation, quick booking, dates/hours, prices/extras/toggles, submissions, availability and notifications remained green.

Hosted [WordPress run 41421263715](https://github.com/dev-najmul/car-pro-form/actions/runs/41421263715) and [Browser run 41421263708](https://github.com/dev-najmul/car-pro-form/actions/runs/41421263708) both **succeeded** for exact source/release `cfeb6b23402c0bf022d93b983387068b5b2d1012`. The WordPress matrix covers PHP 7.4/8.1 with WordPress 6.6 and PHP 8.3/8.5 with current WordPress, including existing backend fixtures and the full browser suite. The final test-only active-pricing assertion was also verified locally on PHP 7.4 and 8.3; it does not change the released ZIP. Retain 2.4.2 for rollback and manually replace the site plugin with the verified 2.4.3 ZIP, then clear caches.
