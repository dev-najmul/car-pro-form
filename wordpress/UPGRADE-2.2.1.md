# Tuxano Booking 2.2.1 — quick date and time selection

Owner report: 26 October 2026 (Asia/Dhaka). Date and Time in the quick-booking form did not open their pickers when the field was clicked.

The transparent native input only focused its invisible date/time segments; desktop browsers normally opened the chooser from a small indicator. The fix invokes the supported native picker synchronously on trusted clicks, touch taps, Enter or Space. Unsupported or denied programmatic pickers fall back to visible editable native fields. Input/change keep the displayed selection synchronized.

Scope is limited to quick-booking frontend activation and release metadata. Native validation, timezone, trip transfer, route pricing, admin settings and stored submissions retain their contracts. Version 2.2.0 remains available for rollback.

Validation before packaging: syntax checks and 109 Node checks passed; all 12 existing quick-booking browser scenarios and five new picker regressions passed. The new regressions open real Chromium popup widgets and select values with keyboard events, rather than filling inputs directly. They cover desktop click, touch tap, Enter/Space and unsupported/denied API fallbacks. A browser-only candidate override on the actual home page also opened the date calendar and time chooser and accepted selections without JavaScript errors.

Installation and final live checks are recorded below after deployment.
