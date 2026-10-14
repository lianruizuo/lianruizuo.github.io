// k-means (Lloyd's algorithm): the engine, a scatter-plot stage, and the public preview.
//
// The engine (window.KMKit) is shared with the lecture's own labs, which load after it. Notation follows the notes:
//   samples x_i (i = 1..N), representatives mu_k (k = 1..K), labels c_i in {1..K},
//   J = sum_i ||x_i - mu_{c_i}||^2.
//   assignment step: c_i <- argmin_k ||x_i - mu_k||^2      update step: mu_k <- average of the samples labelled k
// An empty group takes the sample that is currently farthest from its own representative.
//
// Public widget:  <div data-lab="km-lloyd">   Lloyd's algorithm half-step by half-step, with J traced alongside
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
  // anisotropic Gaussian blobs: centers, sizes, spreads (sx, sy) and angles
  function blobs(spec, seed = 3) {
    const g = normal(seed), X = [], truth = [];
    spec.forEach(([cx, cy, n, sx, sy, a], k) => { const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < n; i++) { const u = g() * sx, v = g() * sy; X.push([cx + c * u - s * v, cy + s * u + c * v]); truth.push(k); } });
    const r = rng(seed + 99), idx = X.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return { X: idx.map((i) => X[i]), truth: idx.map((i) => truth[i]) };
  }
  const d2 = (a, b) => { let s = 0; for (let d = 0; d < a.length; d++) s += (a[d] - b[d]) ** 2; return s; };
  function assign(X, mu) { return X.map((x) => { let best = 0, bd = Infinity; mu.forEach((m, k) => { const v = d2(x, m); if (v < bd) { bd = v; best = k; } }); return best; }); }
  // keep a label on a tie, so a round that changes a label always lowers J strictly
  function assignKeep(X, mu, c) { return X.map((x, i) => { let best = c ? c[i] : 0, bd = c ? d2(x, mu[c[i]]) : Infinity; mu.forEach((m, k) => { const v = d2(x, m); if (v < bd) { bd = v; best = k; } }); return best; }); }
  function update(X, c, mu) {
    const K = mu.length, D = X[0].length, sum = mu.map(() => new Array(D).fill(0)), n = new Array(K).fill(0);
    X.forEach((x, i) => { n[c[i]]++; for (let d = 0; d < D; d++) sum[c[i]][d] += x[d]; });
    const out = mu.map((m, k) => (n[k] ? sum[k].map((v) => v / n[k]) : m.slice()));
    for (let k = 0; k < K; k++) if (!n[k]) {                    // empty group: take the worst-fit sample
      let w = 0, wd = -1; X.forEach((x, i) => { const v = d2(x, out[c[i]]); if (v > wd) { wd = v; w = i; } });
      out[k] = X[w].slice(); c[w] = k;
    }
    return out;
  }
  const cost = (X, c, mu) => X.reduce((s, x, i) => s + d2(x, mu[c[i]]), 0);
  function lloyd(X, mu0, maxRounds = 100) {
    let mu = mu0.map((m) => m.slice()), c = assignKeep(X, mu, null), rounds = 0;
    for (; rounds < maxRounds; rounds++) { mu = update(X, c, mu); const cn = assignKeep(X, mu, c); if (cn.every((v, i) => v === c[i])) break; c = cn; }
    return { c, mu, J: cost(X, c, mu), rounds };
  }
  const forgy = (X, K, r) => { const pick = new Set(); while (pick.size < K) pick.add(Math.floor(r() * X.length)); return [...pick].map((i) => X[i].slice()); };

  // ------------------------------------------------------------------ drawing
  const COLORS = ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00"];   // Okabe-Ito
  const css = (v, f) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; } catch { return f; } };
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  // a stage maps a world box onto a canvas
  function Stage(canvas, box = [-7, 7, -5.5, 5.5]) {
    const ctx = canvas.getContext("2d"), [x0, x1, y0, y1] = box, W = canvas.width, H = canvas.height;
    const X = (x) => (x - x0) / (x1 - x0) * W, Y = (y) => H - (y - y0) / (y1 - y0) * H;
    const inv = (px, py) => [x0 + px / W * (x1 - x0), y0 + (H - py) / H * (y1 - y0)];
    return {
      ctx, W, H, X, Y, inv,
      // samples coloured by label (-1: not yet assigned), representatives as large rings, optional nearest-rule shading
      draw(Xs, c, mu, { shade = true, trails = null, ring = null, dim = null } = {}) {
        const paper = css("--paper", "#f4f5f2"), ink = css("--ink", "#1b2029"), grey = css("--graphite", "#5a6170");
        ctx.clearRect(0, 0, W, H);
        if (shade && mu.length) { const s = 6;
          for (let py = 0; py < H; py += s) for (let px = 0; px < W; px += s) { const p = inv(px + s / 2, py + s / 2); let b = 0, bd = Infinity; mu.forEach((m, k) => { const v = d2(p, m); if (v < bd) { bd = v; b = k; } });
            ctx.fillStyle = hex(COLORS[b % COLORS.length], 0.09); ctx.fillRect(px, py, s, s); } }
        if (trails) trails.forEach((T, k) => { if (T.length < 2) return; ctx.strokeStyle = hex(COLORS[k % COLORS.length], 0.6); ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.beginPath(); T.forEach((p, j) => (j ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); ctx.setLineDash([]); });
        Xs.forEach((x, i) => { const k = c ? c[i] : -1; ctx.globalAlpha = dim && dim[i] ? 0.25 : 1;
          ctx.fillStyle = k < 0 ? grey : COLORS[k % COLORS.length]; ctx.beginPath(); ctx.arc(X(x[0]), Y(x[1]), 3.6, 0, 7); ctx.fill();
          ctx.strokeStyle = paper; ctx.lineWidth = 0.8; ctx.stroke(); });
        ctx.globalAlpha = 1;
        if (ring !== null && ring !== undefined && Xs[ring]) { ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(Xs[ring][0]), Y(Xs[ring][1]), 8, 0, 7); ctx.stroke(); }
        mu.forEach((m, k) => { const px = X(m[0]), py = Y(m[1]);
          ctx.fillStyle = paper; ctx.beginPath(); ctx.arc(px, py, 10, 0, 7); ctx.fill();
          ctx.strokeStyle = COLORS[k % COLORS.length]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(px, py, 8.5, 0, 7); ctx.stroke();
          ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke(); });
      },
      // drag the representatives with a pointer; onmove(k, p) while dragging, onend() after
      draggable(getMu, onmove, onend) {
        let k = -1;
        const at = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
        canvas.addEventListener("pointerdown", (e) => { const [px, py] = at(e), mu = getMu(); k = mu.findIndex((m) => Math.hypot(X(m[0]) - px, Y(m[1]) - py) < 16); if (k >= 0) { canvas.setPointerCapture(e.pointerId); e.preventDefault(); } });
        canvas.addEventListener("pointermove", (e) => { const [px, py] = at(e); if (k >= 0) onmove(k, inv(px, py)); else canvas.style.cursor = getMu().some((m) => Math.hypot(X(m[0]) - px, Y(m[1]) - py) < 16) ? "grab" : "default"; });
        canvas.addEventListener("pointerup", () => { if (k >= 0) { k = -1; onend && onend(); } });
      },
    };
  }
  // a small line chart of J against half-steps
  function traceSVG(svg, pts, { w = 300, h = 220, phase = [] } = {}) {
    const NS = "http://www.w3.org/2000/svg", el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.appendChild(e); return e; };
    svg.replaceChildren();
    const L = 46, R = w - 10, T = 14, B = h - 30;
    el("line", { x1: L, x2: R, y1: B, y2: B, class: "snk-axis" }); el("line", { x1: L, x2: L, y1: T, y2: B, class: "snk-axis" });
    const t1 = el("text", { x: L - 6, y: T + 4, class: "snk-lab", "text-anchor": "end" }), t2 = el("text", { x: (L + R) / 2, y: h - 6, class: "snk-lab", "text-anchor": "middle" });
    t2.textContent = "half-steps: assign, update, assign, …";
    if (!pts.length) { t1.textContent = "J"; return; }
    const ymax = Math.max(...pts) * 1.15, ymin = Math.min(...pts) / 1.15, n = Math.max(pts.length - 1, 6), lg = Math.log;   // J on a log scale
    const X = (i) => L + i / n * (R - L), Y = (v) => B - (lg(v) - lg(ymin)) / (lg(ymax) - lg(ymin) || 1) * (B - T);
    t1.textContent = Math.round(ymax).toLocaleString();
    const t3 = el("text", { x: L - 6, y: B, class: "snk-lab", "text-anchor": "end" }); t3.textContent = Math.round(ymin).toLocaleString();
    const t4 = el("text", { x: L - 30, y: (T + B) / 2, class: "cny-pl" }); t4.textContent = "J"; const t5 = el("text", { x: R, y: T - 2, class: "snk-lab", "text-anchor": "end" }); t5.textContent = "log scale";
    el("path", { d: pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(""), class: "km-trace" });
    pts.forEach((v, i) => el("circle", { cx: X(i), cy: Y(v), r: 3.4, class: phase[i] === "update" ? "km-dot-up" : "km-dot-as" }));
  }

  window.KMKit = { rng, normal, blobs, d2, assign, assignKeep, update, cost, lloyd, forgy, COLORS, Stage, traceSVG, hex, css };

  // ------------------------------------------------------------------ the public widget: Lloyd's algorithm, half-step by half-step
  const DATA = () => blobs([[-3.2, 1.6, 90, 1.0, 0.55, 0.5], [2.6, 2.2, 80, 0.75, 1.1, -0.3], [0.4, -2.8, 90, 1.25, 0.6, 0.2]], 7);
  const STARTS = { 2: [[-5, -2], [-4.7, -2.8]], 3: [[-5, -2], [-4.1, -1.6], [-4.7, -2.8]], 4: [[-5, -2], [-4.1, -1.6], [-4.7, -2.8], [-4.4, -0.9]] };   // bunched in one corner: several rounds to sort out
  function lloydWidget(root) {
    root.innerHTML = `<div class="lab-row snk-top"><span class="bench-label">Groups K</span>
        ${[2, 3, 4].map((k) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === 3}">${k}</button>`).join("")}
        <button type="button" class="chip" data-act="random">New random start</button></div>
      <div class="km-pair"><canvas class="km-canvas" width="560" height="440" role="img" aria-label="Samples in two dimensions, coloured by group, with the representatives drawn as rings"></canvas>
        <svg viewBox="0 0 300 220" class="km-trace-svg" aria-label="The cost J after every half-step"></svg></div>
      <div class="lab-row"><button type="button" class="chip" data-act="assign">Assign</button><button type="button" class="chip" data-act="update">Update</button>
        <button type="button" class="chip chip-strong" data-act="play">Play</button><button type="button" class="chip" data-act="reset">Reset</button><span class="snk-k"></span></div>`;
    const cv = root.querySelector("canvas"), S = Stage(cv), svg = root.querySelector("svg"), note = root.querySelector(".snk-k");
    const { X } = DATA(), r = rng(11);
    let K = 3, start = STARTS[3].map((m) => m.slice()), mu, c, J, phase, trails, round, changed, playing = false, timer = 0, anim = 0, next = "assign", done = false;
    function reset() { clearTimeout(timer); cancelAnimationFrame(anim); playing = false; mu = start.map((m) => m.slice()); c = null; J = []; phase = []; trails = mu.map((m) => [m.slice()]); round = 0; changed = null; next = "assign"; done = false; draw(); setButtons(); }
    function draw() {
      S.draw(X, c, mu, { shade: !!c, trails });
      traceSVG(svg, J, { phase });
      note.textContent = !c ? "Drag the rings to choose a start, then assign." : done ? `stopped after ${round} rounds: a full round changed no label · J = ${J[J.length - 1].toFixed(1)}`
        : `round ${round} · ${next === "update" ? `${changed === null ? "" : changed + " labels changed · "}next: update` : "next: assign"} · J = ${J[J.length - 1].toFixed(1)}`;
    }
    const setButtons = () => { root.querySelector('[data-act="assign"]').disabled = next !== "assign" || done; root.querySelector('[data-act="update"]').disabled = next !== "update" || done;
      root.querySelector('[data-act="play"]').textContent = playing ? "Pause" : done ? "Play again" : "Play"; };
    function doAssign() {
      const cn = assignKeep(X, mu, c); changed = c ? cn.filter((v, i) => v !== c[i]).length : null;
      if (c && changed === 0) { done = true; playing = false; draw(); setButtons(); return; }
      c = cn; round++; J.push(cost(X, c, mu)); phase.push("assign"); next = "update"; draw(); setButtons();
    }
    function doUpdate(then) {
      const from = mu.map((m) => m.slice()), to = update(X, c, mu), t0 = performance.now(), dur = 550;
      const step = (t) => { const u = Math.min(1, (t - t0) / dur), e = u * u * (3 - 2 * u); mu = from.map((m, k) => [m[0] + (to[k][0] - m[0]) * e, m[1] + (to[k][1] - m[1]) * e]);
        S.draw(X, c, mu, { shade: true, trails: trails.map((T, k) => [...T, mu[k]]) });
        if (u < 1) anim = requestAnimationFrame(step); else { mu = to; trails.forEach((T, k) => T.push(to[k].slice())); J.push(cost(X, c, mu)); phase.push("update"); next = "assign"; draw(); setButtons(); then && then(); } };
      anim = requestAnimationFrame(step);
    }
    function play() { if (!playing || done) { setButtons(); return; }
      if (next === "assign") { doAssign(); timer = setTimeout(play, 650); } else doUpdate(() => (timer = setTimeout(play, 450))); }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b || b.disabled) return;
      if (b.dataset.k) { K = +b.dataset.k; start = STARTS[K].map((m) => m.slice()); root.querySelectorAll("[data-k]").forEach((q) => q.setAttribute("aria-pressed", String(q === b))); reset(); }
      const a = b.dataset.act;
      if (a === "random") { start = forgy(X, K, r); reset(); }
      if (a === "reset") reset();
      if (a === "assign") doAssign();
      if (a === "update") doUpdate();
      if (a === "play") { if (playing) { playing = false; clearTimeout(timer); setButtons(); return; } if (done) reset(); playing = true; setButtons(); play(); }
    });
    S.draggable(() => mu, (k, p) => { if (c) reset(); start[k] = p; mu[k] = p.slice(); trails[k] = [p.slice()]; draw(); });
    reset();
  }
  window.KMKit.lloydWidget = lloydWidget;
  const mount = () => document.querySelectorAll('[data-lab="km-lloyd"]:not([data-on])').forEach((r) => { r.dataset.on = 1; lloydWidget(r); });
  window.KMKit.mount = mount;
  mount();
})();
