import { test, expect } from "@playwright/test";

// These checks enter data through real controls and calculate expected amounts
// independently. Demo state is used only for the visual reference captures.
const fixture = {
  pickup: "475 Main Street, Naperville, IL",
  destination: "Midway International Airport (MDW)",
  stop: "Oak Brook Center, IL",
  date: "2027-11-12",
  time: "14:30",
  special: "Please use the south entrance & keep the ride quiet.",
  billingNote: "Please reference invoice DEMO-204.",
};

const errors = new WeakMap();

function installBookingPlacesStub() {
  class Place {
    constructor({ id }) {
      this.id = id;
      this.formattedAddress = id.startsWith('test-') ? decodeURIComponent(id.slice(5)) : id;
      this.location = { lat: () => 41, lng: () => -87 };
      this.attributions = [];
    }
    async fetchFields() {}
  }
  window.google = { maps: { importLibrary: async () => ({
    Place,
    AutocompleteSessionToken: class {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: async ({ input }) => ({ suggestions: [{ placePrediction: {
      placeId: 'test-' + encodeURIComponent(input), text: { text: input }, mainText: { text: input }, secondaryText: { text: 'Test location' },
      toPlace: () => new Place({ id: 'test-' + encodeURIComponent(input) }),
    } }] }) },
  }) } };
}

