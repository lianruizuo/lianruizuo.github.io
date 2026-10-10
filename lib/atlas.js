// Lays out the atlas map from src/_data/atlas.yaml and the written node pages.
// Nothing is placed by hand: a node's band comes from what it sees, its x from its year.
// Lines come from the `crossings` listed in each written node's front matter.

const W = 1000, GUTTER = 128, RIGHT = 18, LANE = 26, BAND_PAD = 18, AXIS = 34;
const CHAR = 6.9; // average label width per character at 13px

export function atlasLayout(atlas, pages = []) {
  const written = Object.fromEntries(pages.filter((p) => p.data.node).map((p) => [p.data.node, p]));
  const years = atlas.nodes.map((n) => n.year);
  const y0 = Math.floor((Math.min(...years) - 2) / 5) * 5;
  const y1 = Math.ceil((Math.max(...years) + 2) / 5) * 5;
  const X = (yr) => GUTTER + ((yr - y0) / (y1 - y0)) * (W - GUTTER - RIGHT);

  const nodes = atlas.nodes.map((n) => {
    const p = written[n.id];
    return { ...n, x: X(n.year), written: !!p, url: p ? p.url : null, question: p ? p.data.question : null };
  });

  // stack bands bottom-up (narrowest view at the bottom), assigning label lanes inside each
  const bands = atlas.bands.map((b) => ({ ...b, nodes: nodes.filter((n) => n.band === b.id).sort((a, c) => a.x - c.x) }));
  for (const b of bands) {
    const lanes = []; // right edge of the last label in each lane
    const order = [...b.nodes].sort((a, c) => (c.written - a.written) || (a.x - c.x)); // written nodes claim the first lane
    const spans = []; // [lane, lo, hi] already placed
    for (const n of order) {
      const w = n.title.length * CHAR + 16;
      const right = n.x + w <= W - 4;
      const lo = right ? n.x - 8 : n.x - w, hi = right ? n.x + w : n.x + 8;
      let lane = 0;
      while (spans.some(([l, a, z]) => l === lane && !(hi < a || lo > z))) lane++;
      spans.push([lane, lo, hi]); lanes[lane] = true;
      Object.assign(n, { lane, anchor: right ? "start" : "end", lx: right ? n.x + 12 : n.x - 12 });
    }
    b.lanes = Math.max(1, lanes.filter(Boolean).length);
    b.h = BAND_PAD * 2 + (b.lanes - 1) * LANE + 8;
  }
  let y = 8;
  for (const b of [...bands].reverse()) {           // widest view on top
    b.y = y;
    for (const n of b.nodes) n.y = y + BAND_PAD + 4 + n.lane * LANE;
    y += b.h;
  }
  const H = y + AXIS;
  const at = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // crossings: one line per (from, to), carrying every boundary it crosses
  const merged = {};
  for (const p of pages) {
    for (const c of p.data.crossings || []) {
      if (!at[p.data.node] || !at[c.to]) continue;
      const key = `${p.data.node}>${c.to}`;
      (merged[key] ||= { from: p.data.node, to: c.to, layer: c.layer, when: [] }).when.push(c.when);
    }
  }
  const edges = Object.values(merged).map((e) => {
    const a = at[e.from], b = at[e.to];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, bow = Math.min(60, d * 0.22);
    const cx = (a.x + b.x) / 2 - uy * bow, cy = (a.y + b.y) / 2 + ux * bow;
    const sx = a.x + ux * 9, sy = a.y + uy * 9;
    const ex = b.x - ux * 12, ey = b.y - uy * 12;
    return { ...e, a, b, d: `M${sx.toFixed(1)},${sy.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`,
      mx: ((a.x + 2 * cx + b.x) / 4).toFixed(1), my: ((a.y + 2 * cy + b.y) / 4).toFixed(1) };
  });

  // courses as routes through the map
  const routes = (atlas.courses || []).map((c) => {
    const stops = c.route.map((id) => at[id]).filter(Boolean);
    // a smooth path through the stops (Catmull-Rom as cubic Béziers), so a route reads as one journey
    const P = stops.map((n) => [n.x, n.y]);
    let d = P.length ? `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}` : "";
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, t = 6;
      const c1 = [p1[0] + (p2[0] - p0[0]) / t, p1[1] + (p2[1] - p0[1]) / t], c2 = [p2[0] - (p3[0] - p1[0]) / t, p2[1] - (p3[1] - p1[1]) / t];
      d += ` C${c1.map((v) => v.toFixed(1))} ${c2.map((v) => v.toFixed(1))} ${p2.map((v) => v.toFixed(1))}`;
    }
    return { ...c, stops, d };
  });

  const ticks = [];
  for (let t = Math.ceil(y0 / 10) * 10; t <= y1; t += 10) ticks.push({ year: t, x: X(t) });

  return { W, H, axisY: y - 4, gutter: GUTTER, bands, nodes, at, edges, routes, ticks };
}

// For a node page: the boundaries it hands on, and the ones it crosses for others.
export function crossingsOf(layout, id) {
  return {
    out: layout.edges.filter((e) => e.from === id),
    into: layout.edges.filter((e) => e.to === id),
  };
}
