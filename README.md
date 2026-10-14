# TUXANO Reservation Request

A working, static, five-step booking form based on the supplied desktop and phone designs. Built with HTML, CSS, and vanilla JavaScript. All fonts and images are self-hosted.

## Try the website

Download this repository as a ZIP and extract it. With Node.js 20 or newer installed, open a terminal inside the project folder and run:

```sh
npm ci
npm run dev
```

On your own computer, open `http://localhost:3000`. No build step, API key, database, or backend is needed. You can also serve the same files with any static host, including GitHub Pages; this repository does not enable or publish a hosted site automatically.

## What works

- Transfer and Hourly trips, native date/time selection, up to five intermediate stops, and optional browser geolocation.
- All six vehicle classes and their supplied text, photographs, capacities, and example transportation prices.
- Passenger/luggage counts, commercial/private flight details, Meet & Greet, car/booster seats, gratuity presets/custom percentage, and tipping in person.
- Payer/passenger details, same-as-payer synchronization, billing address, character limits, and validation.
- Back and Edit navigation without losing data, live estimates, agreement/policy dialogs, and static submission to the thank-you page.
- A draft retained in **sessionStorage for the current browser tab**. It is not uploaded. A new request clears it; closing the tab ends its normal lifetime.
- Responsive layouts, accessible control names, keyboard focus, and reduced-motion support.

This is a prototype: quotes use documented demo rates, address suggestions use a small local list, and submitting sends no booking, email, payment, or other backend request. The thank-you page explicitly identifies a demo request. Policy links explain that real operator policies have not been provided.

## Review the reference-style fixture

Use `?demo=1#trip`, `?demo=1#vehicles`, `?demo=1#passengers`, `?demo=1#contact`, or `?demo=1#review` after the page filename/URL to load the documented example booking. On Review, check the agreement and submit to view its thank-you page. This fixture initializes fresh source-style data on each document load; use normal mode to test draft restoration and your own input.

The working form uses one consistent selected date/time and greets the payer. This resolves the contradictory example dates and the unrelated greeting name in the supplied screenshots. The original screenshot text remains transcribed in [project.md](project.md).

## Screenshots

Actual browser captures of all six pages at desktop and phone sizes are in [docs/previews](docs/previews). The captures use example data to make each section visible.

| Page | Desktop | Phone |
| --- | --- | --- |
| Step 1 — Trip | [View](docs/previews/trip-desktop.png) | [View](docs/previews/trip-mobile.png) |
| Step 2 — Vehicles | [View](docs/previews/vehicles-desktop.png) | [View](docs/previews/vehicles-mobile.png) |
| Step 3 — Passengers & Extras | [View](docs/previews/passengers-desktop.png) | [View](docs/previews/passengers-mobile.png) |
| Step 4 — Contact & Billing | [View](docs/previews/contact-desktop.png) | [View](docs/previews/contact-mobile.png) |
| Step 5 — Review & Submit | [View](docs/previews/review-desktop.png) | [View](docs/previews/review-mobile.png) |
| Thank-you | [View](docs/previews/thank-you-desktop.png) | [View](docs/previews/thank-you-mobile.png) |

## Checks

```sh
npm run check
npm test
```

Tests use Playwright with system Chromium when available. Otherwise install its Chromium once:

```sh
npm run install:browser
npm test
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can point to a different compatible Chromium executable. The suite starts an isolated test server on port 4173, enters values through actual controls, checks prices independently, and captures all desktop/phone pages. Failure traces, screenshots, and an HTML report are kept in ignored output folders. The included GitHub Actions workflow is configured to run these checks on pushes and pull requests.

## Files

- `index.html`, `styles.css`, `app.js`: the entire static application.
- `assets/`: supplied backgrounds, clean derived photography, vehicle/logo crops, fonts, and font licenses. [Asset provenance](assets/README.md).
- `server.js`: optional dependency-free development server, supporting `PORT` or `--port`.
- `tests/booking.spec.js`, `playwright.config.js`: browser verification.
- `project.md`: original inventories, implementation choices, dummy-data log, and validation results.

Fonts retain their SIL Open Font Licenses. Screenshot-derived vehicle/logo assets have the supplied raster resolution; sharper originals can replace them later without changing the UI.
