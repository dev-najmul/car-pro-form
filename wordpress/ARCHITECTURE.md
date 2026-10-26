# WordPress implementation contract

Plugin: `tuxano-booking`, version 2.3.0, namespace `Tuxano\Booking`, WordPress >=6.6 / PHP >=7.4. Existing static form stays supported. Build copies shared root frontend and assets into plugin `public/`; do not duplicate tracked image files.

## Runtime and UI
- One top-level **Tuxano Booking** menu: dashboard, submissions (custom private table, detail/status/admin notes, search/status/date filters/pagination), vehicles (private CPT `tuxano_vehicle` with native CRUD and taxonomy `tuxano_collection`), pricing, settings.
- Shortcode `[tuxano_booking]` embeds an accessible same-origin iframe, isolating existing design from theme CSS. `?tuxano_booking_form=1` serves the standalone document. The full-page template wraps that same isolated transparent iframe with WordPress head/body/footer hooks and guarded Elementor page CSS; page templates/content remain unchanged. Parent resize bridge validates origin/window. Shared app supports optional `globalThis.TuxanoBooking` runtime; static mode keeps its current behavior.
- WordPress bootstrap does POST `/tuxano-booking/v1/session`, then imports app. Response `{token, vehicles, settings, maps:{browserKey,browserConfigured:true,routesConfigured:true,providerMode:'remote',routeEndpoint:restUrl+'route'}, restUrl}`. POSTs use `X-Tuxano-Session: token`, JSON, same-origin credentials; logged-in REST requests also use `X-WP-Nonce` supplied by frame config. Session response is private/no-store.
- `vehicles`: `{id,name,display,capacity,luggageCapacity,image,models:[],features:[],category,categoryDescription,tariff:{base,perMile,perDrivingMinute,minimum,perWaitingMinute,hourly}}`; image absolute URL; id is string WP post ID. Categories grouping must be dynamic. Defaults seed six current vehicles/categories on activation, once, editable.
- `settings` public: `{currency,currencySymbol,meetPrice,firstSeatPrice,additionalSeatPrice,defaultGratuity,companyName,supportEmail,supportPhone,website,termsUrl,privacyUrl,maxStops,minHours,maxHours}`. Private keys/admin email never returned. Browser Maps key intentionally public.
- Route POST accepts `{origin:{placeId}|{latitude,longitude},destination:...,stops:[]}`. Returns `{distanceMeters,durationSeconds,provider:'google',calculatedAt,quoteToken}`. Google calls only on PHP server using private key, fixed Google endpoint, bounded timeouts, same route settings as static. Quote token links verified route to session for 15min.
- Booking POST `/bookings` accepts `{booking: state,quoteToken,requestKey,website:''}`. `booking` matches root app state schema. Server validates locations against quoted origin/destination/stops, time, vehicle/capacity, billing/passenger/consent/options; recomputes all fares/extras/gratuity from stored tariffs and route metrics, never client totals. Returns `{requestId,pricing,route}` after durable save. `pricing`: transportation,carCost,boosterCost,seats,meet,percent,tip,total,currency. Failures use WordPress REST errors `{code,message,data:{status}}`. Quotes carry pricing revision; changed settings require refreshed quote. Idempotency key prevents duplicate bookings/emails on retry.
- Server-side session/origin checks, bounded per-session/IP rates, honeypot, body limits; no anonymous submission-reading API. Admin actions require manage_options + nonces. Keys write-only in admin; blank preserves, explicit clear removes. WordPress options not autoloaded. No keys/passwords in source/logs/release.

## PHP services and data contracts

