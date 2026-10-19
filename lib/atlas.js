// Lays out the atlas map from src/_data/atlas.yaml and the written node pages.
// Nothing is placed by hand. x is the year of a method's primary source; the height is free,
// chosen so labels never collide and the field looks scattered rather than stacked.
// Picking a course moves its methods to one row each, in teaching order, keeping x:
// across = when the idea appeared, down = when you meet it in the course. With several courses
// picked, each gets its own stretch of rows (the browser does that part, in assets/js/atlas.js).

const W = 1080, PAD_L = 40, PAD_R = 40, TOP = 34, ROW = 26, ROW_MIN = 18, MIN_LANES = 8, AXIS = 40;
const CHAR = 7.4; // average label width per character at 13.5px

// a small stable hash, so a node keeps its place when others are added
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

export function atlasLayout(atlas, pages = []) {
  const written = Object.fromEntries(pages.filter((p) => p.data.node).map((p) => [p.data.node, p]));
  const years = atlas.nodes.map((n) => n.year);
  const y0 = Math.floor((Math.min(...years) - 3) / 10) * 10, y1 = Math.max(...years) + 3;
  const X = (yr) => PAD_L + ((yr - y0) / (y1 - y0)) * (W - PAD_L - PAD_R);

  const nodes = atlas.nodes.map((n) => {
    const p = written[n.id];
    const x = X(n.year), w = n.title.length * CHAR + 26;
    const right = x + w <= W - 6;
    return { ...n, x, written: !!p, url: p ? p.url : null, question: p ? p.data.question : null, talk: p ? p.data.talk || null : null, pageTitle: p ? p.data.title : null,
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

  // routes need one row per stop, and all courses at once need room for all their stops;
  // the field gets the same height and spreads its lanes over it
  const lengths = (atlas.courses || []).map((c) => c.route.length);
  const longest = Math.max(0, ...lengths), together = lengths.reduce((a, b) => a + b, 0) + Math.max(0, lengths.length - 1);
  const plotH = Math.max((lanes - 1) * ROW * 1.6, (longest - 1) * ROW, (together - 1) * ROW_MIN);
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

  // a course: its stops in teaching order (the browser lays them out and draws the path)
  const routes = (atlas.courses || []).map((c, k) => {
    const stops = c.route.map((r) => (typeof r === "string" ? { id: r } : r)).filter((r) => at[r.id])
      .map((r, i) => ({ ...at[r.id], ...r, i: i + 1 }));
    const slug = c.code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return { ...c, k, slug, stops, pos: Object.fromEntries(stops.map((s) => [s.id, s.i])) };
  });

  const ticks = [];
  const span = y1 - y0, minor = span > 80 ? 10 : 5, major = span > 80 ? 20 : 10;
  for (let t = Math.ceil(y0 / minor) * minor; t <= Math.floor(y1); t += minor) ticks.push({ year: t, x: X(t), major: t % major === 0 });

  return { W, H, top: TOP, plotH, axisY, nodes, at, edges, routes, ticks };
}

// For a node page: the boundaries it hands on, and the ones it crosses for others.
export function crossingsOf(layout, id) {
  return {
    out: layout.edges.filter((e) => e.from === id),
    into: layout.edges.filter((e) => e.to === id),
  };
}
