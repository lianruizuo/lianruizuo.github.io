// Fuzzy c-means: the engine, a scatter-plot stage that colours samples by membership, and the public preview.
//
// The engine (window.FCMKit) is shared with the lecture's own labs, which load after it. Notation follows the notes:
//   samples x_i (i = 1..N), representatives mu_k (k = 1..K), memberships u_ik in [0, 1] with sum_k u_ik = 1,
//   d_ik = ||x_i - mu_k||,  fuzzifier m > 1,  J_FCM = sum_i sum_k u_ik^m d_ik^2.
//   membership step:      u_ik <- d_ik^(-2/(m-1)) / sum_j d_ij^(-2/(m-1))   (a sample on a representative belongs to it alone)
//   representative step:  mu_k <- sum_i u_ik^m x_i / sum_i u_ik^m
//
// Public widget:  <div data-lab="fcm-run">   fuzzy c-means half-step by half-step, with J_FCM traced alongside
(() => {
  // ------------------------------------------------------------------ small numerics
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function normal(seed) {
    const r = rng(seed); let spare = null;
    return () => { if (spare !== null) { const s = spare; spare = null; return s; }
      const u = Math.max(r(), 1e-12), v = r(), m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };
  }
  // anisotropic Gaussian blobs: [cx, cy, n, sx, sy, angle] per class
  function blobs(spec, seed = 3) {
    const g = normal(seed), X = [], truth = [];
    spec.forEach(([cx, cy, n, sx, sy, a], k) => { const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < n; i++) { const u = g() * sx, v = g() * sy; X.push([cx + c * u - s * v, cy + s * u + c * v]); truth.push(k); } });
    const r = rng(seed + 99), idx = X.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return { X: idx.map((i) => X[i]), truth: idx.map((i) => truth[i]) };
  }
  const d2 = (a, b) => { let s = 0; for (let d = 0; d < a.length; d++) s += (a[d] - b[d]) ** 2; return s; };

  // one sample's memberships from its squared distances
  function row(dd, m) {
    const z = dd.findIndex((v) => v === 0);
    if (z >= 0) return dd.map((_, k) => (k === z ? 1 : 0));
    const w = dd.map((v) => Math.pow(v, -1 / (m - 1)));           // (d^2)^(-1/(m-1)) = d^(-2/(m-1))
    const s = w.reduce((a, b) => a + b, 0);
    if (!isFinite(s) || s === 0) { const b = dd.indexOf(Math.min(...dd)); return dd.map((_, k) => (k === b ? 1 : 0)); }   // m very close to 1
    return w.map((v) => v / s);
  }
  const memberships = (X, mu, m) => X.map((x) => row(mu.map((c) => d2(x, c)), m));
  function centroids(X, U, m) {
    const K = U[0].length, D = X[0].length, num = Array.from({ length: K }, () => new Array(D).fill(0)), den = new Array(K).fill(0);
    X.forEach((x, i) => { for (let k = 0; k < K; k++) { const w = Math.pow(U[i][k], m); den[k] += w; for (let d = 0; d < D; d++) num[k][d] += w * x[d]; } });
    return num.map((v, k) => v.map((s) => s / (den[k] || 1)));
  }
  const cost = (X, U, mu, m) => X.reduce((s, x, i) => s + mu.reduce((t, c, k) => t + Math.pow(U[i][k], m) * d2(x, c), 0), 0);
  const uniform = (N, K) => Array.from({ length: N }, () => new Array(K).fill(1 / K));
  // the whole loop, from starting representatives
  function fcm(X, mu0, m = 2, eps = 1e-5, maxRounds = 300) {
    let mu = mu0.map((c) => c.slice()), U = uniform(X.length, mu.length), rounds = 0;
    for (; rounds < maxRounds; rounds++) {
      const Uold = U; U = memberships(X, mu, m); mu = centroids(X, U, m);
      let ch = 0; U.forEach((r, i) => r.forEach((v, k) => (ch = Math.max(ch, Math.abs(v - Uold[i][k])))));
      if (ch < eps) break;
    }
    return { U, mu, J: cost(X, U, mu, m), rounds: rounds + 1 };
  }
  const forgy = (X, K, r) => { const pick = new Set(); while (pick.size < K) pick.add(Math.floor(r() * X.length)); return [...pick].map((i) => X[i].slice()); };

  // ------------------------------------------------------------------ colour: saturated = one class, pale = between
  const COLORS = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00"];   // Okabe-Ito, as in the k-means chapter
  const NEUTRAL = "#AEB8C4";
  const css = (v, f) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; } catch { return f; } };
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const hex = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
  // the colour of a membership row: the leading class's colour, faded toward grey as the row approaches 1/K everywhere
  function tint(u, alpha = 1) {
    const K = u.length; let b = 0; for (let k = 1; k < K; k++) if (u[k] > u[b]) b = k;
    const s = K > 1 ? Math.max(0, Math.min(1, (u[b] - 1 / K) / (1 - 1 / K))) : 1, a = rgb(COLORS[b % COLORS.length]), n = rgb(NEUTRAL);
    return `rgba(${a.map((v, j) => Math.round(n[j] + (v - n[j]) * s)).join(",")},${alpha})`;
  }

  // a stage maps a world box onto a canvas
  function Stage(canvas, box = [-7, 7, -5.5, 5.5]) {
    const ctx = canvas.getContext("2d"), [x0, x1, y0, y1] = box, W = canvas.width, H = canvas.height;
    const X = (x) => (x - x0) / (x1 - x0) * W, Y = (y) => H - (y - y0) / (y1 - y0) * H;
    const inv = (px, py) => [x0 + px / W * (x1 - x0), y0 + (H - py) / H * (y1 - y0)];
    return {
      ctx, W, H, X, Y, inv,
      // samples coloured by membership (U null: grey), representatives as rings, optional membership field behind
      draw(Xs, U, mu, { field = 0, m = 2, trails = null, ring = null, labels = null } = {}) {
        const paper = css("--paper", "#f4f5f2"), ink = css("--ink", "#1b2029"), grey = css("--graphite", "#5a6170");
        ctx.clearRect(0, 0, W, H);
        if (field && mu.length > 1) { const s = 6;
          for (let py = 0; py < H; py += s) for (let px = 0; px < W; px += s) { const p = inv(px + s / 2, py + s / 2);
            ctx.fillStyle = tint(row(mu.map((c) => d2(p, c)), m), field); ctx.fillRect(px, py, s, s); } }
        if (trails) trails.forEach((T, k) => { if (T.length < 2) return; ctx.strokeStyle = hex(COLORS[k % COLORS.length], 0.6); ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.beginPath(); T.forEach((p, j) => (j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); ctx.setLineDash([]); });
        Xs.forEach((x, i) => {
          ctx.fillStyle = U ? tint(U[i]) : labels ? COLORS[labels[i] % COLORS.length] : grey; ctx.beginPath(); ctx.arc(X(x[0]), Y(x[1]), 3.7, 0, 7); ctx.fill();
          ctx.strokeStyle = paper; ctx.lineWidth = 0.8; ctx.stroke(); });
        if (ring !== null && ring !== undefined && Xs[ring]) { ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(Xs[ring][0]), Y(Xs[ring][1]), 8, 0, 7); ctx.stroke(); }
        mu.forEach((c, k) => { const px = X(c[0]), py = Y(c[1]);
          ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.fill();
          ctx.strokeStyle = COLORS[k % COLORS.length]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, py, 8.5, 0, 7); ctx.stroke();
          ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke(); });
      },
      // drag the representatives; onmove(k, p) while dragging, onend() after
      draggable(getMu, onmove, onend) {
        let k = -1;
        const at = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
        canvas.addEventListener("pointerdown", (e) => { const [px, py] = at(e), mu = getMu(); k = mu.findIndex((c) => Math.hypot(X(c[0]) - px, Y(c[1]) - py) < 16); if (k >= 0) { canvas.setPointerCapture(e.pointerId); e.preventDefault(); } });
        canvas.addEventListener("pointermove", (e) => { const [px, py] = at(e); if (k >= 0) onmove(k, inv(px, py)); else canvas.style.cursor = getMu().some((c) => Math.hypot(X(c[0]) - px, Y(c[1]) - py) < 16) ? "grab" : "default"; });
        canvas.addEventListener("pointerup", () => { if (k >= 0) { k = -1; onend && onend(); } });
      },
    };
  }
  // a small line chart of J_FCM against half-steps (log scale)
  function traceSVG(svg, pts, { w = 300, h = 220, phase = [] } = {}) {
    const NS = "http://www.w3.org/2000/svg", el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.appendChild(e); return e; };
    svg.replaceChildren();
    const L = 46, R = w - 10, T = 14, B = h - 30;
    el("line", { x1: L, x2: R, y1: B, y2: B, class: "snk-axis" }); el("line", { x1: L, x2: L, y1: T, y2: B, class: "snk-axis" });
    const t1 = el("text", { x: L - 6, y: T + 4, class: "snk-lab", "text-anchor": "end" }), t2 = el("text", { x: (L + R) / 2, y: h - 6, class: "snk-lab", "text-anchor": "middle" });
    t2.textContent = "half-steps: memberships, representatives, …";
    const lab = el("text", { x: L - 34, y: (T + B) / 2, class: "cny-pl" }); lab.textContent = "J";
    if (!pts.length) return;
    const ymax = Math.max(...pts) * 1.15, ymin = Math.min(...pts) / 1.15, n = Math.max(pts.length - 1, 6), lg = Math.log;
    const X = (i) => L + i / n * (R - L), Y = (v) => B - (lg(v) - lg(ymin)) / (lg(ymax) - lg(ymin) || 1) * (B - T);
    t1.textContent = Math.round(ymax).toLocaleString();
    const t3 = el("text", { x: L - 6, y: B, class: "snk-lab", "text-anchor": "end" }); t3.textContent = Math.round(ymin).toLocaleString();
    const t5 = el("text", { x: R, y: T - 2, class: "snk-lab", "text-anchor": "end" }); t5.textContent = "log scale";
    el("path", { d: pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(""), class: "km-trace" });
    pts.forEach((v, i) => el("circle", { cx: X(i), cy: Y(v), r: 3.4, class: phase[i] === "rep" ? "km-dot-up" : "km-dot-as" }));
  }

  window.FCMKit = { rng, normal, blobs, d2, row, memberships, centroids, cost, uniform, fcm, forgy, COLORS, NEUTRAL, tint, Stage, traceSVG, hex, css };

  // ------------------------------------------------------------------ the public widget: fuzzy c-means, half-step by half-step
  // the same three clumps as the k-means chapter, and the same bunched start
  const DATA = () => blobs([[-3.2, 1.6, 90, 1.0, 0.55, 0.5], [2.6, 2.2, 80, 0.75, 1.1, -0.3], [0.4, -2.8, 90, 1.25, 0.6, 0.2]], 7);
  const STARTS = { 2: [[-5, -2], [-4.7, -2.8]], 3: [[-5, -2], [-4.1, -1.6], [-4.7, -2.8]], 4: [[-5, -2], [-4.1, -1.6], [-4.7, -2.8], [-4.4, -0.9]] };
  function runWidget(root) {
    root.innerHTML = `<div class="lab-row snk-top"><span class="bench-label">Classes K</span>
        ${[2, 3, 4].map((k) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === 3}">${k}</button>`).join("")}
        <span class="bench-label fcm-gap">Fuzzifier m</span>
        ${[1.2, 2, 4].map((m) => `<button type="button" class="chip" data-m="${m}" aria-pressed="${m === 2}">${m}</button>`).join("")}</div>
      <div class="km-pair"><canvas class="km-canvas" width="560" height="440" role="img" aria-label="Samples in two dimensions, coloured by membership: saturated when a sample belongs to one class, pale when it is shared. Representatives are rings."></canvas>
        <svg viewBox="0 0 300 220" class="km-trace-svg" aria-label="J_FCM after every half-step"></svg></div>
      <div class="lab-row"><button type="button" class="chip" data-act="memb">Memberships</button><button type="button" class="chip" data-act="rep">Representatives</button>
        <button type="button" class="chip chip-strong" data-act="play">Play</button><button type="button" class="chip" data-act="reset">Reset</button><span class="snk-k"></span></div>`;
    const cv = root.querySelector("canvas"), S = Stage(cv), svg = root.querySelector("svg"), note = root.querySelector(".snk-k");
    const { X } = DATA();
    let K = 3, m = 2, start = STARTS[3].map((c) => c.slice()), mu, U, J, phase, trails, round, change, playing = false, timer = 0, anim = 0, next = "memb", done = false;
    function reset() { clearTimeout(timer); cancelAnimationFrame(anim); playing = false; mu = start.map((c) => c.slice()); U = null; J = []; phase = []; trails = mu.map((c) => [c.slice()]); round = 0; change = null; next = "memb"; done = false; draw(); setButtons(); }
    function draw() {
      S.draw(X, U, mu, { field: U ? 0.16 : 0, m, trails });
      traceSVG(svg, J, { phase });
      const Jt = J.length ? ` · J = ${J[J.length - 1].toFixed(1)}` : "";
      note.textContent = !U ? "Drag the rings to choose a start, then compute the memberships." : done ? `stopped after ${round} rounds: no membership moved by more than 0.001${Jt}`
        : `round ${round}${change === null ? "" : ` · largest membership change ${change.toFixed(3)}`} · next: ${next === "rep" ? "representatives" : "memberships"}${Jt}`;
    }
    const setButtons = () => { root.querySelector('[data-act="memb"]').disabled = next !== "memb" || done; root.querySelector('[data-act="rep"]').disabled = next !== "rep" || done;
      root.querySelector('[data-act="play"]').textContent = playing ? "Pause" : done ? "Play again" : "Play"; };
    function doMemb() {
      const Un = memberships(X, mu, m);
      change = U ? Math.max(...Un.map((r, i) => Math.max(...r.map((v, k) => Math.abs(v - U[i][k]))))) : null;
      if (U && change < 1e-3) { done = true; playing = false; draw(); setButtons(); return; }
      U = Un; round++; J.push(cost(X, U, mu, m)); phase.push("memb"); next = "rep"; draw(); setButtons();
    }
    function doRep(then) {
      const from = mu.map((c) => c.slice()), to = centroids(X, U, m), t0 = performance.now(), dur = 550;
      const step = (t) => { const s = Math.min(1, (t - t0) / dur), e = s * s * (3 - 2 * s); mu = from.map((c, k) => [c[0] + (to[k][0] - c[0]) * e, c[1] + (to[k][1] - c[1]) * e]);
        S.draw(X, U, mu, { field: 0.16, m, trails: trails.map((T, k) => [...T, mu[k]]) });
        if (s < 1) anim = requestAnimationFrame(step); else { mu = to; trails.forEach((T, k) => T.push(to[k].slice())); J.push(cost(X, U, mu, m)); phase.push("rep"); next = "memb"; draw(); setButtons(); then && then(); } };
      anim = requestAnimationFrame(step);
    }
    function play() { if (!playing || done) { setButtons(); return; }
      if (next === "memb") { doMemb(); timer = setTimeout(play, 600); } else doRep(() => (timer = setTimeout(play, 420))); }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || b.disabled) return;
      if (b.dataset.k) { K = +b.dataset.k; start = STARTS[K].map((c) => c.slice()); root.querySelectorAll("[data-k]").forEach((q) => q.setAttribute("aria-pressed", String(q === b))); reset(); }
      if (b.dataset.m) { m = +b.dataset.m; root.querySelectorAll("[data-m]").forEach((q) => q.setAttribute("aria-pressed", String(q === b))); reset(); }
      const a = b.dataset.act;
      if (a === "reset") reset();
      if (a === "memb") doMemb();
      if (a === "rep") doRep();
      if (a === "play") { if (playing) { playing = false; clearTimeout(timer); setButtons(); return; } if (done) reset(); playing = true; setButtons(); play(); }
    });
    S.draggable(() => mu, (k, p) => { if (U) reset(); start[k] = p; mu[k] = p.slice(); trails[k] = [p.slice()]; draw(); });
    reset();
  }
  window.FCMKit.runWidget = runWidget;
  const mount = () => document.querySelectorAll('[data-lab="fcm-run"]:not([data-on])').forEach((r) => { r.dataset.on = 1; runWidget(r); });
  window.FCMKit.mount = mount;
  mount();
})();
