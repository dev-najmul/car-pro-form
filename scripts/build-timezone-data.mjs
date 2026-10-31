/**
 * Rebuild the exact, server-only geographical timezone data.
 *
 * npm install --prefix /tmp/tuxano-timezones geo-tz@8.1.10 \
 *   cldr-core@49.0.0 cldr-dates-full@49.0.0 cldr-bcp47@49.0.0 --ignore-scripts
 * node scripts/build-timezone-data.mjs /tmp/tuxano-timezones/node_modules
 *
 * No Node/npm runtime is needed by the installed WordPress plugin.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, openSync, readSync, writeSync, closeSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dependencyRoot = process.argv[2] && resolve(process.argv[2]);
if (!dependencyRoot) throw new Error('Pass the directory containing the pinned development-only node_modules.');
const source = join(dependencyRoot, 'geo-tz');
const sourceRequire = createRequire(join(source, 'package.json'));
const geobuf = sourceRequire('geobuf');
const Pbf = sourceRequire('pbf');
const hash = data => createHash('sha256').update(data).digest('hex');
const packageData = JSON.parse(readFileSync(join(source, 'package.json')));
if (packageData.version !== '8.1.10') throw new Error('This converter requires geo-tz 8.1.10.');
const inputIndex = readFileSync(join(source, 'data/timezones-1970.geojson.index.json'));
const index = JSON.parse(inputIndex);
const inputDataPath = join(source, 'data/timezones-1970.geojson.geo.dat');
const inputData = readFileSync(inputDataPath);
if (hash(inputIndex) !== '9ef48a399c4b0d1394e6c90065673d697a1ee7b91288373b68acae488e7149da' || hash(inputData) !== 'f9a59c9aec9c2470f4e72a1625298bfe347115c3637daca00d8e3bf47e6fb3f7') throw new Error('The pinned upstream geographical dataset checksum changed.');
const destination = join(root, 'wordpress/tuxano-booking/data/timezones');
mkdirSync(destination, { recursive: true });
const outputPath = join(destination, 'tiles.dat');
const outputFile = openSync(outputPath, 'w');
const inputFile = openSync(inputDataPath, 'r');
const maximumGroupBytes = 1024 * 1024;
let position = 0, tiles = 0, groups = 0, maxCompressed = 0, maxDecoded = 0, coordinates = 0, rings = 0, maximumBinaryTileBytes = 0;
let pending = [], pendingLeaves = [], pendingSize = 0;
function flush() {
  if (!pending.length) return;
  const raw = Buffer.concat(pending);
  const compressed = gzipSync(raw, { level: 9 });
  for (const leaf of pendingLeaves) { leaf.pos = position; leaf.len = compressed.length; }
  writeSync(outputFile, compressed);
  position += compressed.length; groups++;
  maxCompressed = Math.max(maxCompressed, compressed.length);
  maxDecoded = Math.max(maxDecoded, raw.length);
  pending = []; pendingLeaves = []; pendingSize = 0;
}
const timezoneIndex = new Map(index.timezones.map((name, number) => [name, number]));
let maximumRoundTripDeviation = 0;
const encodeRing = ring => {
  if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error('A source polygon ring is not closed.');
  rings++;
  let previousLongitude = 0, previousLatitude = 0;
  const encoded = [];
  for (const [longitude, latitude] of ring) {
    const lng = Math.round(longitude * 1000000), lat = Math.round(latitude * 1000000);
    const deviation = Math.max(Math.abs(longitude - lng / 1000000), Math.abs(latitude - lat / 1000000));
    maximumRoundTripDeviation = Math.max(maximumRoundTripDeviation, deviation);
    if (deviation > 1e-10) throw new Error('Source geometry has precision exceeding microdegrees.');
    encoded.push(lng - previousLongitude, lat - previousLatitude);
    previousLongitude = lng; previousLatitude = lat; coordinates++;
  }
  // Validate every generated integer stream against its source; this catches
  // lost signs, overflow, truncation and non-closed rings during regeneration.
  let lng = 0, lat = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    lng += encoded[i]; lat += encoded[i + 1];
    if (Math.abs(lng / 1000000 - ring[i / 2][0]) > 1e-10 || Math.abs(lat / 1000000 - ring[i / 2][1]) > 1e-10) throw new Error('Coordinate round-trip failed.');
  }
  // The last source point duplicates the first. TZB1 closes each ring
  // implicitly, preserving that exact segment while avoiding duplicate bytes.
  return encoded.slice(0, -2);
};
function convert(node) {
  if (Array.isArray(node)) return node;
  if (Number.isInteger(node.pos) && Number.isInteger(node.len)) {
    const buffer = Buffer.alloc(node.len);
    if (readSync(inputFile, buffer, 0, node.len, node.pos) !== node.len) throw new Error('Incomplete source geometry.');
    const decoded = geobuf.decode(new Pbf(buffer));
    const features = decoded.features.map(feature => {
      if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type) || typeof feature.properties.tzid !== 'string') throw new Error('Unsupported source geometry.');
      const geometry = feature.geometry;
      geometry.coordinates = geometry.type === 'Polygon' ? geometry.coordinates.map(encodeRing) : geometry.coordinates.map(polygon => polygon.map(encodeRing));
      return { tzid: feature.properties.tzid, geometry };
    });
    const bytes = [84, 90, 66, 49]; // TZB1
    const unsigned = original => {
      if (!Number.isSafeInteger(original) || original < 0 || original > 0x7fffffff) throw new Error('Invalid generated unsigned varint.');
      const start = bytes.length;
      let value = original;
      while (value > 127) { bytes.push((value % 128) | 128); value = Math.floor(value / 128); }
      bytes.push(value);
      let decoded = 0, scale = 1;
      for (let i = start; i < bytes.length; i++) { decoded += (bytes[i] & 127) * scale; scale *= 128; }
      if (decoded !== original) throw new Error('Binary varint round-trip failed.');
    };
    unsigned(features.length);
    for (const feature of features) {
      unsigned(timezoneIndex.get(feature.tzid));
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      unsigned(polygons.length);
      for (const polygon of polygons) {
        unsigned(polygon.length);
        for (const ring of polygon) {
          unsigned(ring.length / 2);
          for (const delta of ring) unsigned(delta < 0 ? -2 * delta - 1 : 2 * delta);
        }
      }
    }
    const raw = Buffer.from(bytes);
    if (raw.length > maximumGroupBytes) throw new Error('A source tile exceeds the bounded gzip group size.');
    if (pendingSize + raw.length > maximumGroupBytes) flush();
    const result = { pos: 0, len: 0, offset: pendingSize, bytes: raw.length };
    pendingLeaves.push(result); pending.push(raw); pendingSize += raw.length; tiles++;
    maximumBinaryTileBytes = Math.max(maximumBinaryTileBytes, raw.length);
    return result;
  }
  return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, convert(child)]));
}
try { index.lookup = convert(index.lookup); flush(); index.format = 'tzb1-grouped-v1'; }
finally { closeSync(inputFile); closeSync(outputFile); }
writeFileSync(join(destination, 'index.json'), JSON.stringify(index));
writeFileSync(join(destination, 'LICENSE-geo-tz-MIT.txt'), readFileSync(join(source, 'LICENSE.md')));

// CLDR supplies English generic timezone names (Eastern Time, Central Time,
// etc.). PHP's timezone database remains authoritative for date-specific DST.
const cldrCore = join(dependencyRoot, 'cldr-core');
const cldrDates = join(dependencyRoot, 'cldr-dates-full');
const cldrBcp47 = join(dependencyRoot, 'cldr-bcp47');
for (const directory of [cldrCore, cldrDates, cldrBcp47]) {
  if (JSON.parse(readFileSync(join(directory, 'package.json'))).version !== '49.0.0') throw new Error('This converter requires CLDR 49.0.0.');
}
const meta = JSON.parse(readFileSync(join(cldrCore, 'supplemental/metaZones.json'))).supplemental.metaZones;
const names = JSON.parse(readFileSync(join(cldrDates, 'main/en/timeZoneNames.json'))).main.en.dates.timeZoneNames;
const englishNames = {};
function collectNames(node, path = []) {
  if (Array.isArray(node)) {
    const latest = node.map(value => value.usesMetazone).filter(Boolean).sort((a, b) => String(a._from || '').localeCompare(String(b._from || ''))).at(-1);
    const label = names.metazone[latest?._mzone]?.long;
    if (label?.generic || label?.standard) englishNames[path.join('/')] = label.generic || label.standard;
    return;
  }
  for (const [key, child] of Object.entries(node)) collectNames(child, [...path, key]);
}
collectNames(meta.metazoneInfo.timezone);
const zoneAliases = JSON.parse(readFileSync(join(cldrBcp47, 'bcp47/timezone.json'))).keyword.u.tz;
for (const alias of Object.values(zoneAliases)) {
  if (typeof alias._alias !== 'string') continue;
  const zones = alias._alias.split(' ');
  const label = zones.map(zone => englishNames[zone]).find(Boolean);
  if (label) for (const zone of zones) englishNames[zone] = label;
}
writeFileSync(join(destination, 'names.json'), JSON.stringify(englishNames));
writeFileSync(join(destination, 'LICENSE-Unicode.txt'), readFileSync(join(cldrCore, 'LICENSE')));
const manifest = {
  format: 1,
  data: 'geo-tz 8.1.10 / timezones-1970',
  boundaryLicense: 'ODbL-1.0',
  boundarySource: 'https://github.com/evansiroky/timezone-boundary-builder',
  attribution: 'Timezone boundaries © OpenStreetMap contributors; indexed by Evan Siroky / geo-tz.',
  sourcePackage: 'https://registry.npmjs.org/geo-tz/-/geo-tz-8.1.10.tgz',
  sourceIndexSha256: hash(inputIndex),
  sourceGeometrySha256: hash(inputData),
  labelData: 'Unicode CLDR 49.0.0',
  conversion: 'Original quadtree and decoded geometries preserved. Boundary leaves use TZB1 binary varints in bounded gzip groups. Coordinates are signed zigzag longitude/latitude deltas in microdegrees, starting from 0,0 for each ring. Rings close implicitly; their duplicate final source points are omitted from the stream. Source coordinates already use microdegree precision; no simplification or additional quantization is added.',
  zones: index.timezones.length, tiles, groups, sourceCoordinates: coordinates, encodedCoordinates: coordinates - rings, rings, bytes: position,
  maximumCompressedTileBytes: maxCompressed, maximumDecodedTileBytes: maxDecoded,
  maximumBinaryTileBytes,
  maximumCoordinateRoundTripDeviation: maximumRoundTripDeviation,
  files: Object.fromEntries(['index.json', 'tiles.dat', 'names.json'].map(name => [name, hash(readFileSync(join(destination, name)))])),
};
writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
