// Shapes the visitor totals (src/_data/visitors.json, written by scripts/visitors.mjs)
// into what the Visitors corner draws: two dot maps, section shares and an hour strip.
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

const longMonth = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const clock = (h) => (h === 0 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`);

export default function () {
  const v = read(process.env.VISITORS_FILE || new URL("visitors.json", dir));
  const maps = read(new URL("dotmaps.json", dir));
  if (!v || !maps || !v.visits) return null;

  const world = dotMap(maps.world, 6, v.countries || [], (p) => p.name);
  const us = dotMap(maps.us, 15, v.states || [], (p) => maps.us.names[p.code] || p.name);

  const secTotal = (v.sections || []).reduce((a, s) => a + s.count, 0) || 1;
  const sections = (v.sections || []).map((s) => ({ ...s, share: s.count / secTotal }));
  const top = sections[0] ? sections[0].share : 1;
  sections.forEach((s) => { s.width = +(100 * s.share / top).toFixed(1); s.pct = Math.max(1, Math.round(100 * s.share)); });

  const hours = v.hours || Array(24).fill(0);
  const hMax = Math.max(1, ...hours);
  const busiest = hours.indexOf(Math.max(...hours));

  return {
    visits: v.visits,
    since: longMonth(v.since),
    updated: v.updated,
    countries: v.countries || [],
    states: (v.states || []).map((s) => ({ ...s, name: maps.us.names[s.code] || s.name })),
    world,
    us,
    sections,
    hours: hours.map((n, h) => ({ h, n, height: +(n / hMax).toFixed(3), label: clock(h) })),
    busiest: Math.max(...hours) ? clock(busiest) : null,
  };
}
