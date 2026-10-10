// Lays out the atlas map from src/_data/atlas.yaml and the written node pages.
// Nothing is placed by hand. x is the year of a method's primary source; the height is free,
// chosen so labels never collide and the field looks scattered rather than stacked.
// Picking a course moves its methods to one row each, in teaching order, keeping x:
// across = when the idea appeared, down = when you meet it in the course.

const W = 1080, PAD_L = 40, PAD_R = 40, TOP = 34, ROW = 26, MIN_LANES = 7, AXIS = 40;
const CHAR = 7.4; // average label width per character at 13.5px

// a small stable hash, so a node keeps its place when others are added
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

export function atlasLayout(atlas, pages = []) {
  const written = Object.fromEntries(pages.filter((p) => p.data.node).map((p) => [p.data.node, p]));
  const years = atlas.nodes.map((n) => n.year);
  const y0 = Math.min(...years) - 3, y1 = Math.max(...years) + 3;
  const X = (yr) => PAD_L + ((yr - y0) / (y1 - y0)) * (W - PAD_L - PAD_R);

  const nodes = atlas.nodes.map((n) => {
    const p = written[n.id];
    const x = X(n.year), w = n.title.length * CHAR + 26;
    const right = x + w <= W - 6;
    return { ...n, x, written: !!p, url: p ? p.url : null, question: p ? p.data.question : null,
      anchor: right ? "start" : "end", lx: right ? 12 : -12, lo: right ? x - 10 : x - w, hi: right ? x + w : x + 10 };
  });

  // free layout: each node prefers a lane from its hash and takes the nearest one where its label fits
  let lanes = MIN_LANES;
  const place = () => {
    const taken = [];
    for (const n of [...nodes].sort((a, c) => (c.written - a.written) || (a.x - c.x))) {
      const pref = hash(n.id) % lanes;
      const order = [...Array(lanes).keys()].sort((a, c) => Math.abs(a - pref) - Math.abs(c - pref) || a - c);
      const lane = order.find((l) => !taken.some(([tl, a, z]) => tl === l && !(n.hi < a || n.lo > z)));
      if (lane === undefined) return false;
      taken.push([lane, n.lo, n.hi]); n.lane = lane;
    }
    return true;
  };
  while (!place()) lanes++;

  // routes need one row per stop; the field gets the same height and spreads its lanes over it
  const longest = Math.max(0, ...(atlas.courses || []).map((c) => c.route.length));
  const plotH = Math.max((lanes - 1) * ROW * 1.6, (longest - 1) * ROW);
  const laneY = (l) => TOP + (lanes === 1 ? plotH / 2 : (l / (lanes - 1)) * plotH);
  const jit = plotH / Math.max(1, lanes - 1) * 0.28; // a little vertical drift within the lane, so the field does not read as a grid
  for (const n of nodes) n.y = Math.max(TOP, Math.min(TOP + plotH, laneY(n.lane) + ((hash(n.id + "~") % 1000) / 1000 - 0.5) * 2 * jit));
  // drift must never bring two labels together: where it would, both go back to their lane
  for (const a of nodes) for (const b of nodes)
    if (a !== b && !(a.hi + 8 < b.lo || a.lo > b.hi + 8) && Math.abs(a.y - b.y) < 30) { a.y = laneY(a.lane); b.y = laneY(b.lane); }
  const axisY = TOP + plotH + 30;
  const H = axisY + AXIS;
  const at = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // crossings (listed on node pages, not drawn): one per (from, to)
  const merged = {};
  for (const p of pages) {
    for (const c of p.data.crossings || []) {
      if (!at[p.data.node] || !at[c.to]) continue;
      const key = `${p.data.node}>${c.to}`;
      const e = (merged[key] ||= { from: p.data.node, to: c.to, layer: c.layer, how: c.how, when: [] });
      e.when.push(c.when);
    }
  }
  const edges = Object.values(merged).map((e) => ({ ...e, a: at[e.from], b: at[e.to] }));

  // a course: its stops, one row each in teaching order, joined by a smooth path
  const routes = (atlas.courses || []).map((c) => {
    const ids = c.route.filter((id) => at[id]);
    const step = ids.length > 1 ? plotH / (ids.length - 1) : 0;
    const stops = ids.map((id, i) => ({ ...at[id], i: i + 1, ry: TOP + i * step }));
    const P = stops.map((s) => [s.x, s.ry]);
    let d = P.length ? `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}` : "";
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, t = 6;
      const c1 = [p1[0] + (p2[0] - p0[0]) / t, p1[1] + (p2[1] - p0[1]) / t], c2 = [p2[0] - (p3[0] - p1[0]) / t, p2[1] - (p3[1] - p1[1]) / t];
      d += ` C${c1.map((v) => v.toFixed(1))} ${c2.map((v) => v.toFixed(1))} ${p2.map((v) => v.toFixed(1))}`;
    }
    const slug = c.code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return { ...c, slug, stops, d, pos: Object.fromEntries(stops.map((s) => [s.id, [s.i, +s.ry.toFixed(1)]])) };
  });

  const ticks = [];
  for (let t = Math.ceil(y0 / 5) * 5; t <= Math.floor(y1); t += 5) ticks.push({ year: t, x: X(t), major: t % 10 === 0 });

  return { W, H, top: TOP, axisY, nodes, at, edges, routes, ticks };
}

// For a node page: the boundaries it hands on, and the ones it crosses for others.
export function crossingsOf(layout, id) {
  return {
    out: layout.edges.filter((e) => e.from === id),
    into: layout.edges.filter((e) => e.to === id),
  };
}
