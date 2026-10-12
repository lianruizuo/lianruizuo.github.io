// Snakes (Kass, Witkin and Terzopoulos, 1988): a small engine and the two public previews.
//
// The engine (window.SnakeKit) is shared with the lecture's own labs, which load after it.
// It ports the course's Python visualizations: the same synthetic scenes (960 x 540), the same
// edge energy E = -|grad(G_sigma * I)|^2 scaled to [-1, 0], and the same semi-implicit update
//   x <- (I + tau A)^-1 (x - tau f_x),   y <- (I + tau A)^-1 (y - tau f_y).
//
// Public widgets:
//   <div data-lab="snakes-settle">   a snake settling on an object (image or energy landscape)
//   <div data-lab="snakes-shrink">   the same snake with the image switched off
(() => {
  const W = 960, H = 540;

  // ------------------------------------------------------------------ small numerics
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function erf(x) {                               // Abramowitz and Stegun 7.1.26, |error| < 1.5e-7
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  }
  // separable Gaussian, scipy's defaults: mode "reflect", truncate at 4 sigma
  function gauss(src, w, h, sigma) {
    if (sigma <= 0) return Float32Array.from(src);
    const r = Math.ceil(4 * sigma), k = new Float32Array(2 * r + 1);
    let sum = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const refl = (i, n) => { while (i < 0 || i >= n) i = i < 0 ? -i - 1 : 2 * n - i - 1; return i; };
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const row = y * w;
      for (let x = 0; x < w; x++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * src[row + refl(x + i, w)]; tmp[row + x] = a; } }
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let a = 0; for (let i = -r; i <= r; i++) a += k[i + r] * tmp[refl(y + i, h) * w + x]; out[y * w + x] = a; }
    return out;
  }
  // np.gradient: central differences inside, one-sided at the borders
  function grad(f, w, h) {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      gx[i] = x === 0 ? f[i + 1] - f[i] : x === w - 1 ? f[i] - f[i - 1] : (f[i + 1] - f[i - 1]) / 2;
      gy[i] = y === 0 ? f[i + w] - f[i] : y === h - 1 ? f[i] - f[i - w] : (f[i + w] - f[i - w]) / 2;
    }
    return [gx, gy];
  }
  // bilinear sample with clamping (map_coordinates, order 1, mode "nearest")
  function sample(f, x, y) {
    x = Math.min(Math.max(x, 0), W - 1); y = Math.min(Math.max(y, 0), H - 1);
    const x0 = Math.min(Math.floor(x), W - 2), y0 = Math.min(Math.floor(y), H - 2), ax = x - x0, ay = y - y0, i = y0 * W + x0;
    return (1 - ay) * ((1 - ax) * f[i] + ax * f[i + 1]) + ay * ((1 - ax) * f[i + W] + ax * f[i + W + 1]);
  }

  // ------------------------------------------------------------------ scenes (ported from the course's synth.py)
  const CX = 470, CY = 272;
  const radius = (th) => 152 * (1 + 0.13 * Math.cos(2 * th - 0.5) + 0.075 * Math.cos(3 * th + 0.9) + 0.03 * Math.cos(5 * th - 0.4));
  function noiseField(seed) {
    const r = rng(seed), n = new Float32Array(W * H);
    for (let i = 0; i < n.length; i += 2) { const u = Math.max(r(), 1e-12), v = r(), m = Math.sqrt(-2 * Math.log(u));
      n[i] = m * Math.cos(2 * Math.PI * v); if (i + 1 < n.length) n[i + 1] = m * Math.sin(2 * Math.PI * v); }
    const s = gauss(n, W, H, 0.7); let ss = 0; for (const v of s) ss += v * v;
    const k = 0.04 / Math.sqrt(ss / s.length); for (let i = 0; i < s.length; i++) s[i] *= k;
    return s;
  }
  const soft = (d) => 0.5 * (1 - erf(d / (Math.SQRT2 * 1.3)));
  const bgAt = (x, y) => 0.085 + 0.03 * Math.exp(-((x - 300) ** 2 + (y - 420) ** 2) / (2 * 260 ** 2));
  function blobImage(haze = 0.52) {
    const img = new Float32Array(W * H), nz = noiseField(7);
    const wth = -88 * Math.PI / 180, hx = CX + (radius(wth) + 30) * Math.cos(wth), hy = CY + (radius(wth) + 30) * Math.sin(wth);
    const gran = [[CX - 55, CY + 70, 11, 0.12], [CX + 95, CY - 40, 9, -0.12], [CX - 20, CY - 60, 8, 0.10], [CX + 100, CY + 85, 10, -0.10]];
    const clutter = [[120, 110, 16, 0.30], [835, 95, 12, 0.26], [870, 440, 20, 0.22], [95, 450, 10, 0.25], [780, 300, 7, 0.18]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY, rho = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const ins = soft(rho - radius(th));
      const bg = bgAt(x, y) + haze * Math.exp(-((x - hx) ** 2 / (2 * 85 ** 2) + (y - hy) ** 2 / (2 * 42 ** 2)));
      let obj = 0.66 - 0.06 * (dx / 200) + 0.04 * (dy / 200);
      obj -= 0.30 * Math.exp(-((((x - (CX + 38)) / 52) ** 2 + ((y - (CY + 22)) / 40) ** 2) ** 5));
      for (const [gx, gy, gr, ga] of gran) obj += ga * Math.exp(-((x - gx) ** 2 + (y - gy) ** 2) / (2 * gr * gr));
      let v = ins * obj + (1 - ins) * bg;
      for (const [bx, by, br, ba] of clutter) v += ba * 0.5 * (1 - erf((Math.hypot(x - bx, y - by) - br) / 2));
      img[y * W + x] = Math.min(1, Math.max(0, v + nz[y * W + x]));
    }
    return img;
  }
  function rrect(x, y, x0, x1, y0, y1, r) {
    const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  function uImage(softLips) {
    const img = new Float32Array(W * H), nz = noiseField(11), cx = 480, cy = 285;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let d;
      if (softLips) { const a = rrect(x, y, cx - 175, cx + 175, cy - 165, cy + 150, 70), b = -rrect(x, y, cx - 85, cx + 85, cy - 400, 330, 70);
        d = 0.5 * (a + b + Math.sqrt((a - b) ** 2 + 3600)); }
      else d = Math.max(rrect(x, y, cx - 165, cx + 165, cy - 165, cy + 150, 55), -rrect(x, y, cx - 55, cx + 55, cy - 260, cy + 55, 48));
      const ins = soft(d), obj = 0.66 - 0.06 * ((x - cx) / 200) + 0.04 * ((y - cy) / 200);
      img[y * W + x] = Math.min(1, Math.max(0, ins * obj + (1 - ins) * bgAt(x, y) + nz[y * W + x]));
    }
    return img;
  }
  function twoImage(haze = 0.52) {
    const img = blobImage(haze), sm = gauss(img, W, H, 3), cx2 = 790, cy2 = 330, r2 = 48;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, d = Math.hypot(x - cx2, y - cy2) - r2 * (1 + 0.08 * Math.cos(3 * Math.atan2(y - cy2, x - cx2) + 0.7));
      const ins = soft(d); img[i] = Math.min(1, Math.max(0, img[i] * (1 - ins) + ins * (0.62 + (img[i] - sm[i]))));
    }
    return img;
  }
  const circle = (c, r, n) => Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n - Math.PI / 2; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]; });
  // a contour around two discs: convex hull, resampled evenly, starting at the top
  function hullAround(discs, n) {
    const pts = []; for (const [cx, cy, r] of discs) for (let i = 0; i < 240; i++) { const t = 2 * Math.PI * i / 240; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of [...pts].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const C = lo.slice(0, -1).concat(up.slice(0, -1)); C.push(C[0]);
    const d = [0]; for (let i = 1; i < C.length; i++) d.push(d[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
    let P = Array.from({ length: n }, (_, k) => { const t = d[d.length - 1] * k / n; let j = 1; while (d[j] < t) j++;
      const a = (t - d[j - 1]) / (d[j] - d[j - 1] || 1); return [C[j - 1][0] + a * (C[j][0] - C[j - 1][0]), C[j - 1][1] + a * (C[j][1] - C[j - 1][1])]; });
    let top = 0; P.forEach((p, i) => { if ((p[0] - CX) ** 2 + p[1] ** 2 < (P[top][0] - CX) ** 2 + P[top][1] ** 2) top = i; });
    P = P.slice(top).concat(P.slice(0, top));
    let area = 0; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    return area > 0 ? P : [P[0]].concat(P.slice(1).reverse());
  }

  // every scene: the image, the starting beads, the parameters, how long to run
  const BASE = { alpha: 0.06, beta: 0.25, tau: 1, sigma: 3, w: 6 };
  const SCENES = {
    object:  { name: "Around the object",  image: blobImage, start: () => circle([CX, CY], 236, 64), iters: 4000 },
    inside:  { name: "Started inside",     image: blobImage, start: () => circle([CX - 75, CY + 5], 45, 64), iters: 8000 },
    ushape:  { name: "A U shape",          image: () => uImage(false), start: () => circle([480, 285], 236, 64), iters: 4000 },
    usoft:   { name: "A softer U",         image: () => uImage(true), start: () => circle([480, 285], 236, 64), iters: 9000, params: { alpha: 0.02, beta: 0.15, sigma: 4 } },
    two:     { name: "Two objects",        image: twoImage, start: () => hullAround([[CX, CY, 215], [790, 330, 95]], 80), iters: 12000 },
  };
  const imageCache = {};
  const imageOf = (key) => (imageCache[key] ||= SCENES[key].image());

  // ------------------------------------------------------------------ the snake
  function external(img, sigma, w) {
    const sm = gauss(img, W, H, sigma), [gx, gy] = grad(sm, W, H), e = new Float32Array(W * H);
    let mn = 0; for (let i = 0; i < e.length; i++) { e[i] = -(gx[i] * gx[i] + gy[i] * gy[i]); if (e[i] < mn) mn = e[i]; }
    for (let i = 0; i < e.length; i++) e[i] /= -mn;                       // scaled to [-1, 0]
    const we = Float32Array.from(e, (v) => w * v), [fx, fy] = grad(we, W, H);
    return { e, fx, fy };
  }
  // A: the five-point stencil (beta, -(alpha + 4 beta), 2 alpha + 6 beta, ...) around the closed curve
  function snakeMatrix(n, alpha, beta) {
    const a = beta, b = -(alpha + 4 * beta), c = 2 * alpha + 6 * beta, A = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) for (const [k, v] of [[-2, a], [-1, b], [0, c], [1, b], [2, a]]) A[i][(i + k + n) % n] += v;
    return A;
  }
  function inverse(M) {                           // Gauss-Jordan; n is at most ~100 here
    const n = M.length, A = M.map((r, i) => { const row = new Float64Array(2 * n); row.set(r); row[n + i] = 1; return row; });
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; const d = A[c][c];
      for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c && A[r][c]) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map((r) => r.slice(n));
  }
  const matvec = (M, v) => M.map((row) => { let s = 0; for (let j = 0; j < v.length; j++) s += row[j] * v[j]; return s; });

  // a running snake: holds the beads and steps them; `image: false` switches the image force off
  function Snake(P, field, opts) {
    const o = { ...BASE, method: "semi", image: true, ...opts }, n = P.length;
    const A = snakeMatrix(n, o.alpha, o.beta), Minv = o.method === "semi" ? inverse(A.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) + o.tau * v))) : null;
    let x = P.map((p) => p[0]), y = P.map((p) => p[1]), k = 0;
    const forces = () => {
      const fx = x.map((xi, i) => (o.image ? sample(field.fx, xi, y[i]) : 0)), fy = y.map((yi, i) => (o.image ? sample(field.fy, x[i], yi) : 0));
      return { fx, fy };
    };
    return {
      get k() { return k; }, n, opts: o, A,
      beads: () => x.map((xi, i) => [xi, y[i]]),
      step(times = 1) {
        for (let t = 0; t < times; t++) {
          const { fx, fy } = forces();
          if (Minv) { x = matvec(Minv, x.map((v, i) => v - o.tau * fx[i])); y = matvec(Minv, y.map((v, i) => v - o.tau * fy[i])); }
          else { const Ax = matvec(A, x), Ay = matvec(A, y); x = x.map((v, i) => v - o.tau * (Ax[i] + fx[i])); y = y.map((v, i) => v - o.tau * (Ay[i] + fy[i])); }
          k++;
          if (!x.every(Number.isFinite) || !y.every(Number.isFinite)) return false;
        }
        return true;
      },
      // the two forces on each bead: internal  -A v  and image  -w grad E
      forces() { const { fx, fy } = forces(), Ax = matvec(A, x), Ay = matvec(A, y);
        return x.map((_, i) => ({ int: [-Ax[i], -Ay[i]], ext: [-fx[i], -fy[i]] })); },
      // discrete energy: 1/2 x.Ax + 1/2 y.Ay + w * sum E(v_i)   (internal from A, image from the map)
      energy() { const Ax = matvec(A, x), Ay = matvec(A, y); let ei = 0, ee = 0;
        for (let i = 0; i < n; i++) { ei += 0.5 * (x[i] * Ax[i] + y[i] * Ay[i]); if (o.image) ee += o.w * sample(field.e, x[i], y[i]); }
        return { internal: ei, image: ee, total: ei + ee }; },
    };
  }

  // ------------------------------------------------------------------ drawing
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function grayRGBA(img) {
    const d = new ImageData(W, H);
    for (let i = 0; i < img.length; i++) { const g = Math.pow(Math.min(1, Math.max(0, img[i])), 0.95) * 255;
      d.data[4 * i] = g * 0.97; d.data[4 * i + 1] = g * 0.99; d.data[4 * i + 2] = Math.min(255, g * 1.02); d.data[4 * i + 3] = 255; }
    return d;
  }
  // energy map: deep valleys (edges, E near -1) in blue, flat ground (E near 0) in warm light
  function energyRGBA(e) {
    const d = new ImageData(W, H), lo = [38, 70, 160], hi = [246, 238, 226];
    for (let i = 0; i < e.length; i++) { const t = Math.pow(Math.min(1, -e[i]), 0.6);
      for (let c = 0; c < 3; c++) d.data[4 * i + c] = hi[c] + (lo[c] - hi[c]) * t; d.data[4 * i + 3] = 255; }
    return d;
  }
  function makeStage(root, label) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.className = "snk-canvas";
    cv.setAttribute("role", "img"); cv.setAttribute("aria-label", label);
    root.appendChild(cv);
    const bg = document.createElement("canvas"); bg.width = W; bg.height = H;
    return { cv, ctx: cv.getContext("2d"), bg, bgx: bg.getContext("2d") };
  }
  const path = (ctx, P, closed = true) => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); if (closed) ctx.closePath(); };
  const SNAKE = "#ff4d5e", TRAIL = ["#b9c8ff", "#8aa3ff", "#5b7cf5"];
  function drawSnake(ctx, P, { start, trails = [], beads = true, color = SNAKE } = {}) {
    if (start) { ctx.save(); ctx.setLineDash([9, 7]); ctx.strokeStyle = "rgba(255,90,100,.8)"; ctx.lineWidth = 2.2; path(ctx, start); ctx.stroke(); ctx.restore(); }
    trails.forEach((T, i) => { ctx.strokeStyle = TRAIL[Math.min(i, TRAIL.length - 1)]; ctx.lineWidth = 2; path(ctx, T); ctx.stroke(); });
    ctx.strokeStyle = color; ctx.lineWidth = 3.2; path(ctx, P); ctx.stroke();
    if (beads) { ctx.fillStyle = color; for (const p of P) { ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, 7); ctx.fill(); } }
  }

  window.SnakeKit = { W, H, SCENES, BASE, imageOf, blobNoHaze: () => (imageCache.nohaze ||= blobImage(0)), twoNoHaze: () => (imageCache.twonohaze ||= twoImage(0)), external, snakeMatrix, inverse, matvec, Snake, sample, gauss, grad,
    circle, radius, CX, CY, grayRGBA, energyRGBA, makeStage, drawSnake, path, SNAKE, TRAIL, css };

  // ------------------------------------------------------------------ the public widgets
  // A snake settling on the object. Snapshots after 100, 200 and 300 steps stay behind, as in the notes' Figure 1.
  function settle(root, { image = true } = {}) {
    root.innerHTML = "";
    const stage = makeStage(root, image ? "A snake of 64 beads contracting from a circle onto the boundary of a bright object." : "The same snake with the image force switched off: it shrinks through the boundary to a point.");
    const row = document.createElement("div"); row.className = "lab-row";
    row.innerHTML = `<button type="button" class="chip chip-strong" data-act="play">Play</button><button type="button" class="chip" data-act="reset">Reset</button>` +
      (image ? `<button type="button" class="chip" data-act="view" aria-pressed="false">Show the energy landscape</button>` : "") + `<span class="snk-k" aria-live="off"></span>`;
    root.appendChild(row);
    const img = imageOf("object"), field = external(img, BASE.sigma, BASE.w);
    const pics = { image: grayRGBA(img), energy: image ? energyRGBA(field.e) : null };
    let view = "image", S, trails, start, playing = false, raf = 0;
    const paintBg = () => stage.bgx.putImageData(pics[view], 0, 0);
    const reset = () => { start = circle([CX, CY], 236, 64); S = Snake(start, field, { image }); trails = []; draw(); };
    function draw() {
      const c = stage.ctx; c.drawImage(stage.bg, 0, 0);
      drawSnake(c, S.beads(), { start, trails });
      row.querySelector(".snk-k").textContent = `step ${S.k}`;
    }
    const limit = image ? 1000 : 2600;
    function tick() {
      const per = S.k < 400 ? 4 : 12;
      for (let i = 0; i < per && S.k < limit; i++) { S.step(); if (image && [100, 200, 300].includes(S.k)) trails.push(S.beads()); }
      draw();
      if (S.k < limit && playing) raf = requestAnimationFrame(tick); else { playing = false; row.querySelector('[data-act="play"]').textContent = S.k >= limit ? "Play again" : "Play"; }
    }
    row.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.act === "play") { if (playing) { playing = false; cancelAnimationFrame(raf); b.textContent = "Play"; return; }
        if (S.k >= limit) reset(); playing = true; b.textContent = "Pause"; raf = requestAnimationFrame(tick); }
      if (b.dataset.act === "reset") { playing = false; cancelAnimationFrame(raf); row.querySelector('[data-act="play"]').textContent = "Play"; reset(); }
      if (b.dataset.act === "view") { view = view === "image" ? "energy" : "image"; b.setAttribute("aria-pressed", String(view === "energy"));
        b.textContent = view === "energy" ? "Show the image" : "Show the energy landscape"; paintBg(); draw(); }
    });
    paintBg(); reset();
  }
  window.SnakeKit.settle = settle;
  const mount = () => {
    document.querySelectorAll('[data-lab="snakes-settle"]:not([data-on])').forEach((r) => { r.dataset.on = 1; settle(r); });
    document.querySelectorAll('[data-lab="snakes-shrink"]:not([data-on])').forEach((r) => { r.dataset.on = 1; settle(r, { image: false }); });
  };
  window.SnakeKit.mount = mount;
  mount();
})();