- `Countries`: bundled 249-country ISO registry, identical canonical English names to `countries.js`; normalizes legacy ISO codes and current names. Region/postal code are optional globally.
- `Settings`: capability-checked partial merge, validated prices/limits/branding, explicit clear/preserve semantics for keys, public whitelist and tariff revision hash. Browser keys are intentionally public; Routes keys are never returned.
- `Vehicles`: private native CPT/taxonomy, media images, capacities, exact category/name/model/features and six tariff components. Explicit None/blank components map to zero; missing form groups never silently erase rates. One-time seeding never overwrites existing fleet edits.
- `Pricing`: independent server calculation of route-derived transportation, waiting, extras and gratuity. No client totals are accepted. Rounded values match shared `pricing.js`.
- `Database`: private `{$wpdb->prefix}tuxano_bookings` table, prepared bounded listings/counts/deletion, unique reference/request key, decoded JSON snapshots, privacy/retention hooks. Version 2.1 adds `revision`, `updated_at`, `history`, `update_mail`, `update_mail_revision`, `update_mail_started` with an additive `dbDelta` migration. Old NULL history is decoded without PHP deprecations.
- `BookingUpdates`: administrator-only complete edits. Validate through shared request rules, permit valid historical dates/options, preserve accepted metrics/prices/snapshots for contact-only changes, reroute changed points on the server, and recalculate priced changes/explicit repricing through `Pricing`. A removed fleet item can still receive contact corrections using its accepted snapshot.
- `Database::revise`: append the actor/time/field changes and first immutable original snapshot in the same compare-and-swap write as the booking revision. Stale revisions return 409. Original reference, request key/hash and creation time remain immutable. A visitor retry after an admin edit still receives its original receipt, with no private history or contacts returned.
- `Notifications`: branded HTML plus scoped plain-text alternative. Initial customer/admin transport states and send leases are independent. Optional customer updates run only after the revision commits, with their own revision-bound status/lease. Accepted messages are not resent by normal retries. Explicit stalled recovery is labelled as uncertain previous delivery.
- `Admin`: one coherent menu, screen-scoped styles/scripts, per-page/search/status/date filters, View/Edit, bounded selected-row deletion, native vehicle/category editing, pricing/settings and explicit key connection checks. All form writes require `manage_options` and purpose-specific WordPress nonces. Full editor validation retains input on failure and exposes field errors without storing private data in URLs.
- `Frontend`: shortcode isolation, uncached full-page template/standalone document and safe bootstrap. API keys, editor boot data and user text are escaped appropriately for each HTML/JSON context; only the public browser key enters the SDK.

### Administrator endpoints

`POST /admin/route` and `/admin/test-api` require administrator capability, REST nonce, exact same-origin JSON and bounded input. Route/candidate Routes-key tests use only the fixed Google HTTPS endpoint with normal TLS checks, no redirects, bounded timeouts/responses and provider budgets. No visitor-selected fetch URL is accepted. Testing a candidate does not save it.

The browser test returns the intentionally public browser key only to the protected caller. An isolated fresh same-origin frame loads that candidate into Maps/Places, so a previously loaded SDK cannot produce a false success for a replacement key. Parent checks message origin/source/random request ID, enforces a deadline and removes the frame/listener. Configured status is distinct from actual API authorization.

### Country validation boundary

Google Places `addressComponents` supply country codes in the normal UI. Destination/stop suggestions are restricted to the selected pickup country and known conflicts are rejected. Server validation checks metadata shape/ISO membership and known conflicts, but those hints are not independently provider-verified server geography. Unknown coordinate countries are not guessed or snapped to nearby businesses. Actual Google driving metrics and exact selected pointers remain the fare authority; no additional Geocoder/client account requirement was added.

### Shared frontend modules

`app.js` handles dynamic fleet/configuration, in-memory WordPress workflow, accessible field feedback and navigation. `maps.js` handles explicit Place selection, country restrictions and measured route transport; `pickup-map.js` exposes the same guarded picker for every itinerary point. Arbitrary pins require confirmation; searched/named addresses preview their exact Place ID until deliberate confirmation. Typing-only previews never create a booking point. `countries.js` contains stable canonical names without browser locale variation. `embed.js` validates origin/source/frame ID for both resize and navigation messages. Versioned complete public assets prevent stale imported modules after upgrades.

## Verification / delivery
Use isolated Docker WordPress + MariaDB for integration, PHP lint, deterministic mocked provider tests + actual Google route tests. Live install only supplied dedicated test site; preserve existing pages/plugins/settings. Upload ZIP and create a separate booking test page, do not overwrite site home page. Use latest credentials from user privately; never track them. Existing Google keys reused through ignored local secrets. Notifications may be intercepted in local test mail transport; actual mail acceptance/delivery reported distinctly. All implementation decisions and remaining limits go in project.md. Production-oriented code does not imply a claim of absolute security certification.

Version 2.1.1 refines the shared admin shell across native Vehicles/Collections and removes decorative workspace branding. Settings `dashboard_recent_limit` is a private bounded integer (1–20, default 3), excluded from public configuration and pricing revision. Map search/POI selection previews instead of committing immediately; deliberate confirmation preserves exact Place identity, while moving the pin selects raw coordinates. First SDK readiness and cancellation generations protect pending selections. Original thank-you hero/typography restored; form document backgrounds are transparent.

