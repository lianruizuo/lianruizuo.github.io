// One-off: precompute the dot grids for the Visitors corner (src/_data/dotmaps.json).
// The site doesn't depend on these packages; to regenerate, run in a scratch folder:
//   npm i world-atlas@2.0.2 us-atlas@3.0.1 d3-geo@3.1.1 topojson-client@3.1.0 i18n-iso-countries@7.14.0
//   node dotmaps.mjs <path to src/_data/dotmaps.json>
import fs from "node:fs";
import { createRequire } from "node:module";
import * as topo from "topojson-client";
import { geoContains, geoBounds, geoCentroid, geoAlbersUsa } from "d3-geo";
const require = createRequire(import.meta.url);
const iso = require("i18n-iso-countries");
const world = require("world-atlas/countries-50m.json");
const us = require("us-atlas/states-10m.json");

// ---- world: equirectangular grid
const STEP = 2.5, LAT0 = 80, LAT1 = -58;
const cols = Math.round(360 / STEP), rows = Math.round((LAT0 - LAT1) / STEP);
const feats = topo.feature(world, world.objects.countries).features
  .map(f => ({ f, code: iso.numericToAlpha2(f.id) || (f.properties.name === "Kosovo" ? "XK" : null), b: geoBounds(f) }))
  .filter(x => x.code && x.code !== "AQ");
const dots = {}; // code -> [[c,r],...]
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const lon = -180 + (c + .5) * STEP, lat = LAT0 - (r + .5) * STEP;
  for (const x of feats) {
    const [[w, s], [e, n]] = x.b;
    if (lat < s || lat > n) continue;
    if (w <= e ? (lon < w || lon > e) : (lon < w && lon > e)) continue;
    if (geoContains(x.f, [lon, lat])) { (dots[x.code] ||= []).push([c, r]); break; }
  }
}
const centroid = {};
for (const x of feats) {
  const [lon, lat] = geoCentroid(x.f);
  centroid[x.code] = [+((lon + 180) / STEP - .5).toFixed(1), +((LAT0 - lat) / STEP - .5).toFixed(1)];
}

// ---- US states: Albers USA (with Alaska and Hawaii insets), planar grid
const proj = geoAlbersUsa().scale(1070).translate([480, 300]);
const postal = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","Puerto Rico":"PR"};
const sts = topo.feature(us, us.objects.states).features
  .map(f => ({ f, code: postal[f.properties.name], b: geoBounds(f) })).filter(x => x.code && x.code !== "PR");
const US = 15, W = 960, H = 600, ucols = Math.floor(W / US), urows = Math.floor(H / US);
const udots = {};
for (let r = 0; r < urows; r++) for (let c = 0; c < ucols; c++) {
  const p = proj.invert([(c + .5) * US, (r + .5) * US]);
  if (!p) continue;
  // invert maps the inset areas back too; confirm the round trip lands on the same pixel
  const q = proj(p); if (!q || Math.abs(q[0] - (c + .5) * US) > 1 || Math.abs(q[1] - (r + .5) * US) > 1) continue;
  for (const x of sts) {
    const [[w, s], [e, n]] = x.b;
    if (p[1] < s || p[1] > n) continue;
    if (w <= e ? (p[0] < w || p[0] > e) : (p[0] < w && p[0] > e)) continue; // Alaska crosses the antimeridian
    if (geoContains(x.f, p)) { (udots[x.code] ||= []).push([c, r]); break; }
  }
}
const ucentroid = {};
for (const x of sts) { const q = proj(geoCentroid(x.f)); if (q) ucentroid[x.code] = [+(q[0] / US - .5).toFixed(1), +(q[1] / US - .5).toFixed(1)]; }
const stateName = Object.fromEntries(Object.entries(postal).map(([n, c]) => [c, n]));

const out = {
  _about: "Dot grids for the visitors corner. Generated once by scripts/dotmaps.mjs from Natural Earth (world-atlas) and US Census (us-atlas) outlines; not edited by hand.",
  world: { cols, rows, dots, centroid },
  us: { cols: ucols, rows: urows, dots: udots, centroid: ucentroid, names: stateName },
};
const n = o => Object.values(o).reduce((a, d) => a + d.length, 0);
console.log("world dots", n(dots), "countries", Object.keys(dots).length, "| us dots", n(udots), "states", Object.keys(udots).length);
console.log("states with no dot:", Object.keys(stateName).filter(c => c !== "PR" && !udots[c]).join(" "));
fs.writeFileSync(process.argv[2], JSON.stringify(out));
