# Tuxano Booking 2.3.0 — emails and vehicle availability

Owner request: 26 October 2026 (Asia/Dhaka). Direct update/testing of the supplied WordPress site is authorized.

The implementation plan and acceptance checks are recorded in [project.md Section 25](../project.md#25-branded-emails-and-vehicle-pickup-slot-availability--26-october-2026). Scope: thank-you-style receipt emails and configurable logo, concise automatic customer lifecycle notifications, and exact-minute per-vehicle availability checks with server-side conflict prevention. Pending requests warn; confirmed bookings block; a different vehicle remains available.

Current stage: implementation and isolated verification. Keep 2.2.1 for rollback. No live customer notification is sent merely by upgrading or backfilling schedule indexes.
