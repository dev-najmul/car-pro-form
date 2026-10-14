# Car Pro Form — Project Specification

Repository: `dev-najmul/car-pro-form`

Reference archive: `Car booking img.zip`

Documentation date: 14 October 2026

Current milestone: **design inventory prepared for the owner's review; implementation has not started.**

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

**This commit contains the specification only.** A completed inventory is not a claim that an application has been built or tested. The source ZIP and extracted screenshots are currently reference attachments, not additional committed repository files.

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
- Card photos are present only within the screenshots, not as separate vehicle asset files. For later implementation, reproducing these exact pictures requires an explicit asset decision (for example, approved crops from the supplied screenshots or supplied originals); no replacement imagery has been chosen at this documentation stage.

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
- No code or UI implementation is requested in the current documentation phase. Desktop implementation, thank-you navigation, responsive implementation, visual comparison, functional validation, and final GitHub update belong to the user’s subsequent phases after this inventory is reviewed.


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

The data below comes from the supplied screenshots. No new dummy data or working application has been added at this documentation milestone.

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
| Greeting name | Thank-you says `Thank you, Pavel.`; payer is Emily Smith and primary passenger is John Smith | Greeting identity is not defined by the source. Choose its mapping with the owner before implementing personalized greeting behavior. |
| Pickup address | Form summaries say `Carol Stream, IL`; thank-you expands it to `302 Sype Dr, Carol Stream, IL, 60188–3306` | No address lookup or expansion service is supplied. Do not invent a resolved address for arbitrary user input. |
| Airline spelling | Review uses `American Airlines`; thank-you uses `American Airline (AA)` | Preserve source wording here; later decide a consistent representation of entered airline data. |
| Meet & Greet status | Review says `Included`; thank-you says `Added`; price summary still charges $50 | These words describe the selected extra in the fixture; `Included` must not accidentally make it free. |
| Capacity copy | Desktop summary/review uses `Up to 6 Passengers` / `Up to 6 Bags`; some phone summaries shorten these labels | Match viewport-specific wording where documented without changing the capacity value. |
| Child-seat copy | Capitalization and spacing differ between some sidebar/mobile labels and desktop review labels | Keep the visible variants in their inventories; decide whether production copy should match each reference exactly. |
| Time punctuation | Some phone raster glyphs look semicolon-like in `6:00 AM` | It is a visual/typographic uncertainty, not evidence that time data should be stored with a semicolon. |
| Collection subtitle punctuation | Step 2 SUV subtitle ends with a comma | Recorded literally; changing it to a period would be a copy correction requiring a documented decision. |
| Reservation/email/security claims | Source includes receipt/review/email/payment and encryption statements | These are reference UI text. This static phase does not create a real reservation, send an email, collect payment, or prove server-side encryption. |

## 7. Later functional implementation inventory

This section records the requested future behavior and the UI's implications. It is **not implemented yet**. Decisions below must remain recorded when the implementation begins.

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
| New dummy data | Added vehicle/location/contact records, mock quotes or request IDs | **None added yet** |
| Mock behavior | API replacements, autocomplete, submit, email/payment actions | **None implemented yet**; only local/static submit is requested |
| Design choices | Exact CSS sizes, breakpoints, font weights, icons, gradients, vehicle/logo assets | **Not implemented yet**; reference observations are documented |

For every future addition, record: the item, why it is needed, whether it comes from the screenshots or was invented, where it is used, and its limits. Do not describe mock submissions or mock prices as real services.

## 8. Future build and verification checklist

### Phase A — Specification and owner review

- [x] Read all files in the uploaded ZIP.
- [x] Inspect desktop and phone references for every step and the thank-you page.
- [x] List all visible controls, text, options, example values, and design details individually.
- [x] Record source inconsistencies, missing assets, and behavior not shown by the references.
- [x] Prepare `project.md`.
- [ ] Owner reviews this file and supplies the next implementation instruction.

### Phase B — Desktop implementation, after the next instruction

