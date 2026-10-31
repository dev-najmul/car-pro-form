# Exact geographical timezone data

This directory contains an indexed derivative database of geographic timezone
boundaries from **geo-tz 8.1.10**, using its `timezones-1970` data product. The
upstream boundaries are produced by **timezone-boundary-builder** using
**OpenStreetMap contributors'** data. Boundaries and all ring coordinates are
preserved from the upstream encoded dataset, including holes and multipolygons;
this conversion does not simplify boundaries or add coordinate quantization.

Timezone boundaries © OpenStreetMap contributors. This derivative database is
provided under the **Open Data Commons Open Database License 1.0 (ODbL)**. The
database files, their exact source hashes, and the script needed to reproduce
the conversion are provided with the plugin/source repository. ODbL applies to
this geographic database; it does not change the license of the surrounding
application code. English timezone names are derived from **Unicode CLDR 49.0.0**
and are distributed under the Unicode License v3. The upstream geo-tz indexing
code is MIT licensed. Full licenses are included alongside this notice.

Sources:

- https://www.openstreetmap.org/copyright
- https://github.com/evansiroky/timezone-boundary-builder
- https://github.com/evansiroky/node-geo-tz/tree/v8.1.10
- https://registry.npmjs.org/geo-tz/-/geo-tz-8.1.10.tgz
- https://github.com/unicode-org/cldr-json

`manifest.json` identifies the pinned source files and generated checksums. To
regenerate, follow `scripts/build-timezone-data.mjs` in the plugin's source
repository. Regeneration needs Node and development-only dependencies; installed
WordPress sites need neither Node nor an external timezone API.

## Runtime format

`index.json` contains `format: "tzb1-grouped-v1"`, the original `timezones` list,
and the original four-way geographic `lookup` quadtree. Direct leaf arrays hold
indices into `timezones`. Missing quadrants are ocean/uninhabited territory. The
quadtree starts at latitude ±89.9999 and longitude ±179.9999; at each level the
keys are `a` = northeast, `b` = northwest, `c` = southwest, `d` = southeast.

Each boundary leaf is `{pos,len,offset,bytes}`. Read `len` bytes from `tiles.dat`
at `pos`, gzip-decompress that bounded group, then take `bytes` bytes at `offset`
in the decompressed group. A group is at most 1 MiB before compression. Its
individual tiles are encoded as follows:

1. Four ASCII bytes `TZB1`.
2. Unsigned varint feature count.
3. For each feature: unsigned timezone-list index, then polygon count.
4. For each polygon: unsigned ring count.
5. For each ring: unsigned point count, then longitude/latitude delta pairs.

All counts and coordinates use little-endian base-128 varints. Signed coordinate
deltas use zigzag encoding (`n >= 0 ? 2*n : -2*n-1`) and represent millionths of a
degree. Longitude and latitude accumulators start at zero for **each ring**.
The first ring is the polygon exterior; subsequent rings are holes. Each source
ring's last point is checked to be an exact duplicate of its first point, and
that duplicate is omitted from the stream. The decoder must close the ring
implicitly by testing the final segment from the last stored point back to its
first point. A triangle therefore has three stored points, rather than four.
Every
coordinate and binary varint is checked for an exact round-trip on regeneration.
Ring processing can therefore remain streaming with bounded memory in PHP.

`names.json` maps CLDR timezone identifiers and their IANA aliases to English
generic names (for example `Eastern Time` and `Central Time`). Actual offsets
and daylight saving rules come from PHP's timezone database for the reservation
date; these labels are never used to calculate an instant.

Geographic boundaries are community-maintained approximations of observed civil
timekeeping. Disputed/overlapping boundaries can yield more than one timezone;
the application must handle that explicitly instead of silently guessing.
