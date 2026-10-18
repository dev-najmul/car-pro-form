# TUXANO Reservation Request

A responsive five-step transportation form built with HTML, CSS, and vanilla JavaScript from the supplied desktop/phone designs. Version 1.1 adds Google Places (New) location selection, Google Routes driving estimates, automatic travel time, and route-based **demonstration tariffs**. The design photographs and fonts are self-hosted.

Google supplies locations and driving metrics; it does not supply the prices. Submitting still opens a local demo thank-you page and sends no booking, email, or payment. WordPress conversion remains future work. GitHub Pages uses the supplied browser key for suggestions and a temporary private backend for Routes, with no further client Google Cloud changes. See [prototype testing](#temporary-wordpress-prototype-testing) for the two-hour test window.

## Run locally

Use **Node.js 24.5 or newer**:

```sh
npm ci
npm start
```

Open `http://localhost:3000`. `npm run dev` starts the same server. Both scripts use `node --use-env-proxy server.js`, which honors the host's proxy environment when present. There is no frontend build step or runtime npm dependency.

For live location search and route calculation, set these environment bindings:

```dotenv
GOOGLE_MAPS_BROWSER_KEY=YOUR_BROWSER_MAPS_PLACES_KEY
GOOGLE_ROUTES_API_KEY=YOUR_SERVER_ROUTES_KEY
```

For local use, create `.env.local` from the names in [.env.example](.env.example), preserving any existing configuration. The server loads that ignored file without shell evaluation; existing injected environment variables take precedence. Keep real key values out of commits, screenshots, logs, and release ZIPs.

- Enable billing, Maps JavaScript API, Places API (New), and Routes API in the relevant Google Cloud project.
- Restrict the browser key to the permitted website HTTP referrers and Maps JavaScript/Places APIs; only the optional browser-only routing mode additionally needs Routes API on that key. This key is intentionally delivered to the browser.
- Use a separate Routes-only server key, with appropriate server/IP restrictions. It is never included in browser configuration. Hosting with changing egress IPs needs a suitable server-access arrangement.
- Allow outbound access to `maps.googleapis.com`, `maps.gstatic.com`, `places.googleapis.com`, and `routes.googleapis.com`. Use HTTPS for a deployed site and browser geolocation.

There are three supported hosting modes. `npm start` uses the private Routes key through the Node server. For this WordPress prototype, GitHub Pages uses a temporary private route backend with the second server key, so the client does not need to change Google Cloud settings. A standalone browser-only Pages mode is also supported when the browser key permits Routes API. A different local Node port can be selected with `npm start -- --port 4000`.

## Publish the live form on GitHub Pages

The site is [dev-najmul.github.io/car-pro-form](https://dev-najmul.github.io/car-pro-form/). Version 1.1.1 fixes the previous deployment mismatch: GitHub Pages cannot execute Node endpoints such as `/api/maps/config`.

1. In [repository Actions secrets](https://github.com/dev-najmul/car-pro-form/settings/secrets/actions), add **`GOOGLE_MAPS_BROWSER_KEY`** containing the Maps/Places **browser key**. The separate Routes server key remains private in the route backend.
2. The browser key needs **Maps JavaScript API and Places API (New)**. The second server key supplies Routes access for the temporary test backend. Only the optional browser-only mode needs **Routes API on the browser key**. Add `https://dev-najmul.github.io/*` to its allowed website referrers while preserving other required development/production referrers. Origin-based referrers are needed because browsers can omit the page path.
3. For the temporary test backend, also add Actions secret **`GOOGLE_ROUTES_API_KEY`** with the second Routes Server key. That key is available only to the backend process. The Pages configuration contains a public HTTPS endpoint and expiration, never this server credential.
4. Pages must use **GitHub Actions** as its build source. The **Deploy GitHub Pages** workflow builds/publishes on `main` pushes and can be run manually from Actions. Its `dist` artifact includes only public files and generated browser configuration.

The browser key is visible to website visitors by design, so keep its website/API restrictions configured. It is supplied from an Actions secret at build time and never committed to source. The static artifact never contains the Routes server credential, local environment file, server modules, tests, documentation previews, or backup ZIP.

For a local static build, export `GOOGLE_MAPS_BROWSER_KEY` securely and run `npm run build:pages`. Serve `dist/` with a static web server. It works at the origin root or `/car-pro-form/`. Do not double-click `index.html` as a `file://` URL. Missing browser configuration fails the build rather than publishing an unusable empty key.

## Trip behavior

- Select pickup, drop-off, and every intermediate stop from Google Places suggestions. A deliberate click/tap or arrow-key highlight followed by Enter is required; Enter alone never accepts the first result. Include city/country when names are ambiguous. Manually editing a location clears its old selection and estimate. The current-location button can instead use browser-provided pickup coordinates after permission.
- Add/remove up to **five ordered stops**. Each starts with **5 minutes** waiting; choices are 0, 5, 10, 15, 20, 30, 45, 60, 90, or 120 minutes.
- **Pickup time** remains the chosen clock time. Read-only **Travel time** is Google's driving duration plus all stop waiting, added once. The route display separates driving time, waiting time, total journey, kilometers, and miles.
- The complete selected address is visible below each input, with an exact-Place-ID Google Maps link. The route comparison link preserves pickup→drop-off direction and stop order. Routes with more than three intermediate stops open in consecutive parts so Google Maps mobile limits do not omit stops. Editing a location clears its selected-address card, comparison link, and estimate immediately.
- Google routes through the stops in entered order. Stop detours are already included in driving distance/time. This version uses `TRAFFIC_UNAWARE`; its duration excludes live traffic and does not forecast the selected pickup date/time.
- Both Transfer and Hourly need a selected drop-off and valid route for an estimate. Hourly supports 2–12 booked hours, initially 3.
- Location changes and stop add/remove invalidate the route. Waiting, vehicle, service, and hours update the applicable time/price calculation. Late provider responses cannot restore an obsolete location or route. Failed/unconfigured provider calls show an error/retry state rather than invented normal-mode mileage or prices.
- Normal mode has no local address list or fake-route fallback. Provider results are not cached by the server; driving metrics stay only in the active booking workflow and are recalculated when required.

## Demonstration pricing

All amounts are USD and are configurable in [pricing.js](pricing.js). These are invented prototype tariffs, not an operator-approved fare schedule. Google charges for its APIs separately.

| Vehicle | Base | Per mile | Per driving minute | Transfer minimum | Per waiting minute | Per booked hour |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Premium SUV | $65 | $2 | $3 | $100 | $1 | $95 |
| Luxury SUV | $75 | $3 | $3 | $125 | $1.50 | $115 |
| Executive SUV | $105 | $3.50 | $3 | $150 | $2 | $135 |
| Rolls-Royce Ghost | $500 | $15 | $15 | $600 | $5 | $500 |
| Rolls-Royce Cullinan | $700 | $20 | $25 | $900 | $7.50 | $750 |
| Rolls-Royce Phantom | $1,000 | $30 | $55 | $1,500 | $10 | $1,250 |

With `miles = distanceMeters / 1609.344`, `drivingMinutes = durationSeconds / 60`, and `waitingMinutes = sum of stop waits`:

```text
Transfer driving charge = max(minimum, base + miles × perMile
                                      + drivingMinutes × perDrivingMinute)
Hourly driving charge   = max(bookedHours, drivingMinutes / 60) × hourlyRate
                          + miles × perMile
Waiting charge          = waitingMinutes × perWaitingMinute
Transportation          = driving charge + waiting charge
Travel time             = durationSeconds + waitingMinutes × 60
```

Money is rounded to cents. Hourly deliberately adds mileage and waiting to its time charge; it does not apply the transfer base, minimum, or per-driving-minute rate. Waiting is charged even when it falls within the booked block. These business assumptions need operator approval before real quoting.

Meet & Greet adds $50. The first combined car/booster seat costs $75, each additional seat $50. Gratuity is the selected percentage of **transportation, including waiting**, and excludes Meet & Greet/seat charges; tipping in person sets the calculated gratuity to zero. The final estimate adds transportation, extras, and gratuity. See [project.md](project.md#11-google-maps-integration-record--version-110) for rounding, examples, and retained behavior.

## Drafts, APIs, and provider attribution

A draft remains in `sessionStorage` for the current tab. It retains contact/options data, original typed location queries, stop IDs/waits, and Google **place IDs**. Google-formatted addresses, provider attributions, prediction lists, and route metrics are transient; they are not saved in the browser draft. Browser-supplied geolocation coordinates are user input and can be retained with that draft. On refresh, saved Google place IDs first fetch fresh canonical addresses and provider attribution, then calculate a fresh route. If a place cannot be restored, the app returns to Trip and requires reselection without a quote. Starting a new request clears the draft.

The client loads `maps-config.json` relative to its module URL, preserving a project subpath. The Node server serves that configuration dynamically (also available at `GET /api/maps/config`) with `providerMode: server`; `POST /api/maps/route` validates waypoints and calls Google using the private server key. The two-hour preview generates `providerMode: remote`, a public `routeEndpoint`, and `previewExpiresAt`. It calls the private backend with exact-origin CORS from `https://dev-najmul.github.io`. Google receives the server key only in the backend header. When no Routes secret is present, the optional Pages build generates `providerMode: browser`; it uses `google.maps.importLibrary("routes")` and `Route.computeRoutes()` directly, then converts `durationMillis` to seconds. That browser-only mode never falls back to a private key. API responses use `Cache-Control: no-store`; there is no server provider-result cache or persistent browser route cache. Private files, server modules, local configuration, tests, and backups are not served as public application files.

Custom suggestions and route metrics show untranslated **Google Maps** text attribution; returned place-provider names/links are retained during the workflow and displayed. [Prototype Terms of Use](terms.html) and [Prototype Privacy Notice](privacy.html) describe this application and link/incorporate the relevant Google terms and policies. The existing operator Terms & Conditions/Cancellation Policy dialogs remain placeholders, separate from these prototype notices. There is no database or booking submission endpoint. Contact details are not uploaded by the form; searching locations sends the query to Google, and route calculation sends waypoints through the temporary private backend on Pages, through the same-origin proxy on Node hosting, or directly to Google in the optional browser-only mode.

## Offline reference fixture

Use `?demo=1#trip`, `?demo=1#vehicles`, `?demo=1#passengers`, `?demo=1#contact`, or `?demo=1#review` to load the source-style example. It explicitly supplies a sample **20-mile, 30-minute driving route** and preselected example locations; normal mode never switches to it automatically. New demo fixture loads reset that example. Location search itself still uses Google if you edit/search a fixture location.

The fixture reproduces the original six transfer amounts and the Luxury SUV $495 example. All pages use the consistent source date, 8 September 2026 at 6:00 AM, and greet Emily, the payer. Review/thank-you show the entered trip, selected vehicle, extras, and calculations. The consent/policy dialogs, accessible controls, capacity checks, same-as-payer synchronization, and static submission remain available.

The original 12 browser captures in [docs/previews](docs/previews) show the **v1.0.0 static baseline**, before Maps and Travel time were added. The complete screenshot inventory remains in [project.md](project.md).

## Checks and live status

```sh
npm run check
npm run test:unit
npm test
```

The browser suite uses Playwright and system Chromium when available; otherwise install Chromium once with `npm run install:browser`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select another compatible executable. Tests use an isolated server on port 4173 and deterministic Google/provider mocks for repeatable UI and error/race checks. Unit tests cover pricing arithmetic and the server API contract, and CI runs `npm run test:unit` alongside the other checks. Remote CI results are separate from local validation.

The initial Google-domain proxy block was resolved after the cloud network configuration changed. On **18 October 2026**, an actual unmocked Routes request through the running application proxy succeeded with one intermediate stop: **30,855 meters, 2,492 seconds**, `provider: google`. The actual browser SDK, selected place names/addresses, a stop route, automatic time/prices, fresh draft restoration, and the complete flow through local thank-you were also verified on desktop/phone. The live example included 15 minutes waiting and showed a consistent $313.43 Review/thank-you total. Current integration previews are in [docs/previews/maps](docs/previews/maps). Provider details and final integration-suite results are recorded in the current [project record](project.md#118-verification-status). Version 1.1.0 passed 43 unit + 39 browser checks. The Pages correction in 1.1.1 passed 48 unit + 43 browser tests. Version 1.2.0 passed **71 unit + 45 browser tests (116 total)**, plus syntax checks. Mocked tests and live provider checks are documented separately.

## Files and previous version

- `index.html`, `styles.css`, `app.js`: five-step interface, summaries, draft handling, and local confirmation.
- `maps.js`: Places (New) sessions, accessible suggestions, and Node/remote/browser route providers.
- `scripts/build-pages.mjs`, `.github/workflows/pages.yml`: public-only static build and Pages deployment.
- `pricing.js`: configurable demo tariffs, arithmetic, and duration formatting.
- `maps-api.js`, `server.js`: same-origin API, private configuration loading, request limits, and public-file serving.
- `terms.html`, `privacy.html`: prototype/Google terms and data-handling notices; separate from the operator-policy placeholders.
- `assets/`: original/derived photography, vehicle/logo crops, self-hosted fonts, licenses, and [provenance](assets/README.md).
- `tests/`, `playwright.config.js`: pricing/API unit tests and browser verification.
- `project.md`: source inventory, current formulas/decisions, and verification history.
- `terms.html`, `privacy.html`: public prototype notices and Google terms/privacy links.

The pre-integration version is preserved as [car-pro-form-static-v1.0.0-before-maps.zip](releases/car-pro-form-static-v1.0.0-before-maps.zip), from commit `9bd33e5`. [Restore instructions and checksum](releases/README.md) document that backup. It predates the private Maps configuration and contains no new API credentials.

## Temporary WordPress-prototype testing

The owner requested using the supplied two keys for testing, with no further client Google Cloud changes. Both repository secrets have now been added by the owner. The Pages deployment starts a private Node Routes backend on the GitHub Actions runner and exposes it through an account-free Cloudflare Quick Tunnel. Google Maps suggestions remain on the original Pages origin. This mirrors the later WordPress server-side route request without converting the prototype into a plugin yet.

Each test session lasts **two hours** and permits **200 provider requests**, with the existing 30-request/minute limit. The UI shows the local expiration. The deployment job deliberately remains **in progress** during that period to keep the test server alive; the Pages publishing step can already be complete. Run **Actions → Deploy GitHub Pages → Run workflow** to start a new session, then refresh the form. A code push also replaces the session. Markdown-only status commits preserve the running backend. When the session expires or the workflow is cancelled, new routes show an explicit unavailable/expired message rather than fabricated metrics.

A separate **Check live GitHub Pages** workflow can be run manually after publishing. It uses real Google Places/Routes and synthetic contact inputs to verify the public form through thank-you, checks distance/wait pricing and phone layout, and saves screenshots plus a sanitized report as an Actions artifact. It requires no private key in the test browser.

The tunnel binary is pinned to Cloudflared 2026.10.1 and its official SHA-256 digest is checked before execution. The backend accepts browser route requests only from the configured Pages origin, keeps the server key on the runner, and does not persist provider results. The temporary infrastructure is for prototype testing; the later WordPress plugin will make the route request from the WordPress host.

The original address-search failure was fixed by generating public configuration during Pages deployment. Actual public suggestions were verified on 19 October 2026. The earlier browser-only Routes permission denial is bypassed architecturally by using the correctly authorized **server** key on the test backend; no key restriction is being disabled or changed. Current public-preview verification is recorded in [project.md](project.md#13-temporary-server-routes-preview--version-120).

Public verification on **19 October 2026 (Asia/Dhaka)**: [the live Google/browser flow passed](https://github.com/dev-najmul/car-pro-form/actions/runs/39157735762), including all six route-based quotes and consistent Review/thank-you totals. The active expiration appears in the form; run the deployment workflow again for another two-hour window. That release passed 116 local checks; version 1.2.1 passes **131 checks**. See the [current project record](project.md#13-temporary-server-routes-preview--version-120) for deployment, expiry and evidence.

Version **1.2.1** prevents accidental first-suggestion selection and adds full-address/Google Maps verification. The reported Bangladesh mismatch compared Notun Bazar in Dhaka with Nathullahbad in Barishal. Seven live Google route checks reproduced the displayed local route and verified the intended intercity journey, reverse direction, airports and an ordered stop. See [location accuracy findings](project.md#14-location-accuracy-investigation--version-121) for measurements and the distinction between baseline and current-traffic estimates.
