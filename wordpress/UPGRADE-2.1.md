# Tuxano Booking 2.1.0 — approved upgrade checklist

Source: the owner's 22 October 2026 uploads `1.docx`, `2.docx` and three screenshots. Both documents were read completely. `2.docx` contains the stated eight main points; `1.docx` adds five main groups, including multiple contact/address subrequirements. This checklist covers all thirteen groups. The owner authorizes implementation, tests and updating the supplied dedicated WordPress test site, followed by their manual review.

## Frontend: 1.docx

- [x] F1. Remove the hotel photograph background from all form steps/thank-you; retain title/form and use legible, polished light styling.
- [x] F2. Limit desktop content in steps 2–5 to 1200px, with sensible padding and no phone overflow.
- [x] F3. Step navigation starts at the top. Cover the standalone page and parent page when embedded with a shortcode; validate iframe message origin, source and ID.
- [x] F4. Contact/billing validation identifies each invalid field with a red border, useful inline text, accessible error association and focus. Include every ISO country and make State/Province a text field for every country, including the US. Server validation remains authoritative.
- [x] F5. Reduce excessive typography/spacing/control sizes for laptops while preserving mobile readability, touch targets and the existing visual identity.

## Admin and trip: 2.docx, eight points

- [x] A1. Premium dashboard and admin screens with coherent cards, hierarchy, navigation, responsive tables and accessible contrast.
- [x] A2. Submissions: per-page selector, pagination, explicit View/Edit actions, all-information editing, delete on edit, selected-row bulk deletion with confirmation, and optional customer notification after a saved change. Retain original submission history and protect against stale concurrent edits. Updated emails include an itemized estimate; no payment status, tax or legally finalized invoice is invented.
- [x] A3. Explain each vehicle tariff and its units/formula. Each component can explicitly be uncharged/None (zero), with validation and no silent alteration of existing tariffs.
- [x] A4. Collections keeps the Tuxano Booking parent menu expanded and correct submenu selected.
- [x] A5. API settings show a green configured status and masked value; clear/replace controls are explicit. Validate format and provide truthful connection checks, distinguishing saved/configured from actual authorization. Never echo the private Routes key.
- [x] A6. Branded responsive HTML customer, administrator and booking-update emails aligned with form colors/logo; include trip/stop/fare details and honest request/transport status.
- [x] A7. Trip: map selection for pickup, every stop and drop-off; selected map address/POI can populate its intended field; Travel time hidden until a real route can be requested, then loading/result; pickup-country-aware suggestions and helpful cross-country validation using actual Google country components. Unknown coordinate countries are never guessed.
- [ ] A8. Cross-check all menus/settings/form flows, regression/security boundaries and PHP compatibility. Author **Farhan**, URL **https://farhanrajnajmul.com/**. Preserve the live site's PHP 7.4.33 compatibility while testing current PHP too.

## Implementation and validation decisions

- Keep version 2.0.1 ZIP/source as rollback; build a separate version 2.1.0 ZIP with versioned complete frontend assets. Preserve existing records, vehicle tariffs, settings, pages and homepage.
- Administrator writes require `manage_options` and WordPress nonces. Recompute edited-route metrics on the server and edited fares from validated tariffs; discard client totals. Save before sending update mail; keep update notification status separate from initial customer/admin messages. Bounded, explicit bulk deletion only.
- Country restrictions improve selection using Google's country components. Exact provider-selected points and measured Routes results remain authoritative. Server country verification depends on an authorized provider endpoint; document the actual enforcement and limitations after testing rather than claiming client metadata is a security boundary.
- Test deterministic unit/browser/PHP fixtures, including malformed/stale/unauthorized edits, no-charge fares, notification retries, country conflicts and iframe scroll guards. Run PHP fixtures sequentially on PHP 7.4.33 and current local PHP. Run hosted compatibility checks, real Google/live-site booking and admin edits, and responsive visual checks.
- Live tests use clearly marked synthetic bookings. Notify only as expressly selected; distinguish `wp_mail` acceptance from verified inbox delivery. Keep credentials, cookies, API keys and local testing helpers outside source/releases/logs.
- Complete implementation and testing before reporting the plugin ready for the owner's final manual review. Record concrete outcomes below and in `project.md`; no absolute vulnerability-free certification is implied.

## Verified outcome

Implementation is complete. Local verification: 97 Node checks; 91 complete frontend browser cases plus 3 isolated administrator API cases; 80 data/pricing, 114 REST and 158 upgrade/security checks on PHP 7.4.33 and PHP 8.3.35. Native administrator browser checks passed: pagination, complete editor, contact edit with optional customer notification, server route edits, responsive editor, confirmed bulk deletion, Collections expansion, and None tariff persistence. Customer/admin/update email layouts passed at 1280px and 390px (six render cases), with decoded logo and no overflow. Final live deployment and hosted compatibility outcomes are pending and will be recorded below.
