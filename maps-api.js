const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const BODY_LIMIT = 16 * 1024;
const RATE_WINDOW = 60 * 1000;
const RATE_LIMIT = 30;
const RATE_CLIENT_LIMIT = 1000;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, value, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...extraHeaders,
  });
  res.end(JSON.stringify(value));
}

function validateSameOrigin(req) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError(403, "SAME_ORIGIN_REQUIRED", "Use the booking website to make this request.");
  }
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.host.toLowerCase() !== String(req.headers.host || "").toLowerCase() ||
      parsed.username || parsed.password || parsed.origin !== origin
    ) throw new Error("Origin mismatch");
  } catch {
    throw new ApiError(403, "SAME_ORIGIN_REQUIRED", "Use the booking website to make this request.");
  }
}

async function readJsonBody(req) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(req.headers["content-type"] || "")) {
    req.resume();
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the route request as JSON.");
  }
  if (Number(req.headers["content-length"]) > BODY_LIMIT) {
    req.resume();
    throw new ApiError(413, "REQUEST_TOO_LARGE", "The route request is too large.");
  }
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let finished = false;
    req.on("data", (chunk) => {
      if (finished) return;
      length += chunk.length;
      if (length > BODY_LIMIT) {
        finished = true;
        chunks.length = 0;
        reject(new ApiError(413, "REQUEST_TOO_LARGE", "The route request is too large."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks));
    });
    const interrupted = () => {
      if (finished) return;
      finished = true;
      reject(new ApiError(400, "INVALID_REQUEST", "The route request was interrupted."));
    };
    req.on("aborted", interrupted);
    req.on("error", interrupted);
  });
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Send a valid JSON route request.");
  }
}

function invalidRoute() {
  return new ApiError(400, "INVALID_ROUTE", "Choose valid pickup, destination, and up to five stops.");
}

function canonicalWaypoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRoute();
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "placeId") {
    if (
      typeof value.placeId !== "string" || !value.placeId.trim() ||
      value.placeId.length > 512 || /[\u0000-\u001f\u007f]/.test(value.placeId)
    ) throw invalidRoute();
    return { placeId: value.placeId.trim() };
  }
  if (
    keys.length !== 2 || !keys.includes("latitude") || !keys.includes("longitude") ||
    typeof value.latitude !== "number" || !Number.isFinite(value.latitude) ||
    value.latitude < -90 || value.latitude > 90 ||
    typeof value.longitude !== "number" || !Number.isFinite(value.longitude) ||
    value.longitude < -180 || value.longitude > 180
  ) throw invalidRoute();
  return { location: { latLng: { latitude: value.latitude, longitude: value.longitude } } };
}

function canonicalRoute(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalidRoute();
  if (Object.keys(body).some((key) => !["origin", "destination", "stops"].includes(key))) throw invalidRoute();
  const stops = body.stops === undefined ? [] : body.stops;
  if (!Array.isArray(stops) || stops.length > 5) throw invalidRoute();
  return {
    origin: canonicalWaypoint(body.origin),
    destination: canonicalWaypoint(body.destination),
    intermediates: stops.map(canonicalWaypoint),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_UNAWARE",
    optimizeWaypointOrder: false,
  };
}

function normalizeRoute(body, now) {
  if (!body || typeof body !== "object" || !Array.isArray(body.routes) || !body.routes.length) {
    throw new ApiError(422, "ROUTE_NOT_FOUND", "No driving route was found. Check the selected locations.");
  }
  const route = body.routes[0];
  const distanceMeters = route?.distanceMeters;
  const duration = route?.duration;
  if (
    typeof distanceMeters !== "number" || !Number.isSafeInteger(distanceMeters) || distanceMeters < 0 ||
    typeof duration !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,9})?s$/.test(duration)
  ) throw new ApiError(502, "INVALID_PROVIDER_RESPONSE", "The route provider returned incomplete route information.");
  const durationSeconds = Number(duration.slice(0, -1));
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new ApiError(502, "INVALID_PROVIDER_RESPONSE", "The route provider returned incomplete route information.");
  }
  return { distanceMeters, durationSeconds, provider: "google", calculatedAt: new Date(now).toISOString() };
}

/** Handles /api/maps/* and returns true; returns false for unrelated paths. */
export function createMapsApiHandler({
  fetchImpl = globalThis.fetch,
  browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY || "",
  routesKey = process.env.GOOGLE_ROUTES_API_KEY || "",
  timeoutMs = 12_000,
  now = Date.now,
} = {}) {
  const publicKey = typeof browserKey === "string" ? browserKey.trim() : "";
  const privateKey = typeof routesKey === "string" ? routesKey.trim() : "";
  const clients = new Map();

  function checkRate(req, timestamp) {
    const ip = req.socket?.remoteAddress || "unknown";
    let client = clients.get(ip);
    if (!client || timestamp - client.startedAt >= RATE_WINDOW) {
      client = { startedAt: timestamp, count: 0 };
      clients.delete(ip);
      if (clients.size >= RATE_CLIENT_LIMIT) clients.delete(clients.keys().next().value);
      clients.set(ip, client);
    }
    client.count += 1;
    if (client.count > RATE_LIMIT) {
      throw new ApiError(429, "RATE_LIMITED", "Too many route requests. Please wait a minute and try again.");
    }
  }

  return async function mapsApiHandler(req, res) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/api/maps/") && pathname !== "/maps-config.json") return false;
    try {
      validateSameOrigin(req);
      if (pathname === "/api/maps/config" || pathname === "/maps-config.json") {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET for map configuration." } }, { Allow: "GET" });
          return true;
        }
        sendJson(res, 200, { browserKey: publicKey, browserConfigured: Boolean(publicKey), routesConfigured: Boolean(privateKey), providerMode: "server" });
        return true;
      }
      if (pathname !== "/api/maps/route") throw new ApiError(404, "NOT_FOUND", "This map endpoint does not exist.");
      if (req.method !== "POST") {
        sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST to calculate a route." } }, { Allow: "POST" });
        return true;
      }
      checkRate(req, now());
      const payload = canonicalRoute(await readJsonBody(req));
      if (!privateKey) throw new ApiError(503, "ROUTES_NOT_CONFIGURED", "Route calculation is not configured yet.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      timer.unref?.();
      let result;
      try {
        const upstream = await fetchImpl(ROUTES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": privateKey,
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          redirect: "error",
        });
        if (!upstream.ok) {
          throw new ApiError(502, "ROUTE_PROVIDER_ERROR", "Route calculation is temporarily unavailable. Please try again.");
        }
        let upstreamBody;
        try {
          upstreamBody = await upstream.json();
        } catch {
          if (controller.signal.aborted) throw new Error("Route timeout");
          throw new ApiError(502, "INVALID_PROVIDER_RESPONSE", "The route provider returned incomplete route information.");
        }
        result = normalizeRoute(upstreamBody, now());
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ApiError(504, "ROUTE_TIMEOUT", "Route calculation took too long. Please try again.");
        }
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, "ROUTE_PROVIDER_ERROR", "Route calculation is temporarily unavailable. Please try again.");
      } finally {
        clearTimeout(timer);
      }
      sendJson(res, 200, result);
    } catch (error) {
      const safe = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "The route request could not be completed.");
      sendJson(res, safe.status, { error: { code: safe.code, message: safe.message } }, safe.status === 429 ? { "Retry-After": "60" } : {});
    }
    return true;
  };
}
