# Tuxano Booking 2.1.3 — phone map confirmation and alignment

Owner request: 24 October 2026 (Asia/Dhaka). The owner authorized a tested live update; retain 2.1.2 for rollback and preserve current content, records, settings and prices.

1. Fix phone map confirmation after search/preview. Reproduce real touch interactions and preserve deliberate address confirmation, exact provider identity, country consistency and cancellation guards. Never silently commit a typed prediction.
2. Align phone step 4 billing fields and step 5 review content with their section icons, preserving desktop layout.

Both changes are implemented. Map confirmation now uses a separate validated preview and a synchronous guarded selection getter. Keyboard dismissal closes predictions while keeping the visible preview available for an explicit tap on “Use this map point.” Query/generation/country/actual-center checks reject stale or moving-map confirmation; remounts clear stale preview UI. Exact Place IDs are preserved; only actual manual pin selection produces raw coordinates. Default US view remains unselected. Disabled buttons now appear disabled.

Phone billing section bodies and review details/vehicle/contact bodies use the icons' left edge through 639px. Desktop indentation and passenger layouts are retained.

Targeted checks passed: **97 Node**, **19 map-picker browser cases**, **17 frontend cases**. Seven new picker regressions include touch-enabled preview/blur/scroll confirmation across all three fields, deliberate second-suggestion selection, motion/country/edit cancellation and remount/late-response guards. New 320/390px geometry checks reproduced the old 44px offset and passed after the fix; desktop spacing remains unchanged. Independent source review found no remaining concrete blocker. Full compatibility/browser and live deployment results will be recorded after completion.
