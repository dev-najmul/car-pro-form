# TUXANO Booking 2.4.5 — readable long addresses

Vehicle selection previously placed addresses, date, both clocks and Edit Trip in one flex row. Long addresses could consume the available width, squeeze the date into a character column and overlap the time/action.

The trip summary now gives full pickup/drop-off addresses a balanced route row, with date, both pickup clocks and Edit Trip in a separate responsive schedule row. Addresses wrap naturally, including long multilingual text and unbroken strings. Phones stack the sections vertically. No address is shortened or removed, and the same selected locations, routes, prices and saved pickup schedules are retained.

## Install

Upload `tuxano-booking-2.4.5.zip` through WordPress → Plugins → Add New → Upload Plugin and choose Replace current with uploaded. Clear page/browser cache. Existing settings, keys, fleet and submissions remain. Keep 2.4.4 for rollback.

## Verification

The reported baseline was reproduced: the date wrapped into **nine lines** with a long Bengali pickup and English destination. The updated layout passed **seven focused cases** covering 1440/1024/768/390/320 px, long multilingual addresses, an unbroken token and short addresses with configured 1/1/2 px typography. The date remains on one line; addresses, both clocks and Edit Trip do not overlap. Full text, icon sizes, canonical route IDs, Maps links and edit/restore behavior are preserved. Desktop and phone screenshots were inspected.

Syntax checks and **170 Node checks** passed. **36 existing browser regression cases** passed across dual clocks, typography and frontend layout. The actual local WordPress frame served version **2.4.5**, and served app/CSS bytes matched source. No booking or email was created by those HTTP checks.

ZIP: **53 files / 25,013,015 bytes**; SHA-256 **`a95a3fe813390120867f44bbf1a9a94f7aeae347d30cbf8149d47f0ab63a6355`**. CRC and complete plugin/nine-module byte parity passed. All existing backend class and timezone data files are byte-identical to 2.4.4. The change is confined to frontend summary markup/CSS plus release metadata.

Source/release: `70c64515d82d0fba6ce0640c9f8fd7e450dfb24c`. The complete unauthenticated HTTPS200 application/zip download matched every byte and hash: [Direct verified ZIP](https://raw.githubusercontent.com/dev-najmul/car-pro-form/70c64515d82d0fba6ce0640c9f8fd7e450dfb24c/releases/tuxano-booking-2.4.5.zip).

Hosted [WordPress run 41903591187](https://github.com/dev-najmul/car-pro-form/actions/runs/41903591187) and [Browser run 41903591312](https://github.com/dev-najmul/car-pro-form/actions/runs/41903591312) both **succeeded** for that exact source. The matrix covers PHP 7.4/8.1 with WordPress 6.6 and PHP 8.3/8.5 with current WordPress. **1,247 distinct automated checks passed**: 170 Node + 796 PHP assertions + 281 browser cases, counting compatibility repetitions once. Existing GPS, typography, dual clocks, emails, availability, pricing and submissions stayed green. The cloud policy excludes the live host, so deliver the verified ZIP for owner manual replacement rather than claiming a live-site installation.
