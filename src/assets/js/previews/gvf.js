// Gradient vector flow (Xu and Prince, 1998): a solver, a snake that follows a force field, and the public preview.
//
// Builds on window.SnakeKit (previews/snakes.js, loaded first). Ports the course's GVF scripts:
//   f = |grad(G_sigma * I)|^2 scaled to [0, 1],  (f_x, f_y) = grad f,  g = f_x^2 + f_y^2
//   GVF field (u, v): the steady state of  mu lap(u) - g (u - f_x) = 0,  mu lap(v) - g (v - f_y) = 0,
//   Neumann boundary, solved here by multigrid (the scripts use a direct sparse solve; same answer).
// Snakes here follow a force: x <- (I + tau A)^-1 (x + tau w U), then the points are respaced evenly
// along the curve, as in the course's GVF videos (256 points, every 4th drawn as a bead).
//
// Public widget:  <div data-lab="gvf-compare">   the U shape: Kass's force or GVF, and the snake each one drives
(() => {
  const K = window.SnakeKit;
  if (!K) return;
  const { W, H } = K;

  // ------------------------------------------------------------------ the edge map and its gradient
  function edgeMap(img, sigma) {
    const sm = K.gauss(img, W, H, sigma), [gx, gy] = K.grad(sm, W, H), f = new Float32Array(W * H);
    let mx = 0; for (let i = 0; i < f.length; i++) { f[i] = gx[i] * gx[i] + gy[i] * gy[i]; if (f[i] > mx) mx = f[i]; }
    for (let i = 0; i < f.length; i++) f[i] /= mx;
    const [fx, fy] = K.grad(f, W, H), g = Float32Array.from(fx, (v, i) => v * v + fy[i] * fy[i]);
    return { f, fx, fy, g };
  }

  // ------------------------------------------------------------------ multigrid for  c u - mu lap(u) = r  (cell-centered, Neumann)
  function levels(c, w, h, mu) {
    const L = [{ w, h, c, k: mu }];                          // k = mu / h^2 at this level
    while (Math.min(L[L.length - 1].w, L[L.length - 1].h) > 6) {
      const p = L[L.length - 1], cw = Math.ceil(p.w / 2), ch = Math.ceil(p.h / 2), cc = new Float32Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        let s = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const X = 2 * x + dx, Y = 2 * y + dy; if (X < p.w && Y < p.h) { s += p.c[Y * p.w + X]; n++; } }
        cc[y * cw + x] = s / n;
      }
      L.push({ w: cw, h: ch, c: cc, k: p.k / 4 });
    }
    return L;
  }
  function smooth(l, u, r, sweeps) {
    const { w, h, c, k } = l;
    for (let s = 0; s < sweeps; s++) for (let color = 0; color < 2; color++)
      for (let y = 0; y < h; y++) for (let x = (y + color) & 1; x < w; x += 2) {
        const i = y * w + x; let sum = 0, n = 0;
        if (x > 0) { sum += u[i - 1]; n++; } if (x < w - 1) { sum += u[i + 1]; n++; }
        if (y > 0) { sum += u[i - w]; n++; } if (y < h - 1) { sum += u[i + w]; n++; }
        u[i] = (r[i] + k * sum) / (c[i] + k * n);
      }
  }
  function residual(l, u, r) {
    const { w, h, c, k } = l, out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let sum = 0, n = 0;
      if (x > 0) { sum += u[i - 1]; n++; } if (x < w - 1) { sum += u[i + 1]; n++; }
      if (y > 0) { sum += u[i - w]; n++; } if (y < h - 1) { sum += u[i + w]; n++; }
      out[i] = r[i] - ((c[i] + k * n) * u[i] - k * sum);
    }
    return out;
  }
  function vcycle(L, d, u, r) {
    const l = L[d];
    if (d === L.length - 1) { smooth(l, u, r, 60); return; }
    smooth(l, u, r, 2);
    const res = residual(l, u, r), q = L[d + 1], rc = new Float32Array(q.w * q.h);
    for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
      let s = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const X = 2 * x + dx, Y = 2 * y + dy; if (X < l.w && Y < l.h) { s += res[Y * l.w + X]; n++; } }
      rc[y * q.w + x] = s / n;
    }
    const ec = new Float32Array(q.w * q.h);
    vcycle(L, d + 1, ec, rc);
    // bilinear prolongation for cell-centered grids (weights 9/16, 3/16, 3/16, 1/16)
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
      const X = x >> 1, Y = y >> 1, sx = x & 1 ? 1 : -1, sy = y & 1 ? 1 : -1;
      const X2 = Math.min(Math.max(X + sx, 0), q.w - 1), Y2 = Math.min(Math.max(Y + sy, 0), q.h - 1);
      u[y * l.w + x] += (9 * ec[Y * q.w + X] + 3 * ec[Y * q.w + X2] + 3 * ec[Y2 * q.w + X] + ec[Y2 * q.w + X2]) / 16;
    }
    smooth(l, u, r, 2);
  }
  // Solve one component. dt = Infinity: the steady state (the GVF field itself). A finite dt: one implicit
  // pseudo-time step  (u_new - u_old)/dt = mu lap(u_new) - g (u_new - f), used to show the diffusion unfold.
  function solve(fc, g, mu, { dt = Infinity, u0 = null, cycles = 12, tol = 1e-5 } = {}) {
    const n = W * H, c = new Float32Array(n), r = new Float32Array(n), inv = Number.isFinite(dt) ? 1 / dt : 0;
    for (let i = 0; i < n; i++) { c[i] = g[i] + inv; r[i] = g[i] * fc[i] + inv * (u0 ? u0[i] : fc[i]); }
    const L = levels(c, W, H, mu), u = Float32Array.from(u0 || fc);
    let r0 = 0; for (const v of residual(L[0], u, r)) r0 += v * v; r0 = Math.sqrt(r0) || 1;
    for (let k = 0; k < cycles; k++) {
      vcycle(L, 0, u, r);
      let rr = 0; for (const v of residual(L[0], u, r)) rr += v * v;
      if (Math.sqrt(rr) / r0 < tol) break;
    }
    return u;
  }
  function gvf(E, mu = 0.2, opts = {}) { return { u: solve(E.fx, E.g, mu, opts), v: solve(E.fy, E.g, mu, opts) }; }

  // ------------------------------------------------------------------ scenes (ported from the GVF scripts)
  const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
  function cImage(R = 150, r = 85, gapDeg = 50) {
    const CX = 480, CY = 270, img = new Float32Array(W * H);
    const th = (180 - gapDeg) * Math.PI / 180, s = Math.sin(th), c = Math.cos(th), ra = (R + r) / 2, rb = (R - r) / 2;
    const noise = (() => { const rnd = (seed => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(13);
      const n = new Float32Array(W * H); for (let i = 0; i < n.length; i += 2) { const u = Math.max(rnd(), 1e-12), v = rnd(), m = Math.sqrt(-2 * Math.log(u)); n[i] = m * Math.cos(2 * Math.PI * v); if (i + 1 < n.length) n[i + 1] = m * Math.sin(2 * Math.PI * v); }
      const sm = K.gauss(n, W, H, 0.7); let ss = 0; for (const v of sm) ss += v * v; const k = 0.04 / Math.sqrt(ss / sm.length); return sm.map((v) => v * k); })();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const px = x - CX, py = y - CY, qx = Math.abs(py), qy = -px;
      const d = (c * qx > s * qy ? Math.hypot(qx - s * ra, qy - c * ra) : Math.abs(Math.hypot(qx, qy) - ra)) - rb;
      const ins = 0.5 * (1 - erf(d / (Math.SQRT2 * 1.3)));
      const bg = 0.085 + 0.03 * Math.exp(-((x - 300) ** 2 + (y - 420) ** 2) / (2 * 260 ** 2)), obj = 0.66 - 0.06 * (px / 200) + 0.04 * (py / 200);
      img[y * W + x] = Math.min(1, Math.max(0, ins * obj + (1 - ins) * bg + noise[y * W + x]));
    }
    return img;
  }
  const NP = 256, k2 = (NP / 64) ** 2, k4 = (NP / 64) ** 4;
  const SOFT = { alpha: 0.005 * k2, beta: (0.15 / 16) * k4, w: 12, tau: 1 }, INSIDE = { alpha: 0.015 * k2, beta: (0.25 / 16) * k4, w: 12, tau: 1 };
  const SCENES = {
    ushape: { name: "A U shape", image: () => K.imageOf("usoft"), sigma: 4, start: () => K.circle([480, 285], 236, NP), prm: SOFT, iters: 5000 },
    cshape: { name: "A C shape", image: () => cImage(), sigma: 4, start: () => K.circle([480, 270], 205, NP), prm: SOFT, iters: 6000 },
    inside: { name: "Inside, with haze", image: () => K.imageOf("object"), sigma: 3, start: () => K.circle([K.CX - 75, K.CY + 5], 45, NP), prm: INSIDE, iters: 3000 },
    nohaze: { name: "Inside, no haze", image: () => K.blobNoHaze(), sigma: 3, start: () => K.circle([K.CX + 30, K.CY + 18], 72, NP), prm: INSIDE, iters: 4000 },
    two:    { name: "Two objects", image: () => K.twoNoHaze(), sigma: 3, start: () => hullN(320), prm: { alpha: 0.06 / 4 * (320 / 80) ** 2, beta: 0.25 / 16 * (320 / 80) ** 4, w: 12, tau: 1 }, iters: 8000 },
  };
  function hullN(n) {                                   // the lecture's two-object hull, with n points
    const P = K.SCENES.two.start();                     // 80 points; resample to n
    return resample(P, n);
  }
  const cache = {};
  const sceneData = (key) => {
    if (cache[key]) return cache[key];
    const s = SCENES[key], img = s.image(), E = edgeMap(img, s.sigma);
    return (cache[key] = { img, E, gvf: null, kass: { u: E.fx, v: E.fy } });
  };
  const gvfOf = (key, mu = 0.2) => { const d = sceneData(key); if (!d.gvf || d.mu !== mu) { d.gvf = gvf(d.E, mu); d.mu = mu; } return d.gvf; };

  // ------------------------------------------------------------------ a snake that follows a force field
  // equal arc-length points along the closed Catmull-Rom curve through P (point 0 kept in place)
  function resample(P, n = P.length, sub = 8) {
    const m = P.length, C = [];
    for (let i = 0; i < m; i++) {
      const p0 = P[(i - 1 + m) % m], p1 = P[i], p2 = P[(i + 1) % m], p3 = P[(i + 2) % m];
      for (let j = 0; j < sub; j++) { const t = j / sub, t2 = t * t, t3 = t2 * t;
        C.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3))); }
    }
    C.push(C[0]);
    const d = [0]; for (let i = 1; i < C.length; i++) d.push(d[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
    const out = []; let j = 1;
    for (let k = 0; k < n; k++) { const t = d[d.length - 1] * k / n; while (d[j] < t) j++;
      const a = (t - d[j - 1]) / (d[j] - d[j - 1] || 1); out.push([C[j - 1][0] + a * (C[j][0] - C[j - 1][0]), C[j - 1][1] + a * (C[j][1] - C[j - 1][1])]); }
    return out;
  }
  function ForceSnake(P, field, prm) {
    const o = { tau: 1, ...prm }, n = P.length, A = K.snakeMatrix(n, o.alpha, o.beta);
    const Minv = K.inverse(A.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) + o.tau * v)));
    let B = P.map((p) => [p[0], p[1]]), k = 0;
    return {
      get k() { return k; }, n,
      beads: () => B,
      step(times = 1) {
        for (let t = 0; t < times; t++) {
          const bx = B.map(([x, y]) => x + o.tau * o.w * K.sample(field.u, x, y)), by = B.map(([x, y]) => y + o.tau * o.w * K.sample(field.v, x, y));
          const nx = K.matvec(Minv, bx), ny = K.matvec(Minv, by);
          const moved = Math.max(...nx.map((x, i) => Math.hypot(x - B[i][0], ny[i] - B[i][1])));
          B = resample(nx.map((x, i) => [x, ny[i]])); k++;
          if (!B.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return -1;
          if (moved < 2e-3) return 0;
        }
        return 1;
      },
    };
  }

  // ------------------------------------------------------------------ drawing a force field as arrows
  function drawField(ctx, field, { scale, step = 22, color = "#f2a541", box = [0, 0, W, H] } = {}) {
    const [x0, y0, x1, y1] = box;
    ctx.lineWidth = 2;
    for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
      const u = K.sample(field.u, x, y), v = K.sample(field.v, x, y), m = Math.hypot(u, v) / scale;
      if (m < 0.004) { ctx.fillStyle = "rgba(255,255,255,.3)"; ctx.fillRect(x - 1, y - 1, 2, 2); continue; }
      const L = Math.min(step * 0.9, step * 0.95 * Math.pow(m, 0.45)), ux = u / Math.hypot(u, v), uy = v / Math.hypot(u, v);
      const ax = x - ux * L / 2, ay = y - uy * L / 2, bx = x + ux * L / 2, by = y + uy * L / 2;
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + ux * 2, by + uy * 2); ctx.lineTo(bx - ux * 5 - uy * 3.5, by - uy * 5 + ux * 3.5); ctx.lineTo(bx - ux * 5 + uy * 3.5, by - uy * 5 - ux * 3.5); ctx.fill();
    }
  }
  const pct = (u, v, q = 0.998) => { const m = Array.from(u, (x, i) => Math.hypot(x, v[i])).filter((x, i) => i % 7 === 0).sort((a, b) => a - b); return m[Math.floor(q * (m.length - 1))] || 1; };
  const dim = (img, a = 0.16) => K.grayRGBA(Float32Array.from(img, (v) => v * a + 0.02));

  window.GVFKit = { edgeMap, solve, gvf, gvfOf, sceneData, SCENES, resample, ForceSnake, drawField, pct, dim, cImage };

  // ------------------------------------------------------------------ the public widget: same snake, two forces
  function compare(root) {
    root.innerHTML = `<div class="lab-row snk-top"><span class="bench-label">External force</span>
        <button type="button" class="chip" data-f="kass" aria-pressed="true">Kass’s force</button>
        <button type="button" class="chip" data-f="gvf" aria-pressed="false">Gradient vector flow</button></div>
      <div class="snk-stage"></div>
      <div class="lab-row"><button type="button" class="chip chip-strong" data-act="play">Play the snake</button><button type="button" class="chip" data-act="reset">Reset</button><span class="snk-k"></span></div>`;
    const stage = K.makeStage(root.querySelector(".snk-stage"), "A U-shaped object with an external force field drawn as arrows; a snake can be played under either force.");
    const d = sceneData("ushape"), sc = SCENES.ushape, kass = d.kass;
    let force = "kass", field = kass, S = null, playing = false, raf = 0, phase = "field";
    const scale = pct(kass.u, kass.v), bg = dim(d.img), bright = K.grayRGBA(d.img);
    const label = root.querySelector(".snk-k"), play = root.querySelector('[data-act="play"]');
    function draw() {
      const c = stage.ctx;
      if (phase === "field") { c.putImageData(bg, 0, 0); drawField(c, field, { scale }); }
      else { c.putImageData(bright, 0, 0); const B = S.beads(); const beads = B.filter((_, i) => i % 4 === 0);
        K.drawSnake(c, B, { start: sc.start(), beads: false }); c.fillStyle = K.SNAKE; for (const p of beads) { c.beginPath(); c.arc(p[0], p[1], 4.2, 0, 7); c.fill(); } }
      label.textContent = phase === "snake" ? `step ${S.k}` : force === "gvf" ? "Arrows: the GVF field" : "Arrows: Kass’s force, ∇f";
    }
    function tick() {
      let r = 1; for (let i = 0; i < 10 && r === 1 && S.k < sc.iters; i++) r = S.step();
      draw();
      if (playing && r === 1 && S.k < sc.iters) raf = requestAnimationFrame(tick); else { playing = false; play.textContent = "Play again"; }
    }
    const reset = () => { playing = false; cancelAnimationFrame(raf); phase = "field"; S = null; play.textContent = "Play the snake"; draw(); };
    function setForce(fk) {
      force = fk; root.querySelectorAll("[data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === fk)));
      if (fk === "gvf") { label.textContent = "Solving for the GVF field…"; setTimeout(() => { field = gvfOf("ushape"); reset(); }, 30); }
      else { field = kass; reset(); }
    }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.f) setForce(b.dataset.f);
      if (b.dataset.act === "reset") reset();
      if (b.dataset.act === "play") {
        if (playing) { playing = false; cancelAnimationFrame(raf); play.textContent = "Play the snake"; return; }
        if (!S || S.k >= sc.iters || phase === "field") { S = ForceSnake(sc.start(), field, sc.prm); phase = "snake"; }
        playing = true; play.textContent = "Pause"; raf = requestAnimationFrame(tick);
      }
    });
    draw();
  }
  const mount = () => document.querySelectorAll('[data-lab="gvf-compare"]:not([data-on])').forEach((r) => { r.dataset.on = 1; compare(r); });
  window.GVFKit.mount = mount;
  mount();
})();