async function mockGoogleMaps(page) {
  const configuration = { browserKey: 'test-browser-key', browserConfigured: true, routesConfigured: true, providerMode: 'server' };
  await page.route('**/api/maps/config', route => route.fulfill({ json: configuration }));
  await page.route('**/maps-config.json', route => route.fulfill({ json: configuration }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => {
    const callback = new URL(route.request().url()).searchParams.get('callback');
    const body = `(${installBookingPlacesStub.toString()})();window[${JSON.stringify(callback)}]?.();`;
    return route.fulfill({ contentType: 'text/javascript', body });
  });
  await page.route('https://maps.gstatic.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/api/maps/route', route => route.fulfill({ json: { distanceMeters: 32186.88, durationSeconds: 1800, provider: 'google', calculatedAt: '2026-10-18T00:00:00Z' } }));
}

test.beforeEach(async ({ page }) => {
  await mockGoogleMaps(page);
  const unexpected = [];
  errors.set(page, unexpected);
  page.on("pageerror", (error) => unexpected.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") unexpected.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      response.url().startsWith("http://127.0.0.1:4173")
    ) {
      unexpected.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto("/");
});

test.afterEach(async ({ page }) => {
  expect(
    errors.get(page),
    "No browser exceptions, console errors, or missing local assets",
  ).toEqual([]);
});

async function route(page, name) {
  await expect(page).toHaveURL(new RegExp(`#${name}$`));
}

async function fillTrip(page) {
  await selectLocation(page, 'Pickup location', fixture.pickup);
  await selectLocation(page, 'Drop-off location', fixture.destination);
  await page.getByLabel("Date", { exact: true }).fill(fixture.date);
  await page.getByLabel("Pickup time", { exact: true }).fill(fixture.time);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
}

async function selectLocation(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('option', { name: value, exact: true }).click();
  await expect(page.getByLabel(label, { exact: true })).toHaveValue(value);
}

async function reachVehicles(page) {
  await fillTrip(page);
  await page.getByRole("button", { name: "CHECK PRICE", exact: true }).click();
  await route(page, "vehicles");
}

async function reachPassengers(page, vehicle = "Luxury SUV") {
  await reachVehicles(page);
  await page
    .getByRole("button", { name: `Select & continue with ${vehicle}`, exact: true })
    .click();
  await route(page, "passengers");
}

async function setToggle(page, name, checked) {
  const control = page.getByLabel(name, { exact: true });
  const current = await control.evaluate((element) =>
    element.matches("input[type=checkbox]")
      ? element.checked
      : element.getAttribute("aria-checked") === "true",
  );
  if (current !== checked) await control.click();
}

async function setQuantity(page, name, value, minimum = 0) {
  const decrease = page.getByRole("button", {
    name: `Decrease ${name}`,
    exact: true,
  });
  for (
    let attempts = 0;
    attempts < 12 && !(await decrease.isDisabled());
    attempts++
  ) {
    await decrease.click();
  }
  await expect(decrease, `${name} has an enforced minimum`).toBeDisabled();
  const increase = page.getByRole("button", {
    name: `Increase ${name}`,
    exact: true,
  });
  for (let count = minimum; count < value; count++) await increase.click();
}

async function expectTotal(page, amount) {
  const displayed = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await expect(
    page.locator('[data-testid="estimated-total"]:visible').last(),
  ).toHaveText(`$${displayed}`);
}

async function extrasFixture(page) {
  await setToggle(page, "Child Seats", false);
  await setQuantity(page, "passengers", 3, 1);
  await setQuantity(page, "luggage", 4);
  await page.getByLabel("Airline", { exact: true }).fill("United Airlines");
  await page.getByLabel("Flight / tail number", { exact: true }).fill("UA432");
  await setToggle(page, "Meet & Greet", true);
  await setToggle(page, "Child Seats", true);
  await setQuantity(page, "car seats", 2);
  await setQuantity(page, "booster seats", 1);
  await page.getByRole("button", { name: "20%", exact: true }).click();
  await page
    .getByLabel("Special requests", { exact: true })
    .fill(fixture.special);
  await expectTotal(page, 495);
}

async function reachContact(page) {
  await reachPassengers(page);
  await extrasFixture(page);
  await page.getByRole("button", { name: /continue to contact/i }).click();
  await route(page, "contact");
}

async function fillContact(page, { sameAsPayer = false } = {}) {
  for (const [label, value] of [
    ["Billing first name", "Alex"],
    ["Billing last name", "Rivera"],
    ["Billing email", "alex.rivera@example.com"],
    ["Billing phone", "+1 312 555 0134"],
    ["Company name", "Northwind Demo"],
    ["Street address", "321 Oak Street"],
    ["Apt / Suite / Unit", "Suite 8"],
    ["City", "Chicago"],
    ["ZIP / Postal Code", "60601"],
    ["Billing notes", fixture.billingNote],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByLabel("Country", { exact: true })
    .selectOption({ label: "United States" });
  await page
    .getByLabel("State / Province", { exact: true })
    .fill("Illinois");
  await setToggle(page, "Same as billing contact", sameAsPayer);
  if (!sameAsPayer) {
    for (const [label, value] of [
      ["Passenger first name", "Taylor"],
      ["Passenger last name", "Chen"],
      ["Passenger mobile", "+1 312 555 0155"],
      ["Passenger email", "taylor.chen@example.com"],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
  }
}

async function reachReview(page) {
  await reachContact(page);
  await fillContact(page);
  await page.getByRole("button", { name: /continue to review/i }).click();
  await route(page, "review");
}

async function submit(page) {
  await page.getByRole("checkbox", { name: /I agree to the Terms/i }).check();
  await page
    .getByRole("button", { name: "SUBMIT RESERVATION REQUEST", exact: true })
    .click();
  await route(page, "thank-you");
}

async function editReviewSection(page, heading) {
  await page
    .locator(".review-block")
    .filter({
      has: page.getByRole("heading", { name: heading, exact: true }),
    })
    .getByRole("button", { name: "EDIT", exact: true })
    .click();
}

test("empty trip is blocked and entered route/date/time survive Back and reload", async ({
  page,
}) => {
  await page.getByRole("button", { name: "CHECK PRICE", exact: true }).click();
  await route(page, "trip");
  await expect(
    page.getByLabel("Pickup location", { exact: true }),
  ).toBeVisible();
  await reachVehicles(page);
  await page.getByRole("button", { name: "BACK", exact: true }).click();
  await route(page, "trip");
  await page.reload();
  await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue(
    fixture.pickup,
  );
  await expect(
    page.getByLabel("Drop-off location", { exact: true }),
  ).toHaveValue(fixture.destination);
  await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
    fixture.date,
  );
  await expect(page.getByLabel("Pickup time", { exact: true })).toHaveValue(
    fixture.time,
  );
});

test("stops and Hourly service can be edited without losing trip values", async ({
  page,
}) => {
  await fillTrip(page);
  await page.getByRole("button", { name: /Add stop/i }).click();
  await selectLocation(page, 'Stop 1', fixture.stop);
  await page.getByRole("button", { name: /Remove stop 1/i }).click();
  await expect(page.getByLabel("Stop 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Add stop/i }).click();
  await selectLocation(page, 'Stop 1', fixture.stop);
  await page.getByLabel('Stop 1 wait time', { exact: true }).selectOption('0');
  await page.getByRole("button", { name: "HOURLY", exact: true }).click();
  await expect(page.getByLabel("Hours", { exact: true })).toBeVisible();
  await page.getByLabel("Hours", { exact: true }).fill("4");
  await page.getByRole("button", { name: "TRANSFER", exact: true }).click();
  await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue(
    fixture.pickup,
  );
  await expect(page.getByLabel("Stop 1", { exact: true })).toHaveValue(
    fixture.stop,
  );
  await page.getByRole("button", { name: "HOURLY", exact: true }).click();
  await expect(page.getByLabel("Hours", { exact: true })).toHaveValue("4");
  await page.getByRole("button", { name: "CHECK PRICE", exact: true }).click();
  await route(page, "vehicles");
  await page
    .getByRole("button", { name: "Select & continue with Luxury SUV", exact: true })
    .click();
  await route(page, "passengers");
  // Four hours × $115 + 20 miles × $3 = $520; 20% gratuity = $104.
  await expectTotal(page, 624);
  await expect(page.getByText("4 hours", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /continue to contact/i }).click();
  await fillContact(page);
  await page.getByRole("button", { name: /continue to review/i }).click();
  await route(page, "review");
  await expect(page.locator("body")).toContainText(fixture.stop);
  await expect(page.locator("body")).toContainText("Hourly (4 hours)");
  await expectTotal(page, 624);
});

test("all six vehicle prices are used and only one choice is selected", async ({
  page,
}) => {
  await reachVehicles(page);
  await route(page, "vehicles");
  await expect(page.getByRole("button", { name: /continue to passengers/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Step 3: Passengers & Extras", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Select & continue with /, pressed: true })).toHaveCount(0);
  for (const [name, price] of [
    ["Premium SUV", 195],
    ["Luxury SUV", 225],
    ["Executive SUV", 265],
    ["Rolls-Royce Ghost", 1250],
    ["Rolls-Royce Cullinan", 1850],
    ["Rolls-Royce Phantom", 3250],
  ]) {
    await page
      .getByRole("button", { name: `Select & continue with ${name}`, exact: true })
      .click();
    await route(page, "passengers");
    await setToggle(page, "Meet & Greet", false);
    await setToggle(page, "Child Seats", false);
    await setToggle(page, "I’ll tip the chauffeur in person.", true);
    await expectTotal(page, price);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "BACK", exact: true }).click();
    await route(page, "vehicles");
    await expect(page.getByRole("button", { name: /^Select & continue with /, pressed: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: `Select & continue with ${name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
});

test("source extra quantities produce $495 and disabled extras remove their charges", async ({
  page,
}) => {
  await reachPassengers(page);
  await extrasFixture(page);
  await setToggle(page, "Meet & Greet", false);
  await expectTotal(page, 445);
  await setToggle(page, "Child Seats", false);
  await expectTotal(page, 270);
  await setToggle(page, "Meet & Greet", true);
  await expectTotal(page, 320);
});

test("every gratuity preset uses transportation only", async ({ page }) => {
  await reachPassengers(page);
  await extrasFixture(page);
  for (const [percent, total] of [
    [10, 472.5],
    [15, 483.75],
    [20, 495],
    [25, 506.25],
  ]) {
    await page
      .getByRole("button", { name: `${percent}%`, exact: true })
      .click();
    await expectTotal(page, total);
  }
});

test("custom percentage rounds to cents and in-person gratuity is excluded", async ({
  page,
}) => {
  await reachPassengers(page);
  await extrasFixture(page);
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page
    .getByLabel("Custom gratuity percentage", { exact: true })
    .fill("12.5");
  await expectTotal(page, 478.13);
  await page
    .getByLabel("Custom gratuity percentage", { exact: true })
    .fill("0");
  await expectTotal(page, 450);
  await page.getByRole("button", { name: "25%", exact: true }).click();
  await setToggle(page, "I’ll tip the chauffeur in person.", true);
  await expectTotal(page, 450);
  await setToggle(page, "I’ll tip the chauffeur in person.", false);
  await expectTotal(page, 506.25);
});

test("combined car-seat and booster pricing charges the first seat once", async ({
  page,
}) => {
  await reachPassengers(page);
  await setToggle(page, "Meet & Greet", false);
  await setToggle(page, "I’ll tip the chauffeur in person.", true);
  await setToggle(page, "Child Seats", true);
  await setQuantity(page, "car seats", 0);
  await setQuantity(page, "booster seats", 0);
  await expectTotal(page, 225);
  await setQuantity(page, "booster seats", 1);
  await expectTotal(page, 300);
  await setQuantity(page, "car seats", 1);
  await expectTotal(page, 350);
  await setQuantity(page, "car seats", 2);
  await expectTotal(page, 400);
});

test("passenger and luggage buttons enforce selected-vehicle capacity", async ({
  page,
}) => {
  await reachPassengers(page, "Rolls-Royce Ghost");
  await setToggle(page, "Child Seats", false);
  await setQuantity(page, "passengers", 3, 1);
  await setQuantity(page, "luggage", 3);
  await expect(
    page.getByRole("button", { name: "Increase passengers", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Increase luggage", exact: true }),
  ).toBeDisabled();
  await setQuantity(page, "passengers", 1, 1);
  await setQuantity(page, "luggage", 0);
  await expect(
    page.getByRole("button", { name: "Decrease passengers", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Decrease luggage", exact: true }),
  ).toBeDisabled();
});

test("private aviation preserves flight input and special requests enforce 250 characters", async ({
  page,
}) => {
  await reachPassengers(page);
  await page.getByLabel("Airline", { exact: true }).fill("Private operator");
  await page.getByLabel("Flight / tail number", { exact: true }).fill("N123DE");
  await page
    .getByRole("button", { name: "PRIVATE AVIATION", exact: true })
    .click();
  await expect(page.getByLabel("Operator", { exact: true })).toHaveValue(
    "Private operator",
  );
  await expect(
    page.getByLabel("Flight / tail number", { exact: true }),
  ).toHaveValue("N123DE");
  await page
    .getByLabel("Special requests", { exact: true })
    .fill("x".repeat(270));
  await expect(
    page.getByLabel("Special requests", { exact: true }),
  ).toHaveValue("x".repeat(250));
  await expect(page.getByText("250/250", { exact: true })).toBeVisible();
});

test("required billing data and invalid email block review while optional fields stay optional", async ({
  page,
}) => {
  await reachContact(page);
  await page.getByRole("button", { name: /continue to review/i }).click();
  await route(page, "contact");
  await fillContact(page);
  await page.getByLabel("Billing email", { exact: true }).fill("invalid-email");
  await page.getByRole("button", { name: /continue to review/i }).click();
  await route(page, "contact");
  await page
    .getByLabel("Billing email", { exact: true })
    .fill("alex.rivera@example.com");
  for (const label of [
    "Company name",
    "Apt / Suite / Unit",
    "Passenger email",
    "Billing notes",
  ]) {
    await page.getByLabel(label, { exact: true }).fill("");
  }
  await page.getByRole("button", { name: /continue to review/i }).click();
  await route(page, "review");
  await expect(page.locator("body")).not.toContainText("undefined");
  await expect(page.locator("body")).not.toContainText("null");
});

test("same-as-billing passenger remains synchronized until unchecked", async ({
  page,
}) => {
  await reachContact(page);
  await fillContact(page, { sameAsPayer: true });
  await expect(
    page.getByLabel("Passenger first name", { exact: true }),
  ).toHaveValue("Alex");
  await expect(
    page.getByLabel("Passenger mobile", { exact: true }),
  ).toHaveValue("+1 312 555 0134");
  await page.getByLabel("Billing first name", { exact: true }).fill("Jordan");
  await page
    .getByLabel("Billing phone", { exact: true })
    .fill("+1 312 555 0178");
  await expect(
    page.getByLabel("Passenger first name", { exact: true }),
  ).toHaveValue("Jordan");
  await expect(
    page.getByLabel("Passenger mobile", { exact: true }),
  ).toHaveValue("+1 312 555 0178");
  await setToggle(page, "Same as billing contact", false);
  await page.getByLabel("Passenger first name", { exact: true }).fill("Casey");
  await expect(
    page.getByLabel("Billing first name", { exact: true }),
  ).toHaveValue("Jordan");
  await setToggle(page, "Same as billing contact", true);
  await expect(
    page.getByLabel("Passenger first name", { exact: true }),
  ).toHaveValue("Jordan");
});

test("billing notes enforce 500 characters and persist through review edits", async ({
  page,
}) => {
  await reachContact(page);
  await fillContact(page);
  await page.getByLabel("Billing notes", { exact: true }).fill("n".repeat(530));
  await expect(page.getByLabel("Billing notes", { exact: true })).toHaveValue(
    "n".repeat(500),
  );
  await expect(page.getByText("500/500", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /continue to review/i }).click();
  await route(page, "review");
  await editReviewSection(page, "4. CONTACT & BILLING");
  await route(page, "contact");
  await expect(page.getByLabel("Billing notes", { exact: true })).toHaveValue(
    "n".repeat(500),
  );
});

test("review data, price, and trip edits use entered values rather than fixtures", async ({
  page,
}) => {
  await reachReview(page);
  for (const value of [
    fixture.pickup,
    fixture.destination,
    fixture.special,
    fixture.billingNote,
    "United Airlines",
    "UA432",
    "Alex Rivera",
    "Taylor Chen",
    "Northwind Demo",
    "321 Oak Street",
  ]) {
    await expect(page.locator("body")).toContainText(value);
  }
  await expectTotal(page, 495);
  await editReviewSection(page, "1. TRIP DETAILS");
  await selectLocation(page, 'Pickup location', 'Updated downtown pickup');
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await route(page, "review");
  await expect(page.locator("body")).toContainText("Updated downtown pickup");
  await expect(page.locator("body")).not.toContainText(fixture.pickup);
  await expectTotal(page, 495);
});

test("changing vehicle during review updates transportation and percentage gratuity", async ({
  page,
}) => {
  await reachReview(page);
  await editReviewSection(page, "2. SELECTED VEHICLE");
  await page
    .getByRole("button", { name: "Select & continue with Executive SUV", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await route(page, "review");
  // $265 transportation + $50 meet/greet + $175 seats + 20% of $265 ($53).
  await expectTotal(page, 543);
  await expect(page.locator("body")).toContainText("Executive SUV");
});

test("consent is required and successful static submission preserves details and request ID", async ({
  page,
}) => {
  await reachReview(page);
  await page
    .getByRole("button", { name: "SUBMIT RESERVATION REQUEST", exact: true })
    .click();
  await route(page, "review");
  // A previously completed step can become invalid after an Edit. Final submit
  // must recheck retained data, including values outside the current form.
  await editReviewSection(page, "1. TRIP DETAILS");
  await page.getByLabel("Pickup location", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I agree to the Terms/i }).check();
  await page
    .getByRole("button", { name: "SUBMIT RESERVATION REQUEST", exact: true })
    .click();
  await route(page, "trip");
  await expect(page.getByRole("alert")).toBeVisible();
  await selectLocation(page, 'Pickup location', fixture.pickup);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await editReviewSection(page, "4. CONTACT & BILLING");
  await page.getByLabel("Billing first name", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I agree to the Terms/i }).check();
  await page
    .getByRole("button", { name: "SUBMIT RESERVATION REQUEST", exact: true })
    .click();
  await route(page, "contact");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Billing first name", { exact: true }).fill("Alex");
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await editReviewSection(page, "2. SELECTED VEHICLE");
  await page
    .getByRole("button", { name: "Select & continue with Rolls-Royce Ghost", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /I agree to the Terms/i }).check();
  await page
    .getByRole("button", { name: "SUBMIT RESERVATION REQUEST", exact: true })
    .click();
  await route(page, "passengers");
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Step 2: Select Vehicle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select & continue with Luxury SUV", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await expectTotal(page, 495);
  const writes = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()) && !request.url().endsWith('/api/maps/route')) writes.push(request.url());
  });
  await submit(page);
  for (const value of [
    fixture.pickup,
    fixture.destination,
    fixture.special,
    fixture.billingNote,
    "United Airlines",
    "UA432",
    "Alex Rivera",
    "Taylor Chen",
    "Northwind Demo",
    "321 Oak Street",
  ]) {
    await expect(page.locator("body")).toContainText(value);
  }
  await expectTotal(page, 495);
  const before = await page.locator("body").innerText();
  const requestId = before.match(/TUX-[A-Z0-9-]+/);
  expect(
    requestId,
    "Confirmation includes a local request identifier",
  ).not.toBeNull();
  await page.reload();
  await route(page, "thank-you");
  await expect(page.locator("body")).toContainText(requestId[0]);
  await expectTotal(page, 495);
  expect(writes, "Static submit makes no backend/payment/email write").toEqual(
    [],
  );
});

test("entered HTML is displayed as text without executing in review or confirmation", async ({
  page,
}) => {
  const dangerous = '<img src=x onerror="window.__unsafe=1">';
  await reachReview(page);
  await editReviewSection(page, "1. TRIP DETAILS");
  await selectLocation(page, 'Pickup location', dangerous);
  await expect(page.getByLabel('Travel time', { exact: true })).toHaveValue('30 min');
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await editReviewSection(page, "3. PASSENGERS & EXTRAS");
  await page
    .getByLabel("Special requests", { exact: true })
    .fill("<script>window.__unsafe=2</script>");
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await editReviewSection(page, "4. CONTACT & BILLING");
  await page.getByLabel("Company name", { exact: true }).fill(dangerous);
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await expect(page.locator("body")).toContainText(dangerous);
  expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await submit(page);
  await expect(page.locator("body")).toContainText(dangerous);
  expect(await page.evaluate(() => window.__unsafe)).toBeUndefined();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

test("session reload retains fields and corrupt saved JSON recovers safely", async ({
  page,
}) => {
  await reachContact(page);
  await fillContact(page);
  await page.reload();
  await route(page, "contact");
  await expect(
    page.getByLabel("Billing first name", { exact: true }),
  ).toHaveValue("Alex");
  await expect(
    page.getByLabel("Passenger first name", { exact: true }),
  ).toHaveValue("Taylor");
  await expect(page.getByLabel("Billing notes", { exact: true })).toHaveValue(
    fixture.billingNote,
  );
  await expectTotal(page, 495);
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage))
      sessionStorage.setItem(key, "{invalid json");
  });
  await page.goto("/");
  await expect(
    page.getByLabel("Pickup location", { exact: true }),
  ).toBeVisible();
});

test("a complete phone journey submits and representative widths have no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reachReview(page);
  await expectTotal(page, 495);
  for (const width of [320, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const sizes = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(
      sizes.page,
      `Review does not overflow at ${width}px`,
    ).toBeLessThanOrEqual(sizes.viewport + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await submit(page);
  await expect(page.locator("body")).toContainText("Taylor Chen");
  await expectTotal(page, 495);
  const sizes = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport + 1);
});

test("structurally corrupted saved drafts recover and forged empty submissions cannot open confirmation", async ({
  page,
}) => {
  const empty = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("tuxano-booking-v1")),
  );
  await page.goto("/?demo=1#review");
  const valid = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("tuxano-booking-v1")),
  );
  const corruptions = [
    [
      "null-stops",
      (saved) => {
        saved.trip.stops = null;
      },
    ],
    [
      "null-notes",
      (saved) => {
        saved.billing.notes = null;
      },
    ],
    [
      "invalid-date",
      (saved) => {
        saved.trip.date = "bad";
      },
    ],
    [
      "invalid-passengers",
      (saved) => {
        saved.passengers = "bad";
      },
    ],
  ];
  for (const [name, corrupt] of corruptions) {
    const saved = structuredClone(valid);
    corrupt(saved);
    await page.evaluate(
      (saved) =>
        sessionStorage.setItem("tuxano-booking-v1", JSON.stringify(saved)),
      saved,
    );
    // A different query forces a real document load. Hash-only navigation would
    // keep in-memory state and fail to exercise deserialization of the draft.
    await page.goto(`/?restore-check=${name}#review`);
    await expect(
      page.getByRole("heading", { name: "RESERVATION REQUEST", exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Invalid Date");
    await expect(page.locator("body")).not.toContainText("$NaN");
    const normalized = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("tuxano-booking-v1")),
    );
    expect(
      Array.isArray(normalized.trip.stops),
      `${name}: stops remains an array`,
    ).toBe(true);
    expect(
      typeof normalized.billing.notes,
      `${name}: billing notes remains text`,
    ).toBe("string");
    expect(
      Number.isInteger(normalized.passengers),
      `${name}: passenger count remains an integer`,
    ).toBe(true);
    expect(normalized.passengers).toBeGreaterThanOrEqual(1);
    expect(normalized.passengers).toBeLessThanOrEqual(6);
    expect(
      normalized.trip.date === "" ||
        /^\d{4}-\d{2}-\d{2}$/.test(normalized.trip.date),
    ).toBe(true);
  }
  const forged = {
    ...empty,
    submitted: true,
    completed: 4,
    requestId: "TUX-REQUEST-FAKE",
    consent: false,
  };
  await page.evaluate(
    (saved) =>
      sessionStorage.setItem("tuxano-booking-v1", JSON.stringify(saved)),
    forged,
  );
  await page.goto("/?restore-check=forged-submission#thank-you");
  await expect(page).not.toHaveURL(/#thank-you$/);
  await expect(
    page.getByRole("heading", { name: "RESERVATION REQUEST", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("tuxano-booking-v1")).submitted,
    ),
  ).toBe(false);
});

test("keyboard focus survives count, aviation, toggle, and country rerenders", async ({
  page,
}) => {
  await reachPassengers(page);
  const increase = page.getByRole("button", {
    name: "Increase passengers",
    exact: true,
  });
  await increase.focus();
  await page.keyboard.press("Enter");
  await expect(increase).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(increase).toBeFocused();
  await expect(
    page
      .getByRole("group", { name: "passengers", exact: true })
      .locator("output"),
  ).toHaveText("3");
  const aviation = page.getByRole("button", {
    name: "PRIVATE AVIATION",
    exact: true,
  });
  await aviation.focus();
  await page.keyboard.press("Enter");
  await expect(aviation).toBeFocused();
  await expect(page.getByLabel("Operator", { exact: true })).toBeVisible();
  const meet = page.getByLabel("Meet & Greet", { exact: true });
  await meet.focus();
  await page.keyboard.press("Space");
  await expect(meet).toBeFocused();
  await expect(meet).toBeChecked();
  await setQuantity(page, "passengers", 6, 1);
  await expect(increase).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Decrease passengers", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: /continue to contact/i }).click();
  const country = page.getByLabel("Country", { exact: true });
  await country.focus();
  await country.selectOption({ label: "Canada" });
  await expect(country).toHaveValue("Canada");
  await expect(country).toBeFocused();
});

test("editing a submitted vehicle or extra blocks direct confirmation until valid resubmission", async ({
  page,
}) => {
  await reachReview(page);
  await submit(page);
  const originalId = (await page.locator("body").innerText()).match(
    /TUX-[A-Z0-9-]+/,
  )[0];
  await page.goBack();
  await route(page, "review");
  await editReviewSection(page, "2. SELECTED VEHICLE");
  await page
    .getByRole("button", { name: "Select & continue with Executive SUV", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("tuxano-booking-v1")).submitted,
    ),
  ).toBe(false);
  await page.evaluate(() => {
    location.hash = "thank-you";
  });
  await route(page, "passengers");
  await page.goto("/?edited-vehicle=1#thank-you");
  await expect(page).not.toHaveURL(/#thank-you$/);
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await expectTotal(page, 543);
  await submit(page);
  await expectTotal(page, 543);
  await expect(page.locator("body")).toContainText("Executive SUV");
  const changedId = (await page.locator("body").innerText()).match(
    /TUX-[A-Z0-9-]+/,
  )[0];
  expect(changedId).not.toBe(originalId);
  await page.goBack();
  await route(page, "review");
  await editReviewSection(page, "3. PASSENGERS & EXTRAS");
  await setToggle(page, "Meet & Greet", false);
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("tuxano-booking-v1")).submitted,
    ),
  ).toBe(false);
  await expectTotal(page, 493);
  await page.evaluate(() => {
    location.hash = "thank-you";
  });
  await route(page, "passengers");
  await page
    .getByRole("button", { name: "Step 5: Review & Submit", exact: true })
    .click();
  await submit(page);
  await expectTotal(page, 493);
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
]) {
  test(`${name} references: capture every step and confirmation with loaded assets`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    for (const [index, hash] of [
      "trip",
      "vehicles",
      "passengers",
      "contact",
      "review",
      "thank-you",
    ].entries()) {
      await page.goto(`/?demo=1#${hash === "thank-you" ? "review" : hash}`);
      if (hash === "thank-you") await submit(page);
      await route(page, hash);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((image) =>
            image.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                }),
          ),
        );
      });
      const failed = await page
        .locator("img")
        .evaluateAll((images) =>
          images
            .filter((image) => !image.complete || !image.naturalWidth)
            .map((image) => image.src),
        );
      expect(failed, `${hash} images loaded`).toEqual([]);
      const fonts = await page.evaluate(() => {
        const loaded = (family) =>
          [...document.fonts].some(
            (face) =>
              face.family.replace(/["']/g, "") === family &&
              face.status === "loaded",
          );
        return {
          serif:
            loaded("Cormorant Garamond") &&
            document.fonts.check('24px "Cormorant Garamond"'),
          sans:
            loaded("Plus Jakarta Sans") &&
            document.fonts.check('16px "Plus Jakarta Sans"'),
        };
      });
      expect(fonts).toEqual({ serif: true, sans: true });
      const sizes = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(
        sizes.page,
        `${name} ${hash} has no horizontal overflow`,
      ).toBeLessThanOrEqual(sizes.viewport + 1);
      await page.screenshot({
        path: testInfo.outputPath(
          `${name}-${index === 5 ? "thank-you" : `step-${index + 1}`}.png`,
        ),
        fullPage: true,
        animations: "disabled",
      });
    }
  });
}

// Includes the 640px breakpoint where a three-card row previously overflowed.
test("all six page layouts fit phones, intermediate breakpoints, and wide desktops", async ({
  page,
}) => {
  for (const width of [320, 375, 390, 640, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const hash of [
      "trip",
      "vehicles",
      "passengers",
      "contact",
      "review",
      "thank-you",
    ]) {
      await page.goto(`/?demo=1#${hash === "thank-you" ? "review" : hash}`);
      if (hash === "thank-you") await submit(page);
      await route(page, hash);
      await page.evaluate(() => document.fonts.ready);
      const sizes = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      expect(sizes.page, `${hash} fits at ${width}px`).toBeLessThanOrEqual(
        sizes.viewport + 1,
      );
    }
  }
});
