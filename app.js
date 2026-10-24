import { MapsClient, mountAutocomplete, googlePlaceUrl, googleRouteLinks, DEVICE_LOCATION_POLICY, normalizeDevicePosition, requestDeviceLocation, assertSameCountry, countryCodeOf } from "./maps.js";
import { quoteTransportation, formatDuration } from "./pricing.js";
import { mountPickupMap } from "./pickup-map.js";
import { COUNTRY_NAMES } from "./countries.js";
/* The shared frontend supports both the static prototype and WordPress runtime. */
(() => {
  "use strict";
  const runtime = globalThis.TuxanoBooking || null;
  const settings = {
    currency: "USD", currencySymbol: "$", meetPrice: 50, firstSeatPrice: 75,
    additionalSeatPrice: 50, defaultGratuity: 20, companyName: "TUXANO",
    supportEmail: "info@tuxano.com", supportPhone: "+1 (717) 434–6195",
    website: "https://tuxano.com", termsUrl: "", privacyUrl: "",
    maxStops: 5, minHours: 2, maxHours: 12, ...runtime?.settings,
  };
  // A fixed property whitelist and strict hex validation keep administrator
  // preferences out of arbitrary CSS. Only form-page selectors consume them.
  const formColors = settings.formColors;
  if (formColors && typeof formColors === "object" && !Array.isArray(formColors)) {
    for (const [key, property] of Object.entries({
      title: "--form-title-color", subtitle: "--form-subtitle-color",
      stepLabel: "--form-step-label-color", activeStepLabel: "--form-active-step-label-color",
      connector: "--form-connector-color", circleBackground: "--form-circle-background",
      circleText: "--form-circle-text-color", circleBorder: "--form-circle-border-color",
      activeCircleBackground: "--form-active-circle-background", activeCircleText: "--form-active-circle-text-color",
    })) {
      if (typeof formColors[key] === "string" && /^#[\da-f]{6}$/i.test(formColors[key])) {
        document.documentElement.style.setProperty(property, formColors[key]);
      }
    }
  }
  const STORAGE = "tuxano-booking-v1";
  let DEMO_MODE = !runtime && new URLSearchParams(location.search).get("demo") === "1";
  let receipt = null, requestKey = "", submitting = false;
  const gratuities = [...new Set([10, 15, 20, 25, settings.defaultGratuity])].sort((a, b) => a - b).map(String);
  const WAIT_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
  const maps = new MapsClient();
  let currentRoute = null, routeStatus = "idle", routeMessage = "", routeGeneration = 0, routeController = null, routePromise = null;
  let autocompleteCleanups = [];
  let advancing = false, locationGeneration = 0, navigationGeneration = 0;
  let restoringPlaces = false;
  let deviceLocation = { status: "idle", candidate: null, message: "" };
  let pickupMapCleanup;
  const fieldErrors = new Map();
  const touchedFields = new Set();
  const newStopId = () => "stop-" + (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const makeStop = (text = "") => ({ id: newStopId(), text, query: text, place: null, waitMinutes: 5 });
  const routes = [
    "trip",
    "vehicles",
    "passengers",
    "contact",
    "review",
    "thank-you",
  ];
  const labels = [
    "Trip",
    "Select Vehicle",
    "Passengers & Extras",
    "Contact & Billing",
    "Review & Submit",
  ];
  const staticVehicles = [
    {
      id: "premium",
      name: "PREMIUM SUV",
      display: "Premium SUV",
      capacity: 6,
      image: "premium-suv.png",
      models: [
        "Chevrolet Suburban",
        "Ford Expedition MAX",
        "GMC Yukon XL or similar",
      ],
      features: [
        "Full-size extended-wheelbase SUVs",
        "Spacious luggage capacity",
        "Professional chauffeur service",
        "Airport and business travel focused",
      ],
    },
    {
      id: "luxury",
      name: "LUXURY SUV",
      display: "Luxury SUV",
      capacity: 6,
      image: "luxury-suv.png",
      models: [
        "Lincoln Navigator Reserve L",
        "Cadillac Escalade ESV Luxury",
        "GMC Yukon Denali XL or similar",
      ],
      features: [
        "Second-row captain’s chairs",
        "Premium leather interiors",
        "Professional chauffeur service",
        "Enhanced ride quality",
      ],
    },
    {
      id: "executive",
      name: "EXECUTIVE SUV",
      display: "Executive SUV",
      capacity: 6,
      image: "executive-suv.png",
      models: [
        "Lincoln Navigator Black Label L",
        "Cadillac Escalade ESV Platinum Luxury",
        "GMC Yukon Denali Ultimate XL or similar",
      ],
      features: [
        "Executive second-row captain’s chairs",
        "Massage seating functions",
        "Top-tier premium trim packages",
        "Highest level of interior refinement",
      ],
    },
    {
      id: "ghost",
      name: "ROLLS-ROYCE GHOST",
      display: "Rolls-Royce Ghost",
      capacity: 3,
      image: "rolls-royce-ghost.png",
      models: ["Executive transportation", "Private events", "Fine dining"],
      features: [
        "Handcrafted luxury interior",
        "Near-silent ride quality",
        "Rear executive comfort settings",
        "Advanced technology integration",
      ],
    },
    {
      id: "cullinan",
      name: "ROLLS-ROYCE CULLINAN",
      display: "Rolls-Royce Cullinan",
      capacity: 3,
      image: "rolls-royce-cullinan.png",
      models: ["VIP transportation", "Private aviation", "VIP Travel"],
      features: [
        "Ultra-luxury SUV presence",
        "Bespoke handcrafted leather",
        "Exceptional ride quality over any terrain",
        "Iconic Spirit of Ecstasy presence",
      ],
    },
    {
      id: "phantom",
      name: "ROLLS-ROYCE PHANTOM",
      display: "Rolls-Royce Phantom",
      capacity: 3,
      image: "rolls-royce-phantom.png",
      models: ["Weddings", "Red Carpet Events", "Flagship Occasions"],
      features: [
        "Iconic flagship presence",
        "Famous Starlight Headliner",
        "Ultimate rear passenger sanctuary",
        "Unmatched ride refinement",
      ],
    },
  ];
  const vehicles = runtime ? runtime.vehicles : staticVehicles;
  const unavailableVehicle = { id: "", name: "", display: "No vehicle selected", capacity: 1, luggageCapacity: 0, image: "", models: [], features: [] };
  const paths = {
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M16 3v4M8 3v4M3 11h18M7 15h2M12 15h2M7 18h2M12 18h2"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="m8 8 4 4 4-5"/>',
    car: '<path d="m5 7 2-4h10l2 4M3 10l2-3h14l2 3v8H3Z M6 18v3M18 18v3M3 13h18M6 10h2M16 10h2"/>',
    people:
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3ZM16 4a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v2"/>',
    person:
      '<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    luggage:
      '<rect x="5" y="6" width="14" height="14" rx="1"/><path d="M9 6V3h6v3M9 9v8M15 9v8M8 20v2M16 20v2"/>',
    plane:
      '<path d="m22 2-8 8-8-2-2 2 7 4-3 4-4-1-2 2 6 3 3-6 4-3 4 7 2-2-2-8Z"/>',
    case: '<rect x="3" y="7" width="18" height="14" rx="1"/><path d="M8 7V3h8v4M3 12h18M10 11v4h4v-4"/>',
    seat: '<path d="M7 3H4l2 10h9l3 8h3l-4-11H9ZM6 15v6h11M10 5l2 4h5"/>',
    star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    chat: '<path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6l-5 3v-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 8h10M7 12h7"/>',
    clipboard:
      '<rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M9 11h6M9 15h6M9 19h3"/>',
    document: '<path d="M6 2h8l5 5v15H6ZM14 2v6h5M9 12h7M9 16h7"/>',
    edit: '<path d="m4 16 12-13 4 4L8 20l-5 1ZM14 5l4 4M13 21h8"/>',
    shield: '<path d="m12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5Z M8 12l3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 6v1"/>',
    target:
      '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    minus: '<path d="M4 12h16"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    down: '<path d="M12 3v18m-6-6 6 6 6-6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    check: '<path d="m4 12 5 5L20 5"/>',
    circlecheck: '<circle cx="12" cy="12" r="10"/><path d="m8 11 4 4 5-7"/>',
    phone: '<path d="m5 2 4 6-3 3c2 4 3 5 7 7l3-3 6 4-3 4C9 22 2 15 1 5Z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="1"/><path d="m2 5 10 8L22 5"/>',
    globe:
      '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/>',
    dollar:
      '<circle cx="12" cy="12" r="10"/><path d="M12 5v14M16 8h-6a3 3 0 0 0 0 5h4a3 3 0 0 1 0 5H8"/>',
    wallet:
      '<rect x="3" y="6" width="18" height="15" rx="1"/><path d="m3 6 14-4v4M15 12h6v5h-6ZM17 14h1"/>',
  };
  const icon = (name, cls = "") =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
  const e = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (value) =>
    value === null || !Number.isFinite(Number(value)) ? "—" : e(settings.currencySymbol) +
    Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const whole = (value) => value === null || !Number.isFinite(Number(value)) ? "—" : e(settings.currencySymbol) + Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const asset = (path) => {
    if (!path) return "";
    if (!runtime) return "assets/" + path;
    try {
      const url = new URL(path, new URL("assets/", runtime.assetUrl));
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  };
  const safeUrl = (value, fallback = "") => {
    try { const url = new URL(value, location.href); return ["https:", "http:"].includes(url.protocol) ? url.href : fallback; } catch { return fallback; }
  };
  const bags = (vehicle = selected()) => vehicle.luggageCapacity ?? vehicle.capacity;
  const policies = () => runtime
    ? `${settings.termsUrl ? `<a href="${e(safeUrl(settings.termsUrl))}" target="_blank" rel="noopener noreferrer">Terms & Conditions</a>` : "Terms & Conditions"} and ${settings.privacyUrl ? `<a href="${e(safeUrl(settings.privacyUrl))}" target="_blank" rel="noopener noreferrer">Privacy Policy</a>` : "Privacy Policy"}`
    : '<button type="button" class="text-link" data-policy="Terms & Conditions">Terms & Conditions</button> and <button type="button" class="text-link" data-policy="Cancellation Policy">Cancellation Policy</button>';
  const brand = (hero = false) => !runtime || settings.companyName === "TUXANO"
    ? `<img src="${e(asset("tuxano-wordmark.png"))}" alt="${e(settings.companyName)} Private Transportation"${hero ? ' class="brand-logo"' : ""}>`
    : `<strong${hero ? ' class="brand-logo" style="font:500 48px var(--serif);color:white"' : ""}>${e(settings.companyName)}</strong>`;
  const phoneLink = () => settings.supportPhone ? `<a href="tel:${e(settings.supportPhone.replace(/[^+0-9]/g, ""))}">${e(settings.supportPhone)}</a>` : "";
  const supportFooter = () => `<footer class="thank-footer"><div>${brand()}${settings.supportPhone ? `<a href="tel:${e(settings.supportPhone.replace(/[^+0-9]/g, ""))}">${icon("phone")}${e(settings.supportPhone)}</a>` : ""}${settings.supportEmail ? `<a href="mailto:${e(settings.supportEmail)}">${icon("mail")}${e(settings.supportEmail)}</a>` : ""}${settings.website ? `<a href="${e(safeUrl(settings.website))}" target="_blank" rel="noopener noreferrer">${icon("globe")}${e(settings.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : ""}</div></footer>`;
  const defaults = () => ({
    trip: {
      service: "transfer",
      pickup: "",
      dropoff: "",
      date: "",
      time: "",
      hours: Math.min(settings.maxHours, Math.max(settings.minHours, 3)),
      stops: [],
      pickupPlace: null, dropoffPlace: null, pickupQuery: "", dropoffQuery: "",
    },
    vehicle: "",
    passengers: 1,
    luggage: 0,
    flightType: "commercial",
    airline: "",
    flight: "",
    meet: false,
    child: false,
    carSeats: 0,
    boosterSeats: 0,
    gratuity: String(settings.defaultGratuity),
    custom: settings.defaultGratuity,
    inPerson: false,
    special: "",
    billing: {
      first: "",
      last: "",
      email: "",
      phone: "",
      company: "",
      street: "",
      unit: "",
      city: "",
      region: "",
      zip: "",
      country: "United States",
      notes: "",
    },
    passenger: { first: "", last: "", mobile: "", email: "" },
    same: false,
    consent: false,
    completed: 0,
    submitted: false,
    requestId: "",
  });
  const fixture = () => ({
    ...defaults(),
    trip: {
      service: "transfer",
      pickup: "Carol Stream, IL",
      dropoff: "O’Hare International Airport (ORD)",
      date: "2026-09-08",
      time: "06:00",
      hours: 3,
      stops: [],
    },
    vehicle: "luxury",
    passengers: 3,
    luggage: 4,
    airline: "American Airlines",
    flight: "AA1234",
    meet: true,
    child: true,
    carSeats: 2,
    boosterSeats: 1,
    special: "Fiji Water",
    billing: {
      first: "Emily",
      last: "Smith",
      email: "emily@example.com",
      phone: "(312) 555-0182",
      company: "Accurate LLC",
      street: "123 Main St",
      unit: "Suite 200",
      city: "Chicago",
      region: "Illinois",
      zip: "60601",
      country: "United States",
      notes: "Please bill accurate LLC for this ride.",
    },
    passenger: {
      first: "John",
      last: "Smith",
      email: "john@example.com",
      mobile: "(312) 555-0199",
    },
    completed: 4,
  });
  let state = defaults();
  function restoreDraft(saved) {
    const clean = defaults();
    if (!saved || typeof saved !== "object" || Array.isArray(saved))
      return clean;
    for (const [key, value] of Object.entries(clean)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [child, initial] of Object.entries(value)) {
          if (child === "stops") continue;
          if (typeof saved[key]?.[child] === typeof initial)
            clean[key][child] = saved[key][child];
        }
      } else if (typeof saved[key] === typeof value) clean[key] = saved[key];
    }
    const safePlace = (point, fallback) => {
      if (!point || typeof point !== "object" || Array.isArray(point)) return null;
      const text = typeof point.text === "string" ? point.text.slice(0, 1024) : fallback;
      if (typeof point.placeId === "string" && point.placeId.length > 0 && point.placeId.length <= 512) return { placeId: point.placeId, text };
      // A saved device coordinate is not a newly verified current pickup.
      // Keep manually selected Place IDs, but require fresh device confirmation.
      return null;
    };
    clean.trip.pickupQuery = typeof saved.trip?.pickupQuery === "string" ? saved.trip.pickupQuery : clean.trip.pickup;
    clean.trip.dropoffQuery = typeof saved.trip?.dropoffQuery === "string" ? saved.trip.dropoffQuery : clean.trip.dropoff;
    clean.trip.pickupPlace = safePlace(saved.trip?.pickupPlace, clean.trip.pickup);
    clean.trip.dropoffPlace = safePlace(saved.trip?.dropoffPlace, clean.trip.dropoff);
    for (const key of ["pickup", "dropoff"]) {
      const previous = saved.trip?.[key + "Place"];
      if (previous && typeof previous === "object" && !previous.placeId && ("latitude" in previous || "longitude" in previous)) {
        clean.trip[key] = ""; clean.trip[key + "Query"] = "";
        deviceLocation = { status: "error", candidate: null, message: "Your saved device location needs a fresh check. Detect your location again or search for your pickup address." };
      }
    }
    const seen = new Set();
    clean.trip.stops = Array.isArray(saved.trip?.stops) ? saved.trip.stops.slice(0, settings.maxStops).map(stop => {
      if (typeof stop === "string") return makeStop(stop);
      if (!stop || typeof stop !== "object") return makeStop();
      const result = makeStop(typeof stop.text === "string" ? stop.text.slice(0, 1024) : "");
      if (typeof stop.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(stop.id) && !seen.has(stop.id)) result.id = stop.id;
      seen.add(result.id);
      result.query = typeof stop.query === "string" ? stop.query.slice(0, 1024) : result.text;
      result.place = safePlace(stop.place, result.text);
      result.waitMinutes = WAIT_OPTIONS.includes(stop.waitMinutes) ? stop.waitMinutes : 5;
      return result;
    }) : [];
    clean.trip.service = ["transfer", "hourly"].includes(clean.trip.service)
      ? clean.trip.service
      : "transfer";
    clean.vehicle = vehicles.some((v) => v.id === clean.vehicle)
      ? clean.vehicle
      : "";
    clean.flightType = ["commercial", "private"].includes(clean.flightType)
      ? clean.flightType
      : "commercial";
    clean.gratuity = [...gratuities, "custom"].includes(clean.gratuity)
      ? clean.gratuity
      : String(settings.defaultGratuity);
    const integer = (value, min, max, fallback) =>
      Number.isInteger(value) && value >= min && value <= max
        ? value
        : fallback;
    clean.trip.hours = integer(clean.trip.hours, settings.minHours, settings.maxHours, Math.min(settings.maxHours, Math.max(settings.minHours, 3)));
    clean.passengers = integer(clean.passengers, 1, 100, 1);
    for (const name of ["luggage", "carSeats", "boosterSeats"])
      clean[name] = integer(clean[name], 0, 100, 0);
    clean.completed = integer(clean.completed, 0, 4, 0);
    clean.custom =
      Number.isFinite(clean.custom) && clean.custom >= 0 && clean.custom <= 100
        ? clean.custom
        : 20;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(clean.trip.date) ||
      Number.isNaN(new Date(clean.trip.date + "T12:00:00Z").getTime()) ||
      new Date(clean.trip.date + "T12:00:00Z").toISOString().slice(0, 10) !==
        clean.trip.date
    )
      clean.trip.date = "";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clean.trip.time))
      clean.trip.time = "";
    clean.special = clean.special.slice(0, 250);
    clean.billing.notes = clean.billing.notes.slice(0, 500);
    if (!/^TUX-REQUEST-[A-Z0-9-]{1,32}$/i.test(clean.requestId))
      clean.requestId = "";
    return clean;
  }
  try {
    if (runtime) sessionStorage.removeItem(STORAGE);
    else state = restoreDraft(JSON.parse(sessionStorage.getItem(STORAGE) || "null"));
  } catch {
    /* Draft persistence is optional. */
  }
  if (DEMO_MODE) state = fixture();
  const save = () => {
    if (runtime) return; // WordPress drafts and receipts never persist personal information in browser storage.
    try {
      const snapshot = structuredClone(state);
      // Keep only place IDs and the user's own queries across reload. Google
      // formatted addresses, provider attributions, and route metrics stay in memory.
      const persistPlace = (point, query) => point?.placeId ? { placeId: point.placeId, text: query } : point ? { latitude: point.latitude, longitude: point.longitude, text: query } : null;
      if (!DEMO_MODE) {
        for (const key of ["pickup", "dropoff"]) {
          const query = state.trip[key + "Query"] || "";
          const devicePoint = state.trip[key + "Place"] && !state.trip[key + "Place"].placeId;
          snapshot.trip[key] = devicePoint ? "" : query;
          snapshot.trip[key + "Query"] = devicePoint ? "" : query;
          snapshot.trip[key + "Place"] = devicePoint ? null : persistPlace(state.trip[key + "Place"], query);
        }
        snapshot.trip.stops = state.trip.stops.map(stop => ({ id: stop.id, text: stop.query, query: stop.query, waitMinutes: stop.waitMinutes, place: persistPlace(stop.place, stop.query) }));
      }
      sessionStorage.setItem(STORAGE, JSON.stringify(snapshot));
    } catch {
      /* Continue if storage is unavailable. */
    }
  };
  const dirty = () => {
    const hadReceipt = Boolean(receipt);
    receipt = null; requestKey = "";
    state.submitted = false;
    state.requestId = "";
    if (runtime && hadReceipt) invalidateRoute();
  };
  const get = (path) =>
    path.split(".").reduce((obj, part) => obj?.[part], state);
  const set = (path, value) => {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((obj, key) => obj[key], state)[last] = value;
  };
  const selected = () =>
    vehicles.find((v) => v.id === state.vehicle) || vehicles[1] || vehicles[0] || unavailableVehicle;
  const costs = () => {
    if (receipt) return receipt.pricing;
    const v = selected();
    const fare = transportQuote(v);
    const transportation = fare?.transportation ?? null;
    const car = state.child ? state.carSeats : 0,
      booster = state.child ? state.boosterSeats : 0;
    const carCost = car ? settings.firstSeatPrice + (car - 1) * settings.additionalSeatPrice : 0;
    const boosterCost = booster
      ? car
        ? booster * settings.additionalSeatPrice
        : settings.firstSeatPrice + (booster - 1) * settings.additionalSeatPrice
      : 0;
    const percent = state.inPerson
      ? 0
      : state.gratuity === "custom"
        ? Number(state.custom || 0)
        : Number(state.gratuity);
    const tip = transportation === null ? null : Math.round(transportation * percent) / 100;
    const meet = state.meet ? settings.meetPrice : 0;
    return {
      transportation,
      carCost,
      boosterCost,
      seats: carCost + boosterCost,
      meet,
      percent,
      tip,
      total: transportation === null ? null : Math.round((transportation + carCost + boosterCost + meet + tip) * 100) / 100,
      fare,
    };
  };
  const dateLabel = (long = false) =>
    state.trip.date
      ? new Date(state.trip.date + "T12:00:00").toLocaleDateString("en-US", {
          month: long ? "long" : "short",
          day: "numeric",
          year: "numeric",
        })
      : "Select a date";
  const timeLabel = () =>
    state.trip.time
      ? new Date("2000-01-01T" + state.trip.time).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "Select a time";
  const fullDate = () => `${dateLabel()} at ${timeLabel()}`;
  const seatText = () =>
    `${state.child ? state.carSeats : 0} car seats, ${state.child ? state.boosterSeats : 0} booster seat${state.boosterSeats === 1 ? "" : "s"}`;
  const model = () =>
    !runtime && state.vehicle === "luxury"
      ? "Lincoln Navigator or similar"
      : selected().models.at(-1);
  const vehicleImage = () =>
    !runtime && state.vehicle === "luxury" ? "navigator-cutout.png" : selected().image;
  let step = 0;
  const app = document.querySelector("#app");
  const announce = (text) => {
    document.querySelector("#announcement").textContent = text;
  };
  const fieldKey = path => "field-" + path.replace(/[^a-zA-Z0-9_-]/g, "-");
  const field = (
    path,
    label,
    placeholder,
    { type = "text", required = false, cls = "", max = "", list = "" } = {},
  ) => {
    const contact = /^(billing|passenger)\./.test(path);
    const limits = { "billing.first": 100, "billing.last": 100, "billing.email": 254, "billing.phone": 60, "billing.company": 200, "billing.street": 300, "billing.unit": 200, "billing.city": 120, "billing.region": 120, "billing.zip": 40, "passenger.first": 100, "passenger.last": 100, "passenger.mobile": 60, "passenger.email": 254 };
    const maximum = max || limits[path] || "";
    const id = fieldKey(path);
    const message = fieldErrors.get(path) || "";
    const input = `<input class="input ${cls}${message ? " field-invalid" : ""}" type="${type}" name="${path}" data-field="${path}" ${contact ? `id="${id}" aria-invalid="${Boolean(message)}"${message ? ` aria-describedby="${id}-error"` : ""}` : ""} aria-label="${label}" placeholder="${e(placeholder)}" value="${e(get(path))}" ${required ? "required" : ""} ${maximum ? `maxlength="${maximum}"` : ""} ${list ? `list="${list}"` : ""} autocomplete="${{ "billing.first": "given-name", "billing.last": "family-name", "billing.email": "email", "billing.phone": "tel", "billing.street": "address-line1", "billing.unit": "address-line2", "billing.city": "address-level2", "billing.region": "address-level1", "billing.zip": "postal-code", "passenger.first": "given-name", "passenger.last": "family-name", "passenger.mobile": "tel", "passenger.email": "email" }[path] || "off"}">`;
    return contact ? `<div class="form-field"><label class="field-caption" for="${id}">${e(label)}${required ? ' <span aria-hidden="true">*</span>' : ' <span class="field-optional">(optional)</span>'}</label>${input}<p class="field-error" id="${id}-error" ${message ? "" : "hidden"}>${e(message)}</p></div>` : input;
  };
  const textarea = (path, label, placeholder, max) =>
    `<div class="textarea-wrap"><textarea class="input" data-field="${path}" aria-label="${label}" placeholder="${e(placeholder)}" maxlength="${max}">${e(get(path))}</textarea><span class="char-count" data-counter="${path}">${get(path).length}/${max}</span></div>`;
  const toggle = (name, label) =>
    `<label class="toggle"><input type="checkbox" data-field="${name}" aria-label="${label}" ${get(name) ? "checked" : ""}><span></span></label>`;
  const section = (num, title, symbol, helper = "") =>
    `<div class="section-heading"><span class="round-icon">${icon(symbol)}</span><div><h3>${num}. ${title}</h3>${helper ? `<p>${helper}</p>` : ""}</div></div>`;
  const panelHeader = (num, title, symbol, subtitle) =>
    `<header class="panel-header"><span class="tile">${icon(symbol)}</span><div><h2><span>${num} – </span>${title}</h2><p>${subtitle}</p></div></header>`;
  const nav = (next, submit = false) =>
    `<div class="form-nav"><button class="btn secondary" type="button" data-action="back">${icon("back")} BACK</button><button class="btn primary" type="${submit ? "submit" : "button"}" ${submit ? "" : 'data-action="next"'}>${next}</button></div>`;
  const qty = (key, label, value, max, min = 0) =>
    `<div class="quantity" role="group" aria-label="${label}"><button type="button" data-count="${key}" data-delta="-1" aria-label="Decrease ${label}" ${value <= min ? "disabled" : ""}>${icon("minus")}</button><output>${value}</output><button type="button" data-count="${key}" data-delta="1" aria-label="Increase ${label}" ${value >= max ? "disabled" : ""}>${icon("plus")}</button></div>`;
  const security = () =>
    `<div class="security">${icon("shield")}<div><strong>Secure & Confidential</strong><p>Your information is encrypted and handled securely.</p></div></div>`;
  const total = () =>
    `<div class="total"><h4>ESTIMATED TOTAL</h4><strong data-testid="estimated-total">${money(costs().total)}</strong><p>All-Inclusive (${e(settings.currency)})</p></div>`;
  const lines = (compact = false) => {
    const c = costs();
    return `<div class="price-lines"><div><span>Transportation${compact ? `<span class="desktop-copy"> (${e(selected().display)})</span>` : ""}</span><strong>${money(c.transportation)}</strong></div><div><span>Meet & Greet</span><strong>${money(c.meet)}</strong></div><div><span>Child Seats${compact ? ` <span class="seat-detail">(${seatText()})</span>` : `<small>${seatText()}</small>`}</span><strong>${money(c.seats)}</strong></div><div><span>${compact ? '<span class="desktop-copy">Chauffeur </span>' : ""}Gratuity (${c.percent}%)</span><strong>${money(c.tip)}</strong></div></div>`;
  };
  const summary = () =>
    `<aside class="panel trip-summary" aria-label="Your trip summary"><div class="summary-heading"><h3>YOUR TRIP SUMMARY</h3><button type="button" data-go="0">${step === 3 ? '<span class="desktop-copy">EDIT</span><span class="mobile-copy">Edit</span>' : "Edit"} ${icon("edit")}</button></div><div class="route-summary"><p>${icon("pin")}${e(state.trip.pickup)}</p>${icon("down")}<p>${icon("pin")}${e(state.trip.dropoff || "Hourly service")}</p><p>${icon("calendar")}<span>${dateLabel()}<span class="combined-time"> at ${timeLabel()}</span></span></p><p class="separate-time">${icon("clock")}${timeLabel()}</p>${state.trip.service === "hourly" ? `<p>${icon("clock")}${state.trip.hours} hours</p>` : ""}${usableRoute() ? `<div class="summary-route-estimate">${routeDetails()}</div>` : `<p class="route-status">${e(routeStatus === "error" ? routeMessage : "Route estimate is being refreshed…")}</p>`}</div><div class="summary-vehicle"><h3>VEHICLE SELECTED</h3><div class="small-vehicle">${selected().image ? `<img src="${e(asset(!runtime && state.vehicle === "luxury" ? "navigator-summary.png" : selected().image))}" alt="${e(selected().display)}">` : ""}<div><strong>${e(selected().display)}</strong><p>${e(model())}</p></div></div><div class="capacities">${icon("people")}<span><span class="desktop-copy">Up to </span>${selected().capacity} Passengers</span>${icon("luggage")}<span><span class="desktop-copy">Up to </span>${bags()} Bags</span></div></div><div class="summary-prices"><h3>TRIP DETAILS</h3>${lines()}</div>${total()}${security()}</aside>`;
  const nextSteps = () =>
    `<aside class="next-card"><h3><span class="round-icon">${icon("circlecheck")}</span>WHAT HAPPENS NEXT</h3><ol><li>We review availability and trip details.</li><li>You’ll receive an email with confirmation details and any payment instructions.</li><li>Once confirmed, your reservation is secured.</li></ol><p>Reservation requests are typically reviewed within 2–4 business hours.</p></aside>`;
  const header = () =>
    `<header class="page-header"><h1>RESERVATION REQUEST</h1><p>Complete the form below to request your executive transportation.</p><nav class="progress" aria-label="Reservation steps"><ol>${labels.map((label, i) => `<li class="${step === i ? "active" : ""}"><button type="button" data-go="${i}" aria-label="Step ${i + 1}: ${label}" ${i > state.completed ? "disabled" : ""} ${step === i ? 'aria-current="step"' : ""}><span class="step-circle">${i + 1}</span><span class="step-label">${label}</span></button></li>`).join("")}</ol></nav></header>`;

  const selectedPoint = (point, value) => Boolean(point && point.text === value && (point.placeId || Number.isFinite(point.latitude) && Number.isFinite(point.longitude)));
  const deviceBusy = () => ["locating", "resolving"].includes(deviceLocation.status);
  const accuracyLabel = meters => meters === 0 ? "under 1 m" : meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.ceil(meters)} m`;
  const mapFieldLabel = fieldId => fieldId.startsWith("stop:") ? `stop ${state.trip.stops.findIndex(stop => stop.id === fieldId.slice(5)) + 1}` : fieldId === "dropoff" ? "drop-off" : "pickup";
  const mapFieldPoint = fieldId => fieldId.startsWith("stop:") ? state.trip.stops.find(stop => stop.id === fieldId.slice(5))?.place : state.trip[fieldId + "Place"];
  const mapTarget = () => deviceLocation.fieldId || "pickup";
  function deviceLocationMarkup(fieldId = "pickup") {
    if (deviceLocation.status === "idle" || (deviceLocation.status === "map" ? mapTarget() !== fieldId : fieldId !== "pickup")) return "";
    if (deviceLocation.status === "map") {
      const label = mapFieldLabel(fieldId), searchId = fieldId === "pickup" ? "pickup-map-search" : "map-search-" + fieldId.replace(/[^a-zA-Z0-9_-]/g, "-");
      return `<section class="device-location-panel pickup-map-picker" data-map-picker data-testid="${fieldId === "pickup" ? "pickup-map-picker" : e(fieldId.replace(":", "-") + "-map-picker")}" aria-label="Choose ${label} on map"><h4>CHOOSE ${label.toUpperCase()} ON MAP</h4><p>Search to preview an address, then use this map point to add it. You can also choose a suggestion or move the pin before confirming.</p><label class="map-search-label" for="${searchId}">Search map for ${label}</label><div class="location-input"><input id="${searchId}" class="input" data-map-search aria-label="Search map for ${label}" placeholder="Search city, address or landmark" autocomplete="off"></div><p data-map-status role="status">Loading Google Maps…</p><div class="pickup-map-frame"><div data-pickup-map data-location-map class="pickup-map-canvas" aria-label="${label} point map"></div><span class="pickup-map-pin" aria-hidden="true">${icon("pin")}</span></div><div data-map-selection aria-live="polite"></div><div class="device-location-actions"><button type="button" class="btn primary" data-action="use-map-location" disabled>Use this map point</button><button type="button" class="text-link" data-action="choose-map" data-map-field="${e(fieldId)}">Reload map</button><button type="button" class="text-link" data-action="cancel-device-location">Cancel map selection</button></div></section>`;
    }
    const candidate = deviceLocation.candidate;
    const url = candidate ? googlePlaceUrl(candidate) : "";
    return `<section class="device-location-panel" data-testid="device-location-preview" aria-label="Check detected pickup location"><h4>${deviceBusy() ? "CHECKING YOUR LOCATION" : "CHECK DETECTED PICKUP"}</h4><p class="device-location-message" role="status">${e(deviceLocation.message)}</p>${candidate ? `<p class="device-location-context">${e(candidate.text)}</p><dl><div><dt>Detected coordinates</dt><dd>${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}</dd></div><div><dt>Reported accuracy</dt><dd>Within ${accuracyLabel(candidate.accuracyMeters)}</dd></div></dl>${url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">View detected location in Google Maps</a>` : ""}${candidate.nearbyName ? `<div class="route-provider"><span class="google-maps-attribution" translate="no">Google Maps</span><span>Nearby landmark, not an exact pickup address.</span></div>${attributionsMarkup(candidate.attributions || [])}` : ""}` : ""}<div class="device-location-actions">${deviceLocation.status === "ready" && candidate?.precise ? '<button type="button" class="btn primary" data-action="use-device-location">Use this pickup location</button>' : ""}<button type="button" class="${candidate?.precise ? "text-link" : "btn primary"}" data-action="choose-pickup-map">Choose pickup on map</button>${!deviceBusy() ? '<button type="button" class="text-link" data-action="locate">Try location again</button>' : ""}<button type="button" class="text-link" data-action="cancel-device-location">Cancel location detection</button></div></section>`;
  }
  function refreshDeviceLocation() {
    pickupMapCleanup?.(); pickupMapCleanup = null;
    app.querySelectorAll("[data-map-wrap]").forEach(box => { box.innerHTML = deviceLocationMarkup(box.dataset.mapWrap); });
    app.querySelectorAll(".location-map-open").forEach(button => { button.hidden = deviceLocation.status !== "idle" && (deviceLocation.status === "map" ? button.dataset.mapField === mapTarget() : button.dataset.mapField === "pickup"); });
    const button = app.querySelector('[data-action="locate"].location-target');
    if (button) { button.disabled = deviceBusy(); button.setAttribute("aria-busy", String(deviceBusy())); }
    mountDeviceMap();
  }
  function refreshMapSelection() {
    const panel = app.querySelector('[data-map-picker]');
    if (!panel || deviceLocation.status !== "map") return;
    const candidate = deviceLocation.candidate || deviceLocation.mapPreview;
    const previewOnly = !deviceLocation.candidate && Boolean(deviceLocation.mapPreview);
    panel.querySelector('[data-action="use-map-location"]').disabled = !candidate;
    panel.querySelector('[data-map-selection]').innerHTML = candidate ? `<p class="device-location-context">${e(candidate.text)}</p><p>${previewOnly ? "Previewed address — not yet added" : candidate.placeId ? "Address shown on map" : "Selected pin"}: ${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}. Check the surroundings, then use this map point to confirm.</p><a href="${e(googlePlaceUrl(candidate))}" target="_blank" rel="noopener noreferrer">View ${previewOnly ? "previewed" : "selected"} ${candidate.placeId ? "place" : "pin"} in Google Maps</a>${candidate.nearbyName ? `<p>Nearby landmark, not an exact address.</p>${attributionsMarkup(candidate.attributions || [])}` : ""}${candidate.placeId && !previewOnly ? attributionsMarkup(candidate.attributions || []) : ""}` : '<p>No point selected yet. Search for an address, choose a suggestion, or tap the map.</p>';
  }
  function assignLocation(fieldId, place) {
    if (fieldId.startsWith("stop:")) {
      const stop = state.trip.stops.find(item => item.id === fieldId.slice(5));
      if (!stop) return false;
      stop.text = place.text; stop.query = place.text; stop.place = place;
    } else {
      state.trip[fieldId] = place.text; state.trip[fieldId + "Query"] = place.text; state.trip[fieldId + "Place"] = place;
    }
    return true;
  }
  function countryConflictForField(fieldId) {
    if (fieldId === "pickup") return "";
    try { assertSameCountry([state.trip.pickupPlace, mapFieldPoint(fieldId)]); return ""; } catch (failure) { return failure.message; }
  }
  function countryConflict() {
    try { assertSameCountry([state.trip.pickupPlace, ...state.trip.stops.map(stop => stop.place), state.trip.dropoffPlace]); return ""; } catch (failure) { return failure.message; }
  }
  function commitMapPlace(fieldId, place, generation) {
    if (generation !== locationGeneration || deviceLocation.status !== "map" || mapTarget() !== fieldId) return;
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return;
    try { if (fieldId !== "pickup") assertSameCountry([state.trip.pickupPlace, place]); } catch (failure) { announce(failure.message); return; }
    cancelDeviceLocation(); dirty(); invalidateRoute();
    if (!assignLocation(fieldId, { ...place, confirmedAt: Date.now() })) return;
    save(); render(); calculateRoute();
    app.querySelector(`[data-place-field="${CSS.escape(fieldId)}"]`)?.focus({ preventScroll: true });
    announce(`${mapFieldLabel(fieldId)} selected from Google Maps.`);
  }
  function mountDeviceMap() {
    const panel = app.querySelector('[data-map-picker]');
    if (!panel || deviceLocation.status !== "map") return;
    // A remounted picker must resolve its own preview before enabling use;
    // an old search area does not describe the new map's visible center.
    deviceLocation.mapPreview = null;
    const generation = locationGeneration, fieldId = mapTarget();
    pickupMapCleanup = mountPickupMap(panel, {
      client: maps, fieldId, label: mapFieldLabel(fieldId),
      countryCode: fieldId === "pickup" ? "" : () => countryCodeOf(state.trip.pickupPlace?.countryCode),
      initial: deviceLocation.candidate || deviceLocation.mapInitial,
      onPick: candidate => {
        if (generation !== locationGeneration || deviceLocation.status !== "map" || mapTarget() !== fieldId) return;
        deviceLocation.candidate = candidate;
        if (candidate) deviceLocation.mapPreview = null;
        refreshMapSelection();
      },
      onPreview: preview => {
        if (generation !== locationGeneration || deviceLocation.status !== "map" || mapTarget() !== fieldId) return;
        deviceLocation.mapPreview = preview;
        if (preview) deviceLocation.candidate = null;
        refreshMapSelection();
      },
    });
    refreshMapSelection();
  }
  function choosePickupMap(fieldId = "pickup") {
    if (fieldId.startsWith("stop:") && !state.trip.stops.some(stop => stop.id === fieldId.slice(5))) return;
    const initial = (mapTarget() === fieldId ? deviceLocation.candidate : null) || mapFieldPoint(fieldId);
    ++locationGeneration;
    deviceLocation = { status: "map", fieldId, candidate: null, mapInitial: initial, message: "" };
    refreshDeviceLocation();
  }
  function useMapLocation() {
    if (deviceLocation.status !== "map") return;
    const candidate = pickupMapCleanup?.confirmSelection?.(), fieldId = mapTarget(), generation = locationGeneration;
    if (!candidate) { announce("Wait for the map to finish moving, then confirm the displayed address or choose a map point."); return; }
    if (deviceLocation.status !== "map" || !["map", "map-place"].includes(candidate?.source) || !Number.isFinite(candidate.latitude) || Math.abs(candidate.latitude) > 90 || !Number.isFinite(candidate.longitude) || Math.abs(candidate.longitude) > 180) return;
    commitMapPlace(fieldId, candidate, generation);
  }
  function cancelDeviceLocation() {
    ++locationGeneration;
    deviceLocation = { status: "idle", candidate: null, message: "" };
    refreshDeviceLocation();
  }
  async function detectDeviceLocation() {
    const generation = ++locationGeneration, navigation = navigationGeneration, originalState = state;
    const pickupBefore = state.trip.pickup;
    const current = () => generation === locationGeneration && navigation === navigationGeneration && state === originalState && step === 0 && state.trip.pickup === pickupBefore;
    deviceLocation = { status: "locating", candidate: null, message: "Requesting a fresh, high-accuracy device location. Your pickup stays unchanged until you confirm." };
    refreshDeviceLocation();
    try {
      const point = await requestDeviceLocation();
      if (!current()) return;
      const candidate = { ...point, text: "Detected coordinates — address unavailable", attributions: [] };
      if (!point.precise) {
        deviceLocation = { status: "coarse", candidate, message: `Your browser only provided an approximate position (within ${accuracyLabel(point.accuracyMeters)}). Automatic pickup needs accuracy within ${DEVICE_LOCATION_POLICY.maxAccuracyMeters} m. On a PC this may be an estimate in another city. Choose pickup on map below to search your correct city and set an exact pin, or enter your address above.` };
        refreshDeviceLocation(); return;
      }
      deviceLocation = { status: "resolving", candidate, message: "Finding a nearby landmark. Check the detected pin and address before using this pickup." };
      refreshDeviceLocation();
      let description, lookupFailed = false;
      try { description = await maps.describeDeviceLocation(point); } catch { lookupFailed = true; }
      if (!current()) return;
      if (description?.nearbyName) {
        candidate.nearbyName = description.nearbyName;
        candidate.text = `Near ${description.nearbyName}${description.nearbyAddress ? `, ${description.nearbyAddress}` : ""} (device location)`;
        candidate.attributions = description.attributions;
      }
      deviceLocation = { status: "ready", candidate, message: description?.nearbyName ? "This is your device's estimate. Check the city, nearby landmark and map pin. Use it only if this is your intended pickup." : `${lookupFailed ? "Nearby landmark lookup is unavailable." : "No nearby address was found."} The coordinates are still your device's estimate. Check the pin on Google Maps or search for your pickup address.` };
      refreshDeviceLocation();
    } catch (failure) {
      if (!current()) return;
      deviceLocation = { status: "error", candidate: null, message: failure.message || "Your device could not determine a reliable location. Please search for your pickup address." };
      refreshDeviceLocation();
    }
  }
  function useDeviceLocation() {
    const candidate = deviceLocation.candidate;
    if (deviceLocation.status !== "ready" || !candidate) return;
    try {
      const fresh = normalizeDevicePosition({ coords: { latitude: candidate.latitude, longitude: candidate.longitude, accuracy: candidate.accuracyMeters }, timestamp: candidate.capturedAt });
      if (!fresh.precise) throw new Error("This position is not precise enough. Please search for your pickup address.");
    } catch (failure) {
      deviceLocation = { status: "error", candidate, message: failure.message };
      refreshDeviceLocation(); return;
    }
    cancelDeviceLocation(); dirty(); invalidateRoute();
    state.trip.pickup = candidate.text;
    state.trip.pickupQuery = `${candidate.latitude}, ${candidate.longitude}`;
    state.trip.pickupPlace = { ...candidate, source: "device", confirmedAt: Date.now() };
    save(); render(); calculateRoute();
    app.querySelector('[data-place-field="pickup"]')?.focus();
    announce("Detected pickup confirmed. The route uses your original device coordinates.");
  }
  function selectedLocationMarkup(fieldId) {
    if (DEMO_MODE || restoringPlaces) return "";
    const stopIndex = fieldId.startsWith("stop:") ? state.trip.stops.findIndex(stop => stop.id === fieldId.slice(5)) : -1;
    const stop = state.trip.stops[stopIndex];
    const point = stop ? stop.place : state.trip[fieldId + "Place"];
    const value = stop ? stop.text : state.trip[fieldId];
    if (!selectedPoint(point, value)) return "";
    const label = stop ? `stop ${stopIndex + 1}` : `${fieldId} location`;
    const url = googlePlaceUrl(point);
    return `<span class="selected-location-label">Selected ${e(label)}</span><span class="selected-location-address">${e(point.text)}</span>${point.source === "device" ? `<span class="selected-location-label">Device coordinates: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} · accuracy within ${accuracyLabel(point.accuracyMeters)}. Confirmed ${e(new Date(point.confirmedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }))}.</span>` : point.source === "map" ? `<span class="selected-location-label">Manually selected map point: ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}. Nearby names are approximate context.</span>` : ""}${url ? `<a href="${e(url)}" target="_blank" rel="noopener noreferrer" aria-label="View selected ${e(label)} in Google Maps">View place in Google Maps</a>` : ""}`;
  }
  function selectedLocationBox(fieldId) {
    const content = selectedLocationMarkup(fieldId);
    return `<div class="selected-location" data-selected-place="${e(fieldId)}" ${content ? "" : "hidden"}>${content}</div>`;
  }
  function refreshSelectedLocations() {
    app.querySelectorAll("[data-selected-place]").forEach(box => {
      const content = selectedLocationMarkup(box.dataset.selectedPlace);
      box.innerHTML = content; box.hidden = !content;
    });
  }
  function routeComparison() {
    if (DEMO_MODE || !usableRoute()) return "";
    const links = googleRouteLinks([state.trip.pickupPlace, ...state.trip.stops.map(stop => stop.place), state.trip.dropoffPlace]);
    return links.length ? `<div class="route-comparison">${links.map((url, i) => `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">View ${links.length > 1 ? `route part ${i + 1}` : "route"} in Google Maps</a>`).join("")}${links.length > 1 ? "<p>All stops are included. Open each route part to check the full journey.</p>" : ""}</div>` : "";
  }
  const routeRequest = () => {
    if (restoringPlaces || countryConflict()) return null;
    const trip = state.trip;
    if (!selectedPoint(trip.pickupPlace, trip.pickup) || !selectedPoint(trip.dropoffPlace, trip.dropoff) || trip.stops.some(stop => !selectedPoint(stop.place, stop.text))) return null;
    const waypoint = point => point.placeId ? { placeId: point.placeId } : { latitude: point.latitude, longitude: point.longitude };
    return { origin: waypoint(trip.pickupPlace), destination: waypoint(trip.dropoffPlace), stops: trip.stops.map(stop => waypoint(stop.place)) };
  };
  const routeSignature = () => { const request = routeRequest(); return request ? JSON.stringify(request) : ""; };
  const waitingMinutes = () => state.trip.stops.reduce((sum, stop) => sum + stop.waitMinutes, 0);
  const usableRoute = () => currentRoute && currentRoute.signature === routeSignature() ? currentRoute : null;
  function transportQuote(vehicle = selected()) {
    const route = usableRoute();
    if (!route) return null;
    if (runtime && !vehicle.tariff) return null;
    return quoteTransportation(vehicle.id, route, waitingMinutes(), state.trip.service, state.trip.hours, runtime ? vehicle.tariff : null, settings);
  }
  const stopDescription = () => state.trip.stops.map(stop => `${stop.text} (${stop.waitMinutes} min stop)`).join(" → ");
  function routeDetails(full = false) {
    const route = usableRoute();
    const travel = route ? formatDuration(route.durationSeconds + waitingMinutes() * 60) : "";
    const status = restoringPlaces ? "Restoring selected locations…" : routeStatus === "loading" ? "Calculating driving route…" : routeStatus === "error" ? routeMessage : route ? "" : "Select pickup, drop-off, and any stops from the location suggestions.";
    const hasGooglePlace = [state.trip.pickupPlace, state.trip.dropoffPlace, ...state.trip.stops.map(stop => stop.place)].some(point => point?.placeId || point?.nearbyName);
    if (full && !route && routeStatus !== "loading" && routeStatus !== "error" && !restoringPlaces) {
      const attribution = hasGooglePlace && !DEMO_MODE ? `<div class="route-provider"><span class="google-maps-attribution" translate="no">Google Maps</span></div>${providerAttributions()}` : "";
      const policyLinks = runtime ? `<p class="maps-policies">${policies()}</p>` : '<p class="maps-policies"><a href="terms.html" target="_blank" rel="noopener">Terms of Use</a><span> · </span><a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a></p>';
      return attribution + policyLinks;
    }
    const previewNote = full && maps.previewExpiresAt ? `<p class="test-session-note">Temporary live test · Route server available until ${e(new Date(maps.previewExpiresAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))}.</p>` : '';
    return `${previewNote}${full && route ? `<label class="travel-time-label"><span class="label">TRAVEL TIME</span><input class="input travel-time" aria-label="Travel time" readonly placeholder="Calculated from your route" value="${travel}"></label>` : ""}${status ? `<div class="route-status ${routeStatus === "error" ? "route-error" : routeStatus === "loading" ? "route-loading" : ""}" role="${routeStatus === "error" ? "alert" : "status"}" ${routeStatus === "loading" ? 'aria-busy="true"' : ""}>${e(status)}${routeStatus === "error" ? '<button type="button" class="text-link" data-action="retry-route">Try again</button>' : ""}</div>` : ""}${route ? `<div class="route-metrics" aria-label="Journey estimate"><div><span>Distance</span><strong data-testid="route-distance">${(route.distanceMeters / 1000).toFixed(1)} km / ${(route.distanceMeters / 1609.344).toFixed(1)} mi</strong></div><div><span>Driving time</span><strong data-testid="driving-duration">${formatDuration(route.durationSeconds)}</strong></div><div><span>Stop waiting</span><strong data-testid="stop-wait-duration">${waitingMinutes()} min</strong></div><div><span>Total journey</span><strong data-testid="total-duration">${travel}</strong></div></div>` : ""}${DEMO_MODE ? '<div class="route-provider">Example route · sample metrics</div>' : hasGooglePlace || route ? `<div class="route-provider"><span class="google-maps-attribution" translate="no">Google Maps</span>${route ? '<span>Baseline driving estimate. Live traffic and pickup date/time are not included.</span>' : ''}</div>${providerAttributions()}` : ''}${routeComparison()}${full ? runtime ? `<p class="maps-policies">${policies()}</p>` : '<p class="maps-policies"><a href="terms.html" target="_blank" rel="noopener">Terms of Use</a><span> · </span><a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a></p>' : ''}`;
  }
  function providerAttributions() {
    const points = [state.trip.pickupPlace, state.trip.dropoffPlace, ...state.trip.stops.map(stop => stop.place)];
    return attributionsMarkup(points.flatMap(point => point?.attributions || []));
  }
  function attributionsMarkup(entries) {
    return entries.length ? `<div class="place-providers">${entries.map(a => { let url; try { url = new URL(a.uri); } catch { return e(a.displayName); } return url.protocol === "https:" ? `<a href="${e(url.href)}" target="_blank" rel="noopener noreferrer">${e(a.displayName)}</a>` : e(a.displayName); }).join(" · ")}</div>` : "";
  }
  function refreshRoutePanel() {
    refreshSelectedLocations();
    const box = app.querySelector(".route-live");
    if (box) box.innerHTML = routeDetails(true);
  }
  function invalidateRoute() {
    ++routeGeneration; routeController?.abort(); routeController = null; routePromise = null; currentRoute = null; routeStatus = "idle"; routeMessage = "";
    refreshRoutePanel();
  }
  async function calculateRoute() {
    const conflict = countryConflict();
    if (conflict) {
      ++routeGeneration; routeController?.abort(); routePromise = null; currentRoute = null;
      routeStatus = "error"; routeMessage = conflict; refreshRoutePanel(); updateValidity();
      app.querySelectorAll('[data-place-field]:not([data-place-field="pickup"])').forEach(control => { if (countryConflictForField(control.dataset.placeField)) paintFieldValidation(control); });
      return false;
    }
    const request = routeRequest(), signature = routeSignature();
    if (!request) { routeStatus = "idle"; refreshRoutePanel(); return false; }
    if (usableRoute()) return true;
    if (routePromise && routeStatus === "loading") return routePromise;
    const generation = ++routeGeneration;
    routeController?.abort(); routeController = new AbortController();
    routeStatus = "loading"; routeMessage = ""; refreshRoutePanel();
    routePromise = (async () => {
      try {
        const result = DEMO_MODE ? { distanceMeters: 32186.88, durationSeconds: 1800, provider: "demo" } : await maps.route(request, routeController.signal);
        if (generation !== routeGeneration || signature !== routeSignature()) return false;
        currentRoute = { ...result, signature }; routeStatus = "ready"; routeMessage = "";
        if (step === 0) refreshRoutePanel(); else render();
        return true;
      } catch (failure) {
        if (generation !== routeGeneration || failure.name === "AbortError") return false;
        currentRoute = null; routeStatus = "error"; routeMessage = failure.message || "The driving route could not be calculated. Please try again.";
        if (step === 0) refreshRoutePanel(); else render();
        return false;
      } finally { if (generation === routeGeneration) routePromise = null; }
    })();
    return routePromise;
  }
  function mountPlaces() {
    app.querySelectorAll("[data-place-field]").forEach(input => {
      const fieldId = input.dataset.placeField;
      autocompleteCleanups.push(mountAutocomplete(input, { client: maps, fieldId, countryCode: fieldId === "pickup" ? "" : () => countryCodeOf(state.trip.pickupPlace?.countryCode), onSelect: place => {
        dirty(); invalidateRoute();
        if (fieldId.startsWith("stop:")) {
          const stop = state.trip.stops.find(item => item.id === fieldId.slice(5));
          if (!stop) return;
          stop.text = place.text; stop.place = place;
        } else { if (fieldId === "pickup") cancelDeviceLocation(); state.trip[fieldId] = place.text; state.trip[fieldId + "Place"] = place; }
        input.value = place.text;
        updateValidity();
        if (input.getAttribute("aria-invalid") === "true") paintFieldValidation(input);
        save(); refreshRoutePanel(); calculateRoute();
      }, onError: message => announce(message) }));
    });
  }
  async function restoreLocations() {
    const originalState = state;
    const points = [
      ...["pickup", "dropoff"].map(key => ({ point: state.trip[key + "Place"], current: () => state.trip[key + "Place"], apply: place => { state.trip[key + "Place"] = place; if (place) state.trip[key] = place.text; } })),
      ...state.trip.stops.map(stop => ({ point: stop.place, current: () => state.trip.stops.find(item => item.id === stop.id)?.place, apply: place => { stop.place = place; if (place) stop.text = place.text; } })),
    ].filter(item => item.point?.placeId);
    if (!points.length) { calculateRoute(); return; }
    restoringPlaces = true; refreshRoutePanel();
    let failed = false;
    await Promise.all(points.map(async item => {
      try {
        const place = await maps.restore(item.point.placeId);
        if (state === originalState && item.current() === item.point) item.apply(place);
      } catch {
        if (state === originalState && item.current() === item.point) { item.apply(null); failed = true; }
      }
    }));
    if (state !== originalState) return;
    restoringPlaces = false;
    if (failed) {
      dirty(); state.completed = 0; save();
      if (step !== 0) go(0); else render();
      error("Your saved locations could not be restored. Please select them again from the Google Maps suggestions.");
    } else { save(); render(); calculateRoute(); }
  }
  // Step 1: selected Google places, ordered stopovers, separate pickup clock time,
  // and an automatic driving + waiting duration.
  function tripPage() {
    const mapControls = fieldId => DEMO_MODE ? "" : `<button type="button" class="text-link location-map-open${fieldId === "pickup" ? " pickup-map-open" : ""}" data-action="choose-map" data-map-field="${e(fieldId)}" ${deviceLocation.status !== "idle" && (deviceLocation.status === "map" ? mapTarget() === fieldId : fieldId === "pickup") ? "hidden" : ""}>Choose ${mapFieldLabel(fieldId)} on map</button><div class="location-map-wrap${fieldId === "pickup" ? " device-location-wrap" : ""}" data-map-wrap="${e(fieldId)}">${deviceLocationMarkup(fieldId)}</div>`;
    const locationInput = (path, label, placeholder, target = false) => `<div class="location-input">${icon("pin")}${field("trip." + path, label, placeholder, { required: true }).replace("<input ", `<input data-place-field="${path}" `)}${target ? `<button type="button" class="location-target" data-action="locate" aria-label="Use current location" ${deviceBusy() ? 'disabled aria-busy="true"' : ""}>${icon("target")}</button>` : ""}</div>${selectedLocationBox(path)}${mapControls(path)}`;
    const picker = (path, label, symbol, value, type) => `<label class="picker-field"><span class="label">${label.toUpperCase()}</span><span class="picker-box">${icon(symbol)}<span data-display="${path}">${value}</span>${field(path, label, "", { type, required: true })}</span></label>`;
    return `<form id="booking-form" class="panel trip-panel" data-step="1">${panelHeader(1, "TRIP", "calendar", "Tell us where and when you need service.")}<div class="field-block"><span class="label">SERVICE TYPE</span><div class="segments service-choice"><button type="button" data-service="transfer" aria-pressed="${state.trip.service === "transfer"}">TRANSFER</button><button type="button" data-service="hourly" aria-pressed="${state.trip.service === "hourly"}">HOURLY</button></div></div><div class="field-block"><label class="label" for="pickup">PICKUP LOCATION</label>${locationInput("pickup", "Pickup location", "Enter pickup location", true)}<p class="helper">${icon("info")}Search by address, hotel, airport, or landmark${DEMO_MODE ? "" : ". Include the city and choose the exact place."}</p></div><div class="stop-list">${state.trip.stops.map((stop, index) => `<div class="stop-field"><label class="label" for="${e(stop.id)}">STOP ${index + 1}</label><div class="stop-row"><div class="location-input">${icon("pin")}<input id="${e(stop.id)}" class="input" data-place-field="stop:${e(stop.id)}" data-stop="${e(stop.id)}" aria-label="Stop ${index + 1}" placeholder="Enter stop location" value="${e(stop.text)}" required autocomplete="off"></div><button type="button" class="remove-stop" data-remove-stop="${e(stop.id)}" aria-label="Remove stop ${index + 1}">×</button></div>${selectedLocationBox("stop:" + stop.id)}${mapControls("stop:" + stop.id)}<label class="stop-wait-label">Stop waiting time<select class="input" aria-label="Stop ${index + 1} wait time" data-stop-wait="${e(stop.id)}">${WAIT_OPTIONS.map(value => `<option value="${value}" ${value === stop.waitMinutes ? "selected" : ""}>${value} minutes</option>`).join("")}</select></label><p class="stop-wait-note">Waiting adds a charge based on your vehicle class.</p></div>`).join("")}</div><button type="button" class="add-stop" data-action="add-stop" ${state.trip.stops.length >= settings.maxStops ? "disabled" : ""}>${icon("plus")}Add stop</button><div class="field-block"><label class="label">DROP-OFF LOCATION</label>${locationInput("dropoff", "Drop-off location", "Enter drop-off location")}</div>${state.trip.service === "hourly" ? `<div class="field-block"><label class="label" for="hours">NUMBER OF HOURS</label><select id="hours" class="input" aria-label="Hours" data-field="trip.hours">${Array.from({length:settings.maxHours - settings.minHours + 1}, (_,i) => i + settings.minHours).map(hours => `<option value="${hours}" ${hours === state.trip.hours ? "selected" : ""}>${hours} hours</option>`).join("")}</select></div>` : ""}<div class="field-grid date-time">${picker("trip.date", "Date", "calendar", dateLabel(), "date")}${picker("trip.time", "Pickup time", "clock", timeLabel(), "time")}</div>${runtime ? `<p class="route-status">Pickup dates and times use ${e(settings.timezone || "the website timezone")}.</p>` : ""}<div class="route-live" aria-live="polite">${routeDetails(true)}</div><div class="form-error" role="alert" hidden></div><button class="btn primary check-price" type="submit">CHECK PRICE</button></form>`;
  }

  // Step 2: all six vehicle classes, using the original supplied pictures.
  function vehicleCard(v) {
    const quote = transportQuote(v)?.transportation ?? null;
    return `<article class="vehicle-card ${state.vehicle === v.id ? "is-selected" : ""}" data-vehicle-card="${e(v.id)}">${v.image ? `<img class="vehicle-photo" src="${e(asset(v.image))}" alt="${e(v.display)} outside a luxury hotel">` : ""}<h3>${e(v.name)}</h3><div class="card-capacity">${icon("people")} ${v.capacity} Passengers <span></span>${icon("luggage")} ${bags(v)} Bags</div><div class="vehicle-models"><h4>${v.capacity === 6 ? "VEHICLES" : "IDEAL FOR"}</h4>${v.models.map((m) => `<p>${e(m)}</p>`).join("")}</div><ul class="features">${v.features.map((f) => `<li>${icon("check")}${e(f)}</li>`).join("")}</ul><div class="vehicle-price"><p>TOTAL ALL-INCLUSIVE</p><strong>${whole(quote)}<small>${e(settings.currency)}</small></strong>${waitingMinutes() ? `<small class="waiting-price">Includes ${waitingMinutes()} min waiting (${money(transportQuote(v)?.waitingCharge ?? null)})</small>` : ""}</div><button class="btn primary" type="button" data-select="${e(v.id)}" aria-label="Select ${e(v.display)}" aria-pressed="${state.vehicle === v.id}">${state.vehicle === v.id ? `${icon("check")} SELECTED` : "SELECT"}</button></article>`;
  }
  function collections() {
    if (!runtime) return `<section class="collection"><h2>SUV COLLECTION</h2><p>Spacious, comfortable, and perfect for everyday executive travel,</p><div class="vehicle-grid">${vehicles.slice(0, 3).map(vehicleCard).join("")}</div></section><section class="collection"><h2>ROLLS-ROYCE COLLECTION</h2><p>The ultimate in luxury, prestige, and refinement.</p><div class="vehicle-grid">${vehicles.slice(3).map(vehicleCard).join("")}</div></section>`;
    const groups = new Map();
    vehicles.forEach(vehicle => {
      const category = vehicle.category || "VEHICLES";
      if (!groups.has(category)) groups.set(category, { description: vehicle.categoryDescription || "", items: [] });
      groups.get(category).items.push(vehicle);
    });
    return groups.size ? [...groups].map(([name, group]) => `<section class="collection"><h2>${e(name)}</h2>${group.description ? `<p>${e(group.description)}</p>` : ""}<div class="vehicle-grid">${group.items.map(vehicleCard).join("")}</div></section>`).join("") : `<p role="status">No vehicles are currently available. Please contact ${e(settings.companyName)} for assistance.</p>`;
  }
  function vehiclesPage() {
    return `<div class="panel vehicles-panel" data-step="2">${panelHeader(2, "SELECT YOUR VEHICLE", "car", "Choose the vehicle that best fits your trip.")}<div class="trip-strip"><p>${icon("pin")}${e(state.trip.pickup)}</p>${icon("arrow", "route-arrow")}<p>${icon("pin")}${e(state.trip.dropoff || "Hourly service")}</p><p>${icon("calendar")}${dateLabel()}</p><p>${icon("clock")}${timeLabel()}</p><button type="button" data-go="0">Edit Trip ${icon("edit")}</button></div>${collections()}<div class="pricing-note">${icon("info")}<div><p>Prices shown are the total all-inclusive cost for transportation.</p><strong>Gratuity is not included and will be added in the final step.</strong></div></div><div class="form-error" role="alert" hidden></div>${nav("CONTINUE TO PASSENGERS AND EXTRAS")}</div>`;
  }

  // Step 3: passenger counts, flight details, optional extras, and gratuity.
  function seatControls() {
    const c = costs();
    return `<div class="seat-area"><div class="seat-counts"><div>${icon("seat")}<strong>Car Seats</strong>${qty("carSeats", "car seats", state.carSeats, selected().capacity)}</div><div>${icon("seat")}<strong>Booster Seats</strong>${qty("boosterSeats", "booster seats", state.boosterSeats, selected().capacity)}</div><p>First seat ${money(settings.firstSeatPrice)} <span>•</span> Each additional seat ${money(settings.additionalSeatPrice)}</p></div><table class="seat-table"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody><tr><td>Car Seat</td><td>${state.carSeats}</td><td>${whole(c.carCost)}</td></tr><tr><td>Booster Seat</td><td>${state.boosterSeats}</td><td>${whole(c.boosterCost)}</td></tr><tr><th>Total</th><td></td><th>${whole(c.seats)}</th></tr></tbody></table></div>`;
  }
  function passengersPage() {
    const c = costs();
    return `<div class="columns passengers-columns" data-step="3"><form id="booking-form" class="panel passengers-panel">${panelHeader(3, "PASSENGERS & EXTRAS", "people", "Add passenger details, flight information, and any extras.")}<section class="form-section">${section(1, "PASSENGERS AND LUGGAGE", "people")}<div class="section-body passenger-counts"><label>${icon("people")}NUMBER OF PASSENGERS</label>${qty("passengers", "passengers", state.passengers, selected().capacity, 1)}<label>${icon("luggage")}LUGGAGE</label>${qty("luggage", "luggage", state.luggage, bags())}</div></section><section class="form-section">${section(2, "AIRPORT DETAILS", "plane")}<div class="section-body"><div class="segments aviation"><button type="button" data-flight="commercial" aria-pressed="${state.flightType === "commercial"}">${icon("plane")}COMMERCIAL FLIGHT</button><button type="button" data-flight="private" aria-pressed="${state.flightType === "private"}">${icon("plane")}PRIVATE AVIATION</button></div><div class="field-grid"><div><label class="label">${state.flightType === "private" ? "OPERATOR" : "AIRLINE"}</label>${field("airline", state.flightType === "private" ? "Operator" : "Airline", state.flightType === "private" ? "Type your operator" : "Type your airline")}</div><div><label class="label">FLIGHT / TAIL NUMBER</label>${field("flight", "Flight / tail number", "Type your flight / tail number")}</div></div><p class="helper">${icon("info")}Flight details help us monitor your itinerary and verify that your scheduled pickup time aligns with your flight.</p></div></section><section class="form-section">${section(3, "ADD TO YOUR TRIP", "case")}<div class="section-body"><div class="extra-row">${icon("person")}<div><strong>Meet & Greet</strong><p>Chauffeur meets you at baggage claim and assists with luggage.</p></div>${toggle("meet", "Meet & Greet")}</div><div class="extra-row">${icon("seat")}<div><strong>Child Seats</strong><p>Car seats and booster seats available upon request.</p></div>${toggle("child", "Child Seats")}</div>${state.child ? seatControls() : ""}</div></section><section class="gratuity-section"><div class="gratuity-options">${section(4, "CHAUFFEUR GRATUITY", "star", "Optional. Calculated on transportation charges only.")}<div class="section-body"><div class="segments gratuity">${[...gratuities, "custom"].map((g) => `<button type="button" data-tip="${g}" aria-pressed="${!state.inPerson && state.gratuity === g}">${g === "custom" ? "Custom" : g + "%"}</button>`).join("")}</div>${state.gratuity === "custom" && !state.inPerson ? `<label class="custom-tip">Custom gratuity percentage<input type="number" class="input" data-field="custom" aria-label="Custom gratuity percentage" min="0" max="100" step="0.5" value="${state.custom}"></label>` : ""}<label class="checkbox small-check"><input type="checkbox" data-field="inPerson" ${state.inPerson ? "checked" : ""}>I’ll tip the chauffeur in person.</label></div></div><div class="gratuity-result"><strong>${c.percent}% = <span>${money(c.tip)}</span></strong><p>100% of your gratuity goes directly to your chauffeur.</p></div></section><section class="form-section special-section">${section(5, "SPECIAL REQUESTS (Optional)", "chat", "Anything else we should know to personalize your trip?")}<div class="section-body">${textarea("special", "Special requests", "Pickup instructions, quiet ride preference, luggage notes, or other personal requests", 250)}</div></section><div class="form-error" role="alert" hidden></div>${nav("CONTINUE TO CONTACT & BILLING", true)}</form>${summary()}</div>`;
  }

  // Step 4: payer, primary passenger, and billing address.
  const countries = COUNTRY_NAMES;
  const dropdown = (path, label, placeholder, options) =>
    `<div class="form-field"><label class="field-caption" for="${fieldKey(path)}">${e(label)} <span aria-hidden="true">*</span></label><select id="${fieldKey(path)}" class="input" data-field="${path}" aria-label="${label}" required><option value="">${placeholder}</option>${options.map((value) => `<option value="${e(value)}" ${get(path) === value ? "selected" : ""}>${e(value)}</option>`).join("")}</select><p class="field-error" id="${fieldKey(path)}-error" hidden></p></div>`;
  function contactPage() {
    const regionField = field("billing.region", "State / Province", "State / Province (optional)");
    return `<div class="columns contact-columns" data-step="4"><form id="booking-form" class="panel contact-panel">${panelHeader(4, "CONTACT & BILLING", "clipboard", "Tell us who is making the reservation and who is traveling.")}<section class="form-section">${section(1, "BILLING CONTACT (PAYER) *", "person", "The person or company responsible for payment.")}<div class="section-body input-stack"><div class="field-grid">${field("billing.first", "Billing first name", "First Name *", { required: true })}${field("billing.last", "Billing last name", "Last Name *", { required: true })}</div>${field("billing.email", "Billing email", "Email *", { type: "email", required: true })}${field("billing.phone", "Billing phone", "Phone Number *", { type: "tel", required: true })}${field("billing.company", "Company name", "Company Name (optional)")}</div></section><section class="form-section">${section(2, "PRIMARY PASSENGER *", "person", "Who will be riding in the vehicle?")}<div class="section-body input-stack"><label class="checkbox"><input type="checkbox" data-field="same" ${state.same ? "checked" : ""}>Same as billing contact</label><div class="field-grid">${field("passenger.first", "Passenger first name", "First Name *", { required: true })}${field("passenger.last", "Passenger last name", "Last Name *", { required: true })}</div><div class="field-grid">${field("passenger.mobile", "Passenger mobile", "Mobile Number *", { type: "tel", required: true })}${field("passenger.email", "Passenger email", "Email (optional)", { type: "email" })}</div><p class="helper no-icon">Passenger contact information is used for chauffeur communication and ride updates.</p></div></section><section class="form-section">${section(3, "BILLING ADDRESS *", "pin", "Required for invoicing and account records.")}<div class="section-body input-stack"><div class="field-grid">${field("billing.street", "Street address", "Street Address *", { required: true })}${field("billing.unit", "Apt / Suite / Unit", "Apt / Suite / Unit (optional)")}</div><div class="field-grid">${field("billing.city", "City", "City *", { required: true })}${regionField}</div><div class="field-grid">${field("billing.zip", "ZIP / Postal Code", "ZIP / Postal Code (optional)")}${dropdown("billing.country", "Country", "Country *", countries)}</div><p class="helper">${icon("info")}Enter billing address for invoicing and account records.</p></div></section><section class="form-section billing-notes">${section(4, "ADDITIONAL BILLING INFORMATION (Optional)", "document")}<div class="section-body">${textarea("billing.notes", "Billing notes", "Add any billing instructions or payment-related notes, if needed.", 500)}</div></section><div class="form-error" role="alert" hidden></div>${nav("CONTINUE TO REVIEW & SUBMIT", true)}</form>${summary()}</div>`;
  }

  // Step 5: review retained fields before the authoritative WordPress submission.
  const reviewHead = (num, title, symbol, target) =>
    `<div class="review-heading"><span class="tile">${icon(symbol)}</span><h3>${num}. ${title}</h3><button type="button" data-go="${target}">EDIT ${icon("edit")}</button></div>`;
  const rows = (pairs) =>
    `<dl class="detail-rows">${pairs.map(([label, value]) => `<div><dt>${label}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>`;
  const billingAddress = () =>
    [
      state.billing.street,
      state.billing.unit,
      state.billing.city,
      state.billing.region,
      state.billing.zip,
      state.billing.country,
    ]
      .filter(Boolean)
      .join(", ");
  function reviewPage() {
    return `<div class="panel review-panel" data-step="5"><form id="booking-form" class="review-main">${panelHeader(5, "REVIEW & SUBMIT", "document", "Please review all the information before submitting your reservation request.")}<section class="review-block">${reviewHead(1, "TRIP DETAILS", "calendar", 0)}${rows([["Service Type:", state.trip.service === "hourly" ? `Hourly (${state.trip.hours} hours)` : "Transfer"], ["Pickup:", state.trip.pickup], ["Destination:", state.trip.dropoff || "As directed"], ...(state.trip.stops.length ? [["Stops:", stopDescription()]] : []), ["Date & Time:", fullDate()], ["Distance:", usableRoute() ? `${(usableRoute().distanceMeters / 1000).toFixed(1)} km / ${(usableRoute().distanceMeters / 1609.344).toFixed(1)} mi` : "Not calculated"], ["Travel time:", usableRoute() ? `${formatDuration(usableRoute().durationSeconds + waitingMinutes() * 60)} (${waitingMinutes()} min waiting)` : "Not calculated"], ["Airport Details:", state.airline || state.flight ? `${state.flightType === "commercial" ? "Commercial Flight" : "Private Aviation"} — ${state.airline} ${state.flight}` : "Not provided"]])}</section><section class="review-block">${reviewHead(2, "SELECTED VEHICLE", "car", 1)}<div class="review-vehicle">${vehicleImage() ? `<img src="${e(asset(vehicleImage()))}" alt="${e(selected().display)}">` : ""}<div><strong>${e(selected().display)}</strong><p>${e(model())}</p><div class="capacities">${icon("people")}<span>Up to ${selected().capacity} Passengers</span>${icon("luggage")}<span>Up to ${bags()} Bags</span></div></div></div></section><section class="review-block">${reviewHead(3, "PASSENGERS & EXTRAS", "people", 2)}${rows(
      [
        ["Passengers:", state.passengers],
        ["Luggage:", state.luggage],
        ["Meet & Greet:", state.meet ? "Included" : "Not added"],
        ["Child Seats:", state.child ? seatText() : "None"],
        [
          "Chauffeur Gratuity:",
          state.inPerson ? "Tip in person" : costs().percent + "%",
        ],
        ["Special Requests:", state.special || "None"],
      ],
    )}</section><section class="review-block">${reviewHead(4, "CONTACT & BILLING", "clipboard", 3)}<div class="contact-review"><div><h4>Billing Contact (Payer)</h4>${rows(
      [
        ["Name:", state.billing.first + " " + state.billing.last],
        ["Email:", state.billing.email],
        ["Phone:", state.billing.phone],
        ["Company:", state.billing.company || "Not provided"],
      ],
    )}</div><div><h4>Primary Passenger</h4>${rows([
      ["Name:", state.passenger.first + " " + state.passenger.last],
      ["Email:", state.passenger.email || "Not provided"],
      ["Mobile:", state.passenger.mobile],
    ])}</div></div><div class="billing-review">${rows([
      ["Billing Address:", billingAddress()],
      ["Billing Notes:", state.billing.notes || "None"],
    ])}</div></section><label class="checkbox consent"><input type="checkbox" data-field="consent" ${state.consent ? "checked" : ""} required><span>I agree to the ${policies()}.</span></label>${runtime ? '<label style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden" aria-hidden="true">Leave this field empty<input name="website" data-booking-honeypot tabindex="-1" autocomplete="off"></label>' : ""}<div class="form-error" role="alert" hidden></div>${nav("SUBMIT RESERVATION REQUEST", true)}</form><div class="review-sidebar"><aside class="price-summary"><h3>PRICE SUMMARY</h3>${lines(true)}${total()}${security()}</aside>${nextSteps()}</div></div>`;
  }

  // Confirmation follows a durable WordPress receipt; static mode remains a demo.
  const thankHeading = (label, symbol) =>
    `<h3 class="thank-section-title"><span class="dark-icon">${icon(symbol)}</span>${label}</h3>`;
  const noteStrip = (title, symbol, value) =>
    `<div class="thank-note"><h3><span class="dark-icon">${icon(symbol)}</span>${title}</h3><p>${e(value || "None")}</p></div>`;
  function thankPage() {
    const c = costs();
    const weekday = new Date(state.trip.date + "T12:00:00").toLocaleDateString(
      "en-US",
      { weekday: "short" },
    );
    return `<header class="thank-hero">${brand(true)}</header><main id="main" tabindex="-1" class="thank-content"><h1>Thank you, ${e(state.billing.first)}.</h1><p>Your reservation request has been received and is currently being reviewed.</p><p>Reservation requests are typically reviewed within 2–4 business hours.</p><p class="request-id">Request ID: ${e(state.requestId)}</p>${runtime ? "" : '<p class="demo-notice">Demo request only — no reservation, payment, or email has been sent.</p>'}<div class="received-card"><div class="received-status"><span class="seal">${icon("check")}</span><div><h2>Reservation Request Received</h2><p>We’ll confirm availability and send you the next steps soon.</p></div></div><div class="received-date">${icon("calendar")}<div><p>Pickup Date & Time</p><strong>${dateLabel(true)}</strong><span>${weekday}, ${timeLabel()}</span></div></div></div><section class="thank-section">${thankHeading("TRIP DETAILS", "calendar")}${rows(
      [
        [
          "Service Type:",
          state.trip.service === "hourly"
            ? `Hourly (${state.trip.hours} hours)`
            : "Transfer",
        ],
        ["Pick-up Location:", state.trip.pickup],
        ["Drop-off Location:", state.trip.dropoff || "As directed"],
        ["Stops:", stopDescription() || "None"],
      ["Distance:", usableRoute() ? `${(usableRoute().distanceMeters / 1000).toFixed(1)} km / ${(usableRoute().distanceMeters / 1609.344).toFixed(1)} mi` : "Not calculated"],
      ["Travel time:", usableRoute() ? `${formatDuration(usableRoute().durationSeconds + waitingMinutes() * 60)} (${waitingMinutes()} min waiting)` : "Not calculated"],
      ],
    )}</section><section class="thank-section">${thankHeading("VEHICLE SELECTED", "car")}<div class="thank-vehicle">${vehicleImage() ? `<img src="${e(asset(vehicleImage()))}" alt="${e(selected().display)}">` : ""}<div><strong>${e(selected().display)}</strong><p>${e(model())}</p><div class="capacities">${icon("people")}<span>Up to ${selected().capacity} Passengers</span>${icon("luggage")}<span>Up to ${bags()} Bags</span></div></div></div></section><section class="thank-section extras-thank">${thankHeading("PASSENGERS & EXTRAS", "people")}${rows(
      [
        ["Passengers:", state.passengers],
        ["Luggage:", state.luggage],
        ["Airline:", state.airline || "Not provided"],
        ["Flight Number:", state.flight || "Not provided"],
        [
          "Flight Type:",
          state.flightType === "commercial" ? "Commercial" : "Private",
        ],
        ["Meet & Greet:", state.meet ? "Added" : "Not added"],
        ["Child Seats:", state.child ? seatText() : "None"],
        [
          "Chauffeur Gratuity:",
          state.inPerson ? "Tip in person" : c.percent + "%",
        ],
      ],
    )}${noteStrip("SPECIAL REQUESTS", "chat", state.special)}</section><section class="thank-section">${thankHeading("PRIMARY PASSENGER", "person")}${rows(
      [
        ["Passenger Name:", state.passenger.first + " " + state.passenger.last],
        ["Phone Number:", state.passenger.mobile],
        ["Email Address:", state.passenger.email || "Not provided"],
      ],
    )}</section><section class="thank-section">${thankHeading("BILLING / PAYER INFORMATION", "clipboard")}${rows(
      [
        ["Company Name:", state.billing.company || "Not provided"],
        ["Billing Contact:", state.billing.first + " " + state.billing.last],
        ["Billing Phone:", state.billing.phone],
        ["Billing Email:", state.billing.email],
        ["Billing Address:", billingAddress()],
      ],
    )}${noteStrip("BILLING NOTES", "chat", state.billing.notes)}</section><section class="thank-section thank-pricing">${thankHeading("PRICING SUMMARY", "dollar")}<div class="thank-prices"><div class="price-lines"><div><span>Transportation (${e(selected().display)})</span><strong>${money(c.transportation)}</strong></div><div><span>Meet & Greet</span><strong>${money(c.meet)}</strong></div><div><span>${state.child ? state.carSeats : 0} Car Seats</span><strong>${money(c.carCost)}</strong></div><div><span>${state.child ? state.boosterSeats : 0} Booster Seat${state.boosterSeats === 1 ? "" : "s"}</span><strong>${money(c.boosterCost)}</strong></div><div><span>Chauffeur Gratuity (${c.percent}%)</span><strong>${money(c.tip)}</strong></div></div><p class="payment-note"><span class="dark-icon">${icon("wallet")}</span>Payment instructions will be sent separately.</p></div>${total()}</section><section class="thank-next"><span class="next-symbol">${icon("circlecheck")}</span><div><h3>WHAT HAPPENS NEXT?</h3><ol><li><span>1</span><p>We review availability and reservation details.</p></li><li><span>2</span><p>You’ll receive an email with confirmation details and any payment instructions.</p></li><li><span>3</span><p>Once confirmed, your reservation is secured.</p></li></ol></div></section><section class="assistance"><div>${icon("phone")}<div><h3>NEED ASSISTANCE?</h3><p>Call, text, or WhatsApp us anytime.</p>${phoneLink()}</div></div><div><strong>Thank you for choosing ${e(settings.companyName)}.</strong><p>We look forward to your journey with us.</p><strong>${e(settings.companyName)}${runtime ? "" : " Private Transportation"}.</strong></div></section><button class="text-link start-over" type="button" data-action="reset">Start a new request</button></main>${supportFooter()}`;
  }

  function render() {
    const active = document.activeElement;
    const focusKeys = [
      "field",
      "count",
      "delta",
      "service",
      "flight",
      "tip",
      "select",
      "go",
      "stop",
    ];
    const focusAttributes =
      active && app.contains(active)
        ? focusKeys
            .filter((key) => active.dataset[key] !== undefined)
            .map((key) => `[data-${key}="${CSS.escape(active.dataset[key])}"]`)
            .join("")
        : "";
    autocompleteCleanups.forEach(cleanup => cleanup()); autocompleteCleanups = [];
    pickupMapCleanup?.(); pickupMapCleanup = null;
    document.body.className =
      step === 5 ? "thank-page" : `form-page step-${step + 1}`;
    document.title =
      step === 5
        ? `Request Received | ${settings.companyName}`
        : `${labels[step]} | ${settings.companyName} Reservation Request`;
    app.innerHTML =
      step === 5
        ? thankPage()
        : `${header()}<main id="main" tabindex="-1">${[tripPage, vehiclesPage, passengersPage, contactPage, reviewPage][step]()}</main>`;
    app
      .querySelectorAll('input[data-field="trip.pickup"]')
      .forEach((input) => (input.id = "pickup"));
    app.querySelectorAll("form").forEach(form => { form.noValidate = true; });
    updateValidity();
    mountPlaces();
    mountDeviceMap();
    if (focusAttributes) {
      const replacement = app.querySelector(focusAttributes);
      if (replacement && !replacement.disabled)
        replacement.focus({ preventScroll: true });
      else if (replacement?.dataset.count)
        replacement
          .closest(".quantity")
          .querySelector("button:not(:disabled)")
          ?.focus({ preventScroll: true });
    }
  }
  function scrollToStepStart() {
    // A changing iframe document cannot move the page that embeds it by itself.
    // Only the matching frame may ask its parent to reveal the start of a step.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const frameId = globalThis.TuxanoBookingBoot?.frameId;
    if (window.parent !== window && typeof frameId === "string" && frameId) {
      window.parent.postMessage({ type: "tuxano-booking:scroll", frameId }, location.origin);
    }
    document.querySelector("#main")?.focus({ preventScroll: true });
  }
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  function go(index, replace = false) {
    if (submitting) return;
    if (index < 0 || index > 5) return;
    if (index === 5 && !state.submitted) return;
    if (index < 5 && index > state.completed) return;
    if (index === step) return;
    cancelDeviceLocation();
    ++navigationGeneration;
    step = index;
    history[replace ? "replaceState" : "pushState"](
      null,
      "",
      "#" + routes[step],
    );
    render();
    scrollToStepStart();
    announce(
      step === 5
        ? runtime ? "Your reservation request has been received." : "Your demo request summary is ready."
        : `Step ${step + 1}: ${labels[step]}`,
    );
  }
  function error(message) {
    const box = app.querySelector(".form-error");
    if (box) {
      box.textContent = message;
      delete box.dataset.validationSummary;
      box.hidden = false;
      box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    announce(message);
  }
  function fieldMessage(control) {
    const label = (control.getAttribute("aria-label") || control.name || "this field").replace(/^(Billing|Passenger) /, "");
    if (control.validity.valueMissing) return control.type === "checkbox" ? "Please confirm this field to continue." : `Please enter ${label.toLowerCase()}.`;
    if (control.validity.typeMismatch && control.type === "email") return "Please enter a valid email address, such as name@example.com.";
    if (control.validity.tooLong) return `Use ${control.maxLength} characters or fewer.`;
    if (control.validity.rangeUnderflow || control.validity.rangeOverflow) return `Enter a value between ${control.min} and ${control.max}.`;
    if (control.validity.badInput) return "Please enter a valid value.";
    return control.validationMessage || "Please check this field.";
  }
  function paintFieldValidation(control) {
    if (!control?.willValidate) return;
    const path = control.dataset.field || control.dataset.stop || control.name || control.id;
    const invalid = !control.validity.valid;
    const message = invalid ? fieldMessage(control) : "";
    if (message) fieldErrors.set(path, message); else fieldErrors.delete(path);
    control.classList.toggle("field-invalid", invalid);
    control.setAttribute("aria-invalid", String(invalid));
    const id = (control.id || fieldKey(path)) + "-error";
    let output = app.querySelector(`#${CSS.escape(id)}`);
    if (!output) {
      output = document.createElement("p"); output.className = "field-error"; output.id = id;
      const anchor = control.closest(".picker-box") || control.closest(".location-input") || control;
      anchor.insertAdjacentElement("afterend", output);
    }
    output.textContent = message; output.hidden = !invalid;
    const descriptions = new Set((control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    if (invalid) descriptions.add(id); else descriptions.delete(id);
    if (descriptions.size) control.setAttribute("aria-describedby", [...descriptions].join(" ")); else control.removeAttribute("aria-describedby");
  }
  function updateValidity() {
    app.querySelectorAll("input, select, textarea").forEach(control => {
      if (!control.willValidate) return;
      let message = "";
      const value = control.value;
      if (control.required && typeof value === "string" && value && !value.trim()) message = "Please enter a value.";
      if (control.type === "tel" && value && !/^\+?[0-9() .-]+$/.test(value)) message = "Use a phone number with 7–15 digits; letters are not allowed.";
      else if (control.type === "tel" && value && (value.replace(/\D/g, "").length < 7 || value.replace(/\D/g, "").length > 15)) message = "Please enter a valid phone number with 7–15 digits.";
      if (control.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = "Please enter a valid email address, such as name@example.com.";
      if (control.maxLength > 0 && value.length > control.maxLength) message = `Use ${control.maxLength} characters or fewer.`;
      if (control.dataset.placeField) {
        const fieldId = control.dataset.placeField;
        const place = mapFieldPoint(fieldId);
        const valueMatches = fieldId.startsWith("stop:") ? state.trip.stops.find(stop => stop.id === fieldId.slice(5))?.text : state.trip[fieldId];
        if (value && !selectedPoint(place, valueMatches) && !DEMO_MODE) message = "Choose this location from the suggestions or select it on the map.";
        message = countryConflictForField(fieldId) || message;
      }
      control.setCustomValidity(message);
      const key = control.dataset.field || control.dataset.stop || control.name || control.id;
      if (touchedFields.has(key) || fieldErrors.has(key)) paintFieldValidation(control);
    });
    const form = app.querySelector("form");
    const summary = form?.querySelector('[data-validation-summary="true"]');
    if (summary && [...form.querySelectorAll("input,select,textarea")].every(control => !control.willValidate || control.validity.valid)) summary.hidden = true;
  }
  function showInvalidFields(form) {
    if (!form) return true;
    const controls = [...form.querySelectorAll("input,select,textarea")].filter(control => control.willValidate);
    const invalid = controls.filter(control => !control.validity.valid);
    if (!invalid.length) return true;
    controls.forEach(control => {
      touchedFields.add(control.dataset.field || control.dataset.stop || control.name || control.id);
      paintFieldValidation(control);
    });
    const box = form.querySelector(".form-error");
    if (box) { box.textContent = `Please correct ${invalid.length === 1 ? "the highlighted field" : "the highlighted fields"} before continuing.`; box.dataset.validationSummary = "true"; box.hidden = false; }
    invalid[0].focus({ preventScroll: true });
    invalid[0].scrollIntoView({ block: "center", behavior: "instant" });
    announce(`Please correct ${invalid.length} ${invalid.length === 1 ? "field" : "fields"}. ${fieldMessage(invalid[0])}`);
    return false;
  }
  function validate() {
    if (restoringPlaces) { error("Please wait while your selected locations are restored."); return false; }
    updateValidity();
    const form = app.querySelector("form");
    if (!showInvalidFields(form)) return false;
    if (step === 0 && !routeRequest()) { error("Choose pickup, drop-off, and every stop from the Google Maps suggestions."); return false; }
    if (step === 1 && !state.vehicle) {
      error("Please select a vehicle to continue.");
      return false;
    }
    if (step === 2) {
      if (
        state.passengers > selected().capacity ||
        state.luggage > bags()
      ) {
        error(
          `This vehicle accommodates up to ${selected().capacity} passengers and ${bags()} bags. Adjust the counts or choose another vehicle.`,
        );
        return false;
      }
      if (
        state.child &&
        state.carSeats + state.boosterSeats > state.passengers
      ) {
        error("Child seats cannot exceed the number of passengers.");
        return false;
      }
    }
    return true;
  }
  function validateRetainedState() {
    const text = (value) => typeof value === "string" && Boolean(value.trim());
    if (
      !text(state.trip.pickup) ||
      !text(state.trip.dropoff) ||
      !state.trip.date ||
      !state.trip.time ||
      state.trip.stops.some((stop) => !text(stop.text))
    )
      return {
        index: 0,
        message:
          "Please complete your pickup, destination, stops, date, and time before submitting.",
      };
    if (
      state.trip.service === "hourly" &&
      (!Number.isInteger(state.trip.hours) ||
        state.trip.hours < settings.minHours ||
        state.trip.hours > settings.maxHours)
    )
      return { index: 0, message: `Please choose between ${settings.minHours} and ${settings.maxHours} hours.` };
    if (!routeRequest()) return { index: 0, message: "Select your pickup, drop-off, and every stop from the location suggestions." };
    if (!vehicles.some((vehicle) => vehicle.id === state.vehicle))
      return {
        index: 1,
        message: "Please select a vehicle before submitting.",
      };
    if (
      state.passengers < 1 ||
      state.passengers > selected().capacity ||
      state.luggage < 0 ||
      state.luggage > bags() ||
      (state.child && state.carSeats + state.boosterSeats > state.passengers)
    )
      return {
        index: 2,
        message:
          "Please check passenger, luggage, and child-seat counts for your selected vehicle.",
      };
    if (
      state.gratuity === "custom" &&
      (!Number.isFinite(state.custom) || state.custom < 0 || state.custom > 100)
    )
      return {
        index: 2,
        message: "Custom gratuity must be between 0% and 100%.",
      };
    const required = [
      "first",
      "last",
      "email",
      "phone",
      "street",
      "city",
      "country",
    ];
    if (
      required.some((key) => !text(state.billing[key])) ||
      ["first", "last", "mobile"].some((key) => !text(state.passenger[key]))
    )
      return {
        index: 3,
        message:
          "Please complete the required contact and billing details before submitting.",
      };
    const emailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneValid = (phone) => {
      const length = phone.replace(/\D/g, "").length;
      return length >= 7 && length <= 15;
    };
    if (
      !emailValid(state.billing.email) ||
      (state.passenger.email && !emailValid(state.passenger.email)) ||
      !phoneValid(state.billing.phone) ||
      !phoneValid(state.passenger.mobile)
    )
      return {
        index: 3,
        message:
          "Please check the email addresses and phone numbers before submitting.",
      };
    return null;
  }
  async function submitBooking() {
    if (!currentRoute?.quoteToken) throw new Error("Please refresh your route before submitting this request.");
    requestKey ||= globalThis.crypto.randomUUID();
    const headers = { "Content-Type": "application/json", "X-Tuxano-Session": runtime.token };
    if (runtime.nonce) headers["X-WP-Nonce"] = runtime.nonce;
    const payload = { booking: structuredClone(state), quoteToken: currentRoute.quoteToken, requestKey, website: app.querySelector("[data-booking-honeypot]")?.value || "" };
    const controls = [...app.querySelectorAll("input, select, textarea, button")].map(control => [control, control.disabled]);
    const submitButton = app.querySelector('button[type="submit"]');
    const originalText = submitButton?.innerHTML;
    submitting = true;
    controls.forEach(([control]) => { control.disabled = true; });
    if (submitButton) submitButton.textContent = "Submitting…";
    announce("Submitting your reservation request. Please wait.");
    try {
      let response;
      try {
        response = await fetch(runtime.restUrl + "bookings", {
          method: "POST", headers, credentials: "same-origin", cache: "no-store",
          body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
        });
      } catch {
        throw new Error("We could not confirm that your request was received. Please try again; retrying this request will not create a duplicate.");
      }
      let result;
      try { result = await response.json(); } catch { throw new Error("We could not confirm your submission. Please try again."); }
      if (!response.ok) {
        if (/quote|revision/i.test(result.code || "")) invalidateRoute();
        throw new Error(result.message || "Your reservation request could not be saved. Please try again.");
      }
      const components = ["transportation", "carCost", "boosterCost", "seats", "meet", "percent", "tip", "total"];
      if (typeof result.requestId !== "string" || !result.requestId || result.requestId.length > 100 || !result.pricing || components.some(key => !Number.isFinite(result.pricing[key]) || result.pricing[key] < 0) || !result.route || !Number.isFinite(result.route.distanceMeters) || result.route.distanceMeters < 0 || !Number.isFinite(result.route.durationSeconds) || result.route.durationSeconds < 0) throw new Error("We could not verify the saved request receipt. Please retry this request.");
      return result;
    } finally {
      submitting = false;
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      if (submitButton) submitButton.innerHTML = originalText;
    }
  }
  async function advance() {
    if (advancing || !validate()) return;
    if (runtime && step === 4 && receipt && state.submitted) { go(5); return; }
    advancing = true;
    const startingStep = step;
    const startingNavigation = navigationGeneration;
    try {
      const retainedIssue = step === 4 ? validateRetainedState() : null;
      if (retainedIssue) {
        state.consent = false; dirty(); save();
        go(retainedIssue.index); error(retainedIssue.message); return;
      }
      if (!await calculateRoute()) {
        if (step === startingStep) error(routeMessage || "Wait for your driving route to be calculated before continuing.");
        return;
      }
      if (step !== startingStep || navigationGeneration !== startingNavigation || !validate()) return;
      if (step === 4) {
        const issue = validateRetainedState();
        if (issue) {
          state.consent = false; dirty(); save();
          go(issue.index); error(issue.message); return;
        }
        if (runtime) {
          receipt = await submitBooking();
          currentRoute = { ...receipt.route, signature: routeSignature() };
          state.requestId = receipt.requestId;
          try { sessionStorage.removeItem(STORAGE); } catch { /* Browser persistence is optional. */ }
        } else {
          state.requestId = "TUX-REQUEST-" + (globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase() || Date.now().toString(36).toUpperCase());
        }
        state.submitted = true;
        save(); go(5); return;
      }
      state.completed = Math.max(state.completed, step + 1);
      state.submitted = false;
      save();
      go(step + 1);
    } catch (failure) {
      error(failure.message || "Your reservation request could not be submitted. Please try again.");
    } finally { advancing = false; }
  }
  function syncPassenger() {
    if (!state.same) return;
    state.passenger = {
      first: state.billing.first,
      last: state.billing.last,
      email: state.billing.email,
      mobile: state.billing.phone,
    };
    app
      .querySelectorAll('[data-field^="passenger."]')
      .forEach((input) => (input.value = get(input.dataset.field)));
  }
  function refreshPrices() {
    const current = app.querySelector(".trip-summary");
    if (current) current.outerHTML = summary();
    const result = app.querySelector(".gratuity-result strong");
    if (result)
      result.innerHTML = `${costs().percent}% = <span>${money(costs().tip)}</span>`;
  }
  app.addEventListener("focusout", event => {
    const control = event.target;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.willValidate) return;
    const key = control.dataset.field || control.dataset.stop || control.name || control.id;
    touchedFields.add(key); updateValidity(); paintFieldValidation(control);
  });
  app.addEventListener("input", (event) => {
    if (submitting) return;
    const input = event.target;
    if (input.dataset.stop !== undefined) {
      dirty();
      const stop = state.trip.stops.find(item => item.id === input.dataset.stop);
      if (!stop) return;
      stop.text = input.value; stop.query = input.value; stop.place = null;
      invalidateRoute(); save();
      return;
    }
    const path = input.dataset.field;
    if (!path || input.type === "checkbox" || input.tagName === "SELECT")
      return;
    dirty();
    set(
      path,
      input.type === "number"
        ? Math.max(0, Math.min(100, Number(input.value) || 0))
        : input.value,
    );
    if (["trip.pickup", "trip.dropoff"].includes(path)) {
      if (path === "trip.pickup") cancelDeviceLocation();
      const key = path.slice(5); state.trip[key + "Place"] = null; state.trip[key + "Query"] = input.value; invalidateRoute();
    }
    if (path.startsWith("passenger.") && state.same) {
      state.same = false;
      app.querySelector('[data-field="same"]').checked = false;
    }
    if (path.startsWith("billing.")) syncPassenger();
    const display = app.querySelector(`[data-display="${path}"]`);
    if (display)
      display.textContent = path === "trip.date" ? dateLabel() : timeLabel();
    const count = app.querySelector(`[data-counter="${path}"]`);
    if (count) count.textContent = input.value.length + "/" + input.maxLength;
    if (path === "custom") refreshPrices();
    save();
    updateValidity();
  });
  app.addEventListener("change", (event) => {
    if (submitting) return;
    const input = event.target,
      path = input.dataset.field;
    if (input.dataset.stopWait) {
      const stop = state.trip.stops.find(item => item.id === input.dataset.stopWait);
      if (stop && WAIT_OPTIONS.includes(Number(input.value))) { dirty(); stop.waitMinutes = Number(input.value); save(); refreshRoutePanel(); }
      return;
    }
    if (!path) return;
    dirty();
    if (input.type === "checkbox") {
      set(path, input.checked);
      if (path === "same") syncPassenger();
      if (["meet", "child", "inPerson"].includes(path)) {
        save();
        render();
        announce("Options and estimated price updated.");
      }
    } else if (input.tagName === "SELECT") {
      set(path, path === "trip.hours" ? Number(input.value) : input.value);
    }
    updateValidity();
    const key = input.dataset.field || input.name || input.id;
    if (touchedFields.has(key)) paintFieldValidation(input);
    save();
  });
  app.addEventListener("submit", (event) => {
    event.preventDefault();
    advance();
  });
  app.addEventListener("click", async (event) => {
    if (submitting) return;
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.go !== undefined) {
      go(Number(button.dataset.go));
      return;
    }
    if (
      ["service", "select", "flight", "tip", "count", "removeStop"].some(
        (key) => button.dataset[key] !== undefined,
      ) ||
      button.dataset.action === "add-stop"
    )
      dirty();
    if (button.dataset.service) {
      state.trip.service = button.dataset.service;
      save();
      render();
      return;
    }
    if (button.dataset.select) {
      state.vehicle = button.dataset.select;
      save();
      render();
      announce(`${selected().display} selected.`);
      return;
    }
    if (button.dataset.flight) {
      state.flightType = button.dataset.flight;
      save();
      render();
      return;
    }
    if (button.dataset.tip) {
      state.gratuity = button.dataset.tip;
      state.inPerson = false;
      save();
      render();
      return;
    }
    if (button.dataset.count) {
      const key = button.dataset.count,
        min = key === "passengers" ? 1 : 0,
        limit = key === "luggage" ? bags() : selected().capacity;
      state[key] = Math.max(
        min,
        Math.min(limit, state[key] + Number(button.dataset.delta)),
      );
      save();
      render();
      announce(`${key}: ${state[key]}`);
      return;
    }
    if (button.dataset.removeStop !== undefined) {
      const index = state.trip.stops.findIndex(item => item.id === button.dataset.removeStop);
      if (index < 0) return;
      if (deviceLocation.status === "map" && mapTarget() === "stop:" + state.trip.stops[index].id) cancelDeviceLocation();
      maps.discardSession("stop:" + state.trip.stops[index].id);
      state.trip.stops.splice(index, 1); invalidateRoute();
      save(); render(); calculateRoute();
      return;
    }
    if (button.dataset.policy) {
      const dialog = document.createElement("dialog");
      dialog.className = "policy-dialog";
      dialog.innerHTML = `<h2>${e(button.dataset.policy)}</h2><p>This is a static demonstration form. No reservation or payment is submitted.</p><p>The operator’s actual ${e(button.dataset.policy.toLowerCase())} document has not been provided. Contact TUXANO for the applicable terms before making a real reservation.</p><button class="btn primary" type="button">CLOSE</button>`;
      dialog
        .querySelector("button")
        .addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", () => {
        dialog.remove();
        button.focus();
      });
      app.append(dialog);
      dialog.showModal();
      return;
    }
    switch (button.dataset.action) {
      case "next":
        advance();
        break;
      case "back":
        go(step - 1);
        break;
      case "add-stop":
        if (state.trip.stops.length < settings.maxStops) {
          state.trip.stops.push(makeStop()); invalidateRoute();
          save();
          render();
          app
            .querySelector(`[data-stop="${state.trip.stops.at(-1).id}"]`)
            .focus();
        }
        break;
      case "retry-route":
        invalidateRoute(); calculateRoute(); break;
      case "reset":
        cancelDeviceLocation();
        restoringPlaces = false;
        DEMO_MODE = false;
        invalidateRoute(); state = defaults();
        fieldErrors.clear(); touchedFields.clear();
        save();
        step = -1;
        history.replaceState(null, "", runtime ? location.pathname + location.search : location.pathname);
        go(0, true);
        break;
      case "locate":
        await detectDeviceLocation(); break;
      case "choose-map":
        choosePickupMap(button.dataset.mapField || "pickup"); break;
      case "choose-pickup-map":
        choosePickupMap(); break;
      case "use-map-location":
        useMapLocation(); break;
      case "cancel-device-location":
        cancelDeviceLocation();
        app.querySelector('[data-place-field="pickup"]')?.focus();
        break;
      case "use-device-location":
        useDeviceLocation(); break;
    }
  });
  window.addEventListener("hashchange", () => {
    if (submitting) { history.replaceState(null, "", "#" + routes[step]); return; }
    const index = routes.indexOf(location.hash.slice(1));
    const allowed =
      index === 5 ? state.submitted : index >= 0 && index <= state.completed;
    if (allowed) {
      cancelDeviceLocation();
      ++navigationGeneration;
      step = index;
      render();
      scrollToStepStart();
    } else {
      history.replaceState(null, "", "#" + routes[step]);
    }
  });
  if (DEMO_MODE) {
    state.trip.pickupQuery = state.trip.pickup; state.trip.dropoffQuery = state.trip.dropoff;
    state.trip.pickupPlace = { placeId: "demo-pickup", text: state.trip.pickup };
    state.trip.dropoffPlace = { placeId: "demo-dropoff", text: state.trip.dropoff };
    currentRoute = { distanceMeters: 32186.88, durationSeconds: 1800, provider: "demo", signature: routeSignature() }; routeStatus = "ready";
  }
  const initial = routes.indexOf(location.hash.slice(1));
  const initialIssue = validateRetainedState();
  if (initialIssue)
    state.completed = Math.min(state.completed, initialIssue.index);
  if (state.submitted && (initialIssue || !state.consent || !state.requestId))
    dirty();
  step =
    initial === 5 && state.submitted
      ? 5
      : initial >= 0 && initial <= state.completed && initial < 5
        ? initial
        : 0;
  history.replaceState(null, "", "#" + routes[step]);
  save();
  render();
  if (!DEMO_MODE) restoreLocations();
})();
