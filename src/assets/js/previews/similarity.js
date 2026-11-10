// Image similarity: the engine, and the public preview.
//
// The engine (window.SMKit) is shared with the lecture's own labs, which load after it. Conventions follow the notes:
//   x is the row (down), y the column (right). A transformation T_p maps a location of the FIXED grid to the place
//   where the MOVING image is read: m_i = I_m(T_p(x_i)), linear interpolation, compared only where T_p(x_i) is inside.
//   Images come from window.HEAD (one 128 x 128 head slice, T1 and T2). Every "scan" gets its own noise (sd 0.02).
//
// Public widget:  <div data-lab="sm-compare">   slide a moving image along x; SSD, NCC and MI against the shift
//   data-moving="same,lin,t2" (which moving images to offer), data-scores="ssd,ncc,mi" (which curves to draw)
(() => {
  const H = window.HEAD;
  if (!H) return;
  const n = H.n, c = (n - 1) / 2;

  // ------------------------------------------------------------------ images and noise
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const noisy = (img, seed, sd = 0.02) => { const r = rng(seed); return Float32Array.from(img, (v) => v + sd * gauss(r)); };
  const FIX = noisy(H.t1, 11);
  const MOVING = {
    same: { img: noisy(H.t1, 12), name: "same scan, new noise", region: null },
    lin: { img: Float32Array.from(noisy(H.t1, 13), (v) => 0.5 * v + 0.3), name: "darker, lower contrast", region: null },
    t2: { img: noisy(H.t2, 14), name: "T2-weighted", region: H.brain },
  };

  // ------------------------------------------------------------------ sampling: I(T_p(x)) on the fixed grid
  // bilinear read of img at (x, y); inside means 0 <= x, y <= n - 1
  function read(img, x, y) {
    if (x < 0 || y < 0 || x > n - 1 || y > n - 1) return NaN;
    const i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), a = x - i, b = y - j, k = i * n + j;
    return (1 - a) * ((1 - b) * img[k] + b * img[k + 1]) + a * ((1 - b) * img[k + n] + b * img[k + n + 1]);
  }
  // T_p(x) = R(theta)(x - c) + c + t; NaN where it falls outside the moving image
  function warp(img, th = 0, tx = 0, ty = 0) {
    const r = th * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), out = new Float32Array(n * n);
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
      const u = x - c, v = y - c;
      out[x * n + y] = read(img, cs * u - sn * v + c + tx, sn * u + cs * v + c + ty);
    }
    return out;
  }
  // a shift along x only (the moving image is read t rows further down)
  function shift(img, t) {
    const out = new Float32Array(n * n), i0 = Math.floor(t), a = t - i0;
    for (let x = 0; x < n; x++) { const xx = x + t; if (xx < 0 || xx > n - 1) { out.fill(NaN, x * n, x * n + n); continue; }
      const i = Math.min(n - 2, x + i0), aa = xx - i;
      for (let y = 0; y < n; y++) out[x * n + y] = (1 - aa) * img[i * n + y] + aa * img[(i + 1) * n + y]; }
    return out;
  }
  // the pairs (f_i, m_i): fixed-grid locations where the moving image was read, and inside the region if one is given
  function pairs(fix, mov, region) {
    const f = [], m = [];
    for (let i = 0; i < fix.length; i++) if (!Number.isNaN(mov[i]) && (!region || region[i])) { f.push(fix[i]); m.push(mov[i]); }
    return [Float64Array.from(f), Float64Array.from(m)];
  }

  // ------------------------------------------------------------------ the three scores
  const ssd = (f, m) => { let s = 0; for (let i = 0; i < f.length; i++) s += (f[i] - m[i]) ** 2; return s / f.length; };   // mean over the pairs
  function ncc(f, m) {
    let fm = 0, mm = 0; for (let i = 0; i < f.length; i++) { fm += f[i]; mm += m[i]; } fm /= f.length; mm /= f.length;
    let sfm = 0, sff = 0, smm = 0; for (let i = 0; i < f.length; i++) { const a = f[i] - fm, b = m[i] - mm; sfm += a * b; sff += a * a; smm += b * b; }
    return sfm / Math.sqrt(sff * smm);
  }
  const range = (a, region) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < a.length; i++) if (!region || region[i]) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } return [lo, hi + 1e-9]; };
  // J x K counts; bin ranges are fixed in advance (rf, rm) and do not change with the transformation
  function joint(f, m, rf, rm, J = 32, K = J) {
    const h = new Float64Array(J * K);
    for (let i = 0; i < f.length; i++) {
      const j = Math.floor((f[i] - rf[0]) / (rf[1] - rf[0]) * J), k = Math.floor((m[i] - rm[0]) / (rm[1] - rm[0]) * K);
      if (j < 0 || j >= J || k < 0 || k >= K) continue; h[j * K + k]++;
    }
    return { h, J, K };
  }
  const entropy = (p) => { let s = 0; for (const v of p) if (v > 0) s -= v * Math.log2(v); return s; };
  // H(F), H(M), H(F, M), H(M | F) and MI from a joint histogram
  function info({ h, J, K }) {
    let N = 0; for (const v of h) N += v;
    const p = Float64Array.from(h, (v) => v / N), pf = new Float64Array(J), pm = new Float64Array(K);
    for (let j = 0; j < J; j++) for (let k = 0; k < K; k++) { pf[j] += p[j * K + k]; pm[k] += p[j * K + k]; }
    const HF = entropy(pf), HM = entropy(pm), HFM = entropy(p);
    return { N, p, pf, pm, HF, HM, HFM, HMgF: HFM - HF, MI: HF + HM - HFM };
  }
  const mi = (f, m, rf, rm, J = 32) => info(joint(f, m, rf, rm, J)).MI;

  // all three scores along x-shifts t, for one moving image
  function scores(key, t, J = 32, region) {
    const M = MOVING[key], reg = region === undefined ? M.region : region, rf = range(FIX, reg), rm = range(M.img, reg);
    const [f, m] = pairs(FIX, shift(M.img, t), reg);
    return { ssd: ssd(f, m), ncc: ncc(f, m), mi: mi(f, m, rf, rm, J), N: f.length };
  }
  const cache = {};
  function curve(key, ts, J = 32, region) {
    const id = `${key}|${ts[0]}|${ts[ts.length - 1]}|${ts.length}|${J}|${region === undefined ? "d" : region ? "r" : "a"}`;
    return cache[id] || (cache[id] = ts.map((t) => scores(key, t, J, region)));
  }

  // ------------------------------------------------------------------ drawing
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; };
  const txt = (parent, x, y, s, cls = "snk-lab", extra = {}) => { const t = el("text", { x, y, class: cls, ...extra }, parent); t.textContent = s; return t; };
  function paint(canvas, img, { lo = 0, hi = 1, mask = null, dim = 0.35 } = {}) {
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext("2d"), id = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = img[i]; let g = Number.isNaN(v) ? 0 : Math.round(255 * Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
      if (mask && !mask[i]) g = Math.round(g * dim);
      id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = g; id.data[4 * i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
  }
  // fixed in magenta, moving in green: where they agree the result is grey
  function overlay(canvas, a, b, { la = [0, 1], lb = [0, 1] } = {}) {
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext("2d"), id = ctx.createImageData(n, n), s = (v, [lo, hi]) => (Number.isNaN(v) ? 0 : Math.round(255 * Math.min(1, Math.max(0, (v - lo) / (hi - lo)))));
    for (let i = 0; i < n * n; i++) { const p = s(a[i], la), q = s(b[i], lb); id.data[4 * i] = p; id.data[4 * i + 1] = q; id.data[4 * i + 2] = p; id.data[4 * i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
  }
  // a small line chart: frame [x0, y0, w, h], x range, y range; returns mappers
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

  window.SMKit = { n, c, H, rng, gauss, noisy, FIX, MOVING, read, warp, shift, pairs, ssd, ncc, range, joint, entropy, info, mi, scores, curve, el, txt, paint, overlay, chart, path };

  // ------------------------------------------------------------------ the public widget: three scores against a shift
  const SC = {
    ssd: { name: "SSD", q: "are the values close?", best: "min", fmt: (v) => v.toFixed(4) },
    ncc: { name: "NCC", q: "do they rise together?", best: "max", fmt: (v) => v.toFixed(3) },
    mi: { name: "MI", q: "does one predict the other?", best: "max", fmt: (v) => v.toFixed(3) + " bits" },
  };
  function compareWidget(root) {
    const keys = (root.dataset.moving || "same,lin,t2").split(","), which = (root.dataset.scores || "ssd,ncc,mi").split(","), R = 16;
    const ts = Array.from({ length: 2 * R + 1 }, (_, i) => i - R);
    let key = keys[0], t = 0;
    root.innerHTML = (keys.length > 1 ? `<div class="lab-row snk-top"><span class="bench-label">Moving image</span>${keys.map((k, i) => `<button type="button" class="chip" data-m="${k}" aria-pressed="${i === 0}">${MOVING[k].name}</button>`).join("")}</div>` : "") +
      `<div class="sm-cmp"><div class="sm-imgs"><figure><canvas class="ip-canvas" role="img" aria-label="The fixed image"></canvas><figcaption class="km-cap">fixed: T1-weighted</figcaption></figure>
        <figure><canvas class="ip-canvas" role="img" aria-label="The moving image read at the shifted locations"></canvas><figcaption class="km-cap sm-capm"></figcaption></figure></div>
        <svg class="cny-svg sm-curves" viewBox="0 0 330 ${which.length * 118 + 14}" aria-label="Each score against the shift"></svg></div>
      <div class="lab-row ip-sliders"><label class="ip-sl">shift t <input type="range" min="${-R}" max="${R}" step="1" value="0" data-t><output></output></label><span class="snk-k sm-note"></span></div>`;
    const [cf, cm] = root.querySelectorAll("canvas"), svg = root.querySelector("svg"), capm = root.querySelector(".sm-capm"), out = root.querySelector("output"), note = root.querySelector(".sm-note");
    function draw() {
      const M = MOVING[key], cur = curve(key, ts), mt = shift(M.img, t);
      paint(cf, FIX, { mask: M.region }); paint(cm, mt, { mask: M.region, lo: key === "lin" ? 0 : 0, hi: 1 });
      capm.textContent = `moving: ${M.name}, read ${t} rows ${t >= 0 ? "down" : "up"}`;
      out.textContent = `${t > 0 ? "+" : ""}${t} px`;
      note.textContent = M.region ? "Compared inside the brain only (the rest is dimmed)." : "Compared wherever the two images overlap.";
      svg.replaceChildren();
      which.forEach((s, r) => {
        const S = SC[s], ys = cur.map((v) => v[s]), lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.1 || 0.01;
        const { X, Y } = chart(svg, { x0: 40, y0: 22 + r * 118, w: 270, h: 80, xr: [-R, R], yr: [lo - pad, hi + pad], xticks: r === which.length - 1 ? [-R, -8, 0, 8, R] : [], title: `${S.name}: ${S.q}`, xlabel: r === which.length - 1 ? "shift t" : "" });
        el("line", { x1: X(0), x2: X(0), y1: 22 + r * 118, y2: 102 + r * 118, class: "sm-zero" }, svg);
        el("path", { d: path(ts, ys, X, Y), class: `sm-line ${s}` }, svg);
        const b = S.best === "min" ? ys.indexOf(lo) : ys.indexOf(hi);
        el("circle", { cx: X(ts[b]), cy: Y(ys[b]), r: 4.5, class: "sm-best" }, svg);
        txt(svg, X(ts[b]) + (ts[b] > 8 ? -7 : 7), Y(ys[b]) + (S.best === "min" ? -8 : 14), `best: ${ts[b]}`, "snk-lab sm-bestlab", { "text-anchor": ts[b] > 8 ? "end" : "start" });
        const v = cur[t + R][s]; el("circle", { cx: X(t), cy: Y(v), r: 3.5, class: "sm-cur" }, svg);
        txt(svg, 40 + 270, 22 + r * 118 - 9, S.fmt(v), "snk-lab", { "text-anchor": "end" });
      });
    }
    root.addEventListener("input", (e) => { if (e.target.matches("[data-t]")) { t = +e.target.value; draw(); } });
    root.addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (!b) return; key = b.dataset.m; root.querySelectorAll("[data-m]").forEach((q) => q.setAttribute("aria-pressed", String(q === b))); draw(); });
    draw();
  }
  window.SMKit.compareWidget = compareWidget;
  const mount = () => document.querySelectorAll('[data-lab="sm-compare"]:not([data-on])').forEach((r) => { r.dataset.on = 1; compareWidget(r); });
  window.SMKit.mount = mount;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
