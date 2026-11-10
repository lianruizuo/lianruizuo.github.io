// Linear registration: the engine, and the public preview.
//
// The engine (window.LRKit) is shared with the lecture's own labs, which load after it. Conventions follow the notes:
//   x is the row (down), y the column (right). T_p maps a FIXED-grid location to the place where the MOVING image is
//   read. Affine, centered: T_p(x) = A (x - c) + c + t, p = (a11, a12, a21, a22, tx, ty). The score is the mean
//   squared difference over the pairs whose sample point lies inside the moving image.
//   Images come from window.HEAD (one 128 x 128 head slice). Every "scan" gets its own noise (sd 0.02).
//
// Public widget:  <div data-lab="lr-valley">   search over the rotation angle only, from a start you choose
//   data-blur="on" adds a switch to search on blurred, subsampled images
(() => {
  const H = window.HEAD;
  if (!H) return;
  const n = H.n, c = (n - 1) / 2;

  // ------------------------------------------------------------------ images, noise, blur
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  const noisy = (img, seed, sd = 0.02) => { const r = rng(seed); return Float32Array.from(img, (v) => v + sd * gauss(r)); };
  function blur(img, s) {
    if (!s) return img;
    const R = Math.ceil(3 * s), g = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * s * s))), z = g.reduce((a, b) => a + b, 0);
    const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { let v = 0; for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < n) v += g[k + R] * img[x * n + yy]; } tmp[x * n + y] = v / z; }
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { let v = 0; for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < n) v += g[k + R] * tmp[xx * n + y]; } out[x * n + y] = v / z; }
    return out;
  }
  const FIX = noisy(H.t1, 31);

  // bilinear value and slope (d/dx, d/dy) at (x, y); null outside 0..n-1
  function read(img, x, y) {
    if (!(x >= 0 && y >= 0 && x <= n - 1 && y <= n - 1)) return null;
    const i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), a = x - i, b = y - j, k = i * n + j;
    const v00 = img[k], v01 = img[k + 1], v10 = img[k + n], v11 = img[k + n + 1];
    return [(1 - a) * ((1 - b) * v00 + b * v01) + a * ((1 - b) * v10 + b * v11), (1 - b) * (v10 - v00) + b * (v11 - v01), (1 - a) * (v01 - v00) + a * (v11 - v10)];
  }
  // a moving image made from img so that I_m(T(x)) = I_f(x) for T(x) = A (x - c) + c + t
  function moved(img, A, t, seed) {
    const det = A[0] * A[3] - A[1] * A[2], Ai = [A[3] / det, -A[1] / det, -A[2] / det, A[0] / det], out = new Float32Array(n * n);
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { const u = x - c - t[0], v = y - c - t[1], r = read(img, Ai[0] * u + Ai[1] * v + c, Ai[2] * u + Ai[3] * v + c); out[x * n + y] = r ? r[0] : 0; }
    return seed ? noisy(out, seed) : out;
  }
  const rot = (deg) => { const r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r); return [cs, -sn, sn, cs]; };
  const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];

  // ------------------------------------------------------------------ the score and its gradient
  // grid: every s-th fixed pixel. o: the origin the coordinates are measured from (c for centered, 0 for the corner).
  // offset: where the moving image lies (a slide of the whole moving image, as a changed origin in the file would do).
  function grid(s) { const xs = []; for (let x = 0; x < n; x += s) for (let y = 0; y < n; y += s) xs.push(x, y); return Int16Array.from(xs); }
  function score(p, f, m, xs, { o = c, offset = [0, 0], grad = false, jac = null } = {}) {
    let D = 0, N = 0; const g = [0, 0, 0, 0, 0, 0], rr = [];
    for (let q = 0; q < xs.length; q += 2) {
      const x = xs[q], y = xs[q + 1], u = x - o, v = y - o, X = p[0] * u + p[1] * v + o + p[4] - offset[0], Y = p[2] * u + p[3] * v + o + p[5] - offset[1];
      const r = read(m, X, Y); if (!r) continue;
      const res = f[x * n + y] - r[0]; D += res * res; N++;
      if (grad) { const ju = jac ? jac(x, y) : [u, v]; rr.push(res, r[1], r[2], ju[0], ju[1]); }
    }
    if (!N) return { D: Infinity, N: 0, g };
    D /= N;
    if (grad) for (let q = 0; q < rr.length; q += 5) { const w = -2 * rr[q] / N, dx = rr[q + 1], dy = rr[q + 2], ux = rr[q + 3], uy = rr[q + 4];
      g[0] += w * dx * ux; g[1] += w * dx * uy; g[2] += w * dy * ux; g[3] += w * dy * uy; g[4] += w * dx; g[5] += w * dy; }
    return { D, N, g };
  }
  // gradient descent with the step halved whenever it would not lower the score; yields after every accepted step
  function* descend(p0, f, m, xs, { iters = 100, step = 200, scale = [1, 1, 1, 1, 1, 1], o = c, offset = [0, 0], minPairs = 50, free = [0, 1, 2, 3, 4, 5] } = {}) {
    let p = p0.slice(), eta = step, cur = score(p, f, m, xs, { o, offset, grad: true });
    for (let k = 0; k < iters; k++) {
      let moved = false;
      while (eta > 1e-7) {
        const q = p.slice(); for (const j of free) q[j] -= eta * scale[j] * cur.g[j];
        const s = score(q, f, m, xs, { o, offset });
        if (s.N >= minPairs && s.D < cur.D) { p = q; cur = score(p, f, m, xs, { o, offset, grad: true }); moved = true; break; }
        eta /= 2;
      }
      if (!moved) break;
      yield { p, D: cur.D, N: cur.N, k };
    }
    return { p, D: cur.D };
  }
  // centers of mass (intensity as mass)
  function com(img, offset = [0, 0]) { let sx = 0, sy = 0, w = 0; for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { const v = Math.max(0, img[x * n + y]); sx += v * x; sy += v * y; w += v; } return [sx / w + offset[0], sy / w + offset[1]]; }

  // ------------------------------------------------------------------ drawing
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
  const txt = (parent, x, y, s, cls = "snk-lab", extra = {}) => { const t = el("text", { x, y, class: cls, ...extra }, parent); t.textContent = s; return t; };
  function paint(canvas, img, { lo = 0, hi = 1 } = {}) {
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext("2d"), id = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = img[i]; const g = v === null || Number.isNaN(v) ? 0 : Math.round(255 * Math.min(1, Math.max(0, (v - lo) / (hi - lo)))); id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = g; id.data[4 * i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
  }
  // values in [-1, 1] as blue (negative) / black / orange (positive)
  function paintSigned(canvas, img, scale) {
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext("2d"), id = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = Math.max(-1, Math.min(1, img[i] / scale)); const a = Math.abs(v) ** 0.7;
      const col = v >= 0 ? [255, 160, 40] : [70, 170, 255]; id.data[4 * i] = col[0] * a; id.data[4 * i + 1] = col[1] * a; id.data[4 * i + 2] = col[2] * a; id.data[4 * i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
  }
  // the moving image read at T_p(x) on the fixed grid
  function resample(m, p, { o = c, offset = [0, 0] } = {}) {
    const out = new Float32Array(n * n);
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { const u = x - o, v = y - o, r = read(m, p[0] * u + p[1] * v + o + p[4] - offset[0], p[2] * u + p[3] * v + o + p[5] - offset[1]); out[x * n + y] = r ? r[0] : NaN; }
    return out;
  }
  // fixed in magenta, moving in green: grey where they agree
  function overlay(canvas, a, b) {
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext("2d"), id = ctx.createImageData(n, n), s = (v) => (Number.isNaN(v) ? 0 : Math.round(255 * Math.min(1, Math.max(0, v))));
    for (let i = 0; i < n * n; i++) { const p = s(a[i]), q = s(b[i]); id.data[4 * i] = p; id.data[4 * i + 1] = q; id.data[4 * i + 2] = p; id.data[4 * i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
  }
  function chart(svg, { x0, y0, w, h, xr, yr, xticks = [], yticks = [], xlabel = "", title = "", fmt = (v) => v }) {
    const X = (v) => x0 + (v - xr[0]) / (xr[1] - xr[0]) * w, Y = (v) => y0 + h - (v - yr[0]) / (yr[1] - yr[0]) * h;
    el("line", { x1: x0, x2: x0 + w, y1: y0 + h, y2: y0 + h, class: "snk-axis" }, svg);
    el("line", { x1: x0, x2: x0, y1: y0, y2: y0 + h, class: "snk-axis" }, svg);
    for (const t of xticks) { el("line", { x1: X(t), x2: X(t), y1: y0 + h, y2: y0 + h + 4, class: "snk-axis" }, svg); txt(svg, X(t), y0 + h + 16, fmt(t), "snk-lab mid"); }
    for (const t of yticks) txt(svg, x0 - 5, Y(t) + 4, String(t), "snk-lab", { "text-anchor": "end" });
    if (xlabel) txt(svg, x0 + w, y0 + h + 30, xlabel, "cny-pl", { "text-anchor": "end" });
    if (title) txt(svg, x0, y0 - 9, title, "snk-lab sm-title");
    return { X, Y };
  }
  const path = (xs, ys, X, Y) => xs.map((x, i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join("");

  window.LRKit = { n, c, H, rng, gauss, noisy, blur, FIX, read, moved, rot, mul, grid, score, descend, com, el, txt, paint, paintSigned, resample, overlay, chart, path };

  // ------------------------------------------------------------------ the rotation-only search (the public preview)
  // fixed: the head; moving: the head turned by 150 degrees about the center. We search over theta only.
  const VAL = (() => { let mv = null; return () => mv || (mv = moved(H.t1, rot(150), [0, 0], 32)); })();
  function valleyD(theta, f, m, xs) { const A = rot(theta); return score([A[0], A[1], A[2], A[3], 0, 0], f, m, xs).D; }
  function valleyWidget(root) {
    const withBlur = root.dataset.blur === "on";
    root.innerHTML = `<div class="lab-row ip-sliders"><label class="ip-sl">start θ<sub>0</sub> <input type="range" min="-180" max="180" step="5" value="0" data-s><output></output></label>
        <button type="button" class="chip chip-strong" data-act="run">Run</button><button type="button" class="chip" data-act="reset">Reset</button>
        ${withBlur ? `<label class="ip-sl"><input type="checkbox" data-blur> blurred (σ = 2) and every 4th pixel</label>` : ""}</div>
      <div class="lr-val"><svg class="cny-svg" viewBox="0 0 400 240" aria-label="The score against the angle, with the steps taken"></svg>
        <div class="lr-valimgs"><figure><canvas class="ip-canvas" role="img" aria-label="The moving image"></canvas><figcaption class="km-cap">moving: the head turned by 150°</figcaption></figure>
        <figure><canvas class="ip-canvas" role="img" aria-label="Overlay of the fixed image and the moving image turned back by the current angle"></canvas><figcaption class="km-cap">fixed (magenta) and moving, turned back by θ (green)</figcaption></figure></div></div>
      <p class="snk-status"></p>`;
    const svg = root.querySelector("svg"), [cm, co] = root.querySelectorAll("canvas"), status = root.querySelector(".snk-status"), out = root.querySelector("output"), sl = root.querySelector("[data-s]"), bx = root.querySelector("[data-blur]");
    const curves = {}, ths = Array.from({ length: 181 }, (_, i) => -180 + 2 * i);
    let path0 = [], timer = 0, theta = 0;
    function level() {
      const b = bx && bx.checked, key = b ? "b" : "o";
      if (!curves[key]) { const f = b ? blur(FIX, 2) : FIX, m = b ? blur(VAL(), 2) : VAL(), xs = grid(b ? 4 : 1);
        curves[key] = { f, m, xs, D: ths.map((t) => valleyD(t, f, m, xs)) }; }
      return curves[key];
    }
    function draw() {
      const L = level(), lo = Math.min(...L.D), hi = Math.max(...L.D), pad = (hi - lo) * 0.08;
      out.textContent = `${sl.value}°`;
      svg.replaceChildren();
      const { X, Y } = chart(svg, { x0: 46, y0: 22, w: 336, h: 170, xr: [-180, 180], yr: [lo - pad, hi + pad], xticks: [-180, -90, -30, 0, 90, 150, 180], title: "D(θ): mean squared difference", xlabel: "θ (degrees)" });
      el("path", { d: path(ths, L.D, X, Y), class: "lr-curve" }, svg);
      path0.forEach((t, i) => el("circle", { cx: X(t), cy: Y(valleyD(t, L.f, L.m, L.xs)), r: i === path0.length - 1 ? 5 : 2.6, class: i === path0.length - 1 ? "lr-now" : "lr-step" }, svg));
      el("line", { x1: X(+sl.value), x2: X(+sl.value), y1: 22, y2: 192, class: "lr-start" }, svg);
      paint(cm, VAL());
      const A = rot(theta); overlay(co, FIX, resample(VAL(), [A[0], A[1], A[2], A[3], 0, 0]));
    }
    function reset() { clearTimeout(timer); theta = +sl.value; path0 = [theta]; draw(); status.innerHTML = `<span>Choose a start, then press Run.</span>`; }
    function run() {
      reset();
      const L = level(), slope = (t) => (valleyD(t + 2, L.f, L.m, L.xs) - valleyD(t - 2, L.f, L.m, L.xs)) / 4,   // the slope, from the score 2 degrees to either side
        smax = Math.max(...L.D.map((d, i) => (i ? Math.abs(d - L.D[i - 1]) / 2 : 0)));
      const eta = 1.2 / smax; let k = 0;
      const tick = () => {
        let moved = 0;
        for (let r = 0; r < 3 && k < 600; r++, k++) { const st = -eta * slope(theta); theta = Math.max(-180, Math.min(180, theta + st)); path0.push(theta); moved = Math.abs(st); if (moved < 0.02) break; }
        draw();
        const D = valleyD(theta, L.f, L.m, L.xs);
        if (moved >= 0.02 && k < 600) { status.innerHTML = `<span>θ = <b>${theta.toFixed(1)}°</b></span><span>D = ${D.toFixed(4)}</span><span>${k} steps</span>`; timer = setTimeout(tick, 30); }
        else status.innerHTML = `<span>stopped at θ = <b>${theta.toFixed(1)}°</b> after ${k} steps, D = ${D.toFixed(4)}</span>` +
          `<span class="${Math.abs(theta - 150) < 3 ? "" : "acc"}">${Math.abs(theta - 150) < 3 ? "the right answer: the head is turned back upright" : Math.abs(theta + 30) < 6 ? "the bottom of the other valley: the head is upside down" : "not the answer"}</span>`;
      };
      tick();
    }
    root.addEventListener("input", (e) => { if (e.target === sl) reset(); });
    root.addEventListener("change", (e) => { if (e.target === bx) reset(); });
    root.addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (!b) return; if (b.dataset.act === "run") run(); else reset(); });
    reset();
  }
  window.LRKit.valleyWidget = valleyWidget;
  window.LRKit.valleyD = valleyD; window.LRKit.valleyMoving = VAL;
  const mount = () => document.querySelectorAll('[data-lab="lr-valley"]:not([data-on])').forEach((r) => { r.dataset.on = 1; valleyWidget(r); });
  window.LRKit.mount = mount;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
