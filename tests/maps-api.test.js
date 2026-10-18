import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createMapsApiHandler } from "../maps-api.js";
import { createAppServer, loadLocalEnvironment } from "../server.js";

// Deliberately fake credentials. No live Google service or real key is used.
const browserKey = "browser.fixture.example";
const routesKey = "private.fixture.example";
const trip = {
  origin: { placeId: "pickup-place" },
  destination: { latitude: 41.9742, longitude: -87.9073 },
  stops: [{ placeId: "first-stop" }, { latitude: 41.8, longitude: -87.8 }],
};
const upstreamRoute = () => Response.json({
  routes: [{ distanceMeters: 32187, duration: "1800.5s", privateMetadata: "omit-me" }],
  providerDebug: routesKey,
});

async function startApi(t, options = {}) {
  const handler = createMapsApiHandler({ browserKey, routesKey, ...options });
  const server = http.createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.writeHead(404);
      res.end("Unrelated path");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    request(path = "/api/maps/route", options = {}) {
      return request(base, path, options);
    },
    route(payload = trip, options = {}) {
      return request(base, "/api/maps/route", { method: "POST", json: payload, ...options });
    },
  };
}

function request(base, path, { method = "GET", json, raw, chunks, headers = {}, localAddress } = {}) {
  return new Promise((resolve, reject) => {
    const body = json === undefined ? raw : JSON.stringify(json);
    const req = http.request(new URL(path, base), {
      method,
      agent: false,
      localAddress,
      headers: {
        ...(body !== undefined || chunks ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
    }, (res) => {
      const received = [];
      res.on("data", (chunk) => received.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const text = Buffer.concat(received).toString("utf8");
        let json;
        try { json = JSON.parse(text); } catch { /* Static/fallback responses may not be JSON. */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on("error", reject);
    if (chunks) for (const chunk of chunks) req.write(chunk);
    req.end(body);
  });
}

function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.json?.error?.code, code);
  assert.equal(typeof response.json.error.message, "string");
  assert.equal(response.text.includes(routesKey), false, "Private provider key must never reach clients");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  assert.equal(response.headers["cache-control"], "no-store");
}

test("public config exposes only the browser credential and configured flags", async (t) => {
  const client = await startApi(t);
  const response = await client.request("/api/maps/config");
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { browserKey, browserConfigured: true, routesConfigured: true });
  assert.equal(response.text.includes(routesKey), false);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["cross-origin-resource-policy"], "same-origin");

  const unconfigured = await startApi(t, { browserKey: "", routesKey: "" });
  assert.deepEqual((await unconfigured.request("/api/maps/config")).json, {
    browserKey: "", browserConfigured: false, routesConfigured: false,
  });
  expectError(await unconfigured.route(), 503, "ROUTES_NOT_CONFIGURED");
});

test("route proxy preserves stop order, requests minimal Google fields, and whitelists its result", async (t) => {
  const calls = [];
  const client = await startApi(t, {
    now: () => Date.UTC(2027, 0, 1),
    fetchImpl: async (url, options) => { calls.push({ url, options }); return upstreamRoute(); },
  });
  const response = await client.route(trip, { headers: { Origin: client.base, "Sec-Fetch-Site": "same-origin" } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, {
    distanceMeters: 32187, durationSeconds: 1800.5, provider: "google", calculatedAt: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, "https://routes.googleapis.com/directions/v2:computeRoutes");
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers["X-Goog-Api-Key"], routesKey);
  assert.deepEqual(options.headers["X-Goog-FieldMask"].split(",").sort(), ["routes.distanceMeters", "routes.duration"]);
  assert.deepEqual(JSON.parse(options.body), {
    origin: { placeId: "pickup-place" },
    destination: { location: { latLng: { latitude: 41.9742, longitude: -87.9073 } } },
    intermediates: [
      { placeId: "first-stop" },
      { location: { latLng: { latitude: 41.8, longitude: -87.8 } } },
    ],
    travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", optimizeWaypointOrder: false,
  });
  assert.equal(response.text.includes(routesKey), false);
  assert.equal(response.text.includes("omit-me"), false);
});

test("invalid endpoints and client-controlled route options are rejected before Google is contacted", async (t) => {
  let calls = 0;
  const client = await startApi(t, { fetchImpl: async () => { calls++; return upstreamRoute(); } });
  const invalid = [
    ["missing origin", { destination: trip.destination }],
    ["missing destination", { origin: trip.origin }],
    ["too many stops", { ...trip, stops: Array.from({ length: 6 }, () => ({ placeId: "stop" })) }],
    ["non-array stops", { ...trip, stops: "untrusted" }],
    ["latitude out of range", { ...trip, origin: { latitude: 91, longitude: 0 } }],
    ["longitude out of range", { ...trip, origin: { latitude: 0, longitude: -181 } }],
    ["coordinate strings", { ...trip, origin: { latitude: "41.8", longitude: -87.8 } }],
    ["null coordinate", { ...trip, origin: { latitude: null, longitude: -87.8 } }],
    ["unselected address", { ...trip, origin: { address: "123 Main Street" } }],
    ["empty place ID", { ...trip, origin: { placeId: " " } }],
    ["mixed waypoint forms", { ...trip, origin: { placeId: "a", latitude: 0, longitude: 0 } }],
    ["extra provider options", { ...trip, optimizeWaypointOrder: true }],
  ];
  for (const [name, payload] of invalid) {
    await t.test(name, async () => expectError(await client.route(payload), 400, "INVALID_ROUTE"));
  }
  assert.equal(calls, 0);
});

test("cross-origin and cross-site requests are rejected, without permissive CORS", async (t) => {
  let calls = 0;
  const client = await startApi(t, { fetchImpl: async () => { calls++; return upstreamRoute(); } });
  for (const headers of [
    { Origin: "https://unrelated.example" },
    { Origin: `${client.base}/forged-path` },
    { Origin: client.base, "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
  ]) expectError(await client.route(trip, { headers }), 403, "SAME_ORIGIN_REQUIRED");
  expectError(await client.request("/api/maps/config", { headers: { Origin: "https://unrelated.example" } }), 403, "SAME_ORIGIN_REQUIRED");
  assert.equal(calls, 0);
});

test("HTTP methods, unknown API paths, and unrelated-handler fallthrough are explicit", async (t) => {
  const client = await startApi(t);
  const route = await client.request();
  expectError(route, 405, "METHOD_NOT_ALLOWED");
  assert.equal(route.headers.allow, "POST");
  const config = await client.request("/api/maps/config", { method: "POST" });
  expectError(config, 405, "METHOD_NOT_ALLOWED");
  assert.equal(config.headers.allow, "GET");
  expectError(await client.request("/api/maps/not-an-endpoint"), 404, "NOT_FOUND");
  const unrelated = await client.request("/outside-maps");
  assert.equal(unrelated.status, 404);
  assert.equal(unrelated.text, "Unrelated path");
});

test("JSON media type, malformed bodies, and declared/chunked size limits are enforced", async (t) => {
  let calls = 0;
  const client = await startApi(t, { fetchImpl: async () => { calls++; return upstreamRoute(); } });
  expectError(await client.route(trip, { headers: { "Content-Type": "text/plain" } }), 415, "UNSUPPORTED_MEDIA_TYPE");
  expectError(await client.request("/api/maps/route", { method: "POST", raw: "{broken" }), 400, "INVALID_JSON");
  const oversized = JSON.stringify({ ...trip, extra: "x".repeat(17 * 1024) });
  expectError(await client.request("/api/maps/route", {
    method: "POST", raw: oversized, headers: { "Content-Length": Buffer.byteLength(oversized) },
  }), 413, "REQUEST_TOO_LARGE");
  expectError(await client.request("/api/maps/route", {
    method: "POST", chunks: ["x".repeat(8 * 1024), "y".repeat(9 * 1024)],
  }), 413, "REQUEST_TOO_LARGE");
  assert.equal(calls, 0);
});

test("upstream permission/quota/network failures are sanitized and can be retried", async (t) => {
  for (const status of [403, 429]) {
    await t.test(`Google HTTP ${status}`, async (t) => {
      let calls = 0;
      const client = await startApi(t, { fetchImpl: async () => {
        calls++;
        return calls === 1 ? Response.json({ error: { message: `Provider detail ${routesKey}`, status } }, { status }) : upstreamRoute();
      } });
      const failed = await client.route();
      expectError(failed, 502, "ROUTE_PROVIDER_ERROR");
      assert.equal(failed.text.includes("Provider detail"), false);
      assert.equal((await client.route()).status, 200);
      assert.equal(calls, 2);
    });
  }
  const client = await startApi(t, { fetchImpl: async () => { throw new Error(`Network detail ${routesKey}`); } });
  const failed = await client.route();
  expectError(failed, 502, "ROUTE_PROVIDER_ERROR");
  assert.equal(failed.text.includes("Network detail"), false);
});

test("missing or malformed provider routes do not become a usable quote", async (t) => {
  for (const [name, body, status, code] of [
    ["no route", { routes: [] }, 422, "ROUTE_NOT_FOUND"],
    ["missing distance", { routes: [{ duration: "120s" }] }, 502, "INVALID_PROVIDER_RESPONSE"],
    ["negative distance", { routes: [{ distanceMeters: -1, duration: "120s" }] }, 502, "INVALID_PROVIDER_RESPONSE"],
    ["malformed duration", { routes: [{ distanceMeters: 100, duration: "2 minutes" }] }, 502, "INVALID_PROVIDER_RESPONSE"],
    ["negative duration", { routes: [{ distanceMeters: 100, duration: "-1s" }] }, 502, "INVALID_PROVIDER_RESPONSE"],
  ]) {
    await t.test(name, async (t) => {
      const client = await startApi(t, { fetchImpl: async () => Response.json(body) });
      expectError(await client.route(), status, code);
    });
  }
});

test("slow provider requests are aborted and return a sanitized timeout", async (t) => {
  let aborted = false;
  const client = await startApi(t, {
    timeoutMs: 15,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new Error(`Timeout ${routesKey}`)); }, { once: true });
    }),
  });
  expectError(await client.route(), 504, "ROUTE_TIMEOUT");
  assert.equal(aborted, true);
});

