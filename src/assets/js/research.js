// Three small figures for the research page, in the language of the home-page figure:
// contour lines are a patient, a frame is a measurement, and lines fade from solid to dotted
// with distance from what was measured.
//
//   <canvas data-fig="scanners">  two patients (rows) seen by five scanners (columns); Harmonize removes the
//                                  scanner look and keeps the difference between the patients
//   <canvas data-fig="recover">   one frame was measured; Recover infers the patient just around it, fading out with
//                                  distance, and stops: one measurement cannot tell you the whole patient
//   <canvas data-fig="value">     four possible measurements; each adds what the others do not already cover
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NLEVELS = 13;

  // ---------------------------------------------------------------- colors
  const rgb = (s) => { s = s.trim(); if (s.startsWith("rgb")) return s.match(/\d+/g).slice(0, 3).map(Number);
    const h = s.replace("#", ""), v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement), g = (n, d) => rgb(cs.getPropertyValue(n).trim() || d);
    C = { ink: g("--field-in", "#1b2029"), far: g("--field-out", "#2f43a3"), graphite: g("--graphite", "#5a6170"),
      a: g("--scan-a", "#b5650d"), b: g("--scan-b", "#0f7f78"), s: g("--l-search", "#8a4f7d"), acc: g("--accent", "#2f43a3"),
      paper: rgb(getComputedStyle(document.body).backgroundColor) };
  }

  // ---------------------------------------------------------------- the field and its contours
  // components: [cx, cy, sx, sy, rotation, weight], positions and sizes in units of the figure height
  function field(comps, base = true) {
    const cs = comps.map(([cx, cy, sx, sy, r, w]) => [cx, cy, 1 / sx, 1 / sy, Math.cos(r), Math.sin(r), w]);
    return (u, v) => {
      let f = base ? 0.05 * Math.sin(3.1 * u + 1.3) * Math.cos(4.7 * v - 0.4) : 0;
      for (const [cx, cy, isx, isy, c, s, w] of cs) { const dx = u - cx, dy = v - cy, a = (c * dx + s * dy) * isx, b = (-s * dx + c * dy) * isy; f += w * Math.exp(-0.5 * (a * a + b * b)); }
      return f;
    };
  }
  const levels = (lo, hi, gamma = 1, n = NLEVELS) => Array.from({ length: n }, (_, k) => lo + (hi - lo) * (0.1 + 0.84 * Math.pow(k / (n - 1), gamma)));
  const CASES = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]], 8: [[3, 0]], 9: [[0, 2]], 10: [[3, 2], [0, 1]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };
  // marching squares on a grid g (nx by ny, spacing `cell` px, origin ox, oy); returns segments x1,y1,x2,y2,...
  function march(g, nx, ny, cell, levs, ox = 0, oy = 0) {
    const out = [], e = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (const L of levs) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i + 1], d = g[(j + 1) * nx + i];
      const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x = ox + i * cell, y = oy + j * cell;
      e[0][0] = x + cell * (L - a) / (b - a); e[0][1] = y;
      e[1][0] = x + cell; e[1][1] = y + cell * (L - b) / (c - b);
      e[2][0] = x + cell * (L - d) / (c - d); e[2][1] = y + cell;
      e[3][0] = x; e[3][1] = y + cell * (L - a) / (d - a);
      for (const [p, q] of CASES[idx]) out.push(e[p][0], e[p][1], e[q][0], e[q][1]);
    }
    return out;
  }
  // sample f(u, v) on a grid over a w-by-h px box; u, v are px divided by `unit`
  function grid(f, w, h, cell, unit) {
    const nx = Math.ceil(w / cell) + 1, ny = Math.ceil(h / cell) + 1, g = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = f((i * cell) / unit, (j * cell) / unit);
    return { g, nx, ny };
  }
  const range = (g) => { let lo = Infinity, hi = -Infinity; for (const v of g) { if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
  // draw segments in BINS styles from solid (t = 0) to dotted (t = 1), as on the home page; t < 0 skips a segment
  const BINS = 12;
  function strokeFaded(ctx, seg, t, color, alpha = 1) {
    const paths = Array.from({ length: BINS }, () => new Path2D());
    for (let k = 0; k < seg.length; k += 4) {
      const ax = seg[k], ay = seg[k + 1], bx = seg[k + 2], by = seg[k + 3], tt = t((ax + bx) / 2, (ay + by) / 2);
      if (tt < 0) continue;
      const bin = Math.min(BINS - 1, Math.floor(Math.min(1, tt) * BINS)), duty = 0.9 - 0.78 * Math.pow((bin + 0.5) / BINS, 0.8);
      paths[bin].moveTo(ax, ay); paths[bin].lineTo(ax + (bx - ax) * duty, ay + (by - ay) * duty);
    }
    ctx.lineCap = "round"; ctx.strokeStyle = css(color);
    for (let b = 0; b < BINS; b++) { const tb = (b + 0.5) / BINS; ctx.globalAlpha = Math.min(1, alpha * (0.62 - 0.27 * tb)); ctx.lineWidth = 1 + 0.2 * tb; ctx.stroke(paths[b]); }
    ctx.globalAlpha = 1;
  }
  function strokeSolid(ctx, seg, color, width, alpha = 1) {
    const p = new Path2D(); for (let k = 0; k < seg.length; k += 4) { p.moveTo(seg[k], seg[k + 1]); p.lineTo(seg[k + 2], seg[k + 3]); }
    ctx.globalAlpha = alpha; ctx.strokeStyle = css(color); ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(p); ctx.globalAlpha = 1;
  }
  // viewfinder corners, as on the home page
  function corners(ctx, x0, y0, x1, y1, ck, color, width = 2, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = css(color); ctx.lineWidth = width; ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x0, y0 + ck); ctx.lineTo(x0, y0); ctx.lineTo(x0 + ck, y0);
    ctx.moveTo(x1 - ck, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + ck);
    ctx.moveTo(x1, y1 - ck); ctx.lineTo(x1, y1); ctx.lineTo(x1 - ck, y1);
    ctx.moveTo(x0 + ck, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - ck);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  function label(ctx, txt, x, y, color, align = "left", base = "top", size = 11) {
    ctx.font = `500 ${size}px "Schibsted Grotesk", system-ui, sans-serif`; ctx.fillStyle = css(color); ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(txt, x, y);
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  // a canvas that tracks its CSS size; `step(dt)` advances animations and returns true while it wants more frames
  const STAGES = [];
  function stage(canvas, draw, step = () => false) {
    const ctx = canvas.getContext("2d"), S = { ctx, W: 0, H: 0, raf: 0, last: 0, visible: true };
    const tick = (now) => { S.raf = 0; const dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0; S.last = now; const more = step(dt); if (S.W) draw(S); if (more && S.visible) kick(); else S.last = 0; };
    const kick = () => { if (!S.raf) S.raf = requestAnimationFrame(tick); };
    S.kick = kick;
    const resize = () => { const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2); S.W = Math.max(1, Math.round(r.width)); S.H = Math.max(1, Math.round(r.height));
      canvas.width = S.W * dpr; canvas.height = S.H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); kick(); };
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([e]) => { S.visible = e.isIntersecting; if (S.visible) kick(); }).observe(canvas);
    STAGES.push(S);
    return S;
  }
  const controls = (canvas) => canvas.closest("figure").querySelectorAll("[data-act]");
  const press = (b, on) => b.setAttribute("aria-pressed", String(on));

  // ================================================================ 1. scanners
  // Each scanner draws the same anatomy with its own contrast (iso-levels), resolution (grid spacing),
  // noise (a fine ripple), color and line weight. k = 1 is the scanner's own look; k = 0 is one shared look.
  function figScanners(canvas) {
    const P1 = [[0.28, 0.32, 0.22, 0.16, -0.3, 1.0], [0.72, 0.58, 0.26, 0.2, 0.6, 0.95], [0.3, 0.82, 0.16, 0.14, 0, 0.7], [0.85, 0.12, 0.14, 0.18, -0.5, 0.75]];
    const P2 = [[0.32, 0.38, 0.19, 0.12, -0.1, 1.0], [0.66, 0.62, 0.21, 0.22, 0.3, 0.75], [0.26, 0.85, 0.2, 0.12, 0.2, 0.9], [0.88, 0.18, 0.12, 0.2, -0.5, 0.55]];
    const F = [field(P1, false), field(P2, false)];
    const ripple = (seed) => { let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647), r = [];
      for (let i = 0; i < 6; i++) r.push([22 + 26 * rnd(), 2 * Math.PI * rnd(), 2 * Math.PI * rnd()]);
      return (u, v) => r.reduce((t, [f, th, p]) => t + Math.sin(f * (u * Math.cos(th) + v * Math.sin(th)) + p) / 6, 0); };
    const SC = [
      { col: "a", gamma: 0.72, cell: 3, noise: 0, width: 2.2 },
      { col: "b", gamma: 1.4, cell: 3, noise: 0.03, width: 1.5 },
      { col: "s", gamma: 1.0, cell: 9, noise: 0, width: 2.4 },
      { col: "acc", gamma: 0.9, cell: 3.5, noise: 0.075, width: 1.3 },
      { col: "graphite", gamma: 1.6, cell: 6, noise: 0.015, width: 2 },
    ].map((s, i) => ({ ...s, rip: ripple(17 + 31 * i) }));
    const REF = { gamma: 1, cell: 3, width: 1.7 };
    let on = false, k = SC.map(() => 1), clock = 0, lo = Infinity, hi = -Infinity;
    for (const f of F) for (let j = 0; j <= 40; j++) for (let i = 0; i <= 40; i++) { const v = f(i / 40, j / 40); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const S = stage(canvas, draw, (dt) => {
      clock += dt; let moving = false;
      k = k.map((x, i) => { const goal = on ? 0 : 1; if (on && clock < i * 0.12 && !reduce) { moving = true; return x; }
        let nx = reduce ? goal : x + (goal - x) * (1 - Math.pow(0.03, dt)); if (Math.abs(nx - goal) < 0.003) nx = goal; else moving = true; return nx; });
      return moving;
    });
    function draw() {
      const { ctx, W, H } = S; ctx.clearRect(0, 0, W, H);
      const narrow = W < 520, gut = narrow ? 16 : 64, top = 20, gap = narrow ? 6 : 12;
      const tw = Math.min((W - gut - gap * 4) / 5, (H - top - gap) / 2), x0 = gut + (W - gut - (tw * 5 + gap * 4)) / 2;
      const small = tw < 90;
      SC.forEach((s, c) => {
        const kk = k[c], col = mix(C.ink, C[s.col], kk), tx = x0 + c * (tw + gap);
        label(ctx, narrow ? `${c + 1}` : `scanner ${c + 1}`, tx + tw / 2, 2, mix(C.graphite, C[s.col], kk), "center");
        for (let r = 0; r < 2; r++) {
          const ty = top + r * (tw + gap), cell = REF.cell + (s.cell - REF.cell) * kk, amp = s.noise * kk;
          const { g, nx, ny } = grid((u, v) => F[r](u, v) + amp * s.rip(u, v), tw, tw, cell, tw);
          ctx.save(); ctx.beginPath(); ctx.rect(tx, ty, tw, tw); ctx.clip();
          strokeSolid(ctx, march(g, nx, ny, cell, levels(lo, hi, 1 + (s.gamma - 1) * kk, small ? 8 : NLEVELS), tx, ty), col, (REF.width + (s.width - REF.width) * kk) * (small ? 0.6 : 1));
          ctx.restore();
          corners(ctx, tx, ty, tx + tw, ty + tw, Math.max(6, tw * 0.12), C.ink, 1.5, 0.75);
        }
      });
      for (let r = 0; r < 2; r++) label(ctx, narrow ? `${r + 1}` : `patient ${r + 1}`, x0 - (narrow ? 5 : 10), top + r * (tw + gap) + tw / 2, C.graphite, "right", "middle");
    }
    controls(canvas).forEach((b) => b.addEventListener("click", () => { on = !on; clock = 0; press(b, on); S.kick(); }));
  }

  // ================================================================ 2. recover
  // Inside the frame: what was measured. Just outside it, the inferred field blends from this patient toward a
  // typical patient as the distance grows, and the lines fade from solid to dotted; beyond `reach` nothing is drawn.
  function figRecover(canvas) {
    const TRUE = [[0.35, 0.58, 0.2, 0.3, 0.4, 0.8], [0.8, 0.34, 0.28, 0.17, -0.3, 1.0], [1.2, 0.7, 0.15, 0.13, 0.0, 0.7], [1.62, 0.44, 0.3, 0.21, 0.6, 0.95], [2.15, 0.3, 0.17, 0.26, -0.5, 0.78], [2.55, 0.66, 0.24, 0.17, 0.2, 0.86]];
    const TYPICAL = [[0.42, 0.5, 0.22, 0.26, 0.1, 0.85], [0.8, 0.34, 0.28, 0.17, -0.3, 1.0], [1.2, 0.7, 0.15, 0.13, 0.0, 0.7], [1.55, 0.5, 0.26, 0.24, 0.2, 0.9], [2.05, 0.42, 0.22, 0.22, 0.0, 0.85], [2.6, 0.5, 0.2, 0.22, 0.0, 0.8]];
    const fTrue = field(TRUE), fTyp = field(TYPICAL), CELL = 5;
    let rec = false, truth = false, reveal = 0, fx = null, tx = null, cache = null, base = null;
    // the frame eases toward the pointer, as on the home page
    const S = stage(canvas, draw, (dt) => {
      const goal = rec ? 1 : 0, nr = reduce ? goal : goal ? Math.min(1, reveal + dt / 1.2) : Math.max(0, reveal - dt / 0.4); reveal = nr;
      let moving = false;
      if (fx !== null && tx !== null) { const k = reduce ? 1 : 1 - Math.pow(0.86, dt * 60 || 1); fx += (tx - fx) * k; if (Math.abs(tx - fx) > 0.3) moving = true; else fx = tx; }
      return nr !== goal || moving;
    });
    function layout() {
      const { W, H } = S, off = (Math.max(W / H, 2.9) * H - W) / 2, fw = Math.max(100, Math.min(W * 0.24, 200)), fh = H * 0.7;
      if (fx === null) fx = W * 0.3;
      const clampX = (x) => Math.min(W - fw / 2 - 2, Math.max(fw / 2 + 2, x));
      fx = clampX(fx); if (tx !== null) tx = clampX(tx);
      return { off, fw, fh, x0: Math.round(fx - fw / 2), y0: (H - fh) / 2, x1: fx + fw / 2, y1: (H + fh) / 2, reach: Math.max(50, Math.min(100, W * 0.14)) };
    }
    function compute(L) {
      const { W, H } = S, o = L.off / H, dist = (x, y) => Math.hypot(Math.max(L.x0 - x, 0, x - L.x1), Math.max(L.y0 - y, 0, y - L.y1));
      if (!base || base.key !== `${W}x${H}`) { const gt = grid((u, v) => fTrue(u + o, v), W, H, CELL, H), [lo, hi] = range(gt.g), levs = levels(lo, hi); base = { key: `${W}x${H}`, levs, tru: march(gt.g, gt.nx, gt.ny, CELL, levs) }; }
      const levs = base.levs, gr = grid((u, v) => { const w = Math.exp(-Math.pow(dist(u * H, v * H) / (1.2 * L.reach), 2)); return w * fTrue(u + o, v) + (1 - w) * fTyp(u + o, v); }, W, H, CELL, H);
      return { key: `${W}x${H}:${L.x0}`, tru: base.tru, rec: march(gr.g, gr.nx, gr.ny, CELL, levs), dist };
    }
    function draw() {
      const { ctx, W, H } = S; ctx.clearRect(0, 0, W, H);
      const L = layout(); if (!cache || cache.key !== `${W}x${H}:${L.x0}`) cache = compute(L);
      const inF = (x, y) => x > L.x0 && x < L.x1 && y > L.y0 && y < L.y1;
      if (truth) { const p = [], t = cache.tru; for (let q = 0; q < t.length; q += 4) if (!inF((t[q] + t[q + 2]) / 2, (t[q + 1] + t[q + 3]) / 2)) p.push(t[q], t[q + 1], t[q + 2], t[q + 3]); strokeSolid(ctx, p, C.ink, 1, 0.3); }
      if (reveal > 0) { const R = ease(reveal) * L.reach; strokeFaded(ctx, cache.rec, (x, y) => { if (inF(x, y)) return -1; const d = cache.dist(x, y); return d > R ? -1 : d / L.reach; }, C.far, 1.4); }
      ctx.save(); ctx.beginPath(); ctx.rect(L.x0, L.y0, L.fw, L.fh); ctx.clip(); strokeSolid(ctx, cache.tru, C.ink, 2.6); ctx.restore();
      corners(ctx, L.x0, L.y0, L.x1, L.y1, 16, C.ink);
      label(ctx, "measured", L.x0 + 6, L.y1 + 7 > H - 14 ? L.y1 - 18 : L.y1 + 7, C.ink);
    }
    controls(canvas).forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.act === "recover") { rec = !rec; press(b, rec); }
      if (b.dataset.act === "truth") { truth = !truth; press(b, truth); }
      S.kick(); }));
    // the frame follows the mouse; on touch screens it follows a finger dragged across the figure
    const moveTo = (e) => { tx = e.clientX - canvas.getBoundingClientRect().left; S.kick(); };
    canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) moveTo(e); });
    canvas.addEventListener("pointerdown", moveTo);
    canvas.addEventListener("keydown", (e) => { const d = { ArrowLeft: -20, ArrowRight: 20 }[e.key]; if (!d) return; e.preventDefault(); tx = (tx ?? fx) + d; S.kick(); });
  }

  // ================================================================ 3. value
  // Four measurements the patient could have. Outside the taken ones, lines fade with distance as on the home page.
  // "Known" is the average over the figure of exp(−distance to the nearest taken frame / reach). Each frame's share
  // of the bar is what it added when it was taken, given the frames taken before it.
  function figValue(canvas) {
    const comps = [[0.12, 0.58, 0.2, 0.3, 0.4, 0.8], [0.62, 0.34, 0.28, 0.17, -0.3, 1.0], [1.05, 0.72, 0.15, 0.13, 0.0, 0.7], [1.5, 0.44, 0.3, 0.21, 0.6, 0.95], [2.0, 0.3, 0.17, 0.26, -0.5, 0.78], [2.45, 0.66, 0.24, 0.17, 0.2, 0.86]];
    const f = field(comps), CELL = 5;
    const FR = [[0.06, 0.12, 0.3, 0.78], [0.15, 0.24, 0.39, 0.9], [0.5, 0.1, 0.69, 0.58], [0.77, 0.42, 0.95, 0.9]];   // x0, y0, x1, y1 as fractions
    const fig = canvas.closest("figure"), bar = fig.querySelector(".rsf-bar"), readout = fig.querySelector(".rsf-known");
    let order = [0], cache = null;
    const S = stage(canvas, draw);
    const rects = () => FR.map(([a, b, c, d]) => [a * S.W, b * S.H, c * S.W, d * S.H]);
    const dist = (r, x, y) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));
    const reach = () => Math.max(120, S.W * 0.25);
    function known(set) {
      if (!set.length) return 0;
      const R = rects(), rc = reach(); let s = 0, n = 0;
      for (let y = 4; y < S.H; y += 8) for (let x = 4; x < S.W; x += 8) { let d = Infinity; for (const i of set) d = Math.min(d, dist(R[i], x, y)); s += Math.exp(-d / rc); n++; }
      return s / n;
    }
    function updateBar() {
      const parts = order.map((i, k) => [i, known(order.slice(0, k + 1)) - known(order.slice(0, k))]), tot = known(order);
      bar.innerHTML = parts.map(([i, v]) => `<span class="rsf-seg" style="width:${(100 * v).toFixed(1)}%">${v > 0.045 ? i + 1 : ""}</span>`).join("");
      const last = order[order.length - 1], lastV = parts.length ? parts[parts.length - 1][1] : 0, alone = order.length ? known([last]) : 0;
      readout.textContent = !order.length ? "Nothing measured yet." : order.length === 1 ? `Known: ${Math.round(100 * tot)}%. Click another frame to take that measurement too.`
        : `Known: ${Math.round(100 * tot)}%. Measurement ${last + 1} added ${Math.round(100 * lastV)}% on top of the others; on its own it would give ${Math.round(100 * alone)}%.`;
    }
    const toggle = (i) => { order = order.includes(i) ? order.filter((j) => j !== i) : [...order, i]; updateBar(); S.kick(); };
    function draw() {
      const { ctx, W, H } = S; ctx.clearRect(0, 0, W, H);
      if (!cache || cache.key !== `${W}x${H}`) { const o = (Math.max(W / H, 2.9) * H - W) / 2 / H, gg = grid((u, v) => f(u + o, v), W, H, CELL, H), [lo, hi] = range(gg.g);
        cache = { key: `${W}x${H}`, seg: march(gg.g, gg.nx, gg.ny, CELL, levels(lo, hi)) }; updateBar(); }
      const R = rects(), rc = reach(), inAny = (x, y) => order.some((i) => x > R[i][0] && x < R[i][2] && y > R[i][1] && y < R[i][3]);
      strokeFaded(ctx, cache.seg, (x, y) => { if (inAny(x, y)) return -1; let d = Infinity; for (const i of order) d = Math.min(d, dist(R[i], x, y)); return order.length ? d / rc : 1; }, C.ink);
      if (order.length) { ctx.save(); ctx.beginPath(); order.forEach((i) => ctx.rect(R[i][0], R[i][1], R[i][2] - R[i][0], R[i][3] - R[i][1])); ctx.clip(); strokeSolid(ctx, cache.seg, C.ink, 2.6); ctx.restore(); }
      R.forEach((r, i) => {
        const taken = order.includes(i);
        if (taken) corners(ctx, r[0], r[1], r[2], r[3], 14, C.ink);
        else { ctx.setLineDash([3, 4]); ctx.strokeStyle = css(C.graphite); ctx.lineWidth = 1; ctx.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - r[0] - 1, r[3] - r[1] - 1); ctx.setLineDash([]); }
        ctx.fillStyle = css(taken ? C.ink : C.paper); ctx.strokeStyle = css(taken ? C.ink : C.graphite); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(r[0] + 12, r[1] + 12, 8.5, 0, 7); ctx.fill(); ctx.stroke();
        label(ctx, String(i + 1), r[0] + 12, r[1] + 12.5, taken ? C.paper : C.graphite, "center", "middle", 10);
      });
    }
    canvas.addEventListener("click", (e) => {
      const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, R = rects();
      // where frames overlap, prefer one not yet taken, then the smaller one
      const hit = R.map((q, i) => [i, (q[2] - q[0]) * (q[3] - q[1])]).filter(([i]) => x > R[i][0] && x < R[i][2] && y > R[i][1] && y < R[i][3])
        .sort((p, q) => (order.includes(p[0]) - order.includes(q[0])) || p[1] - q[1]);
      if (hit.length) toggle(hit[0][0]);
    });
    canvas.addEventListener("pointermove", (e) => { const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; canvas.style.cursor = rects().some((q) => x > q[0] && x < q[2] && y > q[1] && y < q[3]) ? "pointer" : "default"; });
    controls(canvas).forEach((b) => b.addEventListener("click", () => { if (b.dataset.act === "reset") { order = []; updateBar(); S.kick(); } }));
  }

  // ================================================================ the pipeline map at the top
  // Pointing at a step pops up the questions that cover it (their bars and their titles) and dims the rest;
  // pointing at a question's bar or title lights its steps.
  // On touch screens a tap on a step does the same, and a second tap (or a tap elsewhere) clears it.
  function pipeline(map) {
    const steps = [...map.querySelectorAll("button.rs-step")], arcs = [...map.querySelectorAll("[data-arc]")];
    const cover = (b) => b.dataset.arcs.split(" ");
    const show = (on, lit) => {
      arcs.forEach((a) => { a.classList.toggle("is-on", !!on && on.includes(a.dataset.arc)); a.classList.toggle("is-off", !!on && !on.includes(a.dataset.arc)); });
      steps.forEach((b) => { b.classList.toggle("is-on", lit === b); b.classList.toggle("is-lit", !lit && !!on && on.length === 1 && cover(b).includes(on[0])); });
      if (lit === null && on && on.length === 1) { const c = getComputedStyle(arcs.find((a) => a.dataset.arc === on[0])).getPropertyValue("--arc"); map.style.setProperty("--lit", c); }
    };
    let pinned = null;
    const clear = () => { pinned = null; show(null, null); };
    steps.forEach((b) => {
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(cover(b), b); });
      b.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") pinned ? show(cover(pinned), pinned) : clear(); });
      b.addEventListener("focus", () => show(cover(b), b));
      b.addEventListener("blur", () => (pinned === b ? null : clear()));
      b.addEventListener("click", () => { if (pinned === b) clear(); else { pinned = b; show(cover(b), b); } });
    });
    arcs.forEach((a) => {
      a.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && !pinned) show([a.dataset.arc], null); });
      a.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !pinned) clear(); });
    });
    document.addEventListener("click", (e) => { if (pinned && !map.contains(e.target)) clear(); });
  }
  document.querySelectorAll(".rs-map").forEach(pipeline);

  const FIGS = { scanners: figScanners, recover: figRecover, value: figValue };
  readColors();
  document.querySelectorAll("canvas[data-fig]").forEach((c) => FIGS[c.dataset.fig] && FIGS[c.dataset.fig](c));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); STAGES.forEach((S) => S.kick()); });
})();