Version 2.1.2 adds ten validated six-digit header/progress colors in public `formColors`, rendered through fixed form-only CSS variables and excluded from pricing revisions. The admin fills available width. Initial maps center on the US; debounced nonbinding typing previews use real provider details with transient same-prediction reuse and cancellation/country guards. Secure resize messages include bounded `view` state, allowing only an empty trailing Elementor Text Editor paragraph run adjacent to the authenticated embed to be hidden on thank-you and restored on form/reset. This removes the owner-observed 38.4px tail without rewriting owner content or removing the footer.

Version 2.1.3 allows deliberate confirmation of the validated address currently previewed on the map, including after phone keyboard dismissal/scrolling. `onPreview` stays separate from selected booking state. `confirmSelection()` validates query/generation/country and actual map center before returning the exact provider point; it never substitutes coordinates from an unfinished pan. Editing/Escape/map interactions invalidate preview, remounts clear stale UI, and late nearby context retains its original country. An untouched initial US center cannot be confirmed. Phone contact/review section bodies align with their icons through 639px; desktop and passenger spacing is retained.

Version 2.2.0 supersedes camera-center equality with explicit-intent and SDK movement/idle readiness: equivalent wrapped worlds must not invalidate a named Place ID. Normalize only SDK coordinates, anchor the visible pin through OverlayView to the nearest visible world, and produce manual coordinates only after actual user camera movement settles. Cooperative page scrolling alone leaves the selected intent intact. Toggle checked/focus styling uses general sibling selectors because validation can insert hidden elements between input and track.

`[tuxano_quick_booking]` renders native inline HTML/CSS/ES modules so backdrop blur can see its parent hero. It obtains fresh public session settings, without a cached token/nonce or global main-runtime collision. Settings `booking_page_id` resolves only a published, unprotected, same-origin page; its public URL is excluded from fare revision. `quick-handoff.js` stores only whitelisted trip intent in a one-use ten-minute sessionStorage record bound to the destination. The URL fragment contains a random 128-bit reference, never addresses, credentials, prices, quotes, contact or consent. The fresh main frame consumes its matching parent's intent, re-resolves canonical places and fetches a new authoritative route before step 2. Invalid data/provider failure stays on step 1. Edit/navigation/picker generations prevent late auto-navigation; Back/BFCache and invalid-configuration retries restore a usable quick planner. Quick mode never submits a reservation.

Quick date/time fields progressively enhance native inputs only when `showPicker()` is supported. Trusted click/tap and Enter/Space invoke it synchronously; unavailable or denied APIs retain visible, keyboard-editable native fields. Input/change events keep the floating display synchronized.


## Vehicle pickup-slot integrity and lifecycle notifications

Version 2.3.0 adds `Availability` and the always-present public capability
`availabilityChecks`. Session-bound POST `/availability` accepts only vehicleId,
date and time, returning state/message without customer or request data. It uses
fresh no-store responses and per-session/network limits. The frontend checks
on vehicle selection and freshly before step 3, with acknowledged pending
warnings, confirmed blocks, stale-response guards and an accessible dialog placed
inside the visible parent viewport of autosized shortcode frames.

`vehicle_id` and `pickup_utc` are derived from validated saved vehicle/date/time
and the recorded timezone; the existing local `pickup_at` remains intact.
Confirmed rows have a unique nullable SHA-256 slot key. Short site-specific MySQL
advisory write leases serialize conflict lookup and persistence; the database
unique index independently prevents two confirmed slot keys. Network/provider
requests and mail transport run outside the lease. Pending rows do not reserve
a vehicle. Completed/cancelled rows release the slot. Original idempotent
receipt replay precedes fresh conflict checks. Bounded additive backfill retains
payload, history, prices and statuses; unresolved confirmed schedules and
incomplete active migrations fail closed.

Each committed confirmed/cancelled/completed transition schedules one customer
update revision when customer emails are enabled. Transport claims/retry guards
remain separate from initial customer/admin receipts. Generic same-status edits
retain optional detailed-update emails. Email HTML uses tables/inline styles and
plain-text alternatives; the configured logo is display-only HTTP(S) branding,
never fetched by the server, exposed publicly or included in pricing revisions.
