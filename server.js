import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createMapsApiHandler } from "./maps-api.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicFiles = new Set(["index.html", "terms.html", "privacy.html", "styles.css", "app.js", "maps.js", "pricing.js"]);
const assetExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".ttf", ".woff", ".woff2", ".txt", ".md"]);
const previewExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

/** Read local bindings without shell evaluation, interpolation, or replacing injected values. */
export async function loadLocalEnvironment(path = resolve(root, ".env.local"), environment = process.env) {
  let contents;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw new Error("Local environment configuration could not be read.");
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(environment, match[1])) continue;
    let value = match[2];
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const quoted = value.match(quote === '"' ? /^"((?:\\.|[^"\\])*)"\s*(?:#.*)?$/ : /^'([^']*)'\s*(?:#.*)?$/);
      if (!quoted) throw new Error("Local environment configuration contains an invalid quoted value.");
      value = quoted[1];
      if (quote === '"') value = value.replace(/\\([nrt"\\])/g, (_, escaped) => ({ n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" })[escaped]);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    environment[match[1]] = value;
  }
  return true;
}

function isPublicPath(path) {
  const parts = path.split(/[\\/]/);
  if (parts.some((part) => !part || part.startsWith(".") || part === "node_modules")) return false;
  if (publicFiles.has(path)) return true;
  const extension = extname(path).toLowerCase();
  if (parts[0] === "assets" && assetExtensions.has(extension)) return true;
  return parts[0] === "docs" && parts[1] === "previews" && previewExtensions.has(extension);
}

export function createAppServer({ rootDirectory = root, ...mapsOptions } = {}) {
  const base = resolve(rootDirectory);
  const mapsHandler = createMapsApiHandler(mapsOptions);
  const server = http.createServer(async (req, res) => {
    try {
      if (await mapsHandler(req, res)) return;
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { Allow: "GET, HEAD", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const requested = pathname === "/" ? "index.html" : pathname.slice(1);
      if (!isPublicPath(requested)) throw new Error("Not a public path");
      const path = resolve(base, requested);
      if (!path.startsWith(base + sep)) throw new Error("Invalid path");
      const actualPath = await realpath(path);
      const actualRelative = relative(base, actualPath).split(sep).join("/");
      if (!isPublicPath(actualRelative) || !(await stat(actualPath)).isFile()) throw new Error("Not a public file");
      const data = await readFile(actualPath);
      res.writeHead(200, {
        "Content-Type": types[extname(actualPath).toLowerCase()] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : "Not found");
    }
  });
  server.requestTimeout = 20_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await loadLocalEnvironment();
    const portIndex = process.argv.indexOf("--port");
    const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("Use a valid server port.");
    const server = createAppServer();
    server.on("error", () => {
      console.error("The booking server could not start. Check the configured port.");
      process.exitCode = 1;
    });
    server.listen(port, "0.0.0.0", () => console.log(`Car Pro Form listening on port ${server.address().port}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
