// Canny edge detection (Canny, 1986): the detector, the course's synthetic test image, and the public preview.
//
// The engine (window.CannyKit) is shared with the lecture's own labs, which load after it. It follows the
// lecture's algorithm exactly:
//   I_sigma = G_sigma * I (rows, then columns; scipy's defaults: mode "reflect", truncate at 3 sigma)
//   g_x, g_y = central differences of I_sigma;  M = |g|;  theta = atan2(g_y, g_x)
//   non-maximum suppression across the edge (theta rounded to 0, 45, 90, 135 degrees; one strict and one
//   non-strict comparison, so a ridge whose top falls between two pixels keeps exactly one of them)
//   hysteresis: grow from M_thin >= T_H through 8-connected pixels with M_thin >= T_L.
// Thresholds are fractions of a robust maximum (the 99.7th percentile) of the thinned magnitude.
// The test image ports the course's viz13 synth.py (540 x 540, two objects, each with a stretch of fading contrast).
//
// Public widget:  <div data-lab="canny-pipeline">   the detector one stage at a time, with a sigma slider
(() => {
  const N = 540;

  // ------------------------------------------------------------------ small numerics
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function normal(seed) {                         // standard normal draws (Box-Muller)
    const r = rng(seed); let spare = null;
    return () => { if (spare !== null) { const s = spare; spare = null; return s; }
      const u = Math.max(r(), 1e-12), v = r(), m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };
  }
  function erf(x) {                               // Abramowitz and Stegun 7.1.26, |error| < 1.5e-7
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  // separable Gaussian: mode "reflect", radius int(3 sigma + 0.5), as scipy's gaussian_filter(truncate=3)
  function gauss(src, w, h, sigma) {
    if (sigma <= 0) return Float32Array.from(src);
    const r = Math.floor(3 * sigma + 0.5), k = new Float32Array(2 * r + 1);
    let sum = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const refl = (i, n) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return i; };
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const row = y * w;
      for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * src[row + refl(x + i, w)]; tmp[row + x] = a; } }
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * tmp[refl(y + i, h) * w + x]; out[y * w + x] = a; }
    return out;
  }
  // central differences; at the border the missing neighbor repeats the border pixel (np.pad mode "edge")
  function gradient(sm, w, h) {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      gx[i] = 0.5 * (sm[y * w + Math.min(x + 1, w - 1)] - sm[y * w + Math.max(x - 1, 0)]);
      gy[i] = 0.5 * (sm[Math.min(y + 1, h - 1) * w + x] - sm[Math.max(y - 1, 0) * w + x]);
    }
    return [gx, gy];
  }
  // the neighbor across the edge, by rounded direction: 0 -> (0, 1), 45 -> (1, 1), 90 -> (1, 0), 135 -> (1, -1) as (row, col)
  const STEP = [[0, 1], [1, 1], [1, 0], [1, -1]];
  const sectorOf = (gx, gy) => { const th = ((Math.atan2(gy, gx) * 180 / Math.PI) % 180 + 180) % 180; return Math.round(th / 45) % 4; };
  // non-maximum suppression: keep p if M(p) > M(p + n) and M(p) >= M(p - n); outside the image counts as 0
  function thin(gx, gy, w, h, strict = [true, false]) {
    const M = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let i = 0; i < M.length; i++) M[i] = Math.hypot(gx[i], gy[i]);
    const at = (y, x) => (y < 0 || y >= h || x < 0 || x >= w ? 0 : M[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, m = M[i]; if (!(m > 0)) continue;
      const [dr, dc] = STEP[sectorOf(gx[i], gy[i])], q = at(y + dr, x + dc), r = at(y - dr, x - dc);
      if ((strict[0] ? m > q : m >= q) && (strict[1] ? m > r : m >= r)) out[i] = m;
    }
    return { M, Mt: out };
  }
  function percentile(vals, p) {                  // numpy's default (linear interpolation)
    if (!vals.length) return 0;
    const s = Float32Array.from(vals).sort(), k = (s.length - 1) * p / 100, lo = Math.floor(k), hi = Math.min(lo + 1, s.length - 1);
    return s[lo] + (s[hi] - s[lo]) * (k - lo);
  }
  // hysteresis by breadth-first growth; dist = steps from the nearest strong pixel (-1: not an edge)
  function hysteresis(Mt, w, h, lo, hi) {
    const dist = new Int32Array(w * h).fill(-1), queue = new Int32Array(w * h); let head = 0, tail = 0;
    for (let i = 0; i < Mt.length; i++) if (Mt[i] >= hi && Mt[i] > 0) { dist[i] = 0; queue[tail++] = i; }
    while (head < tail) {
      const i = queue[head++], y = (i / w) | 0, x = i - y * w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const v = y + dy, u = x + dx; if (v < 0 || v >= h || u < 0 || u >= w) continue;
        const j = v * w + u; if (dist[j] < 0 && Mt[j] >= lo && Mt[j] > 0) { dist[j] = dist[i] + 1; queue[tail++] = j; }
      }
    }
    let dmax = 0, count = 0; for (const d of dist) if (d >= 0) { count++; if (d > dmax) dmax = d; }
    return { dist, dmax, count };
  }
  // the whole detector; stages are kept for display
  function detect(img, sigma, { w = N, h = N, low = 0.18, high = 0.55, strict } = {}) {
    const sm = gauss(img, w, h, sigma), [gx, gy] = gradient(sm, w, h), { M, Mt } = thin(gx, gy, w, h, strict);
    const pos = []; for (const v of Mt) if (v > 0) pos.push(v);
    const scale = percentile(pos, 99.7) || 1, hy = hysteresis(Mt, w, h, low * scale, high * scale);
    return { img, sigma, sm, gx, gy, M, Mt, scale, low, high, ...hy, w, h };
  }
  const rethreshold = (D, low, high) => Object.assign(D, { low, high }, hysteresis(D.Mt, D.w, D.h, low * D.scale, high * D.scale));
  // 8-connected pieces of a binary map
  function pieces(on, w, h) {
    const lab = new Int32Array(w * h), stack = []; let n = 0;
    for (let i = 0; i < on.length; i++) if (on[i] && !lab[i]) {
      n++; lab[i] = n; stack.push(i);
      while (stack.length) { const p = stack.pop(), y = (p / w) | 0, x = p - y * w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = y + dy, u = x + dx;
          if (v >= 0 && v < h && u >= 0 && u < w) { const j = v * w + u; if (on[j] && !lab[j]) { lab[j] = n; stack.push(j); } } } }
    }
    return n;
  }

  // ------------------------------------------------------------------ the course's synthetic image (viz13 synth.py)
  function synthetic(seed = 3, noise = 0.10) {
    const img = new Float32Array(N * N), dist = new Float32Array(N * N), gn = normal(seed);
    const cx = N * 0.47, cy = N * 0.52, wx = cx + N * 0.27, wy = cy + N * 0.16, ex = N * 0.80, ey = N * 0.22;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ang = Math.atan2(y - cy, x - cx), r0 = N * 0.30 * (1 + 0.10 * Math.cos(3 * ang + 0.6) + 0.06 * Math.sin(5 * ang));
      const rr = Math.hypot(x - cx, y - cy), inside = 0.5 * (1 + Math.tanh((r0 - rr) / 0.8));
      const fade = Math.exp(-((x - wx) ** 2 + (y - wy) ** 2) / (2 * (N * 0.11) ** 2));
      const e = Math.hypot((x - ex) / (N * 0.10), (y - ey) / (N * 0.07)), ein = 0.5 * (1 + Math.tanh((1 - e) * N * 0.07 / 0.8));
      const efade = Math.exp(-((x - ex) ** 2 + (y - (ey + N * 0.075)) ** 2) / (2 * (N * 0.06) ** 2));
      const i = y * N + x;
      img[i] = 0.22 + (0.46 - 0.35 * fade) * inside + (0.40 - 0.31 * efade) * ein + noise * gn();
      dist[i] = Math.min(Math.abs(rr - r0), Math.abs(e - 1) * N * 0.07);   // approximate distance to the true boundary
    }
    return { img, dist };
  }
  const offBoundary = (D, dist, tol = 4) => { let n = 0; for (let i = 0; i < D.dist.length; i++) if (D.dist[i] >= 0 && dist[i] > tol) n++; return n; };

  // ------------------------------------------------------------------ drawing
  const CYAN = [52, 219, 245], CYAN_CORE = [184, 245, 255], PINK = [255, 107, 158], AMBER = [255, 158, 41], LOST = [140, 70, 84];
  function rgba(w, h, fn) {                       // fn(i) -> [r, g, b]
    const d = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) { const c = fn(i); d.data[4 * i] = c[0]; d.data[4 * i + 1] = c[1]; d.data[4 * i + 2] = c[2]; d.data[4 * i + 3] = 255; }
    return d;
  }
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const grayOf = (a, k = 1, b = 0) => (i) => { const g = (clamp(a[i]) * k + b) * 255; return [g * 0.97, g * 0.99, Math.min(255, g * 1.02)]; };
  function hsv(hh, s, v) {                        // hue in [0, 1)
    const i = Math.floor(hh * 6), f = hh * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
    return [r * 255, g * 255, b * 255];
  }
  // glow: soften one-pixel edges so they read at small sizes
  function glowMap(on, w, h) {
    const g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!on[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = y + dy, u = x + dx;
        if (v >= 0 && v < h && u >= 0 && u < w) g[v * w + u] = Math.max(g[v * w + u], dx || dy ? 0.33 : 1); } }
    return g;
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // one picture per stage
  function render(D, stage, { grow = Infinity } = {}) {
    const { w, h } = D;
    if (stage === "image") return rgba(w, h, grayOf(D.img));
    if (stage === "smooth") return rgba(w, h, grayOf(D.sm));
    if (stage === "dx" || stage === "dy") {
      const g = stage === "dx" ? D.gx : D.gy, s = D.gscale || (D.gscale = percentile(Array.from(D.gx, (v, i) => Math.max(Math.abs(v), Math.abs(D.gy[i]))).filter((_, i) => i % 5 === 0), 99.7) || 1);
      return rgba(w, h, (i) => { const d = Math.max(-1, Math.min(1, g[i] / s)), p = Math.pow(Math.max(d, 0), 0.8), n = Math.pow(Math.max(-d, 0), 0.8);
        return [Math.min(255, p * CYAN_CORE[0] + n * PINK[0]), Math.min(255, p * CYAN_CORE[1] + n * PINK[1]), Math.min(255, p * CYAN_CORE[2] + n * PINK[2])]; });
    }
    const mscale = D.mscale || (D.mscale = percentile(Array.from(D.M).filter((_, i) => i % 5 === 0), 99.7) || 1);
    if (stage === "mag") return rgba(w, h, (i) => { const v = Math.pow(clamp(D.M[i] / mscale), 0.75); return hsv(((Math.atan2(D.gy[i], D.gx[i]) / (2 * Math.PI)) + 1) % 1, 0.62, v); });
    if (stage === "thin") {
      return rgba(w, h, (i) => { const v = D.Mt[i] > 0 ? Math.pow(clamp(D.Mt[i] / D.scale), 0.6) : Math.pow(clamp(D.M[i] / mscale), 0.75) * 0.12;
        return [v * 230, v * 235, v * 250]; }); }
    if (stage === "hyst") {
      const lo = D.low * D.scale, hi = D.high * D.scale;
      return rgba(w, h, (i) => { const m = D.Mt[i]; if (!(m > 0)) return [12, 13, 17];
        if (m >= hi) return CYAN_CORE;
        if (m >= lo) return D.dist[i] >= 0 && D.dist[i] <= grow ? AMBER : D.dist[i] >= 0 ? [120, 92, 60] : LOST;
        const v = Math.pow(clamp(m / D.scale), 0.6) * 0.45; return [v * 230, v * 235, v * 250]; });
    }
    if (stage === "edges") { const on = Uint8Array.from(D.dist, (d) => d >= 0), gl = glowMap(on, w, h);
      return rgba(w, h, (i) => { const g = clamp(D.img[i]) * 0.38 + 0.02, base = [g * 247, g * 252, g * 255];
        return gl[i] ? mix(base, gl[i] === 1 ? CYAN_CORE : CYAN, gl[i] === 1 ? 1 : 0.45) : base; }); }
    return rgba(w, h, grayOf(D.img));
  }
  // a small direction wheel, drawn in a corner
  function wheel(ctx, cx, cy, r) {
    for (let a = 0; a < 360; a += 3) { const t = a * Math.PI / 180, c = hsv(a / 360, 0.62, 1);
      ctx.fillStyle = `rgb(${c.map(Math.round).join(",")})`; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, t - 0.03, t + 0.06); ctx.fill(); }
    ctx.fillStyle = "#15171c"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, 7); ctx.fill();
  }
  function makeCanvas(root, label, w = N, h = N) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.className = "cny-canvas";
    cv.setAttribute("role", "img"); cv.setAttribute("aria-label", label); root.appendChild(cv);
    return { cv, ctx: cv.getContext("2d") };
  }

  window.CannyKit = { N, rng, normal, erf, gauss, gradient, thin, sectorOf, STEP, percentile, hysteresis, detect, rethreshold, pieces,
    synthetic, offBoundary, render, wheel, makeCanvas, hsv, rgba, grayOf, CYAN, CYAN_CORE, PINK, AMBER };

  // ------------------------------------------------------------------ the public widget: one stage at a time
  const STAGES = [
    ["image", "Image", "A synthetic image: two objects on a background, with noise. Each object has a stretch where its contrast fades."],
    ["smooth", "Smoothed", "Blurred with a Gaussian of width σ. The noise is averaged away; so is some detail."],
    ["dx", "∂/∂x", "How fast the smoothed image changes from left to right. Cyan: getting brighter. Pink: getting darker."],
    ["dy", "∂/∂y", "The same, from top to bottom. Each derivative sees the edges that cross its direction."],
    ["mag", "Strength & direction", "Brightness: how fast the image changes, M. Color: which way it changes, n. The ridges are several pixels wide."],
    ["thin", "Thinned", "Each ridge cut down to its top: a pixel survives only if it beats its neighbors across the edge."],
    ["hyst", "Hysteresis", "Cyan pixels are strong and always kept. Amber ones are weak, kept only if connected to a strong one. Dark red: weak and alone, dropped."],
    ["edges", "Edges", "The edge map: pixels, each one marked on local evidence. Nothing in it says which pixels belong to which object."],
  ];
  function pipeline(root, { scene = null, sigma = 2.2, play = true } = {}) {
    root.innerHTML = `<div class="chips cny-stages">${STAGES.map(([k, name]) => `<button type="button" class="chip" data-stage="${k}">${name}</button>`).join("")}</div>
      <div class="cny-stage"></div>
      <p class="cny-say" aria-live="polite"></p>
      <div class="lab-row"><label class="snk-slider">σ <input type="range" min="0.8" max="6" step="0.1" value="${sigma}"><output>${sigma.toFixed(1)}</output></label>
        ${play ? '<button type="button" class="chip chip-strong" data-act="play">Play all stages</button>' : ""}<span class="snk-k"></span></div>`;
    const { cv, ctx } = makeCanvas(root.querySelector(".cny-stage"), "The Canny edge detector applied to a synthetic image, showing one stage at a time");
    const say = root.querySelector(".cny-say"), note = root.querySelector(".snk-k"), inp = root.querySelector("input"), out = root.querySelector("output");
    const S = scene || synthetic(3, 0.10);
    let D = detect(S.img, sigma), stage = "edges", timer = 0, raf = 0;
    function draw(opts) {
      ctx.putImageData(render(D, stage, opts), 0, 0);
      if (stage === "mag") { wheel(ctx, N - 40, 40, 24); ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "13px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.fillText("direction of n", N - 72, 45); }
      root.querySelectorAll("[data-stage]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stage === stage)));
      say.textContent = STAGES.find((s) => s[0] === stage)[2];
      note.textContent = stage === "edges" || stage === "hyst" ? `${D.count.toLocaleString()} edge pixels` : stage === "thin" ? `${D.Mt.reduce((a, v) => a + (v > 0), 0).toLocaleString()} candidates` : "";
    }
    function show(k) {
      cancelAnimationFrame(raf); stage = k;
      if (k === "hyst") { const t0 = performance.now(), dur = 1400;            // grow outward from the strong pixels
        const tick = (t) => { const u = Math.min(1, (t - t0) / dur); draw({ grow: Math.floor(u * D.dmax) }); if (u < 1 && stage === "hyst") raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick); }
      else draw();
    }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.stage) { clearTimeout(timer); show(b.dataset.stage); }
      if (b.dataset.act === "play") { clearTimeout(timer); let i = 0; const next = () => { show(STAGES[i][0]); if (++i < STAGES.length) timer = setTimeout(next, STAGES[i - 1][0] === "hyst" ? 2600 : 1900); }; next(); }
    });
    inp.addEventListener("input", () => (out.textContent = (+inp.value).toFixed(1)));
    inp.addEventListener("change", () => { note.textContent = "computing…"; setTimeout(() => { D = detect(S.img, +inp.value); show(stage); }, 20); });
    show(stage);
    return { get D() { return D; } };
  }
  window.CannyKit.pipeline = pipeline;
  const mount = () => document.querySelectorAll('[data-lab="canny-pipeline"]:not([data-on])').forEach((r) => { r.dataset.on = 1; pipeline(r); });
  window.CannyKit.mount = mount;
  mount();
})();
