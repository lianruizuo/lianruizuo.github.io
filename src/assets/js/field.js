// The figure on the home page.
// Iso-contours of a smooth density (a small Gaussian mixture). Inside the frame
// the contours are drawn as measured: solid. Outside, they are drawn as inferred:
// sampled dots. Move the pointer, drag, or use the arrow keys to move the frame.
(() => {
  const canvas = document.getElementById("field");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // mixture components: [x as fraction of width, y as fraction of height, sx, sy (in heights), rotation, weight]
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
  const CELL = 5; // CSS px per grid cell

  let W = 0, H = 0, dpr = 1;
  let solid = null;      // Path2D of all contour segments
  let dots = [];         // midpoints of all segments (for the inferred look)
  let colors = {};
  let frame = { x: 0, y: 0, w: 0, h: 0 };
  let target = { x: 0, y: 0 };
  let open = reduce ? 1 : 0, dotAlpha = reduce ? 1 : 0, t0 = 0;
  let raf = 0;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = {
      inside: cs.getPropertyValue("--field-in").trim() || "#1b2029",
      outside: cs.getPropertyValue("--field-out").trim() || "#2f43a3",
      paper: cs.getPropertyValue("--paper").trim() || "#f4f5f2",
      graphite: cs.getPropertyValue("--graphite").trim() || "#5a6170",
    };
  }

  function density(px, py) {
    // narrow screens see the middle of a wider field rather than a squeezed one
    const ratio = Math.max(W / H, 2.6), off = (ratio * H - W) / 2;
    const u = (px + off) / H, v = py / H;
    let f = 0;
    for (const [cx, cy, sx, sy, r, w] of COMP) {
      const dx = u - cx * ratio, dy = v - cy;
      const c = Math.cos(r), s = Math.sin(r);
      const a = (c * dx + s * dy) / sx, b = (-s * dx + c * dy) / sy;
      f += w * Math.exp(-0.5 * (a * a + b * b));
    }
    return f + 0.05 * Math.sin(3.1 * u + 1.3) * Math.cos(4.7 * v - 0.4);
  }

  // marching squares over a regular grid
  function build() {
    const nx = Math.ceil(W / CELL) + 1, ny = Math.ceil(H / CELL) + 1;
    const g = new Float32Array(nx * ny);
    let max = -Infinity, min = Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const val = density(i * CELL, j * CELL);
      g[j * nx + i] = val; if (val > max) max = val; if (val < min) min = val;
    }
    solid = new Path2D(); dots = [];
    const lerp = (a, b, l) => (l - a) / (b - a);
    for (let k = 0; k < NLEVELS; k++) {
      const L = min + (max - min) * (0.1 + 0.84 * (k / (NLEVELS - 1)));
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i + 1], d = g[(j + 1) * nx + i];
        const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * CELL, y = j * CELL;
        const top = [x + CELL * lerp(a, b, L), y];
        const right = [x + CELL, y + CELL * lerp(b, c, L)];
        const bottom = [x + CELL * lerp(d, c, L), y + CELL];
        const left = [x, y + CELL * lerp(a, d, L)];
        const segs = {
          1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
          5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]],
          9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]],
          13: [[bottom, right]], 14: [[left, bottom]],
        }[idx];
        for (const [p, q] of segs) {
          solid.moveTo(p[0], p[1]); solid.lineTo(q[0], q[1]);
          dots.push((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
        }
      }
    }
  }

  function restPosition() {
    return { x: W * 0.37, y: H * 0.5 };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frame.w = Math.max(150, Math.min(W * 0.34, 380));
    frame.h = H * 0.72;
    if (!target.set) { const r = restPosition(); target.x = r.x; target.y = r.y; frame.x = r.x; frame.y = r.y; }
    clampTarget();
    build();
    kick();
  }

  function clampTarget() {
    target.x = Math.min(W - frame.w / 2 - 2, Math.max(frame.w / 2 + 2, target.x));
    target.y = Math.min(H - frame.h / 2 - 2, Math.max(frame.h / 2 + 2, target.y));
  }

  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fw = frame.w * (0.15 + 0.85 * open), fh = frame.h * (0.15 + 0.85 * open);
    const x0 = frame.x - fw / 2, y0 = frame.y - fh / 2;

    // inferred: dots everywhere outside the frame
    ctx.globalAlpha = 0.62 * dotAlpha;
    ctx.fillStyle = colors.outside;
    for (let i = 0; i < dots.length; i += 2) {
      const x = dots[i], y = dots[i + 1];
      if (x > x0 && x < x0 + fw && y > y0 && y < y0 + fh) continue;
      ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;

    // measured: solid contours inside the frame
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, fw, fh); ctx.clip();
    ctx.globalAlpha = open;
    ctx.strokeStyle = colors.inside; ctx.lineWidth = 1; ctx.lineCap = "round";
    ctx.stroke(solid);
    ctx.restore();

    // the frame: viewfinder corners
    ctx.globalAlpha = Math.min(1, open * 1.4);
    ctx.strokeStyle = colors.inside; ctx.lineWidth = 1.5;
    const k = 12;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + k); ctx.lineTo(x0, y0); ctx.lineTo(x0 + k, y0);
    ctx.moveTo(x0 + fw - k, y0); ctx.lineTo(x0 + fw, y0); ctx.lineTo(x0 + fw, y0 + k);
    ctx.moveTo(x0 + fw, y0 + fh - k); ctx.lineTo(x0 + fw, y0 + fh); ctx.lineTo(x0 + fw - k, y0 + fh);
    ctx.moveTo(x0 + k, y0 + fh); ctx.lineTo(x0, y0 + fh); ctx.lineTo(x0, y0 + fh - k);
    ctx.stroke();

    // labels
    ctx.font = '500 11px "Schibsted Grotesk", system-ui, sans-serif';
    ctx.textBaseline = "top";
    ctx.fillStyle = colors.inside;
    ctx.fillText("measured", x0 + 6, y0 + fh + 7 > H - 14 ? y0 + fh - 18 : y0 + fh + 7);
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    raf = 0;
    if (!t0) t0 = now;
    const el = now - t0;
    if (!reduce) {
      open = ease(Math.min(1, el / 1100));
      dotAlpha = ease(Math.min(1, Math.max(0, (el - 700) / 900)));
    }
    const k = reduce ? 1 : 0.14;
    frame.x += (target.x - frame.x) * k;
    frame.y += (target.y - frame.y) * k;
    draw();
    const moving = Math.abs(target.x - frame.x) > 0.3 || Math.abs(target.y - frame.y) > 0.3;
    if (moving || open < 1 || dotAlpha < 1) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  function moveTo(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    target.x = clientX - r.left; target.y = clientY - r.top; target.set = true;
    clampTarget(); kick();
  }
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" || e.buttons) moveTo(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerdown", (e) => moveTo(e.clientX, e.clientY));
  canvas.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 60 : 20;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    target.x += d[0]; target.y += d[1]; target.set = true; clampTarget(); kick();
  });

  readColors();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); kick(); });
  new ResizeObserver(() => resize()).observe(canvas);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { resize(); });
})();