- [ ] Choose and document the HTML/CSS/JavaScript file structure and needed local tooling.
- [ ] Obtain/load both named font families and resolve the vehicle-photo, vehicle-cutout, wordmark, and icon assets.
- [ ] Build Step 1 against its desktop screenshot.
- [ ] Build Step 2, including all six cards and source descriptions/prices.
- [ ] Build Step 3, all count/toggle/flight/gratuity controls, seat breakdown, and sidebar.
- [ ] Build Step 4, contact/billing fields, checkbox mapping, and sidebar.
- [ ] Build Step 5, read-only review, Edit links, consent, totals, and local/static submit.
- [ ] Build the thank-you page and transfer retained state to its summary.
- [ ] Record every new dummy data item and unresolved-source decision in this file.
- [ ] Compare desktop screenshots at the 1440 px reference width and correct differences page by page.

### Phase C — Phone and intermediate-width layouts

- [ ] Match all phone references at 390 px: typography, lobby/hero cropping, progress labels, spacing, controls, and card ordering.
- [ ] Keep Step 1 date/time side by side.
- [ ] Stack all six vehicle cards in source order.
- [ ] Place trip/price summaries and next-step cards below the main form where shown.
- [ ] Apply viewport-specific copy/layout differences documented in the inventories.
- [ ] Place full-width Continue/Submit above full-width Back on phone.
- [ ] Recreate the phone thank-you hero, vertical information sections, pricing total, next-step sequence, assistance panel, and footer.
- [ ] Choose/document intermediate breakpoints; check narrower phones, tablets, and wide desktops for overflow or overlap.

### Phase D — Functional and visual checks

- [ ] Complete the form from Step 1 to thank-you using user-entered data.
- [ ] Check Back/Continue/Edit navigation preserves state correctly.
- [ ] Check both service-type options and document any demo-only Hourly behavior.
- [ ] Check stop add/remove controls, date/time input, and any local/demo address behavior.
- [ ] Select each vehicle and verify its title, description, price, and capacity.
- [ ] Check passenger/luggage and child-seat count boundaries and toggles.
- [ ] Check Commercial Flight/Private Aviation behavior.
- [ ] Check seat arithmetic, Meet & Greet charges, all gratuity presets, custom/tip-in-person choices, and total consistency.
- [ ] Check optional versus required contact/billing fields, email/phone handling, checkbox mapping, and visible validation.
- [ ] Check special-request and billing-note counters/limits and safe rendering of entered text.
- [ ] Check consent and policy-link behavior without inventing published policy content.
- [ ] Check thank-you details match the submitted local state; document how greeting and request ID were chosen.
- [ ] Compare every desktop/phone page with its corresponding source, including exact text, font families/weights, colors, image crops, widths, alignment, borders, spacing, icons, and buttons.
- [ ] Check keyboard access, input labels, focus visibility, and readable errors while preserving the supplied design.
- [ ] Check for browser-console errors and broken/missing assets.
- [ ] Document actual passed/failed checks and any limits, then save the finished implementation to GitHub for owner review.

## 9. Review topics before implementing absent details

The current documentation can be reviewed without answering these now. They are concrete decisions for the next stage:

1. Which name should the thank-you greeting use: payer, primary passenger, or a separate requester? The screenshot's `Pavel` does not match either listed contact.
2. May the implementation use cropped vehicle/wordmark images from the supplied screenshots, or will original assets be supplied? Background images are already available; the separate photos/cutouts/logo are not.
3. What should the Hourly option reveal, and which demo pricing rule should it use? No Hourly-state screenshot or rates are supplied.
4. How should the additional unpictured states behave: stops, custom gratuity, private aviation, and validation? Reasonable local/static defaults can be documented when the owner starts implementation.
5. What should the Terms & Conditions and Cancellation Policy links open? Neither document nor URL was provided.

**Checkpoint:** review this specification first. The implementation phase starts only after the owner's next instruction.
