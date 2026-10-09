// The figure on the home page.
//
// The contour lines are a patient: iso-lines of a smooth field.
// Inside the frame is the measurement: thick solid lines. Outside it, the lines turn
// from solid to dashed to dotted with distance from the frame: what can be
// inferred from the measurement fades the further it is from what was measured.
//
// Two optional modes, switched by the buttons under the figure:
//   Scanners  the left half of the frame is measured by scanner A, the right
//             half by scanner B, each with its own color and contrast (the same
//             anatomy, drawn at different iso-levels). Harmonize maps both
//             halves onto one reference look while keeping the anatomy.
//   Time      the patient changes slowly. The measurement is a snapshot from the
//             last scan, so it drifts out of step with the patient until the
//             next scan.
//
// Move the frame with the pointer, by dragging, or with the arrow keys.
(() => {
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- the patient
  // [x as fraction of width, y as fraction of height, sx, sy (in heights), rotation, weight]
  const COMP = [
    [0.10, 0.58, 0.20, 0.30, 0.4, 0.80],
    [0.27, 0.34, 0.28, 0.17, -0.3, 1.00],
    [0.41, 0.72, 0.15, 0.13, 0.0, 0.70],
    [0.57, 0.44, 0.30, 0.21, 0.6, 0.95],
    [0.75, 0.30, 0.17, 0.26, -0.5, 0.78],
    [0.89, 0.66, 0.24, 0.17, 0.2, 0.86],
    [0.49, 0.12, 0.12, 0.09, 0.0, 0.40],
  ];
  const NLEVELS = 15;
  const CELL = 5;            // CSS px per grid cell
  const MONTHS_PER_SEC = 1;  // patient time in Time mode
  const SCAN_EVERY = 12;     // months between scans
  const MEASURED_WIDTH = 2.8; // line width of measured contours (outside lines are 1)
  const SCANNERS = [
    { name: "scanner A", gamma: 0.86, width: 3.1, color: "a" },
    { name: "scanner B", gamma: 1.18, width: 2.5, color: "b" },
  ];

  // components at patient time tau (months); tau = 0 is the resting state
  function comps(tau) {
    return COMP.map(([cx, cy, sx, sy, r, w], i) => {
      if (!tau) return [cx, cy, sx, sy, r, w];
      const a = 0.045 + 0.008 * i; // slow: one full cycle takes 2-3 minutes
      return [
        cx + 0.02 * Math.sin(a * tau + i * 1.7),
        cy + 0.045 * Math.sin(0.8 * a * tau + i * 2.3),
        sx * (1 + 0.08 * Math.sin(0.6 * a * tau + i)),
        sy,
        r + 0.15 * Math.sin(0.5 * a * tau + i * 0.9),
        w * (1 + 0.22 * Math.sin(0.7 * a * tau + i * 1.3)),
      ];
    });
  }

  // ---------------------------------------------------------------- state
  let W = 0, H = 0, dpr = 1, nx = 0, ny = 0;
  let gNow = null, gSnap = null;     // field sampled on the grid: now, and at the last scan
  let fmin = 0, fmax = 1;            // fixed level range (from tau = 0)
  let outside = new Float32Array(0); // contour segments of the patient now: x1,y1,x2,y2,...
  let colors = {};
  const frame = { x: 0, y: 0, w: 0, h: 0 };
  const target = { x: 0, y: 0, set: false };
  let open = reduce ? 1 : 0, fade = reduce ? 1 : 0, introStart = 0;
  let scannerOn = false, harmonizeOn = false, timeOn = false;
  let harm = 0;          // 0 = raw scanner look, 1 = harmonized (animated)
  let scanAmt = 0;       // 0 = plain measurement, 1 = scanner look (animated)
  let tau = 0, tauScan = 0, flash = 0;
  let last = 0, raf = 0, visible = true;

  // ---------------------------------------------------------------- color helpers
  const rgb = (hex) => {
    const h = hex.replace("#", "");
    const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => rgb((cs.getPropertyValue(n).trim() || d));
    colors = {
      ink: g("--field-in", "#1b2029"),
      far: g("--field-out", "#2f43a3"),
      a: g("--scan-a", "#b06a12"),
      b: g("--scan-b", "#13807a"),
      graphite: g("--graphite", "#5a6170"),
    };
    colors.paper = getComputedStyle(document.body).backgroundColor;
  }

  // ---------------------------------------------------------------- field + contours
  function sample(tau) {
    const ratio = Math.max(W / H, 2.6), off = (ratio * H - W) / 2; // narrow screens see the middle of a wide field
    const cs = comps(tau).map(([cx, cy, sx, sy, r, w]) => [cx * ratio, cy, 1 / sx, 1 / sy, Math.cos(r), Math.sin(r), w]);
    const g = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const v = (j * CELL) / H;
      for (let i = 0; i < nx; i++) {
        const u = (i * CELL + off) / H;
        let f = 0.05 * Math.sin(3.1 * u + 1.3) * Math.cos(4.7 * v - 0.4);
        for (const [cx, cy, isx, isy, c, s, w] of cs) {
          const dx = u - cx, dy = v - cy;
          const a = (c * dx + s * dy) * isx, b = (-s * dx + c * dy) * isy;
          f += w * Math.exp(-0.5 * (a * a + b * b));
        }
        g[j * nx + i] = f;
      }
    }
    return g;
  }

  const levels = (gamma = 1) =>
    Array.from({ length: NLEVELS }, (_, k) => fmin + (fmax - fmin) * (0.1 + 0.84 * Math.pow(k / (NLEVELS - 1), gamma)));

  // marching squares over cells [i0,i1) x [j0,j1); emits segments into `out`
  const CASES = {
    1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]],
    8: [[3, 0]], 9: [[0, 2]], 10: [[3, 2], [0, 1]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
  };
  function march(g, levs, i0, i1, j0, j1, out) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(nx - 1, i1); j1 = Math.min(ny - 1, j1);
    const e = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (const L of levs) {
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i + 1], d = g[(j + 1) * nx + i];
        const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * CELL, y = j * CELL;
        e[0][0] = x + CELL * (L - a) / (b - a); e[0][1] = y;               // top
        e[1][0] = x + CELL;                     e[1][1] = y + CELL * (L - b) / (c - b); // right
        e[2][0] = x + CELL * (L - d) / (c - d); e[2][1] = y + CELL;        // bottom
        e[3][0] = x;                            e[3][1] = y + CELL * (L - a) / (d - a); // left
        for (const [p, q] of CASES[idx]) out.push(e[p][0], e[p][1], e[q][0], e[q][1]);
      }
    }
    return out;
  }

  function rebuildOutside() {
    outside = Float32Array.from(march(gNow, levels(1), 0, nx, 0, ny, []));
  }

  // ---------------------------------------------------------------- layout
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nx = Math.ceil(W / CELL) + 1; ny = Math.ceil(H / CELL) + 1;
    frame.w = Math.max(150, Math.min(W * 0.34, 380));
    frame.h = H * 0.72;
    if (!target.set) { target.x = frame.x = W * 0.37; target.y = frame.y = H * 0.5; }
    clampTarget();
    const g0 = sample(0);
    fmin = Infinity; fmax = -Infinity;
    for (const v of g0) { if (v < fmin) fmin = v; if (v > fmax) fmax = v; }
    gNow = tau ? sample(tau) : g0;
    gSnap = timeOn ? sample(tauScan) : gNow;
    rebuildOutside();
    kick();
  }
  function clampTarget() {
    target.x = Math.min(W - frame.w / 2 - 2, Math.max(frame.w / 2 + 2, target.x));
    target.y = Math.min(H - frame.h / 2 - 2, Math.max(frame.h / 2 + 2, target.y));
  }

  // ---------------------------------------------------------------- drawing
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const smooth = (t) => t * t * (3 - 2 * t);
  const BINS = 12;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fw = frame.w * (0.15 + 0.85 * open), fh = frame.h * (0.15 + 0.85 * open);
    const x0 = frame.x - fw / 2, y0 = frame.y - fh / 2, x1 = x0 + fw, y1 = y0 + fh;
    const reach = Math.max(150, W * 0.24); // distance over which inference fades out

    // outside: the patient, solid near the frame, dashed, then dotted far away
    const paths = Array.from({ length: BINS }, () => new Path2D());
    const o = outside;
    for (let k = 0; k < o.length; k += 4) {
      const ax = o[k], ay = o[k + 1], bx = o[k + 2], by = o[k + 3];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (mx > x0 && mx < x1 && my > y0 && my < y1) continue;
      const dx = Math.max(x0 - mx, 0, mx - x1), dy = Math.max(y0 - my, 0, my - y1);
      const t = Math.min(1, Math.hypot(dx, dy) / reach);
      const bin = Math.min(BINS - 1, Math.floor(t * BINS));
      const duty = 0.9 - 0.78 * Math.pow((bin + 0.5) / BINS, 0.8); // share of each segment drawn: solid-ish to dotted
      paths[bin].moveTo(ax, ay);
      paths[bin].lineTo(ax + (bx - ax) * duty, ay + (by - ay) * duty);
    }
    ctx.lineCap = "round";
    for (let b = 0; b < BINS; b++) {
      const t = (b + 0.5) / BINS;
      ctx.strokeStyle = css(colors.ink);
      ctx.globalAlpha = fade * (0.6 - 0.25 * t);
      ctx.lineWidth = 1 + 0.2 * t;
      ctx.stroke(paths[b]);
    }

    // inside: the measurement
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, fw, fh); ctx.clip();
    const j0 = Math.floor(y0 / CELL) - 1, j1 = Math.ceil(y1 / CELL) + 1;
    // Scanners mode: left half from scanner A, right half from scanner B.
    // Harmonize brings both halves to one reference look; the anatomy stays put.
    const mid = (x0 + x1) / 2;
    const halves = scanAmt > 0.001
      ? [[x0, mid, SCANNERS[0]], [mid, x1, SCANNERS[1]]]
      : [[x0, x1, null]];
    const k = scanAmt * (1 - harm); // how much of the scanner look remains
    for (const [hx0, hx1, s] of halves) {
      const gamma = s ? 1 + (s.gamma - 1) * k : 1;
      const col = s ? mix(colors.ink, colors[s.color], k) : colors.ink;
      const width = s ? MEASURED_WIDTH + (s.width - MEASURED_WIDTH) * k : MEASURED_WIDTH;
      ctx.save();
      ctx.beginPath(); ctx.rect(hx0, y0, hx1 - hx0, fh); ctx.clip();
      const seg = march(gSnap, levels(gamma), Math.floor(hx0 / CELL) - 1, Math.ceil(hx1 / CELL) + 1, j0, j1, []);
      const p = new Path2D();
      for (let q = 0; q < seg.length; q += 4) { p.moveTo(seg[q], seg[q + 1]); p.lineTo(seg[q + 2], seg[q + 3]); }
      ctx.globalAlpha = open;
      ctx.strokeStyle = css(col); ctx.lineWidth = width; ctx.lineJoin = "round";
      ctx.stroke(p);
      ctx.restore();
    }
    if (k > 0.01) { // the seam between the two scanners
      ctx.globalAlpha = k;
      ctx.strokeStyle = css(colors.ink); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mid, y0); ctx.lineTo(mid, y1); ctx.stroke();
    }
    ctx.restore();

    // the frame: a closed box; it flashes when a new scan is taken
    ctx.globalAlpha = Math.min(1, open * 1.4);
    ctx.strokeStyle = css(colors.ink); ctx.lineWidth = 1.5 + 1.5 * flash; ctx.lineJoin = "miter";
    ctx.strokeRect(x0, y0, fw, fh);

    // labels
    ctx.font = '500 11px "Schibsted Grotesk", system-ui, sans-serif';
    ctx.textBaseline = "top";
    const ly = y1 + 7 > H - 14 ? y1 - 18 : y1 + 7;
    if (k > 0.5) {
      ctx.fillStyle = css(colors.a); ctx.textAlign = "left"; ctx.fillText("scanner A", x0 + 6, ly);
      ctx.fillStyle = css(colors.b); ctx.textAlign = "right"; ctx.fillText("scanner B", x1 - 6, ly);
    } else {
      ctx.fillStyle = css(colors.ink); ctx.textAlign = "left";
      ctx.fillText(scanAmt > 0.5 ? "measured, harmonized" : "measured", x0 + 6, ly);
    }
    if (timeOn) {
      const ago = Math.floor(tau - tauScan);
      ctx.fillStyle = css(colors.ink); ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText(ago < 1 ? "scanned just now" : `scanned ${ago} month${ago === 1 ? "" : "s"} ago`, x0 + 6, y0 - 6 < 12 ? y0 + 16 : y0 - 6);
    }
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- loop
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    if (!introStart) introStart = now;
    if (!reduce) {
      const el = now - introStart;
      open = ease(Math.min(1, el / 1100));
      fade = ease(Math.min(1, Math.max(0, (el - 600) / 900)));
    }
    const k = reduce ? 1 : 1 - Math.pow(0.86, dt * 60 || 1);
    frame.x += (target.x - frame.x) * k;
    frame.y += (target.y - frame.y) * k;

    const rate = reduce ? 1 : dt / 0.9;
    scanAmt = scannerOn ? Math.min(1, scanAmt + rate) : Math.max(0, scanAmt - rate);
    harm = harmonizeOn && scannerOn ? Math.min(1, harm + rate * 0.8) : Math.max(0, harm - rate);
    flash = Math.max(0, flash - dt * 2.5);

    if (timeOn) {
      tau += dt * MONTHS_PER_SEC;
      gNow = sample(tau);
      rebuildOutside();
      if (tau - tauScan >= SCAN_EVERY) { tauScan = tau; gSnap = gNow; flash = 1; }
    }

    draw();

    const moving = Math.abs(target.x - frame.x) > 0.3 || Math.abs(target.y - frame.y) > 0.3;
    const wantHarm = harmonizeOn && scannerOn ? 1 : 0;
    const easing = open < 1 || fade < 1 || scanAmt !== (scannerOn ? 1 : 0) || harm !== wantHarm || flash > 0;
    if (visible && (moving || easing || timeOn)) kick();
    else last = 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  // ---------------------------------------------------------------- input
  function moveTo(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    target.x = clientX - r.left; target.y = clientY - r.top; target.set = true;
    clampTarget(); kick();
  }
  canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) moveTo(e.clientX, e.clientY); });
  canvas.addEventListener("pointerdown", (e) => moveTo(e.clientX, e.clientY));
  canvas.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 60 : 20;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    target.x += d[0]; target.y += d[1]; target.set = true; clampTarget(); kick();
  });

  // buttons under the figure
  const fig = canvas.closest("figure");
  const btn = (m) => fig && fig.querySelector(`[data-mode="${m}"]`);
  const note = (m) => fig && fig.querySelector(`[data-note="${m}"]`);
  function sync() {
    const set = (m, on) => { const b = btn(m); if (b) b.setAttribute("aria-pressed", String(on)); const n = note(m); if (n) n.hidden = !on; };
    set("scanner", scannerOn);
    set("harmonize", harmonizeOn && scannerOn);
    set("time", timeOn);
    const h = btn("harmonize"); if (h) h.hidden = !scannerOn;
  }
  btn("scanner")?.addEventListener("click", () => { scannerOn = !scannerOn; if (!scannerOn) harmonizeOn = false; sync(); kick(); });
  btn("harmonize")?.addEventListener("click", () => { harmonizeOn = !harmonizeOn; sync(); kick(); });
  btn("time")?.addEventListener("click", () => {
    timeOn = !timeOn;
    if (!timeOn) { tau = 0; tauScan = 0; gNow = sample(0); gSnap = gNow; rebuildOutside(); }
    else { tauScan = tau; gSnap = gNow; flash = 1; }
    sync(); kick();
  });
  sync();

  readColors();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); kick(); });
  new ResizeObserver(() => resize()).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(canvas);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => resize());
})();
