import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteTransportation, formatDuration } from "../pricing.js";

// Independent route measurements and expected dollar amounts, rather than
// calculating expectations from the implementation's tariff table.
const twentyMiles = { distanceMeters: 32186.88, durationSeconds: 1800 };
const tenMiles = { distanceMeters: 16093.44, durationSeconds: 1200 };

test("a measured 20-mile, 30-minute route gives the six published demo fares", () => {
  for (const [vehicle, expected] of [
    ["premium", 195], ["luxury", 225], ["executive", 265],
    ["ghost", 1250], ["cullinan", 1850], ["phantom", 3250],
  ]) {
    const quote = quoteTransportation(vehicle, twentyMiles);
    assert.equal(quote.transportation, expected, vehicle);
    assert.equal(quote.drivingCharge, expected, vehicle);
    assert.equal(quote.waitingCharge, 0, vehicle);
  }
});

test("a different measured route and its waiting time produce an independent transfer quote", () => {
  // Luxury: $75 + $30 mileage + $60 driving + $15 waiting.
  const quote = quoteTransportation("luxury", tenMiles, 10);
  assert.equal(quote.drivingCharge, 165);
  assert.equal(quote.waitingCharge, 15);
  assert.equal(quote.transportation, 180);
  assert.equal(quote.drivingMinutes, 20);
  assert.equal(quote.waitingMinutes, 10);
  assert.equal(quote.totalDurationSeconds, 1800, "Waiting contributes once to travel time");
  assert.ok(Math.abs(quote.miles - 10) < 1e-10);
  assert.ok(Math.abs(quote.kilometers - 16.09344) < 1e-10);
  assert.deepEqual(tenMiles, { distanceMeters: 16093.44, durationSeconds: 1200 }, "Route metrics are not mutated");
});

test("distance and driving duration both affect a transfer fare", () => {
  const moreDistance = quoteTransportation("luxury", { distanceMeters: 32186.88, durationSeconds: 1200 });
  const moreDriving = quoteTransportation("luxury", { distanceMeters: 16093.44, durationSeconds: 1800 });
  const longerRoute = quoteTransportation("luxury", { distanceMeters: 48280.32, durationSeconds: 3600 });
  assert.equal(moreDistance.transportation, 195);
  assert.equal(moreDriving.transportation, 195);
  assert.equal(longerRoute.transportation, 345);
});

test("waiting is charged outside the transfer minimum and remains vehicle-specific", () => {
  const shortRoute = { distanceMeters: 1609.344, durationSeconds: 60 };
  const luxury = quoteTransportation("luxury", shortRoute, 10);
  assert.equal(luxury.drivingCharge, 125);
  assert.equal(luxury.waitingCharge, 15);
  assert.equal(luxury.transportation, 140);
  assert.equal(luxury.totalDurationSeconds, 660);
  assert.equal(quoteTransportation("premium", shortRoute, 10).transportation, 110);
  assert.equal(quoteTransportation("phantom", shortRoute, 10).transportation, 1600);
  assert.equal(quoteTransportation("luxury", { distanceMeters: 0, durationSeconds: 0 }).transportation, 125);
});

test("combined stop waits are added once to fare and driving duration", () => {
  const quote = quoteTransportation("luxury", twentyMiles, 5 + 10 + 15);
  assert.equal(quote.drivingCharge, 225);
  assert.equal(quote.waitingCharge, 45);
  assert.equal(quote.transportation, 270);
  assert.equal(quote.totalDurationSeconds, 3600);
  assert.equal(quoteTransportation("luxury", twentyMiles, 600).waitingCharge, 900);
});

test("hourly hire uses booked time plus road mileage and explicit waiting", () => {
  const quote = quoteTransportation("luxury", twentyMiles, 15, "hourly", 4);
  assert.equal(quote.drivingCharge, 520, "Four hours at $115 plus $60 mileage");
  assert.equal(quote.waitingCharge, 22.5);
  assert.equal(quote.transportation, 542.5);
  assert.equal(quote.totalDurationSeconds, 2700, "Travel time is driving plus stops, not the booked hire period");
  assert.equal(quoteTransportation("luxury", { distanceMeters: 0, durationSeconds: 60 }, 0, "hourly", 3).transportation, 345);
});

test("hourly hire charges driving beyond the booked period without double-counting stop waits", () => {
  const quote = quoteTransportation("luxury", { distanceMeters: 32186.88, durationSeconds: 18000 }, 15, "hourly", 4);
  assert.equal(quote.drivingCharge, 635, "Five driving hours at $115 plus $60 mileage");
  assert.equal(quote.waitingCharge, 22.5);
  assert.equal(quote.transportation, 657.5);
  assert.equal(quote.totalDurationSeconds, 18900);
});

test("unknown vehicles, invalid route measurements, and invalid wait values cannot yield NaN quotes", () => {
  for (const vehicle of ["unknown", "__proto__", "constructor", "toString", "", null]) {
    assert.throws(() => quoteTransportation(vehicle, twentyMiles), TypeError);
  }
  for (const route of [
    null, {}, { distanceMeters: 100 },
    { distanceMeters: -1, durationSeconds: 1 },
    { distanceMeters: 1, durationSeconds: -1 },
    { distanceMeters: "100", durationSeconds: 60 },
    { distanceMeters: 100, durationSeconds: "60" },
    { distanceMeters: NaN, durationSeconds: 60 },
    { distanceMeters: 100, durationSeconds: Infinity },
  ]) assert.throws(() => quoteTransportation("luxury", route), TypeError);
  for (const wait of [-1, 601, "10", null, NaN, Infinity]) {
    assert.throws(() => quoteTransportation("luxury", twentyMiles, wait), TypeError);
  }
});

test("unsupported services and hourly durations outside the documented range are rejected", () => {
  assert.throws(() => quoteTransportation("luxury", twentyMiles, 0, "unsupported"), TypeError);
  for (const hours of [1, 2, 25, 2.5, "4", null, Infinity]) {
    assert.throws(() => quoteTransportation("luxury", twentyMiles, 0, "hourly", hours), TypeError);
  }
  assert.equal(quoteTransportation("luxury", { distanceMeters: 0, durationSeconds: 0 }, 0, "hourly", 24).transportation, 2760);
});

test("travel-duration labels round seconds up to minutes without confusing them with pickup time", () => {
  for (const [seconds, expected] of [
    [0, "0 min"], [1, "1 min"], [60, "1 min"], [61, "2 min"],
    [3599, "1 hr"], [3600, "1 hr"], [3661, "1 hr 2 min"],
    [7200, "2 hrs"], [7260, "2 hrs 1 min"],
  ]) assert.equal(formatDuration(seconds), expected);
  for (const invalid of [undefined, null, "60", -1, NaN, Infinity]) {
    assert.equal(formatDuration(invalid), "Not calculated");
  }
});