test("identical route requests each fetch a fresh provider result and forbid HTTP caching", async (t) => {
  let timestamp = Date.UTC(2027, 0, 1);
  let calls = 0;
  const client = await startApi(t, {
    now: () => timestamp,
    fetchImpl: async () => {
      calls++;
      return Response.json({ routes: [{ distanceMeters: calls * 1000, duration: `${calls * 60}s` }] });
    },
  });
  const first = await client.route();
  assert.equal(first.status, 200);
  assert.equal(first.json.distanceMeters, 1000);
  assert.equal(first.json.durationSeconds, 60);
  assert.equal(first.headers["cache-control"], "no-store");
  timestamp += 1000;
  const second = await client.route();
  assert.equal(second.status, 200);
  assert.equal(calls, 2, "Identical requests must each contact the provider");
  assert.equal(second.json.distanceMeters, 2000);
  assert.equal(second.json.durationSeconds, 120);
  assert.equal(second.headers["cache-control"], "no-store");
  assert.notEqual(second.json.calculatedAt, first.json.calculatedAt);
});

test("changing the stop order forwards that exact order to Google without optimization", async (t) => {
  const payloads = [];
  const client = await startApi(t, {
    fetchImpl: async (_url, options) => {
      payloads.push(JSON.parse(options.body));
      return upstreamRoute();
    },
  });
  assert.equal((await client.route()).status, 200);
  assert.equal((await client.route({ ...trip, stops: [...trip.stops].reverse() })).status, 200);
  assert.equal(payloads.length, 2);
  const firstStop = { placeId: "first-stop" };
  const secondStop = { location: { latLng: { latitude: 41.8, longitude: -87.8 } } };
  assert.deepEqual(payloads[0].intermediates, [firstStop, secondStop]);
  assert.deepEqual(payloads[1].intermediates, [secondStop, firstStop]);
  assert.equal(payloads[0].optimizeWaypointOrder, false);
  assert.equal(payloads[1].optimizeWaypointOrder, false);
  assert.deepEqual(payloads[1].origin, payloads[0].origin);
  assert.deepEqual(payloads[1].destination, payloads[0].destination);
});

