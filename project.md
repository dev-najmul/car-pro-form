**Current prototype direction (19 October 2026):** version 1.2.2 adds verified device-location confirmation to the existing deliberate Places selection and exact-location Maps links, using the supplied server key in a temporary test backend. The client does not need to change Google Cloud settings. See [Section 15](#15-current-location-accuracy-correction--version-122) for the latest device-location fix and [Section 14](#14-location-accuracy-investigation--version-121) for address selection and [Section 13](#13-temporary-server-routes-preview--version-120) for test hosting.

# Car Pro Form — Project Specification

## 2026-10-18 — Google Maps integration scope

The owner requested continuing the static prototype before its eventual WordPress conversion. This update adds real Google Places (New) location selection and Google Routes driving estimates; it does not implement booking submission or convert the form into a WordPress plugin.

- **Confirmed by the owner:** keep a separate **Pickup time** clock input. Add a read-only, automatic **Travel time**, equal to Google's driving duration plus the selected waiting minutes at every intermediate stop. Duration is not a pickup clock time.
- Pickup, drop-off, and every added stop receive Google Places suggestions. Text must resolve to a selected canonical place; editing it clears the old place/route/quote. Ordered stops have stable identifiers and a wait-duration selector (0, 5, 10, 15, 20, 30, 45, 60, 90, 120 minutes; initial 5).
- Google Routes supplies the complete driving route through all stops, its road distance in meters, and driving duration in seconds. Display both km and miles. Wait duration is added locally exactly once. Stop detours are already included in Google's distance/driving time.
- Replace fixed normal-mode transfer quotes with documented, configurable **demo** base/mileage/driving-time rates and an explicit per-minute stop-wait charge. Keep true Google route metrics distinct from invented tariffs. The existing `?demo=1` fixture remains explicitly offline sample data for reference review.
- Use the browser-restricted Maps/Places key only for the browser SDK. Keep the separate Routes key in local environment configuration and call Routes through a small same-origin Node proxy. Keys must not be committed, included in ZIPs, printed, or written into this document. The frontend remains HTML/CSS/JavaScript; the proxy is needed for API calls, not booking storage.
- Recalculate/invalidate on selected-location, stop-order/wait, service, and relevant input changes. Ignore stale autocomplete/details/route responses after typing, removing a stop, or starting a new request. Do not replace unavailable Google responses with fabricated live routes or old prices.
- Pass route distance, driving/wait/total durations, and new quotes through vehicle cards, summaries, Review, and thank-you. Keep existing extras/gratuity behavior, with gratuity based on transportation only.
- Test provider contracts with deterministic mocks, pricing with independent arithmetic, errors and request races, navigation/refresh, and desktop/mobile layouts. Separately test actual Google access with the supplied credentials and report observed live results honestly.
- **Pre-change backup:** `releases/car-pro-form-static-v1.0.0-before-maps.zip`; source commit `9bd33e5`; 47 tracked files; SHA-256 `dd56418cca67d8bb16394e10998307d935d753ad6e40b762c453fc88765b25fe`. Created and integrity checked before any integration changes or private configuration.
- **Initial live-test blocker, subsequently resolved:** the cloud network proxy initially returned `403 Forbidden` for Google domains before Google API/key validation. Required domains were saved in the environment draft. After the runtime network changed, connectivity was rechecked and an actual Google Routes request through the running application proxy succeeded on 18 October 2026. Browser Places validation and final check results are recorded in Section 11.8; an earlier blocked request is not evidence that a key is invalid.

Sections 1–9 preserve the original screenshot inventory. Section 10 is the **historical v1.0.0 static baseline**; its fixed normal-mode prices, local address suggestions, optional Hourly drop-off, Node 20 requirement, and no-provider statements are superseded by the current **version 1.1.0 integration record in Section 11**.

Repository: `dev-najmul/car-pro-form`

Reference archive: `Car booking img.zip`

Documentation date: 14 October 2026

Current milestone: **version 1.1.0 Maps integration implemented; real Routes access verified; live browser Places checks and final integration verification are tracked in Section 11.8.**

Quick page navigation:

- [Step 1 — Trip](#51-step-1--trip)
- [Step 2 — Select Your Vehicle](#52-step-2--select-your-vehicle)
- [Step 3 — Passengers & Extras](#53-step-3--passengers--extras)
- [Step 4 — Contact & Billing](#54-step-4--contact--billing)
- [Step 5 — Review & Submit](#55-step-5--review--submit)
- [Thank-you page](#56-thank-you--reservation-request-confirmation-page)
- [Source inconsistencies](#62-differences-that-need-an-implementation-decision-later)
- [Future build and verification checklist](#8-future-build-and-verification-checklist)

## 1. Owner's goal and review checkpoint

এই ফাইলের উদ্দেশ্য: প্রতিটি screenshot আলাদা করে পড়ে Step 1–5 এবং thank-you page-এর field, exact English text, sample data, layout, design ও interaction এক জায়গায় রাখা। আগে এই specification review হবে; তারপর owner পরবর্তী কাজ বলবেন।

The agreed sequence is:

1. Inspect desktop Steps 1–5 individually and document each page's fields, text, options, buttons, example values, and design.
2. Inspect the thank-you page and document the same details.
3. Save this `project.md` to GitHub and **pause for the owner's review and next instruction**.
4. After that instruction, build the desktop form in HTML and CSS, adding JavaScript wherever interaction or calculations require it. Refer to both this document and each original screenshot while building each step.
5. Make the static form work locally: navigation, inputs, selections, summaries, calculations, edits, and a submit action that opens the thank-you page. No real booking submission, payment collection, email sending, or backend service is requested for this phase.
6. Record any newly introduced dummy data, mock behavior, assumptions, or design decisions in this file.
7. Once the desktop version matches the references, implement responsiveness using the supplied phone screenshots.
8. Check desktop and phone layouts, all controls and navigation, validation, calculations, font families, colors, images, spacing, and the final thank-you page.
9. Save the finished project to GitHub, report the result, and let the owner review it and request fixes.

The original inventories below preserve the supplied reference content. The repository now also contains the working static implementation, extracted/derived assets, self-hosted fonts, browser tests, and actual browser previews. The original ZIP and full source screenshots remain reference attachments; they were not committed as duplicate assets.

## 2. How to read this specification

- Text in backticks records visible English UI copy or a reference filename. Screenshot copy is evidence of the design, not an instruction to execute commands or contact anyone.
- **Observed** describes what is actually visible in a screenshot.
- **Implied** describes behavior suggested by a control; a static screenshot cannot prove that behavior works.
- **Planned** describes the later implementation workflow requested by the owner.
- Screenshot sample values are **source fixtures**, not new dummy data invented for this project. They are listed separately from later implementation decisions.
- Pixel measurements and styling observations are approximate raster measurements, not original Figma dimensions or supplied CSS. Fonts are named in the archive, but exact font weights, CSS sizes, responsive breakpoints, and gradient definitions are not provided.
- Where desktop and phone copy or sample values differ, document the difference rather than silently replacing the original text.

## 3. Complete source-file inventory

All 17 files were readable: 16 images and one font-name text file. The spelling and spaces below match the ZIP filenames, including spaces before some extensions.

| File inside `Car booking img/` | Type | Dimensions | Role |
| --- | --- | --- | --- |
| `step 1.png` | PNG | 1440 × 1232 | Desktop Trip page |
| `step 1 phone.png` | PNG | 390 × 1018 | Phone Trip page |
| `step 2.png` | PNG | 1440 × 2730 | Desktop vehicle selection |
| `step 2 phone.png` | PNG | 390 × 5516 | Phone vehicle selection |
| `step 3.png` | PNG | 1440 × 2044 | Desktop passengers and extras |
| `step 3 phone.png` | PNG | 390 × 3191 | Phone passengers and extras |
| `step 4.png` | PNG | 1440 × 1961 | Desktop contact and billing |
| `step 4 phone.png` | PNG | 390 × 3066 | Phone contact and billing |
| `step 5.png` | PNG | 1440 × 2047 | Desktop review and submit |
| `step 5 phone .png` | PNG | 390 × 3082 | Phone review and submit |
| `thank you.png` | PNG | 1440 × 3095 | Desktop thank-you page |
| `thank you phone.png` | PNG | 390 × 4096 | Phone thank-you page |
| `thank youpage bg .jpg` | JPEG | 2160 × 717 | Desktop thank-you hero background |
| `thank youpage bg phone.jpg` | JPEG | 585 × 527 | Phone thank-you hero background |
| `used bg imge for all form.jpg` | JPEG | 2160 × 3066 | Desktop lobby/form background |
| `used bg imge for all form phone.png` | PNG | 585 × 4787 | Phone lobby/form background |
| `used fonts names .txt` | Text | — | Font-family names |

The font text file reads:

```text
used fonts family:

1. cormorant garamond font
2. plus jakarta sans font
```

There are no HTML, CSS, JavaScript, original design files, standalone vehicle photos, vehicle cutouts, separate logo files, icon files, font binaries, API details, or policy documents in the archive. Vehicle pictures and the wordmark are visible inside the screenshots; the four background assets are supplied separately.

## 4. Shared form-page design

### 4.1 Shared exact header text

- Heading: `RESERVATION REQUEST`.
- Subtitle: `Complete the form below to request your executive transportation.`
- Progress order:
  1. `Trip`
  2. `Select Vehicle`
  3. `Passengers & Extras`
  4. `Contact & Billing`
  5. `Review & Submit`

The current step has a blue/navy circle with a white number and an emphasized label. Other circles are white with gray/dark numbers. Thin light horizontal rules connect the circles. Completed steps still show their numbers in the supplied references; no completed-step checkmarks are shown.

### 4.2 Typography, colors, surfaces, and icons

| Item | Observed reference treatment |
| --- | --- |
| Serif family | Cormorant Garamond: page heading, principal panel-title words, collection headings, large estimated totals, thank-you greeting |
| Sans-serif family | Plus Jakarta Sans: paragraph text, controls, labels, section headings, vehicle titles, step numbers, prices in vehicle cards |
| Main text / dark navy | Sampled solid pixels include `#0B1220` |
| Muted field/body text | Sampled solid pixels include `#4A4E57`; other gray tones occur in helpers and antialiasing |
| Panel/input background | `#FFFFFF` |
| Borders / main dividers | Sampled solid pixels include `#C9CAD2`; some internal dividers use nearby pale gray tones |
| Pale gray inset panels | Sampled solid pixels include `#F4F5F7` |
| Primary/active fills | Navy/blue gradient; sampled pixels include `#0A1A3D` and `#153479`; the exact gradient geometry/stops are not supplied |
| Thank-you footer | Sampled solid background `#0B1220`, with light logo/contact text |
| Main panels | White with thin pale borders or subtle edges and rounded corners of approximately 8 px |
| Inputs and buttons | Thin borders, modest corner rounding of approximately 4 px; desktop Step 1 controls approximately 56 px high and phone controls approximately 48 px |
| Main header icons | White outline symbol inside a blue/navy square; approximately 56 px on desktop and 40 px on phone |
| Subsection icons | Steps 3–4 use dark outline symbols in pale gray circular badges; Step 5 review blocks use white symbols in navy squares; thank-you sections use white symbols in dark circular badges |
| Common icon vocabulary | Location pin, target/crosshair, calendar, clock, plus/minus, arrows, car, passengers, suitcase, plane, briefcase, seat, star, chat bubble, clipboard/document, pencil, shield/check, phone, envelope, globe |

These color samples are useful implementation targets, but they do not determine the original CSS gradient, every text shade, or exact antialiasing. The geometric `TUXANO` wordmark needs separate treatment from the two named text families.

### 4.3 Desktop layout observations

All six desktop references are 1440 px wide. The five form pages use a photographic lobby background, a centered heading/subtitle/progress group, and white content panels starting around y=364. Each page's background crop is part of its reference and must be checked individually.

| Reference | Approximate main layout |
| --- | --- |
| Step 1 | Centered narrow panel, x≈324–1116, width≈792 px |
| Step 2 | Wide panel, x≈120–1320, width≈1200 px; three vehicle cards per row |
| Step 3 | Two distinct panels: left form≈846 px, right summary≈340 px, gap≈16 px |
| Step 4 | Two distinct panels: left form≈792 px, right summary≈392 px, gap≈16 px; proportions differ from Step 3 |
| Step 5 | One enclosing white container, x≈120–1370, width≈1250 px; review content at left, two bordered sidebar cards at right |
| Thank-you | Separate full-width branded hero and dark footer; centered white content area≈1200 px wide |

Preserve the differences in panel widths and composition when matching each reference. Steps 3–4 have separate white sidebar panels; Step 5 places its sidebar inside the overall white container.

### 4.4 Phone layout observations

Phone references are 390 px wide and show full-page content of different lengths. The form heading wraps into two lines, while all five progress steps remain in one horizontal row with wrapped labels. Most form content becomes a single column; Step 1 date and time stay side by side. Vehicle cards become a single vertical list. Summary panels move below the main form. Primary navigation appears above a full-width Back button. Details and any copy differences are recorded under each page.

Responsive breakpoints and behavior at widths other than 1440 px and 390 px are not supplied; later implementation must choose and document them while checking that the layout remains usable between the reference widths.

## 5. Individual page inventories


### 5.1 Step 1 — Trip

**Inspected individually:** `step 1.png` (1440 × 1232) and `step 1 phone.png` (390 × 1018). Text below transcribes the screenshots; behaviors marked “implied” are inferred from the controls, rather than demonstrated by a working application.

#### Exact visible copy and controls

| Element | Screenshot text / state | Visible presentation |
|---|---|---|
| Page title | `RESERVATION REQUEST` | Large, uppercase, white serif heading. |
| Page subtitle | `Complete the form below to request your executive transportation.` | White sans-serif, centered. |
| Progress steps | `1` / `Trip`; `2` / `Select Vehicle`; `3` / `Passengers & Extras`; `4` / `Contact & Billing`; `5` / `Review & Submit` | Five numbered circles joined by horizontal rules. Step 1 is active in a navy/blue circle, with its label bold; other circles are white with gray numbers. |
| Panel title | `1 – TRIP` | Number in sans-serif and uppercase title in serif, beside a white calendar outline icon in a navy square. |
| Panel subtitle | `Tell us where and when you need service.` | Gray sans-serif. |
| Service type label | `SERVICE TYPE` | Uppercase label. |
| Service type options | `TRANSFER` (selected), `HOURLY` (unselected) | Two equal-width segments; selected segment has navy/blue gradient and white text, unselected segment has white fill and gray text. |
| Pickup label | `PICKUP LOCATION` | Uppercase label. |
| Pickup placeholder | `Enter pickup location` | Empty bordered field, map-pin icon at left and crosshair/location-target icon at right. |
| Pickup helper | `Search by address, hotel, airport, or landmark` | Information-circle icon followed by small gray text. |
| Stop control | `Add stop` | Plus icon at left; dark text; no stop fields shown initially. |
| Drop-off label | `DROP-OFF LOCATION` | Uppercase label. |
| Drop-off placeholder | `Enter drop-off location` | Empty bordered field with map-pin icon at left. |
| Date label | `DATE` | Uppercase label. |
| Date placeholder | `Select a date` | Empty bordered field with calendar outline icon. |
| Time label | `TIME` | Uppercase label. |
| Time placeholder | `Select a time` | Empty bordered field with clock outline icon. |
| Primary action | `CHECK PRICE` | Full-width navy/blue gradient button with centered uppercase white text. |

No required-field asterisks, entered trip data, validation errors, navigation Back button, footer, or date/time popover are visible in this step's initial screenshot.

#### Desktop design inventory

- Full-screen luxury lobby/reception background photograph with a dark upper wall, warm gold lighting, reception counter, and marble floor. White page title sits over the dark wall.
- At the 1440 px reference width, the title begins around y=92; the subtitle is around y=174; progress circles are centered around y=234. The heading, subtitle, and progress bar are centered on the page.
- The white panel occupies approximately x=324–1116, y=364–1112: about 792 px wide, with an approximately 8 px corner radius and 32 px internal horizontal padding.
- Panel header has a 56 × 56 px navy gradient icon tile at approximately x=356, y=400. Title and subtitle align in a column to its right. A thin light gray divider spans the inner panel width below the header.
- Form content spans approximately x=356–1084 (728 px). Input/segmented-control/button heights are approximately 56 px; corners are subtly rounded (about 4 px). Border strokes are thin light gray/lavender.
- Pickup, drop-off, and service type fill the available width. Date and time remain side by side, each about 352 px wide, with a 24 px gap.
- Labels and principal field text are dark navy/near-black; placeholder/helper text is slate gray. Fields have white backgrounds. Calendar/map/clock/info/plus icons are thin outlines.
- Primary buttons and active service segment use a dark navy to brighter royal-blue gradient, with lighter blue near the upper middle and very dark navy near the lower edge.
- Approximate visible scale: page heading ~64 px; panel title ~36 px (serif words with a sans-serif step number); page subtitle ~20 px; form labels/body/button copy ~16–18 px; helper copy ~14 px. These are visual measurements, not supplied CSS values.

#### Mobile reference differences

- At 390 px wide, the page title wraps into two centered lines: `RESERVATION` then `REQUEST`. It begins around y=87 and uses a smaller serif scale (~36 px).
- Subtitle wraps into two centered lines: `Complete the form below to request your executive` / `transportation.`
- All five progress steps remain on one horizontal row; circles are approximately 34 px, with shortened connecting rules. Labels wrap: `Select` / `Vehicle`; `Passengers` / `& Extras`; `Contact &` / `Billing`; `Review &` / `Submit`.
- Panel is approximately x=16–374, y=354–954, with 12 px inner padding (content x=28–362). Its header icon tile shrinks to 40 × 40 px; title is smaller (~22 px). The subtitle still fits one line.
- Inputs/segmented control/primary button shrink to approximately 48 px tall; labels and body copy are about 14 px.
- Date and time remain side by side on mobile (approximately 159 px each, 16 px gap). They do **not** stack in the provided mobile image.
- Pickup helper remains on one line. All initial controls and exact copy are otherwise the same as desktop.
- Mobile background uses the provided portrait lobby asset and a narrower crop, with the dark wall behind the top content and marble floor behind the lower form.

#### Interaction inventory and unresolved details

- **Implied:** `TRANSFER` and `HOURLY` switch the service type; only the Transfer state is supplied. The Hourly-specific fields, duration controls, pricing, and layout are not specified by the supplied images.
- **Implied:** pickup/drop-off accept locations; pickup target icon may obtain the current location. The screenshot does not specify geolocation permissions, a real address provider, autocomplete suggestions, or a map.
- **Implied:** `Add stop` creates an intermediate stop. No expanded stop field, stop count limit, removal control, or pricing effect is shown.
- **Implied:** date/time controls allow selection. Calendar appearance, available dates, minute increments, timezone, and validation rules are not shown.
- **Implied:** `CHECK PRICE` advances to vehicle selection with the entered trip information, consistent with Step 2's trip summary. Price calculation formula is not supplied.

### 5.2 Step 2 — Select Your Vehicle

**Inspected individually:** `step 2.png` (1440 × 2730) and `step 2 phone.png` (390 × 5516). The six card records below preserve source example data; they are supplied design content, not newly invented dummy data.

#### Page/panel copy and trip summary

| Element | Exact visible text / state | Notes |
|---|---|---|
| Page title | `RESERVATION REQUEST` | Same shared page heading. |
| Page subtitle | `Complete the form below to request your executive transportation.` | Same shared subtitle. |
| Progress | Same five labels as Step 1; `2` / `Select Vehicle` active | Step 2 circle has navy/blue fill and label is bold. Step 1 circle appears white rather than displaying a completed checkmark. |
| Panel title | `2 – SELECT YOUR VEHICLE` | Outline front-view car icon in a navy tile. |
| Panel subtitle | `Choose the vehicle that best fits your trip.` | Gray text. |
| Pickup example | `Carol Stream, IL` | Map-pin icon. |
| Destination example | `O’Hare International Airport (ORD)` | Map-pin icon. |
| Date example | `Sep 8, 2026` | Calendar icon. |
| Time example | `6:00 AM` | Clock icon; desktop clearly has a colon. The mobile time separator looks semicolon-like in the raster; treat this as visual uncertainty and retain conventional colon-formatted time data. |
| Trip edit action | `Edit Trip` | Pencil outline icon at the right on desktop; below summary lines on mobile. |
| Collection heading 1 | `SUV COLLECTION` | Uppercase serif. |
| Collection subtitle 1 | `Spacious, comfortable, and perfect for everyday executive travel,` | Source ends with a comma, rather than a full stop; preserve this transcription. |
| Collection heading 2 | `ROLLS-ROYCE COLLECTION` | Uppercase serif. |
| Collection subtitle 2 | `The ultimate in luxury, prestige, and refinement.` | Sentence case. |
| Information note line 1 | `Prices shown are the total all-inclusive cost for transportation.` | Info-circle icon. |
| Information note line 2 | `Gratuity is not included and will be added in the final step.` | Bold compared with line 1. |
| Secondary navigation | `BACK` | Left-arrow outline; white/light-gray bordered button. |
| Primary navigation | `CONTINUE TO PASSENGERS AND EXTRAS` | Navy gradient button; source uses the word `AND` here, while the progress label uses `&`. |

#### Vehicle card 1 — PREMIUM SUV

- **Title:** `PREMIUM SUV`.
- **Photo:** black Chevrolet-style large SUV outside a hotel entrance; standalone original vehicle image is not included in the ZIP.
- **Capacity:** `6 Passengers` and `6 Bags`, with passenger and suitcase outline icons and a short vertical divider.
- **Section label:** `VEHICLES`.
- **Vehicle examples, one per line:**
  - `Chevrolet Suburban`
  - `Ford Expedition MAX`
  - `GMC Yukon XL or similar`
- **Features, each with a checkmark:**
  - `Full-size extended-wheelbase SUVs`
  - `Spacious luggage capacity`
  - `Professional chauffeur service`
  - `Airport and business travel focused`
- **Price label:** `TOTAL ALL-INCLUSIVE`.
- **Price:** `$195 USD` (amount bold/larger; `USD` smaller, aligned to its baseline).
- **Action:** `SELECT`.

#### Vehicle card 2 — LUXURY SUV

- **Title:** `LUXURY SUV`.
- **Photo:** black Lincoln-style SUV outside a warmly lit hotel entrance.
- **Capacity:** `6 Passengers` / `6 Bags`.
- **Section label:** `VEHICLES`.
- **Vehicle examples:**
  - `Lincoln Navigator Reserve L`
  - `Cadillac Escalade ESV Luxury`
  - `GMC Yukon Denali XL or similar`
- **Features:**
  - `Second-row captain’s chairs`
  - `Premium leather interiors`
  - `Professional chauffeur service`
  - `Enhanced ride quality`
- **Price label:** `TOTAL ALL-INCLUSIVE`.
- **Price:** `$225 USD`.
- **Action:** `SELECT`.

#### Vehicle card 3 — EXECUTIVE SUV

- **Title:** `EXECUTIVE SUV`.
- **Photo:** black Cadillac-style SUV outside a hotel in an urban setting.
- **Capacity:** `6 Passengers` / `6 Bags`.
- **Section label:** `VEHICLES`.
- **Vehicle examples:**
  - `Lincoln Navigator Black Label L`
  - `Cadillac Escalade ESV Platinum Luxury`
  - `GMC Yukon Denali Ultimate XL or similar`
- **Features:**
  - `Executive second-row captain’s chairs`
  - `Massage seating functions`
  - `Top-tier premium trim packages`
  - `Highest level of interior refinement`
- **Price label:** `TOTAL ALL-INCLUSIVE`.
- **Price:** `$265 USD`.
- **Action:** `SELECT`.

#### Vehicle card 4 — ROLLS-ROYCE GHOST

- **Title:** `ROLLS-ROYCE GHOST`.
- **Photo:** black Rolls-Royce sedan in a Chicago street scene at dusk.
- **Capacity:** `3 Passengers` / `3 Bags`.
- **Section label:** `IDEAL FOR`.
- **Use cases:**
  - `Executive transportation`
  - `Private events`
  - `Fine dining`
- **Features:**
  - `Handcrafted luxury interior`
  - `Near-silent ride quality`
  - `Rear executive comfort settings`
  - `Advanced technology integration`
- **Price label:** `TOTAL ALL-INCLUSIVE`.
- **Price:** `$1,250 USD`.
- **Action:** `SELECT`.

#### Vehicle card 5 — ROLLS-ROYCE CULLINAN

- **Title:** `ROLLS-ROYCE CULLINAN`.
- **Photo:** black Rolls-Royce SUV outside an urban building, with a lion statue and flags visible behind it.
- **Capacity:** `3 Passengers` / `3 Bags` (exact source content, even though the vehicle is an SUV).
- **Section label:** `IDEAL FOR`.
- **Use cases:**
  - `VIP transportation`
  - `Private aviation`
  - `VIP Travel`
- **Features:**
  - `Ultra-luxury SUV presence`
  - `Bespoke handcrafted leather`
  - `Exceptional ride quality over any terrain`
  - `Iconic Spirit of Ecstasy presence`
- **Price label:** `TOTAL ALL-INCLUSIVE`.
- **Price:** `$1,850 USD`.
- **Action:** `SELECT`.

#### Vehicle card 6 — ROLLS-ROYCE PHANTOM

- **Title:** `ROLLS-ROYCE PHANTOM`.
- **Photo:** black Rolls-Royce sedan outside the gold-lit Lyric Opera of Chicago entrance.
- **Capacity:** `3 Passengers` / `3 Bags`.
- **Section label:** `IDEAL FOR`.
- **Use cases:**
  - `Weddings`
  - `Red Carpet Events`
  - `Flagship Occasions`
- **Features:**
  - `Iconic flagship presence`
  - `Famous Starlight Headliner`
  - `Ultimate rear passenger sanctuary`
  - `Unmatched ride refinement`
- **Price label:** `TOTAL ALL-INCLUSIVE`.
- **Price:** `$3,250 USD`.
- **Action:** `SELECT`.

#### Desktop design inventory

- Same centered title/subtitle/progress construction as Step 1, with Step 2 active. The lobby background is cropped differently because this page is taller; the supplied screenshot's wall spans almost the full desktop width at the top.
- White panel is approximately x=120–1320, y=364–2610: 1200 px wide, with ~32 px inner padding and gently rounded corners. It is much wider than the Step 1 panel.
- Header tile is 56 × 56 px at approximately x=152, y=400; title/subtitle align to its right. Thin divider below header spans x=152–1288.
- Trip summary is one horizontal bordered row approximately x=152–1288, y=496–584, 88 px tall: pickup, right arrow, drop-off, vertical separator, date, time, vertical separator, `Edit Trip` and pencil icon. Summary text is semibold slate gray with dark navy outline icons.
- SUV section comes first, followed by Rolls-Royce section. Each collection has one row of **three equal-width cards**, with ~24 px horizontal gaps. Cards are approximately 363 px wide with ~16 px inner padding, thin light gray/lavender borders, and ~8 px corner radii.
- First row begins around y=704 and ends around y=1495; second row begins around y=1615 and ends around y=2406. Cards in a row have aligned bottoms, aligned prices, and aligned buttons.
- Vehicle photos are approximately 331 × 222 px and have small rounded corners. Text block order is photo → title → capacities → vehicle/use-case section → divider → four checked features → divider → centered price label/amount → full-width Select button.
- Titles are uppercase sans-serif, about 24 px; collection headings are serif, about 32 px. Body and list copy is about 16 px; capacity copy is smaller (~14 px); prices are bold ~34 px with smaller `USD`; buttons are approximately 56 px tall.
- Note sits below both collections in a full-width bordered box with an information icon at left and two small text lines, the second bold. Navigation is a split row: Back at left (~140 × 56 px), Continue at right (~372 × 56 px).
- Card photos are present only within the screenshots, not as separate vehicle asset files. The implementation uses crops from the supplied screenshots under the owner's authorization to complete the project; exact coordinates are recorded in assets/README.md.

#### Mobile reference differences

- Title/subtitle/progress wrap as in Step 1. Panel starts around x=16, y=354 and is 358 px wide, ending near y=5450. Inner content spans x=28–362 (~334 px).
- Header tile shrinks to 40 × 40 px. `2 – SELECT YOUR VEHICLE` stays on one line at a smaller type size; subtitle is beneath it.
- Trip summary changes from a horizontal row into a vertical box (~334 × 204 px): pickup; a **down arrow** on its own line; destination; date; time; Edit Trip with pencil. Vertical separators disappear.
- Collection headings shrink to ~20 px and body text to ~14 px. SUV subtitle wraps into two lines with the same trailing comma.
- Cards stack into **one column in this exact order:** Premium SUV, Luxury SUV, Executive SUV, Rolls-Royce Ghost, Rolls-Royce Cullinan, Rolls-Royce Phantom. All copy, capacities, and prices match the desktop records.
- Card width is ~334 px, inner padding ~16 px, photo width ~302 px, and photo height remains ~222 px. This produces a taller relative image crop than desktop, rather than merely scaling the desktop photo height down proportionally.
- Vehicle titles are about 18 px, body/features about 14 px, capacities about 12 px, prices about 26 px, and Select buttons about 48 px tall. Card content and prices retain the desktop hierarchy.
- Information note remains a small two-line box with info icon. Continue appears **first as a full-width button**, with Back **below it**, also full width. This reverses the visual order from the desktop split row where Back is on the left.

#### Interaction inventory and unresolved details

- **Implied:** `Edit Trip` returns to Step 1 with prior input preserved.
- **Implied:** each `SELECT` chooses the corresponding vehicle class/card. Every button says Select; the screenshots do not show any selected-card border, selected label, radio control, disabled state, or whether a selection immediately advances.
- **Implied:** only one vehicle should be selected for the trip, and Continue advances to Step 3. Selection-required validation and deselection behavior are not pictured.
- **Observed source prices:** the six quoted amounts are supplied example values for the example trip. No route/distance/hourly formula, taxes/fees breakdown, or backend pricing service is supplied.
- **Observed note:** gratuity is excluded at this step and added at the final step. The later-step images are needed to specify its controls and total arithmetic.
- Back/Continue buttons are visibly enabled in the reference; no separate error/empty-selection screen is supplied.

#### Fonts shared by these references

`used fonts names .txt` explicitly lists `cormorant garamond font` and `plus jakarta sans font`. Visual use is consistent with **Cormorant Garamond** for the main page heading, panel title words, and collection headings; **Plus Jakarta Sans** for labels, body copy, navigation, vehicle names, prices, and step numbers. Font files, exact weight assignments, CSS font sizes, and exact hex colors are not supplied; those values must later be matched visually and recorded as implementation decisions.


### 5.3 Step 3 — Passengers & Extras

**Sources individually inspected:** `step 3.png` (1440 × 2044 px) and `step 3 phone.png` (390 × 3191 px). Original images and close crops were checked for small copy.

#### Header and progress state

- Page title: `RESERVATION REQUEST`.
- Subtitle: `Complete the form below to request your executive transportation.`
- Progress: `1` / `Trip`; `2` / `Select Vehicle`; **active `3` / `Passengers & Extras`**; `4` / `Contact & Billing`; `5` / `Review & Submit`.
- Main-card title: `3 – PASSENGERS & EXTRAS` (the separator is visibly longer on mobile; desktop resembles a shorter dash).
- Main-card introduction: `Add passenger details, flight information, and any extras.`
- Header icon: two passengers in a navy square; major section icons sit in small pale-gray circular backgrounds.

#### Section 1: passengers and luggage

Heading: `1. PASSENGERS AND LUGGAGE`.

| Visible label | Control | Shown value | Visible buttons |
| --- | --- | --- | --- |
| `NUMBER OF PASSENGERS` | Bordered horizontal quantity stepper | `3` | Minus, plus |
| `LUGGAGE` | Bordered horizontal quantity stepper | `4` | Minus, plus |

Passenger and luggage icons appear next to their respective labels. Neither field displays a required asterisk. Minimum/maximum values and whether empty luggage is permitted are not specified by these images; vehicle capacity is shown separately in the summary.

#### Section 2: airport details

Heading: `2. AIRPORT DETAILS`.

- A two-choice segmented control has `COMMERCIAL FLIGHT` **selected** in navy with a white airplane icon, and `PRIVATE AVIATION` unselected in white with an outlined airplane icon.
- Field label `AIRLINE`; empty text input placeholder `Type your airline`.
- Field label `FLIGHT / TAIL NUMBER`; empty text input placeholder `Type your flight / tail number`.
- Information icon followed by: `Flight details help us monitor your itinerary and verify that your scheduled pickup time aligns with your flight.`
- Desktop: aviation choices share a row, and the two text inputs share a row.
- Mobile: aviation choices stack vertically; then airline and flight/tail number inputs stack vertically.
- No required asterisks appear for the airline fields. The private-aviation selected state, alternate fields, or any airport-type conditional visibility are not depicted.

#### Section 3: trip extras

Heading: `3. ADD TO YOUR TRIP`.

1. Label `Meet & Greet`; outlined person icon; helper `Chauffeur meets you at baggage claim and assists with luggage.`; toggle shown **on** (dark track, light thumb at the right).
2. Label `Child Seats`; child-seat icon; helper `Car seats and booster seats available upon request.`; toggle shown **on**.
3. The child-seat controls are visible below the enabled child-seat row:

| Visible label | Control | Shown quantity |
| --- | --- | --- |
| `Car Seats` | Minus/value/plus stepper | `2` |
| `Booster Seats` | Minus/value/plus stepper | `1` |

Pricing helper: `First seat $75 • Each additional seat $50`.

Visible child-seat pricing table:

| Item | Qty | Amount |
| --- | --- | --- |
| `Car Seat` | `2` | `$125` |
| `Booster Seat` | `1` | `$50` |
| `Total` | blank | `$175` |

- Desktop: quantities occupy the left half of an indented child-seat area, with the pricing table on the right. A fine vertical line identifies the subordinate controls.
- Mobile: car-seat quantity, booster-seat quantity, pricing helper, and table stack in that order. Each quantity control stretches across the available content width.
- The example supports $75 for the first seat and $50 for each subsequent seat, yielding $175 for three seats. The screenshot does not explicitly resolve how the first-seat charge is allocated if booster seats are selected without car seats; a deterministic implementation rule must be documented later.
- Meet-and-greet price is visible in the trip summary as `$50.00`, not beside its toggle.

#### Section 4: chauffeur gratuity

Heading: `4. CHAUFFEUR GRATUITY`.

- Helper: `Optional. Calculated on transportation charges only.`
- Five segmented options in order: `10%`, `15%`, **`20%` selected**, `25%`, `Custom`.
- Unchecked checkbox: `I’ll tip the chauffeur in person.`
- Calculation display: `20% = $45.00` (amount larger/heavier than its prefix).
- Explanation: `100% of your gratuity goes directly to your chauffeur.`
- Desktop: pale-gray rounded panel; options and checkbox on the left, calculation and explanation on the right separated by a fine vertical divider.
- Mobile: options, checkbox, calculation, and explanation stack in a single column. No vertical divider.
- Illustrated calculation: 20% × $225 transportation = $45. The extra charges are excluded from the gratuity basis, consistent with the visible helper.
- The custom-amount field and the result of checking the in-person checkbox are not pictured. Those states require an implementation decision; no invented current values should be treated as screenshot requirements.

#### Section 5: special requests

Heading: `5. SPECIAL REQUESTS (Optional)`.

- Helper: `Anything else we should know to personalize your trip?`
- Empty multiline textarea placeholder: `Pickup instructions, quiet ride preference, luggage notes, or other personal requests`.
- Character counter bottom right: `0/250`.
- Counter implies a 250-character maximum; enforcing this later is an implementation interpretation of the visible counter.

#### Navigation

- Outlined light-gray secondary button with left-arrow icon: `BACK`.
- Navy gradient primary button: `CONTINUE TO CONTACT & BILLING`.
- Desktop: `BACK` aligned left and primary button aligned right, in the same footer row.
- Mobile: full-width primary button first, then full-width `BACK` button below it.

#### Step 3 trip-summary card: exact visible content

Header: `YOUR TRIP SUMMARY`; top-right `Edit` with pencil icon.

Route and schedule, separated from later blocks with fine gray lines:

- Pin icon + `Carol Stream, IL`.
- Downward arrow between pickup and drop-off.
- Pin icon + `O’Hare International Airport (ORD)`.
- Calendar icon + `Sep 8, 2026`.
- Clock icon + `6:00 AM`. In the Step 3 desktop/mobile rasters the separator appears semicolon-like, so the intended conventional time is transcribed here; compare the source closely during visual matching rather than treating punctuation rendering as a new time requirement.

Vehicle block heading `VEHICLE SELECTED`:

- Small rounded photo of a black Lincoln-style SUV.
- Vehicle name `Luxury SUV`.
- Description `Lincoln Navigator or similar` (wraps in desktop sidebar).
- Desktop capacity text: `Up to 6 Passengers` and `Up to 6 Bags` with passenger/luggage icons.
- Mobile capacity text: `6 Passengers` and `6 Bags`; a short vertical divider separates the two capacities.

Trip pricing block heading `TRIP DETAILS`:

| Exact line | Amount |
| --- | --- |
| `Transportation` | `$225.00` |
| `Meet & Greet` | `$50.00` |
| `Child Seats` | `$175.00` |
| `Gratuity (20%)` | `$45.00` |

Child-seat secondary line: `2 car Seat, 1 Booster Seat` (case and singular spelling as pictured).

Total block, centered:

- `ESTIMATED TOTAL`.
- Large serif `$495.00`.
- `All-Inclusive (USD)`.

Security block, shield/check icon:

- `Secure & Confidential`.
- `Your information is encrypted and handled securely.`

This is visible design copy only. The future static prototype cannot promise an actual encrypted submission/storage service without a backend; documentation should distinguish UI reproduction from actual infrastructure capabilities.

#### Step 3 design and mobile observations

- Desktop has a photographic dark luxury lobby/interior behind the whole page, a centered white serif hero title, white sans-serif subtitle/progress, a large white left form card, and a narrower white right summary card aligned at their tops. At the 1440 px reference width, approximate source-raster card widths are 846 px for the form and 340 px for the summary, with a 14–16 px gap and a left margin near 120 px.
- Dark navy gradient marks the active progress circle, main-card icon block, selected commercial flight option, and primary action. Selected gratuity uses a nearly black navy fill. Inputs and dividers are pale cool gray; body text is near-black navy, helper text is muted gray.
- Main title and card title use the supplied serif family (Cormorant Garamond); body labels, fields, buttons, and helper text use the supplied sans-serif family (Plus Jakarta Sans). Exact font weights/sizes/colors should be calibrated against images during later implementation, not invented as verified tokens now.
- Desktop major sections use generous vertical spacing and thin horizontal separators; cards have modest rounded corners and fine light borders.
- Mobile source is 390 px wide. The hero title wraps into two lines (`RESERVATION` / `REQUEST`). Progress retains all five circles horizontally, with shorter connector lines and compact multi-line labels. Main-card introduction wraps to two lines.
- Mobile has a single-column main form followed by a separate full-width summary card below the form. The summary is in normal document order; a static image does not establish sticky behavior.
- Mobile section headings are compact; helper text, longer labels, and placeholder text wrap. The grayscale footer/security copy remains present. Form and summary use roughly 16 px outer horizontal gutters.

### 5.4 Step 4 — Contact & Billing

**Sources individually inspected:** `step 4.png` (1440 × 1961 px) and `step 4 phone.png` (390 × 3066 px). Original images and close crops were checked for small copy.

#### Header and progress state

- Page title: `RESERVATION REQUEST`.
- Subtitle: `Complete the form below to request your executive transportation.`
- Progress: `1` / `Trip`; `2` / `Select Vehicle`; `3` / `Passengers & Extras`; **active `4` / `Contact & Billing`**; `5` / `Review & Submit`.
- Main-card title: `4 – CONTACT & BILLING`.
- Introduction: `Tell us who is making the reservation and who is traveling.`
- Main-card icon: clipboard in a navy square.

#### Section 1: billing contact

Heading: `1. BILLING CONTACT (PAYER) *`.

Helper: `The person or company responsible for payment.`

Inputs are empty and their visible placeholders supply the labels:

| Placeholder exactly as pictured | Type implied by text | Required marker |
| --- | --- | --- |
| `First Name *` | Text | Yes |
| `Last Name *` | Text | Yes |
| `Email *` | Email | Yes |
| `Phone Number *` | Telephone | Yes |
| `Company Name (optional)` | Text | No |

Desktop: first and last name share a two-column row; email, phone, and company each use a full-width row. Mobile: all five inputs stack, first name then last name then email then phone then company.

#### Section 2: primary passenger

Heading: `2. PRIMARY PASSENGER *`.

Helper: `Who will be riding in the vehicle?`

- Unchecked checkbox label: `Same as billing contact`.

| Placeholder exactly as pictured | Type implied by text | Required marker |
| --- | --- | --- |
| `First Name *` | Text | Yes |
| `Last Name *` | Text | Yes |
| `Mobile Number *` | Telephone | Yes |
| `Email (optional)` | Email | No |

Helper below the inputs: `Passenger contact information is used for chauffeur communication and ride updates.`

- Desktop: first/last name share the first row; mobile/email share the second row.
- Mobile: first name, last name, mobile number, and email stack in that order.
- The checkbox implies copying/reusing billing contact details for the passenger, but checked-state behavior (copy once versus keep synchronized, hide fields versus fill them) is not depicted. Preserve the intent and explicitly document the chosen later implementation behavior.

#### Section 3: billing address

Heading: `3. BILLING ADDRESS *`.

Helper: `Required for invoicing and account records.`

| Placeholder exactly as pictured | Visible control | Required marker |
| --- | --- | --- |
| `Street Address *` | Text input | Yes |
| `Apt / Suite / Unit (optional)` | Text input | No |
| `City *` | Text input | Yes |
| `State / Province *` | Closed dropdown with downward chevron | Yes |
| `ZIP / Postal Code *` | Text input | Yes |
| `Country *` | Closed dropdown with downward chevron | Yes |

Information icon and bottom helper: `Enter billing address for invoicing and account records.`

- Desktop rows: street + unit; city + state/province; ZIP/postal code + country.
- Mobile order: street, unit, city, state/province, ZIP/postal code, country.
- No selected state/province or country values are shown. Option lists, country/state dependence, and international postal validation are not present in the reference; any demo options must be identified later as added data.

#### Section 4: additional billing information

Heading: `4. ADDITIONAL BILLING INFORMATION (Optional)`.

- Empty multiline textarea placeholder: `Add any billing instructions or payment-related notes, if needed.`
- Character counter bottom right: `0/500`.
- Counter implies a 500-character maximum; enforcing it later is an implementation interpretation of the visible counter.
- Desktop heading is one line; mobile wraps `INFORMATION (Optional)` to a second line.

#### Navigation

- Outlined light-gray secondary button with left-arrow icon: `BACK`.
- Navy gradient primary button: `CONTINUE TO REVIEW & SUBMIT`.
- Desktop: secondary left and primary right in a single row.
- Mobile: full-width primary button first, full-width secondary `BACK` below.

#### Step 4 trip-summary card: exact visible content

Header: `YOUR TRIP SUMMARY`; **desktop `EDIT`**, **mobile `Edit`**, both with pencil icon.

Route:

- `Carol Stream, IL` with pin icon.
- Down arrow.
- `O’Hare International Airport (ORD)` with pin icon.

Schedule:

- Desktop: a single calendar row `Sep 8, 2026 at 6:00 AM`.
- Mobile: calendar row `Sep 8, 2026`, followed by a separate clock row `6:00 AM`. The time separator appears semicolon-like in the raster; transcribed as the conventional colon time, consistent with the clear Step 4 desktop text.

Vehicle block:

- `VEHICLE SELECTED`.
- Same black SUV photograph.
- `Luxury SUV`.
- `Lincoln Navigator or similar`.
- Desktop: `Up to 6 Passengers` / `Up to 6 Bags`.
- Mobile: `6 Passengers` / `6 Bags`, with a vertical divider between capacities.

Pricing block heading: `TRIP DETAILS`.

| Exact line | Amount |
| --- | --- |
| `Transportation` | `$225.00` |
| `Meet & Greet` | `$50.00` |
| `Child Seats` | `$175.00` |
| `Gratuity (20%)` | `$45.00` |

Child-seat secondary line differs by viewport:

- Desktop: `2 car seats, 1 booster seat`.
- Mobile: `2 car Seat, 1 Booster Seat`.

Total:

- `ESTIMATED TOTAL`.
- Large serif `$495.00`.
- `All-Inclusive (USD)`.

Security:

- Shield/check icon.
- `Secure & Confidential`.
- `Your information is encrypted and handled securely.`

#### Step 4 design and mobile observations

- Same lobby image, white hero serif title, white subtitle/progress, navy active circle, rounded white form and summary cards, thin pale-gray borders/dividers, muted helpers, and navy gradient primary button as the other steps.
- Desktop source shows a wide form card on the left and a narrower summary on the right, top-aligned. At the 1440 px reference width, approximate source-raster widths are 790 px for the form and 394 px for the summary, with a 16–18 px gap and a left margin near 120 px. The summary is relatively wider than the Step 3 desktop summary in its separate source image; do not assume a single desktop column ratio is already confirmed.
- Four numbered sections appear with person, person, map-pin, and billing/document-style outline icons in light-gray circles.
- No payment card fields, card number, expiration, CVV, payment-method picker, or direct payment action is pictured; this step collects payer/passenger/address/notes only.
- Desktop text-input rows use two columns where noted. Mobile converts every input row to one column and retains every field/helper/counter.
- Mobile main-card title remains on one line; introduction wraps onto two lines. Hero title is two lines; all five progress steps remain horizontal.
- Mobile summary appears below the main form in normal document order, with roughly 16 px horizontal outer gutters. Long helper lines and the additional-billing heading wrap naturally.

#### Cross-step behavior established versus not established

- Required asterisks identify which Step 4 fields should receive validation later. Error wording, error placement, validation timing, and accepted phone/postal formats are not illustrated.
- Screenshot values in the trip summaries are reference/sample values, not newly invented dummy data. Later work should keep entered values across forward/back navigation and update displayed summary/prices from form state; any other dummy content must be recorded in `project.md`.
- The reference totals are consistent: $225 transportation + $50 meet-and-greet + $175 child seats + $45 gratuity = $495. No hidden tax or fee line is shown.
- Dropdown contents, custom gratuity UI, unchecked extras behavior, quantity limits, edit-navigation destinations, and billing-contact-copy mechanics are unknown from these images and should remain explicit implementation decisions.
- This paragraph originally marked the documentation-only checkpoint. The owner subsequently authorized the remaining phases; implementation and verification are recorded in Section 10.


### 5.5 Step 5 — Review & Submit

**Reference images:** `step 5.png` (1440 × 2047) and `step 5 phone .png` (390 × 3082). Both were inspected individually, including native-size crops for the small text.

#### Header and active progress state

- Main heading: `RESERVATION REQUEST`.
- Supporting copy: `Complete the form below to request your executive transportation.`
- Progress labels, in order: `1` / `Trip`; `2` / `Select Vehicle`; `3` / `Passengers & Extras`; `4` / `Contact & Billing`; `5` / `Review & Submit`.
- Step 5 has the active navy circle and bold label; steps 1–4 are white circles with gray numerals. Thin pale lines connect the circles.
- Main card heading: `5 – REVIEW & SUBMIT`.
- Main card helper: `Please review all the information before submitting your reservation request.`
- A white line document icon sits in a navy square beside the heading.

#### Review block 1 — exact displayed trip information

Heading: `1. TRIP DETAILS`. Calendar icon at left; `EDIT` and a pencil outline icon at the upper right.

| Label | Value shown in both desktop and mobile references |
| --- | --- |
| `Service Type:` | `Transfer` |
| `Pickup:` | `Carol Stream, IL` |
| `Destination:` | `O’Hare International Airport (ORD)` |
| `Date & Time:` | `Sep 12, 2026 at 6:00 AM` |
| `Airport Details:` | `Commercial Flight — American Airlines AA1234` |

The mobile airport details wrap before `AA1234`.

#### Review block 2 — exact displayed selected vehicle

Heading: `2. SELECTED VEHICLE`. Car outline icon at left; `EDIT` and a pencil outline icon at the upper right.

- Black Lincoln Navigator image, front three-quarter angle.
- Vehicle category: `Luxury SUV`.
- Model/substitution copy: `Lincoln Navigator or similar`.
- Passenger icon and capacity: `Up to 6 Passengers`.
- Luggage icon and capacity: `Up to 6 Bags`.

#### Review block 3 — exact displayed passengers and extras

Heading: `3. PASSENGERS & EXTRAS`. Passenger/group outline icon at left; `EDIT` and a pencil outline icon at the upper right.

| Label | Value shown |
| --- | --- |
| `Passengers:` | `3` |
| `Luggage:` | `4` |
| `Meet & Greet:` | `Included` |
| `Child Seats:` | `2 car seats, 1 booster seat` |
| `Chauffeur Gratuity:` | `20%` |
| `Special Requests:` | `Fiji Water` |

#### Review block 4 — exact displayed contact and billing

Heading: `4. CONTACT & BILLING`. Clipboard outline icon at left; `EDIT` and a pencil outline icon at the upper right.

**Subheading: `Billing Contact (Payer)`**

| Label | Value shown |
| --- | --- |
| `Name:` | `Emily Smith` |
| `Email:` | `emily@example.com` |
| `Phone:` | `(312) 555–0182` |
| `Company:` | `Accurate LLC` |

**Subheading: `Primary Passenger`**

| Label | Value shown |
| --- | --- |
| `Name:` | `John Smith` |
| `Email:` | `john@example.com` |
| `Mobile:` | `(312) 555–0199` |

**Additional rows, below the contact groups:**

| Label | Value shown |
| --- | --- |
| `Billing Address:` | `123 Main St, Suite 200, Chicago, IL 60601, United States` |
| `Billing Notes:` | `Please bill accurate LLC for this ride.` |

The billing-note sentence intentionally uses lowercase `accurate` in the screenshots; the company field uses capitalized `Accurate LLC`.

#### Consent, navigation, and submit control

- One square checkbox, shown **unchecked**.
- Consent copy: `I agree to the Terms & Conditions and Cancellation Policy.`
- `Terms & Conditions` and `Cancellation Policy` are underlined links. The ZIP supplies no destination URLs or legal policy content.
- Secondary button with a left arrow: `BACK`.
- Primary navy button: `SUBMIT RESERVATION REQUEST`.
- There are no new text-entry fields on this step. Its interactive controls are the four `EDIT` actions, the agreement checkbox, the legal links, `BACK`, and the submit button.

#### Price summary — desktop copy

Heading: `PRICE SUMMARY`.

| Line item | Amount |
| --- | --- |
| `Transportation (Luxury SUV)` | `$225.00` |
| `Meet & Greet` | `$50.00` |
| `Child Seats (2 car seats, 1 booster seat)` | `$175.00` |
| `Chauffeur Gratuity (20%)` | `$45.00` |

After a divider:

- Label: `ESTIMATED TOTAL`.
- Large serif amount: `$495.00`.
- Currency/inclusions copy: `All-Inclusive (USD)`.
- Pale-gray security inset with a shield/check outline icon:
  - `Secure & Confidential`
  - `Your information is encrypted and handled securely.`

#### Price summary — mobile wording differences

Amounts, total, and security copy are unchanged. The mobile line-item labels visible in its reference are:

| Mobile label | Amount |
| --- | --- |
| `Transportation` | `$225.00` |
| `Meet & Greet` | `$50.00` |
| `Child Seats (2 car Seat, 1 Booster Seat)` | `$175.00` |
| `Gratuity (20%)` | `$45.00` |

The inconsistent singular/capitalization in the mobile child-seat label belongs to the supplied image and should be treated as a reference-copy discrepancy for review.

#### What-happens-next card — exact copy

Heading: `WHAT HAPPENS NEXT` with a small circle/check/clock outline icon.

1. `We review availability and trip details.`
2. `You’ll receive an email with confirmation details and any payment instructions.`
3. `Once confirmed, your reservation is secured.`

Below a divider: `Reservation requests are typically reviewed within 2–4 business hours.`

#### Desktop composition and visual requirements

- The form uses the supplied luxury hotel/lobby background, visible around the card. Warm gold illumination contrasts with a near-black central backdrop and gray marble lower floor.
- Header is centered, with a large white Cormorant Garamond serif title, white sans-serif subtitle, then the horizontal five-step progress indicator.
- Main white rounded card occupies most of the page width and starts at approximately x=120/y=364 in this particular 1440-pixel-wide reference. Preserve the actual reference proportions; do not assume its left and right screenshot margins are identical.
- Main card has two columns: wider review column on the left (about two thirds), narrower sidebar on the right (about one third), with a modest gap. The sidebar starts level with the main heading.
- Four bordered review panels appear vertically with even gaps. Fine pale-gray borders, small rounded corners, white interiors. Section icons are white outlines in navy/blue gradient squares.
- Desktop trip and passengers/extras rows place gray labels in one column and dark values beside them.
- Desktop vehicle panel places the vehicle image left of its name/model/capacity text; passenger and bag capacities share a row.
- Desktop contact panel puts payer and passenger information in side-by-side columns separated by a thin vertical rule. Address and notes span beneath them after a horizontal rule.
- The price summary is a separate bordered sidebar card. Below it sits the next-steps card. Both leave a large white area lower in the sidebar.
- Consent is below the review panels after a divider. `BACK` is aligned left; submit is aligned right in the left content column. Secondary button is very light gray with a gray border; submit uses a navy/blue gradient with white uppercase copy.
- Typography uses Cormorant Garamond for the large heading, review-title words, and price total; Plus Jakarta Sans for labels, helpers, values, buttons, and sidebar headings. Main text is dark navy; helper/label text is gray. Icon styles are thin outlines.
- No logo footer or contact footer is visible on this form page.

#### Mobile composition and visual differences

- At 390 px, the heading wraps to two centered lines (`RESERVATION` / `REQUEST`). Subtitle wraps to two lines. All five numbered progress circles remain in a horizontal row; longer captions wrap underneath.
- Main review card starts beneath the header at about y=354 and has about 16 px outside margins. All content is a single column.
- Heading and its helper sit beside the square document icon; helper wraps. Review section headings and `EDIT` stay on one row, with smaller section-icon squares than desktop.
- Trip and passengers/extras use stacked label/value pairs rather than a desktop label/value grid.
- Selected vehicle uses a large centered car image above the title/model/capacity row; capacity labels still share one row.
- Contact and billing stacks payer above primary passenger. Their rows retain side-by-side label/value placement; the desktop vertical separator disappears. Address and notes then use stacked labels/values and a horizontal separator.
- Consent wraps. Submit becomes full width and appears **above** the full-width `BACK` button.
- The price-summary card and next-steps card appear **after the entire review/consent/button card**, separated by visible background gaps. They are separate white rounded cards with the same outer width.
- Mobile price-summary title has a horizontal divider immediately below it, and its wording differences are listed above. Total and security inset remain centered/full width respectively.
- Mobile next-steps text is smaller and left-aligned. The review-time sentence stays beneath its divider.
- Mobile uses the separately supplied phone form background crop. The long page exposes the dark wall/lobby and marble floor at different scroll positions.

#### Behavior established or suggested by Step 5

- Established by the user's requested scope: this will be a static frontend; valid local submission moves to the thank-you page, without a real backend submission.
- Suggested by the design: each `EDIT` returns to the corresponding earlier step and keeps entered selections. `BACK` returns to Step 4. Review values and price summary should reflect the current form data.
- Suggested by consent placement: submitting should require agreement, but the screenshot does not show a validation message or disabled-button appearance; this detail should be specified during implementation.
- The security sentence is visible reference copy, not evidence that a static frontend has backend encryption or storage.
- Price arithmetic in this example is `$225 + $50 + $175 + $45 = $495`; `$45` is 20% of `$225`. Rates and gratuity calculation rules outside this shown case are not supplied here.

### 5.6 Thank-you / reservation-request confirmation page

**Reference images:** `thank you.png` (1440 × 3095) and `thank you phone.png` (390 × 4096). Both were inspected individually, including native-size crops for small text.

#### Branded hero

- Large dark navy and warm-gold hotel/car image at the top, using the supplied thank-you background asset for the corresponding viewport.
- Brand wordmark: `TUXANO`; subline: `PRIVATE TRANSPORTATION`.
- Black luxury sedan in front of a warmly lit hotel entrance; the vehicle itself carries the TUXANO branding. A visible background hotel sign reads `GRAND LUXE HOTEL`; it is part of the artwork, not a form field.
- Desktop composition puts the main wordmark on the left dark panel and the sedan/hotel image on the right.
- Mobile composition puts the hotel/car image above the large centered wordmark on the dark panel.

#### Greeting, status, and pickup date — exact displayed copy

- Heading: `Thank you, Pavel.`
- `Your reservation request has been received and is currently being reviewed.`
- `Reservation requests are typically reviewed within 2–4 business hours.`
- `Request ID: TUX-REQUEST-0001`

Pale-gray, bordered status card:

- Navy badge/seal with a white check.
- `Reservation Request Received`
- `We’ll confirm availability and send you the next steps soon.`
- Calendar outline icon.
- `Pickup Date & Time`
- `August 25, 2026`
- `Tue, 2:00 PM`

#### Trip details — exact displayed copy

Heading: `TRIP DETAILS` with a calendar outline icon in a dark circular badge.

| Label | Value shown |
| --- | --- |
| `Service Type:` | `Transfer` |
| `Pick-up Location:` | `302 Sype Dr, Carol Stream, IL, 60188–3306` |
| `Drop-off Location:` | `O’Hare International Airport (ORD)` |
| `Stops:` | `None` |

#### Vehicle selected — exact displayed copy

Heading: `VEHICLE SELECTED` with a car outline icon in a dark circular badge.

- Same black Lincoln Navigator image used in Step 5.
- `Luxury SUV`
- `Lincoln Navigator or similar`
- Passenger icon: `Up to 6 Passengers`
- Bag icon: `Up to 6 Bags`

#### Passengers and extras — exact displayed copy

Heading: `PASSENGERS & EXTRAS` with a group outline icon in a dark circular badge.

| Label | Value shown |
| --- | --- |
| `Passengers:` | `3` |
| `Luggage:` | `4` |
| `Airline:` | `American Airline (AA)` |
| `Flight Number:` | `AA1234` |
| `Flight Type:` | `Commercial` |
| `Meet & Greet:` | `Added` |
| `Child Seats:` | `2 car seats, 1 booster seat` |
| `Chauffeur Gratuity:` | `20%` |

Separate pale-gray, bordered strip/card with a speech-bubble outline icon:

- Heading: `SPECIAL REQUESTS`
- Value: `Fiji Water`

The singular `American Airline (AA)` is the exact thank-you-page sample copy, whereas Step 5's airport detail says `American Airlines AA1234`.

#### Primary passenger — exact displayed copy

Heading: `PRIMARY PASSENGER` with a person outline icon in a dark circular badge.

| Label | Value shown |
| --- | --- |
| `Passenger Name:` | `John Smith` |
| `Phone Number:` | `(312) 555–0199` |
| `Email Address:` | `john@example.com` |

#### Billing and payer — exact displayed copy

Heading: `BILLING / PAYER INFORMATION` with a clipboard outline icon in a dark circular badge.

| Label | Value shown |
| --- | --- |
| `Company Name:` | `Accurate LLC` |
| `Billing Contact:` | `Emily Smith` |
| `Billing Phone:` | `(312) 555–0182` |
| `Billing Email:` | `emily@example.com` |
| `Billing Address:` | `123 Main St, Suite 200, Chicago, IL 60601, United States` |

Separate pale-gray, bordered strip/card with a speech-bubble outline icon:

- Heading: `BILLING NOTES`
- Value: `Please bill accurate LLC for this ride.`

#### Pricing summary — exact displayed copy

Heading: `PRICING SUMMARY` with a dollar outline icon in a dark circular badge.

| Line item | Amount |
| --- | --- |
| `Transportation (Luxury SUV)` | `$225.00` |
| `Meet & Greet` | `$50.00` |
| `2 Car Seats` | `$125.00` |
| `1 Booster Seat` | `$50.00` |
| `Chauffeur Gratuity (20%)` | `$45.00` |

Wallet/payment outline icon in dark circular badge and message: `Payment instructions will be sent separately.`

Separate pale-gray bordered total panel:

- `ESTIMATED TOTAL`
- `$495.00`
- `All-Inclusive (USD)`

#### Next steps — exact displayed copy

Pale-gray bordered card, heading: `WHAT HAPPENS NEXT?` with an outlined circle/check icon.

1. `We review availability and reservation details.`
2. `You’ll receive an email with confirmation details and any payment instructions.`
3. `Once confirmed, your reservation is secured.`

Each step has a numbered dark circular badge; chevrons separate the steps. Note that this page says **reservation details**, while the Step 5 next-steps card says **trip details**.

#### Assistance and closing copy — exact displayed content

Pale-gray bordered card with a phone outline icon:

- `NEED ASSISTANCE?`
- `Call, text, or WhatsApp us anytime.` (The mobile reference has a visible extra space before the comma after `text`.)
- `+1 (717) 434–6195`
- `Thank you for choosing TUXANO.`
- `We look forward to your journey with us.`
- `TUXANO Private Transportation.`

#### Footer — exact displayed content

Full-width dark navy footer:

- TUXANO wordmark with `PRIVATE TRANSPORTATION` beneath it.
- Phone outline icon and `+1 (717) 434–6195`.
- Envelope outline icon and `info@tuxano.com`.
- Globe outline icon and `tuxano.com`.

The screenshot establishes visible contact text and icons; it does not establish actual href targets or WhatsApp URL behavior. Any links implemented later should be recorded as behavior choices.

#### Desktop composition and visual requirements

- Full-width branded hero, approximately 478 px tall in the 1440-pixel-wide reference. The remainder of the page is white, ending in a dark footer.
- Body content is centered in an approximately 1200 px width with about 120 px left/right margins. Greeting begins about 80–90 px below the hero's bottom edge.
- Greeting uses a large, bold Cormorant Garamond serif; body uses Plus Jakarta Sans. Total amount also uses the serif font.
- Status/date card is horizontally split: seal and status text on the left; vertical divider; calendar, label, date and weekday/time on the right. Pale-gray fill, fine gray outline, small corner radius.
- Detail sections use thin horizontal rules instead of standalone white bordered cards. Section icon and uppercase title occupy the left column; data sits in the wider right column in aligned label/value rows.
- Section icons are white outlines inside dark circular badges, rather than the navy square badges used in the form.
- Vehicle section shows image and descriptive text side by side. Capacities share a horizontal row.
- `SPECIAL REQUESTS` and `BILLING NOTES` use full-width pale-gray strips with icon/title and value arranged horizontally and separated by a vertical rule.
- Pricing uses section title on the left, item labels/amounts in the middle, and a narrow total panel on the right separated by a vertical rule. The payment note appears under the item table after a horizontal divider.
- Next-steps card lays the three numbered steps horizontally, joined by right chevrons; title sits above them.
- Assistance card places the phone/heading/copy/number on the left and closing text on the right with a vertical divider.
- Footer lays out wordmark, phone, email, and site in one horizontal row, divided by thin vertical separators.

#### Mobile composition and visual differences

- Top branded hero is approximately 350 px tall at 390 px width. Image is above the brand mark; logo remains within the hero artwork/dark panel.
- White body uses about 16 px side margins; content fills the available width.
- Greeting appears directly under the hero with a smaller serif heading. Intro text and review-time message wrap to two lines.
- Status/date card stacks seal, heading and supporting copy above a horizontal separator, then calendar icon, pickup label, date, and time beneath. It is left-aligned rather than a horizontally divided desktop row.
- Every detail section places its icon/title in a header row, then the label/value pairs beneath. Labels and values are still two columns; long addresses/destinations wrap in the value column.
- Vehicle image is large and centered above its title/model text; two capacities stay on one row.
- Special requests and billing notes each become their own pale-gray card: icon/title on the first row, horizontal separator, value below.
- Pricing becomes a full-width list with item labels left and amounts right. Payment note follows a divider; the full-width centered total panel is underneath it.
- Next-steps card centers all content and stacks steps vertically; numbered circles and down chevrons form the sequence. The heading retains its question mark.
- Assistance card puts icon, assistance heading, sentence, and phone number centered above a horizontal rule. Closing text below is left-aligned.
- Footer stacks the centered wordmark above a thin rule and a very compact single-row phone/email/site strip. It does not add extra page controls or a new reservation button.

#### Confirmation behavior, sample-data conflicts, and unknowns

- The user's scope establishes a local thank-you screen after successful static submission. No email is actually sent and no real payment, reservation processing, or backend request is implied by the implementation scope.
- The page should later reflect the entered trip, selected vehicle, extras, passenger, payer and price data. Displayed status/review-time/next-step sentences should follow the visual reference.
- **Reference conflict: greeting name.** Thank-you page says `Pavel`, while this screenshot's primary passenger is `John Smith` and payer is `Emily Smith`. The correct source for the personalized greeting must be settled for the implementation; do not silently make these three people the same.
- **Reference conflict: trip date.** Step 5 says `Sep 12, 2026 at 6:00 AM`, but thank-you says `August 25, 2026` / `Tue, 2:00 PM`. These are separate sample states; a functioning form should derive both screens from one submitted state rather than hard-code conflicting dates.
- **Reference difference: pickup detail.** Step 5 uses city-only `Carol Stream, IL`; thank-you expands it to `302 Sype Dr, Carol Stream, IL, 60188–3306`.
- **Reference difference: Meet & Greet status.** Step 5 says `Included`; thank-you says `Added`.
- **Reference difference: pricing presentation.** Step 5 combines all child seats as `$175.00`; thank-you splits two car seats as `$125.00` and one booster as `$50.00`. Totals agree.
- `TUX-REQUEST-0001` is screenshot sample content. A local request-ID generation rule is not specified by the screenshots and should be recorded if dummy/local logic is added.
- No confirmation-page edit, print, download, restart, or payment buttons are visible. Additional controls would be a scope/design change.
- The ZIP includes reference screenshots and background images, but no separate transparent Lincoln Navigator cutout or standalone TUXANO logo files; their eventual asset source/extraction method must be recorded when implementation begins.


## 6. Source sample data and inconsistencies

The data below comes from the supplied screenshots. Section 10 distinguishes these source fixtures from the additional demo data and behavior introduced in the implementation.

### 6.1 Shared sample pricing

| Item | Source value |
| --- | --- |
| Premium SUV transportation | $195 |
| Luxury SUV transportation | $225 |
| Executive SUV transportation | $265 |
| Rolls-Royce Ghost transportation | $1,250 |
| Rolls-Royce Cullinan transportation | $1,850 |
| Rolls-Royce Phantom transportation | $3,250 |
| Meet & Greet in later-step example | $50 |
| Seat-rate helper | `First seat $75 • Each additional seat $50` |
| 2 car seats in example | $125 |
| 1 booster seat in example | $50 |
| Child-seat total in example | $175 |
| Gratuity in example | 20% of $225 transportation = $45 |
| Estimated total in example | $225 + $50 + $175 + $45 = **$495** |

The screenshot explicitly says gratuity is calculated on transportation charges only. It must not be calculated on Meet & Greet or child-seat charges. Vehicle-card prices exclude gratuity. The seat helper and three-seat example fit a combined first-seat/additional-seat rule, but the screenshots do not fully define allocation for every mix of car seats and booster seats. Do not present the reference prices as live route quotes.

### 6.2 Differences that need an implementation decision later

| Topic | Exact observed difference | Consequence for a functional form |
| --- | --- | --- |
| Pickup date | Steps 2–4: `Sep 8, 2026`; Step 5: `Sep 12, 2026 at 6:00 AM`; thank-you: `August 25, 2026` and `Tue, 2:00 PM` | Preserve these values in the inventory; later live summaries should use the actual selected trip date/time consistently unless the owner requests separate screenshot fixtures. |
| Greeting name | Thank-you says `Thank you, Pavel.`; payer is Emily Smith and primary passenger is John Smith | Greeting identity is not defined by the source. The implementation uses the payer's first name; see Section 10. |
| Pickup address | Form summaries say `Carol Stream, IL`; thank-you expands it to `302 Sype Dr, Carol Stream, IL, 60188–3306` | No address lookup or expansion service is supplied. Do not invent a resolved address for arbitrary user input. |
| Airline spelling | Review uses `American Airlines`; thank-you uses `American Airline (AA)` | Preserve source wording here; later decide a consistent representation of entered airline data. |
| Meet & Greet status | Review says `Included`; thank-you says `Added`; price summary still charges $50 | These words describe the selected extra in the fixture; `Included` must not accidentally make it free. |
| Capacity copy | Desktop summary/review uses `Up to 6 Passengers` / `Up to 6 Bags`; some phone summaries shorten these labels | Match viewport-specific wording where documented without changing the capacity value. |
| Child-seat copy | Capitalization and spacing differ between some sidebar/mobile labels and desktop review labels | Keep the visible variants in their inventories; decide whether production copy should match each reference exactly. |
| Time punctuation | Some phone raster glyphs look semicolon-like in `6:00 AM` | It is a visual/typographic uncertainty, not evidence that time data should be stored with a semicolon. |
| Collection subtitle punctuation | Step 2 SUV subtitle ends with a comma | Recorded literally; changing it to a period would be a copy correction requiring a documented decision. |
| Reservation/email/security claims | Source includes receipt/review/email/payment and encryption statements | These are reference UI text. This static phase does not create a real reservation, send an email, collect payment, or prove server-side encryption. |

## 7. Later functional implementation inventory

This section records the requested behavior and the UI's implications. The static implementation now supports this workflow; Section 10 records the decisions made for states absent from the screenshots.

### 7.1 Form state to retain between steps

- Trip: service type, pickup, drop-off, optional intermediate stops, selected date/time; duration only if an agreed Hourly design requires it.
- Vehicle: selected class/card, displayed model description, passenger/bag limits, reference/demo transportation price.
- Passengers/extras: passenger count, luggage count, flight type, airline, flight/tail number, Meet & Greet selection, child-seat selection and counts, gratuity selection/custom value/tip-in-person choice, special requests.
- Contact: payer's first/last name, email, phone, optional company; primary passenger's name, mobile and optional email; same-as-payer checkbox state.
- Billing: street, optional apartment/suite/unit, city, state/province, ZIP/postal code, country, optional billing notes.
- Review: read-only representations of the retained state, editable links back to their source steps, line items, estimated total, policy-consent checkbox.
- Thank-you: the retained trip/contact/pricing details, agreed greeting identity, local/demo request ID, and the branded confirmation layout.

### 7.2 Navigation and controls

- Step 1 `CHECK PRICE` should validate the agreed trip requirements and advance to Step 2.
- Step 2 card controls should select one vehicle. Continue should require a valid selection; Back/Edit Trip should preserve entered state.
- Step 3 plus/minus controls should update counts, toggles should control extras, and pricing/gratuity changes should update every relevant summary.
- Step 4 same-as-billing-contact behavior should populate/map primary-passenger details consistently. Required asterisk fields should be validated; optional fields should remain optional.
- Step 5 Edit actions should return to the corresponding source step with state retained. The consent checkbox should be handled before submitting.
- Successful local/static submission should display the thank-you page using the entered data. Exact file/routing structure is a later implementation decision.
- Mobile and desktop must have the same retained state and working controls, despite different layouts or shortened labels.

### 7.3 Source states that are not supplied

The archive shows no expanded Hourly layout, autocomplete dropdown, geolocation result, open date/time picker, expanded stop fields, maximum stop count, selected-vehicle style, empty-selection error, count-limit error, private-aviation field changes, expanded custom-gratuity input, validation-error styling, loading/submitting state, policy modal, or real submission failure. These need reasonable implementation choices after the owner's review; each added behavior or mock must be noted here.

Vehicle capacities are supplied. Count minima/maxima, whether child seats count toward capacity, and how capacity failures should appear are not fully specified. State/country option lists, location provider, route-pricing rules, Hourly rates, custom-gratuity units/limits, and policy URLs/content are also absent.

### 7.4 Dummy data and assumption log

| Status | Item | Current record |
| --- | --- | --- |
| Source fixture | Screenshot sample route, people, request ID, prices, quantities, dates, and contact information | Transcribed above; not newly invented project data |
| New dummy data | Additional local suggestions, Hourly rates, and local request IDs | Implemented and individually recorded in Section 10 |
| Mock behavior | Local suggestions, fixed quotes, static submit | Implemented locally; no booking/email/payment request is sent. See Section 10. |
| Design choices | CSS, breakpoints, fonts, SVG icons, original/derived assets | Implemented; provenance is in assets/README.md and decisions are in Section 10. |

For every future addition, record: the item, why it is needed, whether it comes from the screenshots or was invented, where it is used, and its limits. Do not describe mock submissions or mock prices as real services.

## 8. Future build and verification checklist

### Phase A — Specification and owner review

- [x] Read all files in the uploaded ZIP.
- [x] Inspect desktop and phone references for every step and the thank-you page.
- [x] List all visible controls, text, options, example values, and design details individually.
- [x] Record source inconsistencies, missing assets, and behavior not shown by the references.
- [x] Prepare `project.md`.
- [x] Owner reviews this file and supplies the next implementation instruction.

### Phase B — Desktop implementation, after the next instruction

- [x] Choose and document the HTML/CSS/JavaScript file structure and needed local tooling.
- [x] Obtain/load both named font families and resolve the vehicle-photo, vehicle-cutout, wordmark, and icon assets.
- [x] Build Step 1 against its desktop screenshot.
- [x] Build Step 2, including all six cards and source descriptions/prices.
- [x] Build Step 3, all count/toggle/flight/gratuity controls, seat breakdown, and sidebar.
- [x] Build Step 4, contact/billing fields, checkbox mapping, and sidebar.
- [x] Build Step 5, read-only review, Edit links, consent, totals, and local/static submit.
- [x] Build the thank-you page and transfer retained state to its summary.
- [x] Record every new dummy data item and unresolved-source decision in this file.
- [x] Compare desktop screenshots at the 1440 px reference width and correct differences page by page.

### Phase C — Phone and intermediate-width layouts

- [x] Match all phone references at 390 px: typography, lobby/hero cropping, progress labels, spacing, controls, and card ordering.
- [x] Keep Step 1 date/time side by side.
- [x] Stack all six vehicle cards in source order.
- [x] Place trip/price summaries and next-step cards below the main form where shown.
- [x] Apply viewport-specific copy/layout differences documented in the inventories.
- [x] Place full-width Continue/Submit above full-width Back on phone.
- [x] Recreate the phone thank-you hero, vertical information sections, pricing total, next-step sequence, assistance panel, and footer.
- [x] Choose/document intermediate breakpoints; check narrower phones, tablets, and wide desktops for overflow or overlap.

### Phase D — Functional and visual checks

- [x] Complete the form from Step 1 to thank-you using user-entered data.
- [x] Check Back/Continue/Edit navigation preserves state correctly.
- [x] Check both service-type options and document any demo-only Hourly behavior.
- [x] Check stop add/remove controls, date/time input, and any local/demo address behavior.
- [x] Select each vehicle and verify its title, description, price, and capacity.
- [x] Check passenger/luggage and child-seat count boundaries and toggles.
- [x] Check Commercial Flight/Private Aviation behavior.
- [x] Check seat arithmetic, Meet & Greet charges, all gratuity presets, custom/tip-in-person choices, and total consistency.
- [x] Check optional versus required contact/billing fields, email/phone handling, checkbox mapping, and visible validation.
- [x] Check special-request and billing-note counters/limits and safe rendering of entered text.
- [x] Check consent and policy-link behavior without inventing published policy content.
- [x] Check thank-you details match the submitted local state; document how greeting and request ID were chosen.
- [x] Compare every desktop/phone page with its corresponding source, including exact text, font families/weights, colors, image crops, widths, alignment, borders, spacing, icons, and buttons.
- [x] Check keyboard access, input labels, focus visibility, and readable errors while preserving the supplied design.
- [x] Check for browser-console errors and broken/missing assets.
- [x] Document actual passed/failed checks and any limits, then save the finished implementation to GitHub for owner review.

## 9. Review topics before implementing absent details

These were open questions in the original specification. The owner subsequently authorized completing all implementation decisions. Section 10 records the chosen prototype defaults; these remain review topics if the owner wants different behavior:

1. Which name should the thank-you greeting use: payer, primary passenger, or a separate requester? The screenshot's `Pavel` does not match either listed contact.
2. May the implementation use cropped vehicle/wordmark images from the supplied screenshots, or will original assets be supplied? Background images are already available; the separate photos/cutouts/logo are not.
3. What should the Hourly option reveal, and which demo pricing rule should it use? No Hourly-state screenshot or rates are supplied.
4. How should the additional unpictured states behave: stops, custom gratuity, private aviation, and validation? Reasonable local/static defaults can be documented when the owner starts implementation.
5. What should the Terms & Conditions and Cancellation Policy links open? Neither document nor URL was provided.

**Current checkpoint:** the owner has authorized implementation. Review the completed website and browser previews, then request any changes.

## 10. Historical static implementation and decision log — version 1.0.0

**Historical record, completed 14 October 2026.** The behavior and checks in this section describe the saved pre-Maps version, not the current provider integration. Section 11 supersedes changed behavior while preserving this baseline for comparison.

The owner authorized completing the remaining process and choosing sensible defaults. The application is implemented in `index.html`, `styles.css`, and `app.js`, with an optional `server.js` development server. It has no runtime package dependency or build step. Node.js 20+ and the pinned Playwright development dependency are used for local checks.

### 10.1 What is implemented

- All five steps, desktop layouts, phone layouts, and the thank-you page.
- Working inputs, selection states, toggles, steppers, counters, navigation, review edits, price calculations, and local submission.
- Validation of required fields, email/phone input, vehicle capacity, seat counts, consent, and the complete retained state at final submission. Revisiting Review cannot bypass required data from an earlier step.
- Typed restoration of a session draft, safe display of entered text, keyboard focus retained during control updates, local request IDs, and a new-request reset.
- Authentic self-hosted fonts, original supplied backgrounds, faithful vehicle/logo crops, and clean desktop background variants. SVG outline icons were drawn in code to reproduce the reference symbols; exported original icon assets were not supplied.
- Browser verification and 12 actual desktop/phone screenshots in `docs/previews/`. These screenshots are examples of the working application, not assertions that every raster pixel is identical to the source.

### 10.2 Explicit demo data and unpictured behavior

| Item | Chosen behavior / data | Source versus addition |
| --- | --- | --- |
| Transfer quotes | Premium $195; Luxury $225; Executive $265; Ghost $1,250; Cullinan $1,850; Phantom $3,250 | Original screenshot amounts; treated as fixed demo quotes, independent of entered route, distance, or stops |
| Hourly prices | Premium $95/h; Luxury $115/h; Executive $135/h; Ghost $500/h; Cullinan $750/h; Phantom $1,250/h | **Invented demo rates**, not operator tariffs |
| Hourly input | 2–12 hours, initial 3; price = selected demo hourly rate × hours; drop-off is optional | Added state because only Transfer is pictured |
| Stops | Add/remove up to 5; an added stop must be filled; stops appear in Review/thank-you; no additional demo charge | Added unpictured controls and limit |
| Local address suggestions | `Carol Stream, IL`; `O’Hare International Airport (ORD)`; `Midway International Airport (MDW)`; `Downtown Chicago, IL` | First two from source; last two added local examples. Native datalist, no real search/geocoding API |
| Current-location control | Requests browser geolocation only when clicked; inserts latitude/longitude; an unavailable/denied result shows an error | Real browser capability, no reverse-geocoding service |
| Initial passenger/luggage values | 1 passenger and 0 bags in a new request | Added practical initial values; fixture uses source 3 passengers/4 bags |
| Capacity | Enforce the supplied 6/6 or 3/3 passenger/bag limits; at most one selected vehicle. Existing excessive counts after choosing a smaller vehicle must be corrected before continuing/submitting | Limits from source; validation and visible selected-card styling added |
| Optional extras | Meet & Greet and Child Seats initially off; demo fixture shows them on. Meet & Greet adds $50 | Price from source; defaults chosen to require explicit optional selection |
| Seat charging | First combined seat $75, each additional $50; allocate first-seat charge to car seats when any are selected, otherwise to booster seats | Deterministic extension of the supplied helper/table. Total car + booster seats cannot exceed passengers |
| Gratuity | Initial 20% as shown; presets 10/15/20/25; Custom is 0–100%, in 0.5-point input increments; round the tip to cents; calculate on transportation only | Presets/basis from source; custom input bounds/units added |
| In-person tipping | Removes the calculated gratuity; unchecking restores the prior percentage | Added unpictured state |
| Private aviation | Retains flight/tail number; changes the free-text `AIRLINE` label/placeholder to `OPERATOR` / `Type your operator` | Added unpictured state; no real flight monitoring |
| Same as billing contact | Copies name/email/phone to passenger fields and keeps them synchronized. Unchecking preserves copied data; manually editing a passenger field ends synchronization | Added mechanics for the pictured checkbox |
| Address options | US 50 states + DC; 13 Canadian provinces/territories. Country list: United States, Canada, United Kingdom, Bangladesh, Other. Other countries use free-text region input; changing country clears region | Real geographic names in a deliberately limited demo list; US initially selected |
| Phone validation | 7–15 digits after ignoring formatting; required names/address fields reject whitespace-only input; native email validation plus final basic email checks | Prototype validation, not a worldwide phone/address verification service |
| Dates/time | Native date/time controls, formatted consistently as entered; no availability or past-date restriction | Allows the historical reference fixture; no operator schedule/timezone API |
| Character limits | Special requests 250; billing notes 500; live counters | Implied by original counters |
| Policy links | Accessible dialogs explaining that real operator policies are not supplied; no invented legal text | Added honest placeholder behavior |
| Thank-you greeting | Payer's first name | Resolves screenshot `Pavel`/Emily/John mismatch; source greeting remains in inventory |
| Pickup date and address | Same entered date/time and location across all pages; no invented address expansion | Resolves differing screenshot fixtures |
| Request ID | `TUX-REQUEST-` plus a locally generated random identifier; stays stable on normal-mode refresh of the submitted request | **Added local/demo identifier**, not a backend reservation ID |
| Confirmation edits | Changing submitted trip/options/contact details invalidates the prior submission. A new valid submission is required before opening its updated thank-you page | Added consistency guard |
| Confirmation disclosure | `Demo request only — no reservation, payment, or email has been sent.` | Added visible clarification of the requested static behavior |
| Reset | `Start a new request` clears the tab's draft and returns to Trip | Added convenient local control, absent from reference |
| Contact links | `tel:+17174346195`, `mailto:info@tuxano.com`, and `https://tuxano.com` from the supplied contact text | Link behavior inferred from source; not contacted during tests |
| Mobile copy cleanup | Generated quantities use consistent pluralization rather than reproducing source `2 car Seat, 1 Booster Seat` typos | Documented copy correction; amounts and capacities unchanged |

### 10.3 Fixture and local data handling

`?demo=1` supplies the original example vehicle, route, people, extras, and price data for review. It deliberately uses the same **8 September 2026, 6:00 AM** trip throughout and greets **Emily**, the payer. The date is source-fixture data, not a suggested real booking date. Loading the demo query again reinitializes that example; normal-mode reload restores the current draft instead.

Normal mode starts with empty trip/contact fields, optional extras off, and the defaults above. Draft data stays in `sessionStorage` for the current browser tab. There is no database, credential, network submission, payment, or email integration. Corrupt or incorrectly typed saved state falls back to safe values; an incomplete forged submitted state cannot open a confirmation.

The screenshot security/review/email/payment sentences remain reference copy. The prototype's confirmation disclosure makes clear that no backend service or actual processing is being performed.

### 10.4 Design and asset implementation

- Serif: Cormorant Garamond, variable 300–700; sans-serif: Plus Jakarta Sans, variable 200–800. Both are unmodified official Google Fonts files with their OFL licenses included.
- Vehicle photos, the scenic Navigator summary photo, Navigator cutout, and TUXANO wordmark are extracted from the supplied screenshots. No substitute vehicle images were invented. Their limited raster resolution is inherited from the sources.
- The separate desktop lobby asset does not include all photographed outer strips shown by every reference. `lobby-step-1.jpg` through `lobby-step-5.jpg` combine the registered original photograph with **photography-only** screenshot strips; no text, progress indicators, or form controls are baked into them. Unseen regions behind white panels use clean adjacent photography/floor strips. [Full provenance](assets/README.md).
- Phone lobby backgrounds follow the reference's full-page `100% 100%` sizing. Desktop pages use their respective clean variants. Dynamic content changes the page height and therefore can change the background's vertical scale.
- Layout breakpoints: phone through 639 px; intermediate vehicle grid has two columns from 640–900 px; desktop vehicles use three columns above that. Main/sidebar columns collapse when space is insufficient, with further typography/layout adjustments at 1023/1279 px and narrow phones below 375 px.
- The reference's individual desktop panel widths, Step 1 side-by-side phone date/time fields, phone vehicle ordering, stacked phone summaries, and reversed full-width phone navigation order are retained.
- Small raster typography/icon differences can remain because exact design-file measurements and exported icons were not supplied. Actual captures are provided for the owner's visual review; pixel-perfect equality is not claimed.

### 10.5 Verification and delivery record

Verified in the current cloud machine on 14 October 2026:

- **24 Playwright tests passed**, with no failed/skipped tests or missing local images/fonts in the tested journeys. The final suite took approximately 1.4 minutes using one worker.
- Tests exercised entered-data flows, all six vehicle prices, independent $495 example arithmetic, all gratuity presets/custom/in-person choices, seat allocation, capacity limits, required/optional fields, all Review Edit actions, consent, static submit, and stable local confirmation IDs.
- Regression checks covered complete-state validation after edits, keyboard focus, safe rendering of entered HTML, corrupt saved state, and blocking an edited/forged confirmation until a new valid submission.
- **48 page/width combinations passed overflow checks**: all six pages at 320, 375, 390, 640, 768, 1024, 1440, and 1920 px. A 640 px vehicle-grid overflow found during inspection was fixed before the final passing suite.
- Desktop/phone browser captures verified both authentic font families and all displayed images loaded. All 12 current captures are committed in [docs/previews](docs/previews); manual reference comparison found no missing sections, clipped/overlapping text, wrong images, or visible reconstructed-background seams in the checked layouts.
- `npm run check` passed, and a frozen-lockfile `npm ci` refresh completed successfully. Runtime used Node.js 24.19.0, npm 11.9.0, Playwright 1.64.0, and system Chromium 154.
- The local development server started successfully and returned the expected application HTML; representative functional browser requests exercised the full workflow. File-URL browsing is blocked by this cloud browser's administrator policy, so the verified run instructions use the HTTP server.
- GitHub Actions configuration is included; remote CI execution is not claimed as locally verified. No hosted public site was published by this work.
- Cloud environment **install_script** and **start_skill** were saved as a configuration draft. Saving does not publish the cloud environment: review/save the draft in environment settings and publish it to use the reusable snapshot. Processes still need startup in a new task; restoration in a separate new task has not been tested.

The final GitHub commit contains the application, assets, docs, previews, and tests. The owner review below remains separate from automated verification.

- [ ] Owner checks the completed website and requests any final modifications.

## 11. Google Maps integration record — version 1.1.0

Implementation date: **18 October 2026**. This is the current behavior. The supplied screenshot inventories and Section 10 remain historical evidence; changed controls and business assumptions below intentionally extend that static design.

### 11.1 Current trip workflow

- Normal mode uses **Google Places (New)** programmatic suggestions for pickup, drop-off, and each stop. Search begins after two characters with a 300 ms debounce and displays up to five results. The browser SDK uses English and US regional bias; this is not a hard country restriction.
- Typed addresses must resolve to a selected Google place before route calculation/continuation. Editing the text clears the old place and route/price. The current-location button is a separate permission-based browser geolocation input; its coordinates can serve as pickup without reverse geocoding.
- At most **five intermediate stops**, in entered order. Each has a stable local ID, location selector, remove button, and wait selector. Wait options are **0, 5, 10, 15, 20, 30, 45, 60, 90, 120 minutes**, initially **5 minutes**. Total supported waiting is at most 600 minutes. Removing/re-adding a stop creates a new identity; outstanding requests cannot apply to the replacement.
- **Pickup time** is the user's selected clock time. Read-only **Travel time** is automatic journey duration, not another clock input. It adds Google driving seconds and all selected waiting seconds exactly once. No arrival clock time or availability lookup is inferred.
- Google Routes calculates the actual road path through pickup, every ordered stop, and drop-off. Stop detours are already in its distance and driving duration; they are not added again locally. `TRAFFIC_UNAWARE` is the chosen baseline, so the UI explicitly says traffic is not included.
- The journey display separates distance in km/miles, driving duration, stop waiting, and total duration. Display distances use one decimal; calculations retain the original meters/seconds. Display durations round upward to whole minutes, formatting hours/minutes as needed.
- **Hourly also requires drop-off and a valid route** for an estimate. The booked-hours selector remains 2–12 hours, initially 3. The previous optional drop-off/hourly-only fixed multiplication is superseded.
- Location edits and stop add/remove clear route validity. Wait, service, hours, vehicle, and extras feed the applicable current calculation. Per-field generation guards and route request generations/abort signals reject stale responses after typing, navigation, removal, or reset. Errors show a retry path; an unavailable Google request never becomes a fabricated normal-mode route or an old quote.
- Route details and derived amounts are reflected in the vehicle cards, sidebar summaries, Review, and thank-you. The form remains locally submitted; route/API access does not create a transportation reservation.

### 11.2 Configurable demonstration tariff table

Google supplies road distance and driving time, **not fares**. The following USD values are invented prototype business rules in `pricing.js`, exposed here for review. They must be replaced/approved by the operator before real quoting.

| Vehicle ID / class | Transfer base | Per mile | Per driving minute | Transfer minimum | Per stop-wait minute | Per booked hour |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `premium` — Premium SUV | $65 | $2 | $3 | $100 | $1 | $95 |
| `luxury` — Luxury SUV | $75 | $3 | $3 | $125 | $1.50 | $115 |
| `executive` — Executive SUV | $105 | $3.50 | $3 | $150 | $2 | $135 |
| `ghost` — Rolls-Royce Ghost | $500 | $15 | $15 | $600 | $5 | $500 |
| `cullinan` — Rolls-Royce Cullinan | $700 | $20 | $25 | $900 | $7.50 | $750 |
| `phantom` — Rolls-Royce Phantom | $1,000 | $30 | $55 | $1,500 | $10 | $1,250 |

Define `d = route.distanceMeters`, `s = route.durationSeconds`, `w = sum of stop.waitMinutes`, and `h = selected booked hours`:

```text
miles          = d / 1609.344
kilometers     = d / 1000
drivingMinutes = s / 60

Transfer drivingCharge = max(minimum,
                             base + miles × perMile
                                  + drivingMinutes × perDrivingMinute)
Hourly drivingCharge   = max(h, drivingMinutes / 60) × hourlyRate
                         + miles × perMile
waitingCharge          = w × perWaitingMinute
transportation         = drivingCharge + waitingCharge
totalDurationSeconds   = s + w × 60
```

The transfer minimum applies **before** adding waiting. Hourly uses the larger of booked hours and actual driving hours, then adds mileage and waiting; it does not use the transfer base/minimum/per-driving-minute charge. Waiting remains separately charged even when it fits inside booked hours. These are explicit added assumptions, not Google behavior or an original screenshot tariff.

`drivingCharge`, `waitingCharge`, and final transportation are rounded to cents using the pricing module's `Math.round((value + Number.EPSILON) * 100) / 100`; transportation is rounded from the full-precision driving-plus-waiting sum. Invalid vehicle/service/route values or unsupported waits/hours are rejected.

### 11.3 Extras, gratuity, and arithmetic examples

Existing extras remain:

- Meet & Greet: $50 when selected, otherwise $0.
- For combined car/booster seat count `n`: $0 if `n = 0`; otherwise `$75 + (n − 1) × $50`. Allocate the first-seat $75 to car seats if any are selected, otherwise booster seats. Seat/capacity validation remains in place.
- Gratuity: 10/15/20/25% presets, initially 20%; custom 0–100%; tipping in person sets the calculated percentage to zero. `gratuity = Math.round(transportation × percentage) / 100`. Its basis is **transportation including stop waiting**, excluding Meet & Greet and child seats.
- `estimatedTotal = roundToCents(transportation + Meet & Greet + childSeats + gratuity)`.

Worked prototype examples:

| Journey / selected options | Calculation | Result |
| --- | --- | --- |
| Luxury, 20 miles / 30 driving minutes / no waiting | `max(125, 75 + 20×3 + 30×3)` | Transportation **$225.00** |
| Same route, two stops waiting 5 + 10 minutes | Driving $225 + `15×$1.50` wait; total journey `30+15` minutes | Transportation **$247.50**, travel **45 min** |
| Same 15-minute-wait route, Meet & Greet, 2 car seats + 1 booster, 20% gratuity | `$247.50 + $50 + $175 + $49.50` | Estimate **$522.00** |
| Luxury Hourly, 3 booked hours, same 20-mile / 30-driving-minute route and 15-minute waiting | `max(3, 0.5)×115 + 20×3 + 15×1.50` | Transportation **$427.50** |

The explicit offline fixture supplies exactly 32,186.88 meters (20 miles) and 1,800 driving seconds (30 minutes), with no stops initially. Those sample metrics reproduce all six original vehicle amounts through the new formula. With its original extras/gratuity, Luxury remains `$225 + $50 + $175 + $45 = $495`.

### 11.4 Places sessions, transient provider content, and draft restoration

`maps.js` loads Maps JavaScript once and imports the `places` library. It uses `AutocompleteSuggestion.fetchAutocompleteSuggestions`, a separate `AutocompleteSessionToken` per input editing session, `prediction.toPlace()`, then `place.fetchFields()` for `id`, `displayName`, `location`, `formattedAddress`, and `attributions`. The first details fetch from that prediction carries its autocomplete token automatically; a selected session is discarded. The selected label includes the place name and address, so a hotel, airport, or park remains identifiable rather than showing only its postal address. `displayName` is requested for that visible behavior; Google API billing follows the requested fields.

Suggestions use a custom accessible combobox/listbox, arrow/Enter/Escape handling, safe text rendering, visible provider errors, and generation guards for predictions and details. Untranslated **Google Maps** text attribution appears with suggestions and route information. Returned attribution `provider` / `providerURI` values are normalized for safe display, with only HTTPS provider links enabled. Public `terms.html` and `privacy.html` provide actual prototype Terms of Use and a Privacy Notice, explain current data processing, and link/incorporate the applicable Google terms and privacy policy. These notices do not establish operator booking/cancellation rules; the existing operator-policy dialogs remain separate placeholders.

The existing tab-scoped `sessionStorage` draft keeps booking/contact/options, stop IDs/waits, original **user-typed queries**, and selected Google **place IDs**. It does not retain Google-formatted addresses, attribution payloads, suggestions, or driving metrics. Browser geolocation coordinates are browser/user input and can be stored with that draft; they are not Google Place coordinates. A normal-mode refresh first resolves each saved Google place ID through a fresh `Place.fetchFields()` request for its canonical address/location/providers, then calculates a fresh route. The original query is not presented as a restored canonical Google address. If details restoration fails, the app clears the failed selection, returns to Trip, and requires reselection without displaying a quote. Browser-supplied coordinates remain the separate user-input case. No saved provider metrics are trusted to bypass Google availability.

The active browser workflow keeps normalized Google route metrics in memory. The server does not cache Google provider results, and there is no provider-result database or disk cache. Starting a new request clears the draft, submission identity, and active route. Existing contact validation, consent, edits, and draft consistency checks remain.

`?demo=1` is an **explicit offline reference fixture**, not an error fallback. It initializes the historical example each document load and supplies sample selected locations and fixed sample route metrics; labels identify those metrics as examples. Its date remains 8 September 2026 at 6:00 AM and greeting uses Emily. Searching/altering a location still invokes the real Places integration; do not treat fixture mileage as a live quote for a modified journey. Normal mode starts empty and never silently enables this fixture.

### 11.5 Server API and request boundaries

`server.js` is now required for live mode. It serves an explicit public application/asset allowlist and delegates `/api/maps/*` to `maps-api.js`; private configuration, server source modules, tests, backups, and arbitrary repository files are not public routes.

- `GET /api/maps/config`: browser key plus browser/Routes configuration booleans. The Routes key is never returned.
- `POST /api/maps/route`: JSON `origin`, `destination`, and at most five ordered `stops`. A waypoint is a bounded nonempty Place ID or a validated latitude/longitude pair. Arbitrary addresses/upstream URLs/extra request properties are rejected.
- Server-only upstream: `POST https://routes.googleapis.com/directions/v2:computeRoutes`, API-key header, field mask **`routes.distanceMeters,routes.duration`**, `DRIVE`, `TRAFFIC_UNAWARE`, and `optimizeWaypointOrder:false`. Intermediate waypoints remain ordinary stopovers in supplied order; no route optimization or extra local detour calculation is added.
- Normalize the first route into nonnegative meters and duration seconds, provider, and calculation timestamp. Protobuf duration strings are parsed as seconds. The application needs aggregate metrics, so leg/polyline/map fields are not requested.
- No Google provider-result cache is kept on the server. Each required route request is forwarded to Google; normalized metrics remain in the active browser booking only. Wait, service, and tariff choices do not alter Google's road path and are calculated locally from the selected active route.
- API responses use `Cache-Control: no-store`; the browser has no persistent route cache, and provider metrics are not written to local files or the draft.
- Input body limit 16 KiB; route POST limit 30 requests per socket IP per minute; bounded client accounting; same-origin browser-request checks; fixed upstream destination; 12-second provider timeout; sanitized errors. These controls bound the prototype endpoint; operator hosting/usage policies remain separate.
- Unconfigured keys, malformed requests, no-route responses, invalid Google payloads, timeout, network errors, and rate limits return explicit failure states. An older in-flight route cannot overwrite a newer route after edits/reset.

### 11.6 Runtime, configuration, hosting, and backup

Current minimum runtime: **Node.js 24.5+**. `npm start` and `npm run dev` run `node --use-env-proxy server.js`. The flag lets outbound Node fetch honor the environment's proxy configuration. There is no frontend build step or runtime package dependency; `npm ci` installs the pinned development/test tools.

Configuration names only; **no actual API key values belong in this file or the repository**:

| Binding | Use | Expected restriction |
| --- | --- | --- |
| `GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript / Places (New), delivered to browser configuration | Permitted website HTTP referrers plus appropriate API restrictions |
| `GOOGLE_ROUTES_API_KEY` | Server-only Routes call | Routes API restriction and appropriate server/IP access controls |
| `PORT` | HTTP listening port, default 3000 | Hosting configuration; optional `--port` override |

The server loads ignored `.env.local` without shell evaluation; existing injected environment values take precedence. [.env.example](.env.example) contains blank bindings and explanatory comments only. Use separate browser/server keys, enable the appropriate APIs/billing, configure referrers for the actual local/preview/production hosts, and keep the private Routes key out of frontend assets, logs, Git, screenshots, and archives. Browser key visibility is intentional; the server key is private.

Host the live application with Node 24.5+ and same-origin API access; a static-only host cannot provide the Routes endpoint. Use HTTPS in deployment and permitted outbound access to `maps.googleapis.com`, `maps.gstatic.com`, `places.googleapis.com`, and `routes.googleapis.com`. Google may bill autocomplete/details and Routes requests; the prototype's demonstration fares are separate from those API charges. Static hosting can still display the explicit fixture for visual review.

Pre-change backup: [releases/car-pro-form-static-v1.0.0-before-maps.zip](releases/car-pro-form-static-v1.0.0-before-maps.zip), all 47 tracked files at commit `9bd33e5`, SHA-256 `dd56418cca67d8bb16394e10998307d935d753ad6e40b762c453fc88765b25fe`. It was created and checked before private Maps configuration. [Backup/restore notes](releases/README.md) explain safe extraction into a separate empty folder. The previous runtime/behavior remains historical, not the current live setup.

### 11.7 Scope, added demo assumptions, and reference differences

| Item | Current choice / provenance |
| --- | --- |
| Location search | Real Google Places (New); replaces the historical local datalist. No local location fallback in normal mode. |
| Road metrics | Real Google Routes when available; no geodesic approximation, fabricated normal-mode route, or stale-price substitution. |
| Prototype tariffs | Table/formulas in 11.2 are newly added demo business rules. Google does not endorse or calculate those prices. |
| Offline metrics | Exactly 20 miles / 30 driving minutes in explicit `?demo=1`; source screenshot did not supply those metrics. Added to reproduce the original six sample prices through the new formula. |
| Stops | Five maximum, stable IDs, listed wait choices/default 5 minutes, per-class waiting prices; new controls absent from original screenshots. |
| Time labels | Separate Pickup time and automatic Travel time, explicitly confirmed by the owner; no replacement of the pickup clock input. |
| Hourly | Drop-off/route now required; minimum booked time 2 hours, default 3, maximum selection 12; larger actual driving time + mileage + waits drives its formula. Supersedes historical fixed hourly multiplication. |
| Retained sample conflicts | Continue one entered date/address throughout, payer greeting, consistent generated quantities, and locally generated request ID. Original conflicting screenshot examples remain transcribed above. |
| Submission | Still local/static navigation to thank-you, with visible demo disclosure. No reservation is stored/sent, no email is sent, and no payment is collected. Google route requests do not change that. |
| Policies | New public `terms.html` / `privacy.html` contain prototype usage/data-handling notices and applicable Google terms/policy links. Existing operator booking/cancellation dialogs remain placeholders; these notices do not invent operator rules. |
| Future WordPress | No WordPress conversion is included in this update. Current HTML/CSS/JS and proxy are the prototype to review before that later integration. |

Google route metrics are estimates; this phase adds neither operator availability nor confirmation processing. Screenshot review/email/payment wording remains reference copy alongside the explicit demo-submission disclosure. The original `docs/previews/` captures are the historical static v1.0.0 visual record; any current integration captures are identified separately.

### 11.8 Verification status

- **Live Routes verified, 18 October 2026:** after the cloud network policy became effective, domain reachability was rechecked. An actual unmocked POST through the running `npm start` same-origin proxy, with one intermediate stop, returned HTTP 200: **30,855 meters**, **2,492 driving seconds**, provider **`google`**. This establishes the tested live server-route path; it does not establish every route, production referrer, or tariff policy.
- **Initial network failure resolved:** earlier proxy `403 Forbidden` responses occurred before Google key validation. The successful later runtime request supersedes that blocker; no credential values are recorded here.
- **Live browser Places and complete booking flow verified, 18 October 2026:** the real Maps JavaScript SDK produced Google suggestions; actual `toPlace()` / `fetchFields()` selections preserved the names and addresses of **Willis Tower → Millennium Park → Chicago O’Hare International Airport**. The stop route displayed **31.1 km / 19.3 mi**, **36 minutes driving**, **15 minutes waiting**, and **51 minutes total** (duration displays round upward). All six vehicle quotes updated; Luxury SUV transportation was **$261.19**, including **$22.50 waiting**. With 20% gratuity and no extras, Review and the local thank-you page both showed **$313.43**. Fresh place details and route calculation also succeeded on draft reload. This was unmocked Google traffic with the supplied keys, tested from the current application origin; new production referrers/hosting remain a separate configuration.
- **Live desktop/mobile captures:** [suggestions desktop](docs/previews/maps/live-google-suggestions-desktop.png), [Trip desktop](docs/previews/maps/live-google-trip-desktop.png), [Trip phone](docs/previews/maps/live-google-trip-phone.png), [vehicles phone](docs/previews/maps/live-google-vehicles-phone.png), and [thank-you phone](docs/previews/maps/live-google-thank-you-phone.png). These show the integration; the earlier twelve captures remain the static baseline. No horizontal overflow was found in the live phone flow and no browser exceptions/console errors were observed.
- **Synthetic live-test contact data:** the final live confirmation capture uses the test contact `Live Demo`, an `example.com` email, a `555` test telephone number, and `321 Oak Street`. These are test inputs, not a real customer or newly prefilled normal-mode defaults.
- **Live-test defect corrected:** leaving a selected pickup field while its details request was pending could cancel that selection. A committed selection now survives focus moving to the next field; only typing/Escape/disposal makes that response obsolete. Updating one selection preserves the other field’s text, focus, and suggestions. A delayed-details browser regression covers this interaction.
- **Cloud browser trust resolved:** Node/Python reached Google through the configured proxy. Chromium 154 additionally needed the existing environment CA trusted in a dedicated persistent profile; verification stayed enabled. Reusable startup instructions include that local setup and the required proxy route.
- **Automated integration validation:** pricing/API unit checks and deterministic mocked browser flows exercise formulas, selected-place requirements, waiting/Hourly calculations, provider failures, stale responses, freshly restored Places details, retained drafts, and layouts. CI includes `npm run test:unit` alongside syntax/browser checks. `npm ci` (frozen lockfile), `npm run check`, and **43/43 unit checks** passed. The final complete Playwright run passed **39/39 browser tests** in 2.5 minutes: 24 existing booking/layout regressions and 15 Maps integration cases, with no failures or skips. Together with the 43 unit checks, **82 checks passed**. Twelve reference captures (six desktop and six mobile) were generated in ignored test artifacts. Section 10’s historical 24-test count is superseded.
- **Production hosting / WordPress:** neither public deployment nor WordPress conversion is part of this verification record.

- **Release checks:** the pre-change ZIP passed integrity and SHA-256 verification. All 63 current tracked/unignored release files and decompressed backup entries were scanned: no Google API key values were found. Private `.env.local` is ignored and is not served; `/server.js` is also not public. Both public prototype policy pages returned HTTP 200 and fit a 320 px viewport.
- **Reusable environment configuration:** updated `install_script` and `start_skill` were saved in the environment draft, including Node 24.5+, unit/browser checks, proxy/key handling, and trusted Chromium setup. Current-instance live checks passed; publishing the draft and restoring a new task are separate platform actions and have not been verified.


## 12. GitHub Pages hosting fix — version 1.1.1

### Reported failure and diagnosis

The owner tested **https://dev-najmul.github.io/car-pro-form/#trip** and saw “Location search is temporarily unavailable.” The earlier live verification used the Node application, while this URL was being published directly from the `main` branch as static files. Actual requests confirmed the home page returned HTTP 200 but `/api/maps/config` returned HTTP 404. The config failure happened before Google loaded. The earlier statement that the integration was complete did not establish that this Pages URL worked.

### Corrected implementation

- A module-relative `maps-config.json` supports both the site root and `/car-pro-form/`. Node serves this dynamically with `providerMode: server`, preserving its existing API/proxy and private Routes key. The original `/api/maps/config` endpoint remains supported.
- The new public-only Pages build generates `providerMode: browser` using the Maps/Places browser key. It loads Google's **new Routes library**, not the legacy Directions API. `Route.computeRoutes()` receives Place-ID or coordinate origin/destination, ordered `intermediates`, `DRIVING`, `TRAFFIC_UNAWARE`, and `optimizeWaypointOrder: false`; it requests only `distanceMeters` and `durationMillis`, then normalizes milliseconds to seconds.
- Stop waiting, prices, date/pickup time, and quote consistency use the existing application logic. Browser API failure never switches to the private Routes key or an invented route. Abort/generation guards ignore obsolete callbacks; a twelve-second routing timeout prevents an indefinitely pending quote.
- Browser configuration is generated during Actions deployment from repository secret `GOOGLE_MAPS_BROWSER_KEY`. It is public website configuration by design, protected with API/website restrictions, and is not committed. The Routes **server** key, `.env.local`, server modules, tests, previews, and version ZIPs are excluded from `dist`. Public asset symlinks are rejected; the builder only replaces its own marked output.
- Policy links now return to the project subpath, and the privacy notice describes browser-direct routes as well as the Node proxy. Tariffs and booking submission remain the same demonstration behavior; no new dummy rates were added.
- `.github/workflows/pages.yml` builds/publishes via GitHub Actions. Pages must use the Actions source; the previous branch-only publishing cannot generate private build configuration.

### Owner setup status — 19 October 2026

1. **Completed by the owner:** repository Actions secret **`GOOGLE_MAPS_BROWSER_KEY`** was added using the first Maps/Places browser key. The generated public config now loads successfully with the expected key format. The integration itself still lacks secret-management access, but that is no longer a deployment blocker.
2. **Pending owner Google Cloud change:** that browser key must authorize **Maps JavaScript API, Places API (New), and Routes API**, with billing/APIs enabled in its project. Permit website referrer **`https://dev-najmul.github.io/*`**, preserving other required referrers. The current browser Routes call returns **`PERMISSION_DENIED`: requests to `routes.googleapis.com` / `Routes.ComputeRoutes` are blocked**. No Google Cloud credential-management access was supplied, so the application cannot change that key's restrictions.
3. **Completed by the owner:** repository **Settings → Pages → Source → GitHub Actions** is set. GitHub API metadata confirms `build_type: workflow`. The prior integration HTTP 403 did not prevent the owner from completing the setting.

The initial public-origin test supplied configuration only to the test browser. After the owner completed the two GitHub settings, an unmodified live check of the published URL produced **five actual Google place suggestions**, including Willis Tower. No mocks, config overrides, browser exceptions, or console errors were involved. At a 390 px phone viewport the suggestions stayed visible without horizontal overflow. A separate actual public-site Routes call still returned `PERMISSION_DENIED`; do not mark route/time/pricing fully working on Pages until Google authorization is updated and retested.

### Validation and deployment outcome

- `npm run check` passed. `npm run test:unit` passed **48/48** checks, including five new static build safety/credential-exclusion cases. The complete Playwright run passed **43/43** cases in 2.6 minutes, including browser Routes ordering/duration/waits, denied permission, cancelled results, and a real static server mounted under `/car-pro-form/` with no API endpoints. Total: **91 passing checks**, no failures/skips. A subsequent focused static-subpath check also verified Privacy Policy navigation back to the project path.
- A local build with the supplied browser key succeeded; the generated configuration contains only that public browser credential and browser-provider flags. The private Routes key is excluded. Generated `dist` and `maps-config.json` are ignored and not committed.
- **Public deployment verified, 19 October 2026 (Asia/Dhaka):** the Deploy GitHub Pages workflow [run 39154806024](https://github.com/dev-najmul/car-pro-form/actions/runs/39154806024) completed successfully. The actual public home page and `/car-pro-form/maps-config.json` both returned HTTP 200; config reports `providerMode: browser`. Address suggestions now work on the owner’s URL. Browser Routes remains blocked by Google API authorization.
- The current Node server was restarted with the new configuration endpoint; local Node mode remains supported. The public browser key remains outside committed source, and the private Routes credential remains absent from static build output.


## 13. Temporary server Routes preview — version 1.2.0

### Owner instruction and approach

The owner clarified that GitHub is only a prototype test environment and the final product will be a WordPress plugin. Use the two keys already supplied and do not request more information or Google Cloud changes from the client. The server key was tested again against Google Routes and returned HTTP 200 (30,855 meters / 2,492 seconds with one intermediate stop); its existing authorization is usable.

A temporary Node backend runs privately on a standard GitHub Actions runner and receives key #2 through repository secret `GOOGLE_ROUTES_API_KEY`. Key #1 remains `GOOGLE_MAPS_BROWSER_KEY` for public Places/Maps. The owner confirmed adding both secrets. The integration's attempted secret write returned HTTP 403, so no credentials were committed or placed in public configuration to work around that permission.

The account-free Cloudflare Quick Tunnel supplies public HTTPS ingress to the test backend. Google Routes receives key #2 only from the backend's `X-Goog-Api-Key` header. Cloudflared is pinned to official release **2026.10.1**, SHA-256 **`3bfc539f45d2620c71debb7a86be0efa737ed5ccbad9eb85c787116900e5c586`**, verified before execution with TLS verification retained. The tunnel process does not inherit either Google key.

### Data flow and lifetime

- Pages serves the existing form and uses key #1 for actual Google Places suggestions/details. The public config adds `providerMode: remote`, `routeEndpoint`, and `previewExpiresAt`; it never contains key #2.
- The browser sends only selected ordered waypoints to the test backend, which forwards to Google with key #2. CORS permits exactly `https://dev-najmul.github.io`; preflight permits only JSON POST. Unlisted origins and unrelated endpoints stay closed. Sanitized allowed-origin errors remain readable by the form.
- Wait times, distance conversions, demo tariffs, extras, gratuity, and local thank-you behavior are unchanged. No route is fabricated or retried with a different key when the test service fails.
- The backend has a **two-hour** lifetime, **200 provider-call** total budget, and existing **30 requests/minute** limit. Invalid requests/preflights do not consume the provider budget; provider failures do. Session expiry is public operational metadata, not a secret, and appears in the form in the browser's local time.
- Local and public tunnel readiness checks must succeed before Pages is published. Readiness makes no Google route call. The publishing job then keeps the owned server/tunnel processes alive until expiry, with PID/path checks and cleanup; GitHub cancellation also ends the runner processes.
- The deployment remains **in progress while the test server is running**, even after the Pages publishing step succeeds. Restart with **Actions → Deploy GitHub Pages → Run workflow**, then refresh the form for the new endpoint. A code push restarts the session; Markdown-only result commits do not cancel the running backend.
- This is temporary prototype infrastructure. WordPress conversion is still deferred; the eventual plugin will perform the same server-side Routes request from the WordPress host. No client account access or additional API key was introduced.

### Verification

`npm run check` passed. The full unit suite passed **71/71** tests and Playwright passed **45/45** browser tests (116 total; no failures or skips). New coverage includes exact-origin CORS/preflight, provider-call budgets, verified binary download, tunnel URL/state/readiness, public build credential exclusion, an actual separate HTTP test backend with real CORS, and expired sessions. Deterministic provider fixtures remain separate from live Google verification.

Earlier browser-only Google authorization requirements in Section 12 are historical; the selected server-key approach does not require that change. The actual hosted public-browser result is recorded below.

The current cloud browser confirmed actual public Google suggestions, but its outbound proxy denies the temporary tunnel hostname (HTTP 403), so that browser run cannot establish live Routes success. The manual **Check live GitHub Pages** workflow runs a clean browser on a GitHub runner against the actual public URL, with real Google services and no SDK/route mocks. It verifies ordered stop routing, distance/time, every vehicle tariff, waiting once, phone layout, and synthetic-contact Review/thank-you totals; only screenshots and a sanitized report are retained.

**First actual public flow passed:** [Check live GitHub Pages run 39157431786](https://github.com/dev-najmul/car-pro-form/actions/runs/39157431786) completed successfully against the published site on 19 October 2026 (Asia/Dhaka). Real Places/Routes, Willis Tower → Millennium Park → O’Hare, 15-minute waiting added once, all six vehicle quotes, Luxury SUV $22.50 waiting, 20% gratuity, synthetic-contact Review/thank-you totals, and 390 px layout passed. The `live-pages-results` artifact contains desktop/phone screenshots and `report.json`; the cloud proxy also prevents downloading that artifact locally, so the workflow’s successful assertions establish this hosted live check.

The keepalive condition explicitly requires `success() && !cancelled()` so a cancelled/replaced test deployment stops its session. GitHub may take several minutes to finish cancelling an older runner before the new deployment starts.

**Latest published test session:** [Pages deployment run 39157637259](https://github.com/dev-najmul/car-pro-form/actions/runs/39157637259) publishes application commit `20a50ba` at the original Pages URL. Its public configuration reports `providerMode: remote`; this session expires **18 October 2026, 21:12:32 UTC / 19 October 2026, 03:12:32 Asia/Dhaka**. The Pages publish step completes before the intentional two-hour keepalive. Restart instructions above apply after expiry.

**Release safety:** the final source/configuration and decompressed pre-Maps backup scan passed for all 74 tracked/unignored release files, with no Google key values found. The private environment and generated `dist` remain ignored. No new dummy fare schedule or WordPress conversion was introduced.

**Latest-session live retest passed:** [Check live GitHub Pages run 39157735762](https://github.com/dev-najmul/car-pro-form/actions/runs/39157735762) completed successfully against the newly published session and final application commit `20a50ba`. Every live-check step and screenshot/report upload succeeded. This repeats the complete real-provider form/stop/pricing/phone/thank-you verification after the cancellation fix and final deployment.


## 14. Location accuracy investigation — version 1.2.1

### Report and verified cause

The owner compared a form result of 11.2 km / 37 minutes with a Google Maps result of 167 km / 3h29. The screenshots show different endpoints: the form selected **Notun Bazar Bus Stop, Dhaka → Sayedabad, Dhaka**; the Maps screenshot uses **Sayedabad, Dhaka → Nathullahbad Central Bus Terminal, Barishal**, also in the opposite direction. These are different journeys, not a kilometers/miles conversion error.

Actual Google calls on **19 October 2026, 01:23–01:25 Asia/Dhaka**, using the existing authorized keys and canonical Places IDs, reproduced the form result exactly for its displayed locations. Google also returns unrelated suggestions for some misspelled terminal searches; a Shah Amanat airport query returned a similarly named business first and the real airport second. A concrete UI defect was reproduced: pressing Enter with no highlighted prediction silently accepted the first result, allowing an unintended location to replace the typed query. This proves an unsafe selection path, but does not establish which key/click the owner used.

| Actual Google route | Distance | Baseline driving duration |
| --- | ---: | ---: |
| Notun Bazar, Dhaka → Sayedabad | 11.190 km | 36m48s |
| Nathullahbad, Barishal → Sayedabad | 166.685 km | 3h22m51s |
| Sayedabad → Nathullahbad | 166.655 km | 3h24m25s |
| Dhaka airport → Sayedabad | 20.149 km | 37m34s |
| Sayedabad → Shah Amanat airport, Chattogram | 251.797 km | 5h00m58s |
| Dhaka airport → Nathullahbad via Sayedabad | 186.804 km | 4h01m59s |

A separate current-traffic query for Sayedabad → Nathullahbad returned **167.072 km / 3h29m38s**, consistent with the owner's Maps screenshot. The application currently uses `TRAFFIC_UNAWARE`; pickup date/clock time is booking information and is not a traffic forecast. The direction, selected Places, traffic settings and time must match for a fair comparison. The ordered-stop route's leg distances and durations sum correctly; 15 minutes waiting adds 900 seconds once (4h16m59s total).

### Correction scope

- Require a deliberate click/tap or highlighted keyboard choice; Enter alone cannot accept an unrelated first prediction. Keep the list and provide an accessible selection hint. Fix initial ArrowUp selection as part of this keyboard handling.
- Remove the hardcoded US region from worldwide Places searches; no country restriction or fabricated local address list is introduced.
- Display the full selected canonical address outside the scrolling input, including its city/country, and provide an exact-Place-ID Google Maps link. Keep names/addresses transient; saved drafts still retain only IDs/user queries and fetch fresh details.
- Provide a comparison route link using the exact selected IDs, pickup→drop-off direction, and stop order. Long routes open in supported parts so Google Maps' mobile stop limits never silently omit a stop.
- Clearly label the estimate as excluding live traffic and the scheduled pickup time. Do not change tariffs, provider metrics, demo submission or the deferred WordPress scope to make a screenshot match.
- Add regression coverage for the accidental Enter selection, canonical-address visibility, exact-ID links, invalidation/restoration, and multiple real Bangladesh routes on the published site.

The Google Maps consumer website was blocked by the current cloud's outbound proxy; no network/TLS bypass was attempted. The seven direct Google Routes calls and real Places selections succeeded. Exact-ID comparison links allow the owner to open the same selected route in their browser. Final automated and published-site validation follows below when completed.

**Updated application tested with real Google data locally:** on 19 October 2026 at 01:33 Asia/Dhaka, Enter without a highlighted result preserved the typed terminal query and displayed the deliberate-selection hint. Clicking the real Nathullahbad terminal and Sayedabad predictions yielded their exact canonical IDs and **166,685 meters / 12,171 seconds**, displayed as **166.7 km / 103.6 mi / 3h23m**. The selected Barishal and Dhaka addresses remained fully visible, the exact-ID Maps comparison link used the same direction, and the 390 px phone layout had no horizontal overflow. This local Node check is separate from the successful published-site regression recorded below.

**Local release verification:** syntax checks passed; **79/79 unit tests + 52/52 browser tests = 131 passing automated checks**, no failures/skips. The new Enter regressions fail the original implementation and pass the correction. Tests cover canonical-address visibility/invalidation/restoration, text safety and 320/390 px layouts, exact-ID/directed/ordered Maps links, mobile waypoint/URL limits, and the existing complete booking/provider/pricing/error flows. The final 77 release files and decompressed pre-Maps ZIP passed credential and backup-integrity scanning.

The manual hosted live workflow now adds five Bangladesh cases: the intended intercity journey and reverse, the local Notun Bazar control, airport → terminal with a Sayedabad stop/15-minute wait, and Sayedabad → the correct Chattogram airport (not its similarly named business). Each uses real public Places/Routes, exact selected/requested IDs, provider-versus-display arithmetic, all six quotes, full readable addresses, Maps comparison links and phone layout. It also retains the existing Chicago full-booking/thank-you check. This hosted run must succeed after deployment before claiming the public correction verified.


### Published correction and final verification

- Application commit **`da28f40`**, version **1.2.1**, was published at **https://dev-najmul.github.io/car-pro-form/#trip** by [Pages deployment 39159523076](https://github.com/dev-najmul/car-pro-form/actions/runs/39159523076). The publish step succeeded; the remaining in-progress keepalive intentionally serves the temporary backend.
- [Actual public Google check 39159702388](https://github.com/dev-najmul/car-pro-form/actions/runs/39159702388) **passed both live steps**: the complete Chicago booking/thank-you flow and all **five Bangladesh route cases**. Every route used real Google suggestions/details and server Routes with no provider mocks; the selected IDs, sent IDs, canonical addresses, direction, ordered stops, provider/display conversions, waiting once, all six quotes and 390 px layout passed. The deliberate-Enter guard also passed with actual suggestions.
- The run's summary table records live Bangladesh distances/durations/waits; artifact `live-pages-results` includes `live-bangladesh/report.json`, ten desktop/phone route captures, and the original full-booking captures/report. Local artifact download remains blocked by the cloud proxy, so these are hosted assertions/artifacts rather than locally inspected hosted screenshots. The local real-Google phone capture was separately inspected and is readable without overflow.
- Public `maps-config.json` returns HTTP 200 and `providerMode: remote`. The new test backend expires **18 October 2026, 21:37:39 UTC / 19 October 2026, 03:37:39 Asia/Dhaka**. Run the deployment workflow again for a new two-hour window and refresh after publishing. Existing saved place IDs are retained; refreshing cannot infer a different intended city, so an old wrong selection should be replaced by deliberately choosing the correct terminal and checking its visible city/address.
- All code/docs are saved to the GitHub repository. Tariffs remain explicitly demonstrative; no fake replacement route, client credential change, traffic forecast, or WordPress plugin conversion was introduced.


## 15. Current-location accuracy correction — version 1.2.2

### Report and diagnosis

The owner confirmed testing on **PC/laptop**, physically about 10–15 minutes from Nathullahbad in Barishal. The button inserted **23.78910, 90.41260**, which is in Dhaka, and produced a much longer route than manually choosing the Barishal terminal. The screenshot also has a Patuakhali stop; its complete drop-off is not visible, so the exact full 294.3 km itinerary cannot be reconstructed from that screenshot alone.

The form sent the browser-supplied coordinates directly to Google. It did not swap latitude/longitude or convert distance incorrectly. The browser's source can be Wi-Fi/network/IP rather than GPS on a PC, so requesting location cannot guarantee a user's physical position. The implementation defect was trusting any returned position as a booking pickup: no high-accuracy request, no accuracy/freshness checks, no readable context, no confirmation, and raw coordinates restored across reloads. `maximumAge` defaults to zero in the browser API, so omitted caching options do not prove cached coordinates caused this case.

Actual provider checks found the existing browser key **cannot use Geocoder** (`REQUEST_DENIED`), but **Places (New) Nearby Search works**. No additional client key/account/API change is required. Nearby businesses are context only, not proof of an exact residence or entrance.

### Correction scope and safeguards

- Request fresh high-accuracy browser positioning with `enableHighAccuracy: true`, `maximumAge: 0`, and a 15-second device timeout plus bounded application watchdog.
- Validate finite/ranged coordinates, reported accuracy, and reading timestamp. For this prototype require **accuracy within 100 meters** and a reading no older than **60 seconds** before confirmation. These are documented device-quality thresholds, not new fare rules; even a precise browser estimate can still be wrong, so explicit verification applies to every reading.
- Preserve the current pickup/quote while locating. Show a separate candidate with coordinates, estimated accuracy, nearby name/address if available, and an exact-coordinate Google Maps link. Only **Use this pickup location** replaces the pickup and recalculates; a coarse/invalid/stale/denied reading cannot do so.
- Use Nearby Search within 50 meters only to say **Near [landmark/address]**. Always route and link the original browser latitude/longitude; never replace it with the nearby business's Place ID or claim the landmark is the exact pickup address. If lookup fails or finds nothing, say the address is unavailable and allow manual search/map verification without inventing a name.
- Cancel obsolete results after pickup edits/manual selection, navigation away/back, reset, cancel or a newer request. Derive the busy button from current state so rerendering cannot create duplicate live requests.
- Do not restore a saved raw/device-coordinate pickup as newly verified. Retain other booking fields and require fresh detection/confirmation or manual address selection after reload; normal selected Google Place IDs still restore normally.
- Show clear permission/timeout/coarse-reading guidance. On a PC with unreliable location, manually choosing the exact pickup address remains the dependable fallback. Software cannot manufacture GPS precision from a network-only reading.

Validation and public deployment results will follow after implementation and checks.

**Implementation detail:** rejected coarse readings do not trigger Nearby Search or routing. Precise candidates use nearby context only; all captions explicitly qualify the landmark. Device-coordinate pickup fields are excluded from newly saved drafts, and legacy saved coordinates are cleared on restore; other booking/contact data and normal Place-ID selections are retained. Existing Section 11 draft statements about retaining device coordinates are historical and superseded here.

**Local live-provider check:** on 19 October 2026 at 04:56 Asia/Dhaka, a controlled browser position `22.714, 90.35` with 20 m reported accuracy used real Google Nearby Search and returned readable context **Near UCB Bank ATM, BM College Rd, Barisal, Bangladesh**. The input stayed empty before confirmation. After explicit confirmation, real Google Routes received exactly those original coordinates and a selected Patuakhali destination, returning **44,800 meters / 4,317 seconds**. The nearby ATM was never substituted as a route Place ID. Desktop/390 px candidate screenshots were captured and the phone capture was visually inspected without overflow. This is an emulated device reading with real Google data, not proof of the owner’s physical laptop position or the full partly hidden screenshot itinerary.

**Automated verification:** syntax checks passed; the full Node suite passed **87/87 unit tests** and Playwright passed **62/62 browser tests** (**149 total**, no failures/skips). New cases cover accurate-but-unconfirmed positions, coarse Dhaka readings preserving a correct pickup, missing accuracy, invalid/stale coordinates, denied/timeout errors, late provider callbacks after manual selection/navigation, busy rerenders, retries/cancellation, expiry before confirmation, coordinate-preserving nearby labels, empty/failed nearby lookup, phone layout and fresh verification after reload. The existing complete booking, place selection, route/pricing and Pages/CORS regressions also pass. All 80 tracked/unignored release files and decompressed pre-Maps backup entries passed credential/ZIP integrity scanning.

A new hosted check uses **controlled device readings with real Google Nearby/Routes**: reject a 12 km-accuracy Dhaka estimate without altering a confirmed Barishal pickup; preview a 20 m-accuracy Barishal reading with actual nearby context; require confirmation; preserve original coordinates; compare route metrics and all six quotes; and clear device pickup on reload. Its artifact/report explicitly distinguishes emulated coordinates from the owner’s physical device, which cannot be measured remotely. The existing full-booking and five-route Bangladesh live checks remain in the same workflow.

The first hosted device-check run `39174697917` passed the complete booking and five Bangladesh routes, but its new check captured the pickup text before asynchronous Places details replaced the typed query with the canonical address. The failed comparison was in the check harness, not a different device coordinate: expected the short typed query, received the correct full Barishal address. The harness now waits for the selected-address card and matching input before capturing its original pickup; the public device check is rerun after that correction.


### Published device-location fix and final result

- Version **1.2.2** application and harness commit **`7856b13`** is published at **https://dev-najmul.github.io/car-pro-form/#trip** by [Pages deployment 39174836677](https://github.com/dev-najmul/car-pro-form/actions/runs/39174836677). The Pages publish step succeeded; its two-hour backend keepalive remains intentionally in progress.
- [Public live check 39174993308](https://github.com/dev-najmul/car-pro-form/actions/runs/39174993308) **completed successfully**. All three steps passed: complete booking/thank-you, five Bangladesh routes, and the new device-location quality/confirmation flow with real Google Nearby/Routes and controlled browser position readings. Coarse Dhaka input preserved the manual Barishal pickup; precise Barishal input showed nearby context, awaited confirmation, routed original coordinates, matched metrics/all six quotes, fit 390 px and required a fresh pickup after reload.
- Artifact `live-pages-results` contains `live-device-location/report.json` and coarse-rejection/preview/confirmation screenshots, alongside the existing booking/Bangladesh artifacts. The report identifies the geolocation override as controlled test data. This does **not** establish the owner’s actual laptop position; native browser/OS accuracy still needs their manual check.
- Public configuration returned HTTP 200 with `providerMode: remote`. This new session expires **19 October 2026, 01:04:23 UTC / 07:04:23 Asia/Dhaka**. Run **Actions → Deploy GitHub Pages → Run workflow** for another two-hour window, then refresh after publishing. A Markdown-only result commit preserves this active session.
- The existing two keys were reused; no client account/settings change, fake GPS/address, tariff change, booking submission or WordPress conversion was added. On a PC that only provides a weak/network-based estimate, selecting the exact pickup from address suggestions is the reliable fallback.

## 16. PC location fallback — version 1.2.3

The owner's PC reports a Dhaka position with **100 km accuracy** while they are near Barishal. Rejecting that reading prevents an incorrect booking, but the previous panel leaves an unhelpful dead end. Keep the quality checks and add an embedded Google map picker using the existing Maps JavaScript and Places APIs; no new client credentials or Geocoding API is required.

- Offer **Choose pickup on map** directly and from the location-error/coarse-reading panel. Search the correct city/address using Google suggestions, then click or move the map pin to the intended pickup.
- An initial map center, especially an approximate PC estimate, is not a selected pickup. Require a deliberate search choice, click or map movement and a separate **Use this map point** confirmation. Preserve the original pickup and quote until confirmation.
- Mark the result as a manually selected map point, route its exact chosen coordinates, and provide a Google Maps verification link. Nearby names remain qualified context, never an invented exact street address or replacement Place ID.
- Cancel stale GPS, search, map and nearby callbacks after cancellation, pickup changes, navigation or rerender. Keep keyboard search and phone layout usable; retain the manual address input if the map cannot load.
- Coordinate pickups (device or map) remain transient and must be reselected after a page reload. Tariffs, live-traffic policy, static submission and deferred WordPress conversion remain as documented.

Implementation, regression and actual provider/public deployment evidence will be recorded below.

**Local actual-provider result (19 October, 05:35 Asia/Dhaka):** a controlled PC reading with 100 km reported accuracy remained unaccepted. The embedded real Google map loaded, real Places search selected Nathullahbad Central Bus Terminal, and explicit map-point confirmation routed exactly `22.7145092, 90.3485913` to the chosen Patuakhali destination. Google Routes returned **46,907 m / 4,769 s**. The readable nearby context was qualified **Map pin near Jayan Traders, BM College Rd, Barisal**; it did not replace the original chosen coordinates. Desktop and 390 px screenshots were captured, the actual map/attribution and phone layout were visually inspected, and no page errors or horizontal overflow were observed. Controlled PC input is test data, not access to the owner's real hardware location.

A second actual-provider check clicked the embedded map after searching the terminal. The pin moved to `22.7143347703551, 90.34884879206543`; the Routes request preserved those exact doubles and returned **46,956 m / 4,788 s** to Patuakhali. Google Nearby supplied qualified Bengali landmark context. The two results differ because the deliberately chosen entrance/point differs; no metric was changed in the client.

**Regression checks:** syntax checks and **87/87 unit checks** passed. The broad Playwright run passed **68/68** browser cases. After adding the remaining map-load/cancellation case and refining map-pan/search invalidation, the focused device/map suite passed **17/17** cases, bringing unique browser coverage to **69 cases / 156 unit+browser checks** with no skips or unresolved failures. Tests include 100 km estimates, initial-center rejection, keyboard search, search edits clearing the pending pin, clicks/drags, exact-coordinate routing, late GPS/Nearby/SDK responses, rerenders/cancellation, map failure with manual-address recovery, phone fit and reload behavior. All 81 tracked/unignored files and decompressed backup ZIP contents passed credential scanning; the ZIP passed integrity checking. The private Routes key remains excluded from public output.

### Published map fallback and final live verification

- Application **1.2.3**, commit **`1091d70`**, is published by [Pages deployment 39177441266](https://github.com/dev-najmul/car-pro-form/actions/runs/39177441266). The public `app.js`, `maps.js` and `pickup-map.js` returned HTTP 200 and matched the local committed bytes. The Pages publish step succeeded; the backend keepalive remains intentionally in progress.
- [Public live check 39177593567](https://github.com/dev-najmul/car-pro-form/actions/runs/39177593567) **completed successfully**. All three actual-provider steps passed: complete booking/thank-you; five Bangladesh routes with ordered stops, waits and six vehicle prices; and device-location plus manual-map correction with real Google Maps/Places/Nearby/Routes.
- The updated check rejected a coarse Dhaka reading, loaded the real embedded map, searched Nathullahbad, clicked a different map point, preserved the old pickup until confirmation, and verified that Routes received **exactly the selected coordinates**. It checked actual distance/time display, phone fit, native precise-location confirmation, all six prices and safe reload behavior. Controlled device readings are identified as test data; this cannot verify the owner's actual laptop GPS.
- Artifact `live-pages-results` includes `live-device-location/manual-map-picker-phone.png`, `manual-map-route-phone.png`, sanitized `report.json`, and the existing booking/Bangladesh/device screenshots. Local screenshots additionally show the rendered Google map and pin on desktop/390 px.
- Public config is HTTP 200, `providerMode: remote`. This session expires **19 October 2026, 01:41:05 UTC / 07:41:05 Asia/Dhaka**. To start another two-hour window, run **Actions → Deploy GitHub Pages → Run workflow**, then refresh after publishing. This Markdown-only result commit preserves the current live server.
- Manual check: refresh **https://dev-najmul.github.io/car-pro-form/#trip** with **Ctrl+Shift+R**. If the PC estimate is inaccurate, choose **Choose pickup on map**, search the correct city/address, adjust the center pin and click **Use this map point**. Then check the selected pickup, drop-off, stops and quote. The existing two keys were reused; no client account/settings change was needed.

## 17. WordPress plugin conversion — version 2.0.0

### Approved goal and implementation plan (19 October 2026)

Convert the existing five-step form and thank-you design into a reusable WordPress plugin with one **Tuxano Booking** main menu. Submenus: dashboard, submissions, vehicles, collections/categories, pricing and settings. Preserve the static prototype as a separate supported mode; WordPress becomes a real server-backed booking request workflow, with no temporary GitHub route server dependency.

1. Build a namespaced PHP plugin (WordPress 6.6+, PHP 8.1+) and a reproducible installable ZIP. Activation creates a private submissions table and seeds the six existing vehicle examples/categories once. Existing seed tariffs remain starting values; admin can replace every fare component and extra. No payment processing or automatic reservation confirmation is added.
2. Admin can add/edit/trash vehicles, manage categories, models/features/images, passenger/bag capacities and transfer/hourly/waiting tariffs. Global pricing controls meet-and-greet, first/additional child/booster seats, default gratuity and currency. Settings manage browser/server Maps keys, business/contact/policy links, stops/hour limits, notification email/toggles and retention. Keys are write-only, blank preserves, explicit clear removes; server key never enters frontend assets or REST responses.
3. Reuse the original design and Maps/location safeguards. `[tuxano_booking]` embeds an accessible same-origin isolated form; a dedicated standalone document prevents theme CSS from altering the reference design. Fleet/category/pricing/branding become admin data. Real PHP Google Routes requests provide quote tokens; the server validates booking fields and selected points, and recomputes prices using stored tariffs and measured route metrics. Client totals are never authoritative.
4. Persist submissions before success. Generate server reservation references, use idempotency keys against duplicate clicks/retries, show thank-you only after durable save. Admin sees totals, searchable/filterable/paginated submissions, full details, status, private notes and notification outcomes. Customer thank-you and configurable admin notification use a simple HTML template for now; detailed template design remains deferred as requested. `wp_mail` acceptance and actual inbox delivery are distinct; failed notifications remain visible/retryable without losing bookings.
5. Validate admin capabilities/nonces, sanitize input, escape output, bound Google request costs/timeouts/body sizes, apply public-session/origin/rate controls and honeypot, and expose no anonymous booking-reading endpoint. Preserve booking data on deactivation; explicit uninstall data removal is opt-in. Use WordPress privacy export/erase hooks and configurable retention where appropriate.
6. Test in isolated WordPress/MariaDB with meaningful happy-path and adversarial cases: route/pricing authority, malformed requests, changed tariffs, replay/idempotency, capacity/date/email/consent, admin CRUD/filter/pagination/nonce checks, notification capture/retry, frontend/mobile/full booking and ZIP contents. PHP lint and shared static regressions must pass. Then install/update only the supplied dedicated test site and create a separate booking test page, preserving its existing content/plugins/home page.

Detailed internal contracts and file ownership: [wordpress/ARCHITECTURE.md](wordpress/ARCHITECTURE.md). Initial live-site request is blocked by this cloud's outbound network policy (HTTP proxy 403 before login); the required site/WordPress domains have been added to the environment configuration draft for user application. This is distinct from invalid WordPress credentials. Latest user-provided credentials supersede earlier ones and will never be committed or logged.

Validation, deployment, download location and any remaining external prerequisites will be recorded below when actually verified. “Production level” guides implementation and review; no assertion of absolute vulnerability-free certification or verified email delivery is made without evidence.

### Implemented plugin and verified local result

- Plugin source is `wordpress/tuxano-booking`; installable package is `releases/tuxano-booking-2.0.0.zip` with adjacent SHA-256. `npm run build:wordpress` builds the package reproducibly from shared frontend/assets, checks for private files/keys, normalizes runtime permissions and verifies ZIP integrity. Public modules/assets live under a versioned directory so a plugin update cannot silently reuse stale module imports. No credentials, local test transport, Node backend, test fixture or environment file is packaged.
- Main menu order was verified in an actual browser: **Dashboard → Submissions → Vehicles → Collections → Pricing → Settings**. Native fleet editing includes media-library photo selection, models/features, categories, capacities and all six tariff components. API budgets and visitor/network limits are editable. API inputs are write-only and preserve/clear explicitly.
- Shortcode `[tuxano_booking]` uses same-origin iframe isolation with origin/window/id validation for resize messages. It fitted a phone inside the default theme without horizontal overflow or resize loops. The optional **Tuxano Booking — full page** template renders the original complete design without theme chrome; standalone query URLs remain available. Starting a new request preserves WordPress query/permalink parameters. Pickup times explicitly use the WordPress site timezone.
- PHP owns Google Routes calls, quote/session binding, field validation, tariff/extra/gratuity calculation, unique booking references, durable idempotency and immutable route/pricing/vehicle snapshots. A fleet selection or tariff change invalidates outstanding quotes. After success, unchanged Back/resubmit returns the existing receipt; editing requests a new quote. WordPress drafts/receipts are not restored from browser storage.
- Customer/admin HTML notifications are recorded independently as pending, sending, accepted, failed or disabled. Database persistence precedes mail. Atomic send leases prevent simultaneous retries; an explicit admin retry can recover a sender stalled over ten minutes, with an accurate uncertain-delivery/duplicate caveat. Status edits do not automatically send mail. Custom email template design remains deferred.
- Deactivation retains records. Explicit uninstall purging registers the owned data types before deletion, so inactive-plugin taxonomy cleanup works. Purging is opt-in via `TUXANO_BOOKING_REMOVE_DATA`; media are retained. Privacy export/erase operates on the booking contact email, and optional retention uses bounded best-effort WP-Cron cleanup. Network-wide activation is rejected; activate per site.

**Local environment:** isolated WordPress **7.1.3**, PHP **8.3.35**, MariaDB **11.4.13**. Local-only mail interception and managed-proxy/CA configuration remain outside the distributable. An HTTP test found that the initial bind-mounted build inherited private source permissions; the builder now sets generated directories to 0755 and files to 0644. Native WordPress ZIP extraction and plugin metadata recognition subsequently passed.

**Actual Google + WordPress HTTP flow (19 October 2026, Asia/Dhaka):** the browser searched/selects Nathullahbad Central Bus Terminal and Sayedabad, Dhaka using real Places data. PHP Routes returned **166,685 m / 12,171 s** directly. Adding Bhanga as an ordered stop produced **166,796 m / 12,245 s**, plus exactly **15 minutes** stop waiting. All six displayed vehicle quotes matched independent shared-formula calculations. Selecting Luxury SUV and completing the five steps saved a real database row and server reference `TUX-2026-44F9658E11B8`, then showed the mobile thank-you summary. Example tariffs gave transportation **USD 1,020.68**, waiting component **USD 22.50**, gratuity **USD 204.14**, total **USD 1,224.82**. These are the seeded prototype tariffs, not newly supplied real business prices.

The browser reported no page errors or phone overflow. The row retained the exact server total and separate customer/admin mail acceptance states. Exactly **two** messages were captured, one for the synthetic customer and one for the synthetic admin, with the same server reference. This verifies template generation and transport invocation, **not external SMTP/inbox delivery**. Real delivery must be checked with the installed site's mail transport.

The first real PHP route attempt exposed this cloud's proxy-only DNS: WordPress's safe-URL precheck could not resolve Google locally even though the managed HTTPS proxy could. The plugin now uses WordPress's normal HTTP API for the **fixed literal Google HTTPS endpoint**, with TLS verification enabled, no redirects, timeout/response bounds and no visitor-controlled URL. Actual provider requests then passed. No TLS checks or cloud network controls were disabled.

**Deterministic verification:** syntax + **87 Node unit checks** passed; **77 distinct browser cases** were verified across the broad suite and focused regressions (the sole broad-run failure was an old exact error-copy assertion, corrected and rerun successfully). **78 WordPress settings/fleet/pricing assertions** and **107 real WordPress REST/database/notification assertions** passed: **349 distinct automated checks** in those groups. Additional native admin screens/nonce/capability checks, a 26-row pagination fixture (20+6), reference search, pickup-date/status filters, private-note/status saving, exact-ID Google links, shortcode message-source guards, phone auto-height and ZIP extraction were verified. Temporary pagination/PHP fixtures were removed; the synthetic actual-provider booking remains available for local review.

**Hosted verification completed:** [Verify WordPress plugin, run 39226586541](https://github.com/dev-najmul/car-pro-form/actions/runs/39226586541) passed on commit `35dd4f6f03df98155fe0793d5af44a264e817bc0` at **19 October 2026, 15:03 Asia/Dhaka**. Both **WordPress 6.6/PHP 8.1** and **current WordPress/PHP 8.3** verified official core checksums, installed/activated the actual generated ZIP, linted the PHP and passed the **87 Node + 78 data/settings/fleet/pricing + 107 REST/database/notification** checks. The PHP 8.3 job also passed **all 77 browser cases in one complete run**. Together these cover the same **349 distinct automated checks**, with compatibility checks repeated on the minimum supported versions. The initial current-core setup failed its checksum check because WP-CLI's archive extraction truncated long core filenames; system ZIP extraction corrected that setup failure, preserving checksum/TLS verification.

**Release verification:** an independent read-only check reconstructed the package from current source and shared assets and matched it byte-for-byte. All **43 ZIP entries** have the expected single plugin root, normal runtime permissions and no private files, unsafe paths or Google-key-like strings. SHA-256: `12724ab11ffd24ee5e796fc2c8b6accd8f09156af15d4619f4388b3cba72782c`. Source and release were pushed to the requested GitHub repository. Installation instructions are in [wordpress/README.md](wordpress/README.md); the ZIP is [releases/tuxano-booking-2.0.0.zip](releases/tuxano-booking-2.0.0.zip).

**Reusable cloud setup:** saved the complete install script (Node dependency/check/unit/build commands) and startup instructions for the local Docker WordPress environment, readiness requests, PHP fixtures, trusted proxy/browser setup and retained static workflow. Existing network/credential requirements were preserved. Saving this draft does not apply or publish it; fresh-task Docker volume restoration remains unverified. Review/save the changes in environment settings and publish the environment when applying the saved network/setup configuration.

**Live test-site status on 19 October:** this cloud's outbound policy blocked `bdreadyweb.com` before login (proxy HTTP 403). The domain was saved in the environment network draft. The owner explicitly replied **“আগে plugin ও local tests শেষ করুন”**; local development/testing therefore proceeded, and no content/plugins/settings were changed on that site. Latest supplied credentials supersede earlier ones and were never committed or logged. At that point live-site installation and real mailbox delivery remained pending site access. WordPress mode does not depend on the expired two-hour GitHub Routes preview.

### Direct ZIP delivery — 21 October 2026, Asia/Dhaka

The owner reported failed browser downloads and then a separate chat artifact-preview error, **“Could not download artifact.”** Local absolute/sandbox links did not provide a working download. Rebuilding the release preserved the same source and SHA-256; this does not diagnose or remove the earlier antivirus alert. Static inspection found no concrete malicious-code indicators, but no malware scanner was available and no virus-free certification is claimed.

The previously blocked test site became reachable (HTTP 200). Using the owner's existing authorized WordPress access, uploaded only the already-public plugin ZIP to its Media Library (attachment ID **7**) to provide a GitHub-free download: **https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.0.0.zip**. An unauthenticated HTTPS download and HEAD check returned HTTP 200, `application/zip`, **11,447,727 bytes**, and the exact release SHA-256 `12724ab11ffd24ee5e796fc2c8b6accd8f09156af15d4619f4388b3cba72782c`. The login password was entered privately without saving or printing it. This delivery step did not install/activate the plugin or perform live booking/mail tests; those deployment checks remain outstanding, while site access itself is now verified.

## 18. PHP 7.4 compatibility and live-site installation — 21 October 2026

The owner's native WordPress installer reported **PHP 7.4.33**, while version 2.0.0 declared PHP 8.1. The failure was the runtime requirement, not archive corruption. The owner explicitly authorized uploading, installing and testing the plugin on the supplied test site.

**Plan:** support this site's existing PHP runtime in **version 2.0.1** by replacing actual PHP 8 syntax/APIs, run authoritative pricing/REST/database/notification regressions on PHP 7.4.33 and PHP 8.3, add PHP 7.4 to hosted compatibility CI, then install/activate through WordPress's native installer. Preserve existing site pages, homepage, plugins and hosting PHP settings; create a separate booking test page. Configure the already-supplied Google keys through the plugin admin and verify the live form, administrative records, responsive design and notification outcomes. Record actual outcomes separately from planned checks.

**Compatibility changes:** union and `mixed` declarations moved to PHPDoc; PHP 8 string helpers replaced with strict `strpos` comparisons; strict list validation replaces PHP 8.1 `array_is_list` without relaxing sparse/reordered-stop rejection. No route, fare, validation, capability or nonce checks were removed. Minimum WordPress remains 6.6; PHP minimum is now 7.4. The release version and complete frontend asset directory advance to 2.0.1.

**Verified before live installation:** actual **PHP 7.4.33** lint passed for all ten plugin PHP files and both PHP fixture files. WordPress loaded successfully, **80 settings/fleet/pricing** and **114 REST/database/notification** assertions passed, then both suites passed again on PHP 8.3.35. Added meaningful sparse/reordered/empty-stop regressions. Node syntax checks, **87 Node unit tests** and **eight WordPress browser cases** passed. Fixtures restored local settings and records, with no external mail/provider requests. Hosted CI now covers WordPress 6.6/PHP 7.4, WordPress 6.6/PHP 8.1 and current WordPress/PHP 8.3; its outcome will be recorded after it runs.

### Actual installation and live verification completed

- **Hosted CI:** [Verify WordPress plugin run 39530324258](https://github.com/dev-najmul/car-pro-form/actions/runs/39530324258) passed on application commit `080673b58c163651cc943634b434bccf811112fa`. All three compatibility targets installed/activated the actual ZIP and passed core checksums, PHP lint, 87 Node tests and 80+114 PHP assertions. The PHP 8.3 target also passed all **77 browser cases**: **358 distinct automated checks** overall, with repeated compatibility runs counted once.
- **Native live update:** the site already contained an inactive 2.0.0 plugin directory. Used WordPress's native **Replace current with uploaded** workflow to update to **2.0.1**, then activated it successfully on the site's existing **PHP 7.4.33 / WordPress 7.1.3**. Hosting PHP was not changed. All six admin screens returned successfully without JavaScript errors. Existing plugins and the two existing pages were retained; a subsequent comparison confirmed their contents, templates and status were unchanged.
- **Live setup:** saved the previously supplied browser/Routes keys through the plugin's nonce-protected Settings form, preserving the other current settings/prices. Saved key fields returned empty and indicated Configured. Created page **33**, **Reservation Request — Plugin Test**, using the full-page template and shortcode: **https://bdreadyweb.com/carbook/tuxano-booking-test/**. No homepage change was made.
- **Real anonymous browser flow:** Google Places selection and WordPress-hosted PHP Routes returned **166,685 m / 12,370 s** for Nathullahbad Central Bus Terminal → Sayedabad, Dhaka. Adding Bhanga as an ordered stop returned **166,796 m / 12,443 s**, plus exactly **15 minutes** waiting. All six displayed vehicle fares matched independent shared-formula calculations. Baseline estimates exclude traffic/date forecasting; measured minutes may differ from earlier Google responses.
- **Durable submission:** the five steps saved booking **1**, reference **`TUX-2026-7415C2F6F9E5`**, with Luxury SUV transportation **USD 1,030.58**, including **USD 22.50** waiting, and gratuity **USD 206.12**, total **USD 1,236.70** under the existing example tariffs. Thank-you showed only after the successful server receipt. A 390px phone had no horizontal overflow or browser errors; reset preserved the WordPress permalink and cleared the contact workflow.
- **Admin readback:** reference search returned exactly that record and server total. All three pickup/drop-off/stop Google links retained exact Place IDs. Status and private notes saved and persisted; reference/status filters returned the expected row. The synthetic record is labelled **Plugin QA / TEST PLEASE IGNORE**, with a private note marking it as a test, and remains **Reviewing** for the owner to inspect.
- **Notifications:** both customer and admin statuses were **Accepted by mail transport** on the actual site. Customer data used an intentionally synthetic `example.invalid` address. This establishes WordPress transport acceptance, not external mailbox delivery; real customer inbox delivery requires the owner's manual test with their address. No additional automatic retry was sent.
- **Current ZIP delivery:** Media Library attachment **34** provides **https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.0.1-1.zip**. An unauthenticated HTTPS download matched release SHA-256 **`4c18d748cb085f483ef79ae192da6c98921a8a3f84df6a3f8a2f8a9a9820c422`**, **11,448,010 bytes**. The 2.0.0 ZIP remains historical; install/use 2.0.1 for PHP 7.4.

Screenshots and machine-readable live reports are retained in ignored `wordpress-test-results/live-201/`. Private cookie state and automation helpers remain outside the repository; no passwords, API keys, cookies, database dump or local transport plugins entered the release. Reusable startup instructions now include the actual PHP 7.4 test command and current live-site status. Saved environment instructions remain a draft until reviewed/saved/published; no fresh-environment restoration claim is made.

## 19. Full frontend/admin upgrade — 22 October 2026

Read both newly attached DOCX files completely and inspected the three supplied screenshots before making changes. Confirmed all **eight main points in 2.docx** plus **five groups in 1.docx**, thirteen groups in total. The owner authorizes all modifications, testing and direct update/testing on the existing dedicated test site, then asks to review the final result personally.

The complete itemized scope, technical decisions, security/data preservation boundaries and verification plan are recorded in [wordpress/UPGRADE-2.1.md](wordpress/UPGRADE-2.1.md). Target release: **2.1.0**, preserving existing bookings, settings, fleet prices and PHP 7.4 compatibility. Implementation and results will be checked off only after verified.


### 2.1.0 implementation and verified delivery — 23 October 2026, Asia/Dhaka

All thirteen document groups are implemented. The hotel background is removed; steps 2–5 use a 1200px desktop maximum, compact responsive typography, accessible red inline field errors, all 249 ISO countries and text State/Province. Region/postal code are optional internationally. Step navigation resets scrolling in full-page and securely validated iframe contexts. Travel time appears only for route loading/results/errors; initial policy links and Google attribution remain available.

The premium administrator workspace includes per-page pagination/search/filters, explicit View/Edit, the complete trip/contact/extras editor, optional customer update, confirmed selected-row deletion, revision checks and private history. Contact-only edits retain accepted fares and vehicle snapshots; route changes call Google again, priced changes use current validated tariffs, and stale writes are rejected. The original visitor receipt stays immutable after admin edits. Collections retains its expanded parent menu. Vehicle rate cards explain each unit/formula, support explicit None/zero, and show a sample fare. API keys show masked configured state with deliberate Replace/Remove/Undo and separate actual authorization checks. The private Routes key is never returned. Customer/admin/update emails use the Tuxano wordmark, navy/gold styling, responsive tables, plain-text alternatives and an itemized estimate. Author metadata is **Farhan**, **https://farhanrajnajmul.com/**.

**Local verification:** 97 Node assertions; 91 complete frontend browser cases plus three new isolated admin API cases; 80 settings/fleet/pricing, 114 REST/persistence/notification and 158 upgrade/security assertions passed on actual PHP 7.4.33 and PHP 8.3.35. Upgrade checks cover unauthorized/CSRF/stale edits, historical values, server rerouting/repricing, changed/removed fleet snapshots, idempotent original receipts, concurrent mail leases, malformed IDs/fields/countries and no-charge tariffs. Native admin browser checks passed pagination, full editor, contact edit and optional notification, route edit, bulk deletion, Collections expansion and None-rate persistence, with synthetic fixtures cleaned. All six customer/admin/update email layouts passed at 1280px and 390px with a decoded logo and no overflow. Source/release review found no concrete blocker; this is not an absolute security certification.

**Hosted compatibility:** application commit `60d8c527190305d65cc9ebf598f3a59b87f88053` passed [run 39877383639](https://github.com/dev-najmul/car-pro-form/actions/runs/39877383639): WordPress 6.6 with PHP 7.4/8.1 and current WordPress with PHP 8.3/8.5 installed/activated the actual ZIP and passed 97 Node plus 80+114+158 PHP checks; PHP 8.3 passed all **94 browser cases**. This gives **543 distinct automated checks**, counting compatibility repetitions once. Log inspection found the runner lacked `rg`, so its old lint pipeline had silently parsed empty stdin. Commit `4f984de6883be3065221ff1307d50ac938e89a4f` fixes lint using portable `find`, null-separated paths and Bash `pipefail`. [Follow-up run 39878052935](https://github.com/dev-najmul/car-pro-form/actions/runs/39878052935) **passed all four targets**. Its aggregate logs confirm **12 unique real plugin PHP files linted on each PHP version**, all 97+80+114+158 checks, and all **94 browser cases** (4.9 minutes) passed. All four rebuilt ZIPs matched the released SHA-256. The longer run was a 7-minute dependency download; no plugin/test failure was found.

**Native live update:** replaced the active plugin through WordPress's own upload/replace workflow, then verified active **2.1.0** on the site's existing **PHP 7.4.33 / WordPress 7.1.3**. The three pre-existing pages retained identical contents, status, slug and template; the homepage was not changed. A fresh comparison confirmed all six current vehicle configurations, all global price controls and existing settings were preserved. The two existing bookings remained visible after upgrade and were not used for edit/deletion tests.

**Actual anonymous Google/booking test:** on [the existing booking test page](https://bdreadyweb.com/carbook/tuxano-booking-test/), Travel time was initially hidden and the photograph background absent. Selected Nathullahbad Central Bus Terminal, selected Sayedabad through the drop-off map search, and selected Bhanga through the stop map search; actual address choices committed to the correct fields. All three provider Place identities returned country **BD**. Direct Google Routes measured **166,685 m / 12,370 s**; the ordered stop route measured **166,796 m / 12,443 s**. Selecting 15 minutes added exactly **900 seconds** and the applicable waiting tariff once. All six displayed vehicle prices matched independent calculations using the site's runtime tariffs. Each desktop step 2–5 measured **1200px**. Red inline email validation, all 249 non-placeholder countries, optional Bangladesh region/postal code, phone overflow and reset behavior passed without page errors. A separate read-only visual run waited for all six live fleet images to decode (331×223 each) and confirmed 1366px laptop/390px phone layouts without overflow; no extra booking was submitted.

The single clearly labelled release QA submission saved booking **3**, reference **`TUX-2026-A92175B66B76`**, then showed the responsive thank-you receipt. Existing example rates produced Luxury SUV transportation **USD 1,030.58**, including **USD 22.50** waiting, gratuity **USD 206.12**, total **USD 1,236.70**. The synthetic customer uses `example.invalid`; no real reservation was made.

**Live administrator readback/update:** reference search, View/Edit and per-page controls worked. Corrected only the new QA booking's company, status and private test note; explicitly requested one customer update. The accepted fare remained **USD 1,236.70**, company/status persisted, and private revision/history advanced to **2**. Initial customer receipt, administrator notification and the chosen customer update each reported **Accepted by mail transport**. This proves transport acceptance rather than delivery into external inboxes; the owner must test their real mailbox. Collections kept its parent expanded. Both saved Maps/Places browser and private Routes keys passed real provider authorization tests. A malformed replacement was rejected without saving; original settings remained configured.

**Current release/download:** [tuxano-booking-2.1.0.zip](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.1.0.zip), Media Library attachment **36**, **11,488,707 bytes**. An unauthenticated HTTPS download returned HTTP 200/application-zip and exact SHA-256 **`42171f0a7df3ce2474d5ff7dae0e681a12b12981df9cc646f92a7c6b7513a8af`**. ZIP integrity and byte parity for every plugin source/shared module passed (47 packaged files). Version 2.0.1 remains available for rollback. Private helpers, credentials, cookies, keys, mail-capture plugins and fixtures were excluded.

**Boundaries retained:** Google duration is a labelled baseline excluding live/pickup-date traffic. Browser country components restrict suggestions and reject known conflicts; server validation checks shape/ISO consistency but does not independently authenticate geographic country hints, and unknown coordinates are not guessed. No extra client API/account was requested. The seeded tariffs still require replacement/approval for real business quoting. Actual inbox delivery and the owner's final manual acceptance remain the final delivery checks. Detailed machine-readable reports/screenshots are in ignored `wordpress-test-results/live-210/`, `admin-210/` and `email-210/`.

**Handoff:** source and release are saved on GitHub `main`, 2.1.0 is active on the supplied site, and all thirteen checklist groups are complete. Reusable cloud startup instructions were saved as a configuration draft while preserving the existing install script, network policy, secret bindings and repositories. A draft still needs environment Publish before it becomes future-session configuration; no fresh-machine restoration claim is made. The owner can now perform final manual review using the live form/dashboard/download links above.


## 20. Final design refinements — 23 October 2026

The owner requested seven further changes and authorized implementation, testing and direct live plugin update, followed by another manual review. Target **2.1.1**, retaining the complete 2.1.0 ZIP as rollback and preserving existing bookings, tariffs, keys and content.

1. Make the main form document/background transparent so the page/Elementor background can show. Verify the same-origin shortcode frame and full-page integration rather than changing only one CSS declaration.
2. Remove the decorative T monogram and “TUXANO · BOOKING WORKSPACE” line from every booking admin screen.
3. Increase undersized administrator text to standard readable sizing and refine the existing design's typography, hierarchy, spacing and controls.
4. Dashboard Recent submissions defaults to the newest **three**. Add a bounded private Settings control (1–20) to increase/decrease this count; retain full-list pagination and current saved settings.
5. Give native Vehicles and Collections list/edit screens the same coherent booking administration design/navigation while retaining WordPress CRUD, notices, media, capabilities and nonces. Scope styling to the plugin's screens.
6. In Choose on map, selecting a search suggestion previews its real location on the live map and keeps the map open for inspecting nearby streets/places. Confirm an exact Place ID deliberately, or refine the pin and explicitly confirm its actual coordinates. Keep ordinary address autocomplete direct; never auto-accept the first prediction or fabricate a GPS position. Preserve country and late-response guards; ensure suggestions do not obscure the whole map.
7. Restore the thank-you page's original desktop/phone reference design (`thank you.png`, `thank you phone.png`), including the supplied photographic hero, original white content and appropriate layout/typography. Keep actual receipt/contact/route/pricing data dynamic. This supersedes the 2.1 plain/compact thank-you styling.

Implementation order is tracked by these numbered points. Check the affected UI, settings validation, map preview/confirmation and races, responsive layouts and actual Google route/submission behavior; build/install the actual 2.1.1 ZIP on the supplied site and record concrete results before handing back for owner review.

### 2.1.1 verification and live update

All seven requested changes are complete. Main form html/body/iframe paint transparent; the unchanged full-page template now uses a WordPress host plus isolated iframe, with `wp_head`, body classes, body/footer hooks and guarded Elementor page CSS. This allows parent page backgrounds and keeps theme CSS from changing form controls. Local actual WordPress HTTP tests confirmed a visible parent background, a hostile 40px/red parent style remaining outside the 15px child, iframe resizing, no overflow and exactly one document title. No page content/template was replaced.

Thank-you restores the supplied original photographic hero and white receipt/typography. Reference measurements passed: **478px at 1440px desktop**, **352px at 390px phone**. Actual receipt/contact/fare/stop fields remain dynamic. The main steps retain 1200px max width, validation and current navigation guards.

All booking administrator pages remove the monogram/workspace line and use readable **15px** main/navigation text, **14px** tables with auxiliary descriptions. Native Vehicles/Collections list/edit screens use the same shell/navigation and scoped design, preserving WordPress CRUD/media/notices/nonces/capabilities. Twelve desktop/phone native layouts and an unrelated Posts-screen isolation check passed locally. The private `dashboard_recent_limit` defaults to **3**, accepts integers **1–20**, and remains outside public configuration/fare revisions. Fourteen new settings assertions passed, including old-install fallback, invalid rejection, partial preservation and quote/public boundaries.

Map address/POI choices now **preview** their actual location at street-level zoom, keeping the picker open. The main field stays unchanged until explicit confirmation. Moving the pin replaces the Place ID with the actual chosen coordinates. A bounded in-flow prediction list keeps the map visible. Readiness/cancellation generations cover first SDK loading and stale searches; main autocomplete remains direct, no first result is silently chosen, and no GPS coordinates are invented/snapped.

**Local checks:** **97 Node**, **100 complete browser cases** (4.1 minutes), **94 settings/fleet/pricing** assertions on actual PHP **7.4.33** and **8.3.35**, and all **12 plugin PHP files** individually linted on PHP 7.4.33. Targeted map regressions, all ten frontend cases and the native layouts passed before the full suite. [Hosted run 39961483079](https://github.com/dev-najmul/car-pro-form/actions/runs/39961483079) for application commit `00a0632d611360dd2b26bff915b12290bf09a034` **passed all four PHP targets** (7.4/8.1 on WordPress 6.6, 8.3/8.5 on current WordPress). Every target genuinely linted 12 unique real PHP files and passed 97 Node plus 94+114+158 PHP assertions; PHP 8.3 passed all **100 browser cases** (4.7 minutes). All four generated ZIPs matched the released hash. **563 distinct automated checks passed**, counting compatibility repetitions once. The release artifact was published successfully.

**Live native update:** uploaded/replaced/activated the actual **2.1.1** ZIP on the existing **PHP 7.4.33 / WordPress 7.1.3** site. The three pages retained identical content, status, slug and template. All six saved vehicle configurations and global pricing matched the fresh pre-upgrade snapshot. The owner-added records were retained and not edited/deleted for these checks.

**Actual Google live flow:** all three map searches—Nathullahbad pickup, Sayedabad drop-off, Bhanga stop—showed the selected real address/coordinates on the live map, stayed open for inspection and left the main field unchanged until confirmation. All provider country components were BD. Google measured **166,685 m / 12,370 s** directly and **166,796 m / 12,443 s** via Bhanga, plus exactly **15 minutes waiting**. All six vehicle prices matched independent runtime calculations. Transparent iframe backgrounds and an ephemeral parent gradient were verified without saving any background or post data. Each step 2–5 remained **1200px**; phone validation/no overflow/reset passed with no page errors.

One clearly marked synthetic booking saved as **ID 5**, **`TUX-2026-93B046D54DC4`**, then displayed the original desktop/phone hero and dynamic thank-you receipt. Actual hero heights were **477.984px** at 1440px and **352px** at 390px. Existing example rates gave transportation **USD 1,030.58** including **USD 22.50** stop waiting, gratuity **USD 206.12**, total **USD 1,236.70**. Customer/admin statuses both reported **Accepted by mail transport**; the synthetic customer email is `example.invalid`, so external inbox delivery remains an owner test.

**Live admin:** all eight screens (dashboard, settings, submissions, pricing, Vehicles list/edit and Collections list/edit) had the expected navigation, removed branding and readable 15px typography; native vehicle table text measured 14px. Changed only the new recent-count control **3 → 1 → 3** through the native nonce-protected Settings form: dashboard rows changed accordingly; all other non-key settings compared equal and both keys remained saved/masked. Six vehicle rows remained. Final dashboard shows the newest **three** requests.

**Release:** [tuxano-booking-2.1.1.zip](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.1.1.zip), Media Library attachment **39**, **11,491,226 bytes**, **47 files**, SHA-256 **`7bc4874f99e249c4725c2125be96743ae82ff5cdd8e8028900674161aa6462da`**. Unauthenticated HTTPS download returned 200/application-zip with exact hash; archive integrity and byte parity for every plugin source passed. Previous 2.1.0 stays available for rollback. Credentials, keys, cookies, transport helpers and test reports are excluded. Detailed local/live evidence remains in ignored `wordpress-test-results/*-211/` and `live-211/`.

The [seven-point checklist](wordpress/UPGRADE-2.1.1.md), installation guide and current ZIP links are updated. The final owner review follows the live update; seeded business tariffs, policy URLs and actual inbox delivery remain owner acceptance items from the preceding release.

**Final handoff:** 2.1.1 is installed/active, all seven requested changes and live checks are complete, source/release/documentation are saved on GitHub `main`, and the owner can now review the live page/dashboard again. Updated cloud startup instructions were saved as a draft with all existing network/secret/install/repository settings retained; Publish is required only to apply that future-session draft.


## 21. Header appearance, live map typing and final admin refinements — 24 October 2026

The owner requested four further changes and authorized continuing the existing update/test/live-deployment workflow. Target **2.1.2**, keeping 2.1.1 for rollback and preserving all current records, prices, keys and owner page content.

1. Add Settings controls for the marked form heading/subtitle/progress text, connectors and step-circle colors so the transparent form is readable on the owner's dark background at `https://bdreadyweb.com/carbook/`. Accept only specific validated hex colors, expose a bounded public palette and apply CSS variables only to the outer form header/progress; no arbitrary CSS and no effect on fares, receipt or emails. Retain current palette defaults; configure the actual dark live section's text to a suitable light palette after verifying controls.
2. Fix map-search predictions into a full-width professional list below the input. Start an unselected map in the United States. While typing, debounce a nonbinding preview of the current best prediction on the live map. That preview must not populate the main address, create a confirmed point or quote, or silently accept the first result. Only deliberate result/map-pin selection and confirmation commit a location. Bound preview details requests and reject stale responses after edits, map interactions, country changes or unmounting.
3. Remove the marked background strip after the thank-you footer. Preserve the navy footer itself. Diagnose iframe resize/host spacing and fix only booking-owned layout or safely scoped integration; preserve owner page content and restore any temporary thank-you host state on reset.
4. Use the available WordPress content width for all booking admin screens instead of the 1500px cap, retain readable fonts, and refine the premium hierarchy/cards/navigation/table details without changing existing CRUD or data.

Verify new color validation/public/revision boundaries, typing-preview races and confirmation safety, US initial map, prediction geometry, thank-you footer/iframe geometry and full-width responsive admin. Then build/install the actual ZIP on the supplied site, test the owner's home-page form and native controls, save concrete results here and return it for another manual review.

### 2.1.2 results and live handoff

All four refinements are complete. **Settings → Form appearance** provides ten strict six-digit hex color controls for the outer header/progress. Invalid CSS/URLs are rejected; only fixed whitelisted CSS variables enter the form, and palette changes do not change fare revisions or receipt/email styling. On the owner's dark home section, title/subtitle/inactive and active step labels are now white with light connectors; the existing circle palette is retained. The other 22 pre-existing non-key settings, recent count **3** and both configured/masked API keys remain unchanged.

Map predictions now occupy the full input width underneath it, with bounded scrolling and the live map visible below. A fresh empty actual Google picker was independently verified at **39.8283, -98.5795 / zoom 4** (United States), with confirmation disabled. Typing uses a debounced real provider preview without selecting a booking location, populating the main field or enabling confirmation. Deliberate result/map-pin selection and confirmation still commit the exact location. Newer typing, country changes, map interactions and unmounting invalidate pending previews; provider details are only reused transiently and attribution is safely displayed.

The thank-you footer itself remains intact. The marked background strip came from an empty Elementor Text Editor paragraph immediately following the shortcode wrapper. Validated same-origin/source/frame view messages now hide only that empty trailing paragraph during thank-you and restore its original inline display on reset. **Both desktop and phone measured 0px below the footer/widget**, versus **38.39px** in normal form view; reset restored that form spacing. Original desktop/phone photographic heroes measured **477.984px / 352px**, with white receipt content and no horizontal overflow. No owner post data was rewritten.

Booking administration now uses the available WordPress content width with balanced gutters: **1720/1740px at 1920px**, **1240/1260px at 1440px**, **370/380px at 390px**. The navy/gold navigation, cards, table headers and status details were refined. Main text remains **15px** and native fleet tables **14px**. All owned native list/edit screens retain WordPress capabilities, nonces, notices, media and CRUD; unrelated Posts styling remains isolated.

**Automated verification:** all **112 full browser cases** passed locally in 4.5 minutes. Targeted color, map/race/attribution, iframe-tail security/restoration and 18 native admin layouts passed; 109 settings/fleet/pricing assertions passed on actual PHP 7.4 and 8.3. [Hosted run 40010679045](https://github.com/dev-najmul/car-pro-form/actions/runs/40010679045), application commit **`4d3f3ebecb8062256f1a0257f2ecd4c7cab5c2a4`**, passed all four compatibility targets: PHP **7.4/8.1 with WordPress 6.6**, PHP **8.3/8.5 with current WordPress**. Each genuinely linted 12 real plugin PHP files and passed **97 Node + 109 data + 114 REST + 158 update/integrity** checks; PHP 8.3 passed all **112 browser cases** in 4.6 minutes. **590 distinct automated checks passed**, counting compatibility repetitions once. Every generated ZIP matched the canonical release hash and the CI artifact uploaded successfully.

**Live update:** the actual 2.1.2 ZIP is installed/active. Site Health currently reports **PHP 8.5.12 / WordPress 7.1.3**; the hosting runtime was not changed by this task. The three pages' raw content/status/slug/template, six complete vehicle configurations, 22 old settings and four global prices match the fresh pre-upgrade snapshots. Existing owner bookings were not edited/deleted. Native Settings saved only five new light appearance values.

The ordinary anonymous home page initially retained an old cached 2.1.1 parent HTML response after the plugin update. Homepage-only native LiteSpeed purge and Elementor Clear Files & Data were attempted; final tests waited until the **ordinary URL** served `embed.js?ver=2.1.2`. No cache-busting test URL was used for acceptance. The current primary review page is **https://bdreadyweb.com/carbook/**, in the owner's existing Elementor background section.

**Actual Google provider checks:** typing and deliberate confirmations passed for all three Bangladesh points and both US points, with full-width prediction geometry and unchanged main fields until confirmation. Nathullahbad → Sayedabad measured **166,685m / 12,370s** directly; via Bhanga **166,796m / 12,443s**, plus exactly **15 minutes waiting**. All provider country components were **BD**. All six displayed fares independently matched the site's tariffs. A second **read-only** Times Square → JFK route measured **25,535m / 2,179s**, both countries **US**, no waiting, and all six fares matched. No second request was submitted.

One clearly labelled synthetic request saved as **ID 7**, reference **`TUX-2026-AB7D9387F3CE`**. Example Luxury SUV transportation **USD 1,030.58** includes **USD 22.50** stop waiting; gratuity **USD 206.12**, total **USD 1,236.70**. Native admin search/View readback confirmed the durable request; both customer/admin notifications reported **Accepted by mail transport**. The synthetic address uses `example.invalid`; this does not prove actual inbox delivery. All steps 2–5 retained the **1200px** desktop maximum. Inline email validation, 249 countries, optional region/postal, phone overflow, original thank-you layout and reset passed with **no JavaScript errors**.

**Release/download:** [tuxano-booking-2.1.2.zip](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.1.2.zip), Media Library attachment **51**, **11,494,792 bytes**, **47 files**, SHA-256 **`8b872a0f7e5467e581ad81859ee4591079b7b56261ac0ef7212e4899bf3d870c`**. An unauthenticated HTTPS download returned **200/application-zip** and exact bytes/hash; archive integrity and complete plugin/shared-source parity passed. Version 2.1.1 remains available for rollback. Credentials, keys, cookies, private helpers and test reports are excluded. Detailed evidence is in ignored `wordpress-test-results/live-212/`, `admin-212/` and `full-browser-212/`.

The [four-point upgrade checklist](wordpress/UPGRADE-2.1.2.md) and installation/download guidance are updated. Source/release/documentation are saved on GitHub `main`, the live update is complete, and the owner can perform the final manual review. Existing business-rate/policy approval and actual inbox delivery remain owner acceptance items.

## 22. Phone map confirmation and content alignment — 24 October 2026

The owner found two phone issues and authorized a tested live plugin update. Target **2.1.3**; retain 2.1.2 as rollback and preserve current page content, prices, API keys, appearance and existing submissions.

1. Reproduce map search/preview/confirmation using touch-enabled mobile interaction. The supplied screenshot says “No point selected yet” while the confirmation button looks active. Ensure a deliberate confirmation can add the intended displayed address/point on phone, including after scrolling/dismissing the keyboard, while retaining exact Place identity, known-country checks and late-response guards. Typing must never silently change the booking address. Verify pickup, drop-off and stops, retaining desktop behavior.
2. On phone, align step 4 Contact & Billing section bodies and step 5 Review content with their section icons' left edge. Remove the unnecessary mobile indent from billing fields and review details/vehicle/other content, matching the existing contact review example. Preserve heading layout, desktop spacing, readable controls and responsive containment.

Implement and verify the two points separately, then build/install the actual ZIP, test the ordinary live homepage with touch-enabled mobile interaction and desktop, and record results before owner review.

### 2.1.3 verification and live update

Both phone requests are complete. The map screenshot showed a disabled action: typing preview did not create a confirmable point, and ordinary input blur discarded its preview state. A resolved visible preview is now kept separately from booking selection. After checking its displayed address/map, the visitor can explicitly tap **Use this map point** to add it. Keyboard dismissal/scrolling preserves that preview; typing alone still never changes the booking address. Disabled actions are visibly gray.

The selection getter revalidates query/generation/country and the actual current map center. It rejects stale input or an unfinished pan without substituting unrelated coordinates. Exact Place IDs remain exact; only explicit manual pin choices use raw coordinates. Editing/Escape/map gestures/unmount invalidate obsolete previews. Review also identified and fixed a remount case where stale preview UI could describe a different initial point, and a late nearby-result country race. Default US view cannot silently become a selected location.

Phone Contact & Billing section bodies and Review details/vehicle/contact bodies now start at their section icons' left edge through 639px. Removed the unnecessary 40/44px mobile indents and redundant small-phone exceptions. Desktop 52/72px spacing and passenger indentation remain intact. New 320/390px geometry tests failed against the prior CSS, then passed after the fix; screenshots were visually reviewed.

**Checks:** 97 Node, 19 final map-picker cases (including seven new touch/race regressions), 17 frontend cases and the **complete 122 browser suite** passed locally (4.9 minutes). Independent source review found no remaining concrete blocker. [Hosted compatibility run 40071123077](https://github.com/dev-najmul/car-pro-form/actions/runs/40071123077), application commit **`437e7c8178a00556927c7f9066538ef1f268f381`**, passed all four PHP targets: 7.4/8.1 with WordPress 6.6, 8.3/8.5 with current WordPress. Each genuinely linted 12 unique real PHP files and passed 97 Node + 109 data + 114 REST + 158 update/integrity checks; PHP 8.3 passed all 122 browser cases in 4.9 minutes. **600 distinct checks passed**, counting compatibility repetitions once. All four generated ZIPs matched the release hash and the artifact uploaded successfully. [Separate browser run 40071123110](https://github.com/dev-najmul/car-pro-form/actions/runs/40071123110) also passed 97 Node and 122 browser cases.

**Live installation:** uploaded/replaced/activated the actual 2.1.3 ZIP on the existing site. The ordinary homepage parent and child use 2.1.3; the served bridge bytes match canonical source. Hosting remains PHP 8.5.12 / WordPress 7.1.3. All **32 existing non-key settings** including ten appearance colors, **six vehicle configurations**, **four global prices**, and **three pages' raw content/status/slug/template** match fresh pre-update snapshots. No existing submission was edited/deleted.

**Real Google phone flow:** used Chromium with Pixel 7 touch/mobile emulation, 393px viewport, coarse pointer and touch support—not only a narrowed desktop viewport. Pickup **Times Square**, drop-off **JFK** and stop **Brooklyn Bridge** each passed type → settled preview → tap outside to dismiss focus → scroll → tap Use, retaining the preview and leaving the main field unchanged until confirmation. All exact Place identities returned **US**. The disabled button appeared gray; the ready preview enabled explicit confirmation. Direct route measured **25,535m / 2,179s**; via Brooklyn Bridge **37,171m / 3,159s**, plus exactly **900s** stop waiting. All six fares matched independent calculations.

Live Contact's four section bodies and Review's four content bodies aligned with their icons at **393px and 320px**; pricing aligned and neither parent nor child overflowed horizontally. The Luxury SUV review image decoded **331×223**, resolving the screenshot concern without an asset-code change. Independent **1440px desktop** suggestion selection/confirmation passed. **Zero booking POSTs, submissions, emails and JavaScript errors** occurred; this release's live QA was read-only. Evidence is ignored under `wordpress-test-results/live-213/`, `frontend-213/` and `full-browser-213/`.

**Release:** [tuxano-booking-2.1.3.zip](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.1.3.zip), Media attachment **53**, **11,496,004 bytes**, **47 files**, SHA-256 **`c0d769e9d334b3c3acf62381943eb1beb3abb3b1a10446facd8823ea771fd7c7`**. Unauthenticated HTTPS download returned **200/application-zip** with exact bytes/hash. ZIP integrity and parity for every plugin source/shared module passed. Version 2.1.2 remains available for rollback; credentials, keys, cookies and private test helpers/reports are excluded.

The [two-point checklist](wordpress/UPGRADE-2.1.3.md), installation guidance and release links are updated. Source, release and verification notes are saved on GitHub `main`. The live plugin is ready for the owner's final check on their physical phone.

## 23. Reliable map confirmation, visible toggles and quick booking — 25 October 2026

The owner reported two remaining defects and requested a quick-booking feature, authorizing direct live updates. Target **2.2.0**, with 2.1.3 retained for rollback.

1. Resolve repeated map confirmation failures for pickup, stops and drop-off. The supplied Govt. BM College Central Mosque example displays the valid selected address while reporting “Wait for the map to stop moving.” Reproduce real Google camera rounding/settling and distinguish selected provider identity from camera rendering. Permit deliberate confirmation of the intended named place or stable manually positioned pin, preserving country/late-result/edit guards and exact routing coordinates.
2. Fix Meet & Greet/Child Seats toggle indicators so the visible track/knob matches checked state, dependent controls and pricing across click, touch, keyboard and rerender.
3. Add independent `[tuxano_quick_booking]` for the home hero: PLAN YOUR RIDE, Transfer/Hourly, Google-selected pickup/drop-off, hourly duration, date/time, CHECK PRICE and estimate note. Match the supplied glass/transparent blurred desktop card and white phone card. Native inline rendering allows the parent hero to blur; styles must remain scoped.
4. Add a Settings page selector for the main booking destination. Quick CHECK PRICE carries only validated trip intent through a short-lived, one-use same-origin handoff, without putting addresses or credentials in the URL. The destination restores canonical places, validates date/time/service/hours and obtains a fresh authoritative route quote before opening step 2; invalid/expired/unresolvable intent stays safely on step 1 with feedback. Never carry contact/consent, a trusted price or an old quote.
5. Install quick booking at `https://bdreadyweb.com/carbook/` and the main `[tuxano_booking]` form at `https://bdreadyweb.com/carbook/booking/`. Back up existing page/builder data, replace only the relevant form widget/shortcode, and retain unrelated hero/content, all existing submissions, fleet, tariffs, appearance and API keys. This explicit page-placement request authorizes moving the form off the home page.

Implement the bug fixes and feature separately, check provider motion/races, toggle state and quick-to-main transfer for desktop/touch phone, then run compatibility/security/browser checks, build/install the actual ZIP and verify both ordinary live URLs. Record concrete results here before final manual review.

### 2.2.0 verification and live update

All requested changes are complete. The map defect was reproduced with actual Google at **Govt. BM College Central Mosque**: selected longitude **90.3542209** and idle camera longitude **-269.6457791** describe the same location in different world copies. The previous exact-center check rejected that valid selection. Confirmation now follows explicit selection and SDK movement/idle readiness, preserving canonical named identity. SDK-only coordinate normalization supports manual wrapped pins; an OverlayView positions the visible marker at the actual selected coordinate. Ordinary cooperative page scrolling does not invalidate a named selection. Query, country, movement, delayed response and remount safeguards remain.

Toggle logic/prices were already changing, but inline validation inserted a hidden paragraph between the input and indicator, breaking the adjacent CSS selector. General sibling selectors now keep track color, knob position and keyboard focus aligned with native checked state after validation and rerender.

New **`[tuxano_quick_booking]`** renders a native inline 440px card with desktop glass/backdrop blur, phone white background, accessible floating labels, Transfer/Hourly, Google-selected pickup/drop-off, hourly duration, date/time, current-location confirmation and CHECK PRICE. Scope/allowlists cover all new modules/styles without exposing backend files or keys. **Settings → Quick booking → Booking page** selects a published, password-free same-origin main page; it does not affect fare revisions. Fresh session settings supersede cached shortcode attributes, and invalid-configuration retry refetches configuration.

Quick submission transfers only minimal trip intent through a destination-bound, ten-minute, one-use sessionStorage record. The parent URL contains only a random 128-bit reference. The main iframe consumes the intent, removes the fragment, restores canonical Google identities, validates current constraints and obtains its own fresh session/route quote before **step 2**. No old quote, price, contact, consent or completed-step state is trusted. Failure stays on step 1 with feedback. User edits/navigation/picker opening prevent late auto-navigation; Back/BFCache restores the planner button. No quick action submits a reservation or sends mail.

**Local checks:** **109 Node**, **137 data/settings/fleet assertions on actual PHP 7.4/8.3**, **28 map-picker cases**, all **69 affected map/device/address cases**, **12 quick browser cases**, **three toggle cases**, and the **complete 146-case browser suite** passed (5.8 minutes). Native WordPress HTTP checks verified actual module/CSS enqueue, 440px blur14 desktop card and white phone/no overflow; the temporary local page/setting was restored. Independent read-only review found no concrete remaining blocker. The browser-only mosque module override probe reproduced the wrapped camera and confirmed the fix before installation.

**Hosted verification:** [run 40191011012](https://github.com/dev-najmul/car-pro-form/actions/runs/40191011012), application commit **`c07b91f752dff52bbbbfc267dd0a8de1ec95a1c0`**, passed all four PHP targets (7.4/8.1 with WordPress 6.6, 8.3/8.5 with current WordPress). Each genuinely linted 12 unique real PHP paths and passed 109 Node + 137 data + 114 REST + 158 integrity assertions. PHP 8.3 passed all 146 browser cases in 5.5 minutes. **664 distinct automated checks passed**, counting compatibility repetitions once; all four built ZIP hashes matched the release and the artifact uploaded. [Separate browser run 40191011007](https://github.com/dev-najmul/car-pro-form/actions/runs/40191011007) also passed 109 Node and all 146 browser cases.

**Live placement:** installed/activated the actual 2.2.0 ZIP. The owner had already moved the old home form to existing **Booking17** at **https://bdreadyweb.com/carbook/booking/** and created empty **Home54**. Selected Booking17 through native Settings and inserted only `[tuxano_quick_booking]` into Home54 at **https://bdreadyweb.com/carbook/**. All four pages remain; Booking17 raw content and Elementor data/page settings/template are identical. No marketing copy or hero image was added to the empty home; the shortcode can be placed in the owner's real photo hero. Native URL purge was submitted and final checks used ordinary URLs.

**Installed Google map/toggle checks:** BM Mosque selection worked on touch phone and desktop while the SDK retained wrapped camera longitude **-269.6457791** and the exact Place/projected pin retained **90.3542209**. Pickup, Sayedabad drop-off and Bhanga stop all confirmed canonical BD identities. Direct route measured **167,583m / 12,662s**; via Bhanga **167,694m / 12,735s**, plus exactly **900s** waiting. All six vehicle fares matched current metrics/tariffs. Meet & Greet and Child Seats showed navy checked tracks/right-positioned knobs and gray off tracks after hidden validation; quantity rerenders kept the correct active state.

**Installed quick checks:** ordinary Home rendered the actual glass desktop and white phone (393px/320px) cards. Desktop **Transfer** and touch-enabled phone **Hourly / 5 hours** each reached main **step 2**, preserving canonical US Place IDs, service, date **2026-11-08**, time **14:30** and hours, with a genuinely fresh main session and server quote. Google measured **25,535m / 2,179s**; all six fares matched. Handoff was consumed once, the opaque fragment removed, Edit Trip showed the fields, bounded native Back navigation returned to a usable Home planner, and visiting Booking directly started step 1. History checks account for legitimate iframe same-document entries. Parent bridge bytes remain canonical despite an older cached version tag; actual child/quick assets are 2.2.0. There were **zero booking POSTs, emails or JavaScript errors**.

**Preservation:** all **32 prior non-key settings**, both configured keys, **six vehicle/collection/status configurations**, and **four global prices** match snapshots; only new `booking_page_id=17` was saved. All submission status/count aggregates are unchanged: **9 → 9**. The only page-content change was the explicitly authorized quick shortcode in previously empty Home54. Hosting remains PHP 8.5.12 / WordPress 7.1.3.

**Release/download:** [tuxano-booking-2.2.0.zip](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.2.0.zip), Media attachment **58**, **11,511,188 bytes**, **50 files**, SHA-256 **`413f483db2c278ee34d9a555ac92b5fe4e86130e5f60a3e4a324b1501adb960a`**. Unauthenticated HTTPS download returned 200/application-zip and exact bytes/hash. Archive integrity and parity for all plugin source files/nine shared modules passed. Version 2.1.3 remains for rollback. Credentials, keys, cookies and private helpers/reports are excluded. Detailed evidence is ignored under `wordpress-test-results/live-220/`, `quick-220/`, `map-probe-220/`, `full-browser-220/` and private CI log archives.

The [upgrade checklist](wordpress/UPGRADE-2.2.0.md), shortcode/settings guide and live download links are updated. Source/release/verification notes are saved on GitHub `main`; the owner can now review both live pages on desktop and their physical phone. Existing business-rate/policy approval and actual inbox delivery remain owner acceptance items from prior releases.


## 24. Quick booking date/time pickers — 26 October 2026

Owner reported that the Date/Time fields did not open their choosers. Reproduced actual live 2.2.0 center clicks focusing hidden segments without requesting a picker. Version **2.2.1** now synchronously invokes native `showPicker()` from trusted click/tap/Enter/Space; unsupported/denied APIs expose readable native editors. Input/change events keep visible values synchronized. No booking, pricing, handoff or administrator contract changed.

Syntax, 109 Node, 12 existing quick-browser and five new actual native-picker regressions passed. Actual Chromium popup opening is exercised via trusted mouse/touch/keyboard events, not only programmatic filling. A browser-only candidate probe and installed-source live acceptance confirmed date/time selection on desktop and touch-enabled phone, then real-Google Transfer/Hourly (5h) handoff into freshly quoted step 2. Google measured 25,301m/2,158s; all six prices matched. No booking/email or JavaScript error occurred.

Installed 2.2.1 and verified preservation of 33 settings, two configured keys, six vehicle/collection/status configurations, four global prices, four pages' raw/builder data and every submission count/status (9 → 9). Test session allowance was temporarily raised and restored to 120 in `finally`, then independently rechecked. Native same-content Home refresh/cache purge did not change page content. The environment's zstd-advertising compressed HTML variant remained stale; ordinary URLs with identity encoding served current installed code and passed acceptance. A version query bypasses that stale variant for the owner's review.

ZIP [2.2.1](https://bdreadyweb.com/carbook/wp-content/uploads/2026/10/tuxano-booking-2.2.1.zip), Media60: 11,511,648 bytes/50 files; SHA-256 `1f72939380deba60abe47548a3263d4d2eea697b6c86faa8b251411570b11c31`. Integrity, all-source parity and public HTTPS200 exact-byte download passed. Keep 2.2.0 for rollback. Private reports are ignored under `wordpress-test-results/live-221/` and `quick-picker-221/`; credentials/helpers are excluded. Detailed notes: [UPGRADE-2.2.1.md](wordpress/UPGRADE-2.2.1.md).

Final [WordPress compatibility run40225517456](https://github.com/dev-najmul/car-pro-form/actions/runs/40225517456) passed at `5a25960438d2edd91cb4a442d40fd8ce99c54801`: all four PHP targets and **669 distinct checks**, including **151 browser cases**. Two timing-dependent test assertions were stabilized without changing the plugin source or ZIP: settled map previews are allowed before explicit confirmation, and native picker opening is tested independently of browser-owned time-column keyboard timing. Live acceptance separately selected actual native chooser values. Source/release bytes remain identical to implementation commit `f8a470be6500f57649b6ce03767b7e5825c4a02d`.

The final [separate browser run40225517705](https://github.com/dev-najmul/car-pro-form/actions/runs/40225517705) also succeeded. Owner review link bypasses the test network’s stale compressed variant: https://bdreadyweb.com/carbook/?v=2.2.1 .


## 25. Branded emails and vehicle pickup-slot availability — 26 October 2026

Owner authorized direct live update after tests. Initial feature build **2.3.0**; final release **2.3.1** also repairs a discovered iframe startup race. Retain 2.2.1 for rollback and preserve existing pages, customer records, keys, prices, fleet and settings.

Implementation plan:

1. Match customer/admin receipts to the thank-you page's typography, sections and estimate; use header **#0a121f**. Add email-logo selection in Settings → Email, defaulting to the existing bundled wordmark, with a native Media Library picker and URL fallback. Keep configuration private and outside fare revisions.
2. Automatically notify customers once per committed Confirmed/Cancelled/Completed transition when customer emails are enabled. Confirmed: thanks, request ID, date/time, pickup/drop-off, vehicle and authoritative price. Cancelled: short apology, ID and support invitation. Completed: thanks, ID and invitation for the next journey. Preserve initial receipt delivery and retry/idempotency leases.
3. Preserve saved local pickup date/time and add indexed vehicle/UTC slot data derived server-side from each record's timezone. One vehicle ID at one exact pickup minute is one slot; another vehicle at that minute remains available. Cancelled/completed records do not reserve future slots. Pending/reviewing requests warn but do not reserve the vehicle.
4. Check availability immediately after vehicle selection and freshly before proceeding from step 2. Show an accessible phone/desktop modal: confirmed blocks; pending requires acknowledgement. Handle slow/stale/failed checks safely and place modals inside the visible viewport of the autosized shortcode iframe.
5. Enforce confirmed-slot conflicts again at final persistence and admin confirmation/rescheduling, with a short database write lock so simultaneous confirmations cannot both succeed. Keep idempotent submission retries working. Migrate old records without changing their accepted data/prices.
6. Test template rendering/privacy/escaping, native logo controls, all slot states/other vehicles/timezone boundaries and actual two-process races; run existing PHP/browser checks, package, update the authorized site and verify preservation. Use local mail capture for design/status tests; do not email existing customers as QA.

Implementation and verification results will be recorded after completion.


Implementation completed. Local syntax/109 Node/165 browser checks passed. PHP suites passed137data,116REST,159updates,31logo,74templates and96availability/concurrency assertions. New suites also passed actualPHP7.4. The independent two-process race confirmed only one row; direct unique-key contention and unavailable lock behavior were covered. Ten email desktop/phone visual previews passed. Initial live2.3.0 native logo selection and desktop/touch availability acceptance passed; all33settings, keys, sixfleetentries, fourprices, fourpages and all12owner submissions/revisions/statuses were retained. No customer mail or booking POST was sent duringliveQA.

Initial BrowserCI40248347870 passed165; WordPressCI40248347825 passed everyPHP assertion across7.4/8.1/8.3/8.5, but its browser stage exposed an existing first-resize race between a fast child and a footer-loaded parentbridge. Final2.3.1 adds a trusted readiness handshake, with a strengthened test that intentionally delivers the first resize before bridge registration. Source and release bytes for2.3.0 are retained; final2.3.1 results follow.
