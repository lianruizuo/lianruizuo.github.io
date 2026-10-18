// Shapes the visitor totals (src/_data/visitors.json, written by scripts/visitors.mjs)
// into what the Visitors corner draws: a dot map of the world, one shaded group per country.
// Returns null when there are no totals yet, which hides the corner.
import fs from "node:fs";

const dir = new URL("./", import.meta.url);
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// A dot map: the land as one faint path, and each visited place as its own path,
// stepped into four shades by visit count (log scale, so one busy place doesn't wash out the rest).
function dotMap(grid, cell, places, nameOf) {
  const at = ([c, r]) => `M${+((c + 0.5) * cell).toFixed(1)} ${+((r + 0.5) * cell).toFixed(1)}h0`;
  const hit = new Set(places.map((p) => p.code));
  const land = Object.entries(grid.dots).filter(([k]) => !hit.has(k)).flatMap(([, d]) => d.map(at)).join("");
  const max = Math.max(1, ...places.map((p) => p.count));
  const lit = places
    .map((p) => {
      const d = grid.dots[p.code] || (grid.centroid[p.code] ? [grid.centroid[p.code]] : null);
      if (!d) return null;
      const level = Math.max(1, Math.ceil((4 * Math.log1p(p.count)) / Math.log1p(max)));
      return { code: p.code, name: nameOf(p), count: p.count, level, d: d.map(at).join("") };
    })
    .filter(Boolean)
    .sort((a, b) => a.level - b.level); // brightest drawn last, on top
  // Crop the drawing to the dots, with half a cell of room around them.
  const all = Object.values(grid.dots).flat();
  const xs = all.map(([c]) => c), ys = all.map(([, r]) => r);
  const x0 = Math.min(...xs) * cell, y0 = Math.min(...ys) * cell;
  const box = [x0, y0, (Math.max(...xs) + 1) * cell - x0, (Math.max(...ys) + 1) * cell - y0].map((n) => +n.toFixed(1)).join(" ");
  return { box, land, lit };
}

export default function () {
  const v = read(process.env.VISITORS_FILE || new URL("visitors.json", dir));
  const maps = read(new URL("dotmaps.json", dir));
  if (!v || !maps || !v.visits || !(v.countries || []).length) return null;
  return { world: dotMap(maps.world, 6, v.countries, (p) => p.name) };
}