test("route requests are rate-limited per client and become available after the window", async (t) => {
  let timestamp = Date.UTC(2027, 0, 1);
  let calls = 0;
  const client = await startApi(t, { now: () => timestamp, fetchImpl: async () => { calls++; return upstreamRoute(); } });
  for (let index = 0; index < 30; index++) assert.equal((await client.route()).status, 200);
  const limited = await client.route();
  expectError(limited, 429, "RATE_LIMITED");
  assert.equal(limited.headers["retry-after"], "60");
  assert.equal(calls, 30, "Throttled request must not call the provider");
  timestamp += 60_000;
  assert.equal((await client.route()).status, 200);
  assert.equal(calls, 31);
});

test("application server serves public files and API routes without exposing server files or credentials", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "car-maps-static-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const site = join(temporary, "site");
  await mkdir(join(site, "assets"), { recursive: true });
  for (const [name, text] of [
    ["index.html", "<h1>Booking fixture</h1>"],
    ["app.js", "export const fixture = true;"],
    ["maps.js", "export const mapsFixture = true;"],
    ["pricing.js", "export const pricingFixture = true;"],
    [".env.local", `GOOGLE_ROUTES_API_KEY=${routesKey}`],
    ["maps-api.js", `const privateCredential = '${routesKey}';`],
    ["server.js", `const serverCredential = '${routesKey}';`],
    ["package.json", '{"private":true}'],
  ]) await writeFile(join(site, name), text);
  await writeFile(join(temporary, "private.txt"), routesKey);
  await symlink(join(site, ".env.local"), join(site, "assets", "alias.txt"));
  await symlink(join(temporary, "private.txt"), join(site, "assets", "outside.txt"));
  const server = createAppServer({ rootDirectory: site, browserKey, routesKey, fetchImpl: async () => upstreamRoute() });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const path of ["/", "/app.js", "/maps.js", "/pricing.js"]) {
    const response = await request(base, path);
    assert.equal(response.status, 200, `Public resource ${path} must load`);
    assert.equal(response.text.includes(routesKey), false);
  }
  for (const path of ["/.env.local", "/%2eenv.local", "/server.js", "/maps-api.js", "/package.json", "/assets/alias.txt", "/assets/outside.txt"]) {
    const response = await request(base, path);
    assert.equal(response.status, 404, `Private resource ${path} must not be served`);
    assert.equal(response.text.includes(routesKey), false);
  }
  const config = await request(base, "/api/maps/config");
  assert.equal(config.status, 200);
  assert.equal(config.json.browserKey, browserKey);
  assert.equal(config.text.includes(routesKey), false);
  assert.equal((await request(base, "/api/maps/route", { method: "POST", json: trip })).status, 200);
  const head = await request(base, "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.text, "");
});

test("local environment loading preserves injected bindings and does not evaluate shell expressions", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "car-maps-env-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const path = join(temporary, ".env.local");
  await writeFile(path, [
    "# Test-only bindings",
    `GOOGLE_ROUTES_API_KEY=local.fixture.example`,
    `export GOOGLE_MAPS_BROWSER_KEY='${browserKey}'`,
    'LITERAL_VALUE="$(never-run) ${UNCHANGED}"',
    'EMPTY_VALUE=',
  ].join("\n"));
  const bindings = { GOOGLE_ROUTES_API_KEY: routesKey };
  assert.equal(await loadLocalEnvironment(path, bindings), true);
  assert.equal(bindings.GOOGLE_ROUTES_API_KEY, routesKey);
  assert.equal(bindings.GOOGLE_MAPS_BROWSER_KEY, browserKey);
  assert.equal(bindings.LITERAL_VALUE, "$(never-run) ${UNCHANGED}");
  assert.equal(bindings.EMPTY_VALUE, "");
  assert.equal(await loadLocalEnvironment(join(temporary, "missing"), {}), false);
});
