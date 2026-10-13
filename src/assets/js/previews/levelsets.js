// Level sets (Malladi, Sethian and Vemuri, 1995): the engine, a small 3D height-field renderer, and the public preview.
//
// The engine (window.LSKit) is shared with the lecture's own labs, which load after it. It follows the notes' algorithm:
//   phi < 0 inside, phi > 0 outside, boundary = {phi = 0}
//   phi <- phi + tau kI [ -c grad+-(phi) + eps kappa G0 ]
//     grad+ (c > 0) or grad- (c < 0): Osher and Sethian's upwind gradient (Malladi, Eq. 9)
//     kappa = div(grad phi / |grad phi|) and G0 = |grad phi| from centered differences
//   zero normal derivative at the image border (edge values copied outward)
//   optional reinitialization  phi <- phi - dt S(phi) (|grad phi| - 1)  (Malladi, Eq. 18), a few steps per iteration
// The image scenes are the snakes chapter's (window.SnakeKit, loaded first). phi lives on a half-resolution grid
// (480 x 270 for the 960 x 540 image); the stopping factor kI = exp(-M), M = |grad(G_sigma * 255 I)|, is computed
// on the full image and averaged onto that grid. All lengths below are in grid cells (2 image pixels).
//
// Public widget:  <div data-lab="ls-run">   a front grows inside the cell: phi as a surface, and its zero level set
(() => {
  const SK = window.SnakeKit;
  if (!SK) return;

  // ------------------------------------------------------------------ finite differences on a w x h grid
  // one-sided and centered differences with the border value copied outward
  function upwind(p, w, h, out, sign) {           // sign > 0: grad+ (front moving outward), sign < 0: grad-
    for (let y = 0; y < h; y++) {
      const r = y * w, rm = (y > 0 ? y - 1 : 0) * w, rp = (y < h - 1 ? y + 1 : h - 1) * w;
      for (let x = 0; x < w; x++) {
        const i = r + x, v = p[i];
        const a = v - p[r + (x > 0 ? x - 1 : 0)], b = p[r + (x < w - 1 ? x + 1 : w - 1)] - v, c = v - p[rm + x], d = p[rp + x] - v;
        let s = 0;
        if (sign > 0) { if (a > 0) s += a * a; if (b < 0) s += b * b; if (c > 0) s += c * c; if (d < 0) s += d * d; }
        else { if (b > 0) s += b * b; if (a < 0) s += a * a; if (d > 0) s += d * d; if (c < 0) s += c * c; }
        out[i] = Math.sqrt(s);
      }
    }
    return out;
  }
  // curvature kappa = Dx0 nx + Dy0 ny with n = D0 phi / sqrt(G0^2 + xi^2), and G0 = |D0 phi|
  function curvature(p, w, h, kap, g0, nx, ny, xi = 1e-3) {
    const xi2 = xi * xi;
    for (let y = 0; y < h; y++) {
      const r = y * w, rm = (y > 0 ? y - 1 : 0) * w, rp = (y < h - 1 ? y + 1 : h - 1) * w;
      for (let x = 0; x < w; x++) {
        const i = r + x, px = (p[r + (x < w - 1 ? x + 1 : w - 1)] - p[r + (x > 0 ? x - 1 : 0)]) * 0.5, py = (p[rp + x] - p[rm + x]) * 0.5, g2 = px * px + py * py, d = 1 / Math.sqrt(g2 + xi2);
        g0[i] = Math.sqrt(g2); nx[i] = px * d; ny[i] = py * d;
      }
    }
    for (let y = 0; y < h; y++) {
      const r = y * w, rm = (y > 0 ? y - 1 : 0) * w, rp = (y < h - 1 ? y + 1 : h - 1) * w;
      for (let x = 0; x < w; x++) kap[r + x] = (nx[r + (x < w - 1 ? x + 1 : w - 1)] - nx[r + (x > 0 ? x - 1 : 0)]) * 0.5 + (ny[rp + x] - ny[rm + x]) * 0.5;
    }
  }
  // a front: phi on a grid, the speed parameters, and its scratch arrays
  function Front(phi, w, h, kI, { c = 1, eps = 0, tau = 0.2, reinit = 2, reinitDt = 0.4 } = {}) {
    const n = w * h, G = new Float32Array(n), K = new Float32Array(n), G0 = new Float32Array(n), NX = new Float32Array(n), NY = new Float32Array(n), Gp = new Float32Array(n);
    const o = { c, eps, tau, reinit, reinitDt };
    let k = 0;
    const F = {
      phi, w, h, kI, o,
      get k() { return k; },
      step(times = 1) {
        for (let t = 0; t < times; t++) {
          const { c, eps, tau } = o;
          upwind(phi, w, h, G, c >= 0 ? 1 : -1);
          if (eps) curvature(phi, w, h, K, G0, NX, NY);
          for (let i = 0; i < n; i++) phi[i] += tau * (kI ? kI[i] : 1) * (-c * G[i] + (eps ? eps * K[i] * G0[i] : 0));
          for (let r = 0; r < o.reinit; r++) F.reinitStep(o.reinitDt);
          k++;
        }
      },
      // phi <- phi - dt S(phi)(|grad phi| - 1): pulls phi back toward a signed distance without moving its zero set
      reinitStep(dt = 0.4) {                       // one pass: grad+ where phi > 0, grad- where phi < 0 (old values read from a copy)
        Gp.set(phi);
        for (let y = 0; y < h; y++) {
          const r = y * w, rm = (y > 0 ? y - 1 : 0) * w, rp = (y < h - 1 ? y + 1 : h - 1) * w;
          for (let x = 0; x < w; x++) {
            const i = r + x, v = Gp[i], S = v / Math.sqrt(v * v + 1);
            const a = v - Gp[r + (x > 0 ? x - 1 : 0)], b = Gp[r + (x < w - 1 ? x + 1 : w - 1)] - v, c = v - Gp[rm + x], d = Gp[rp + x] - v;
            let q = 0;
            if (S > 0) { if (a > 0) q += a * a; if (b < 0) q += b * b; if (c > 0) q += c * c; if (d < 0) q += d * d; }
            else { if (b > 0) q += b * b; if (a < 0) q += a * a; if (d > 0) q += d * d; if (c < 0) q += c * c; }
            phi[i] = v - dt * S * (Math.sqrt(q) - 1);
          }
        }
      },
      inside() { let a = 0; for (let i = 0; i < n; i++) if (phi[i] < 0) a++; return a; },
    };
    return F;
  }

  // ------------------------------------------------------------------ signed distance from a mask (exact Euclidean, Felzenszwalb and Huttenlocher)
  function edt1(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s; while (true) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break; }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  }
  function edt(target, w, h) {                     // squared distance to the nearest pixel with target = 1
    const INF = 1e20, out = new Float64Array(w * h), m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
    for (let i = 0; i < w * h; i++) out[i] = target[i] ? 0 : INF;
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = out[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) out[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = out[y * w + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) out[y * w + x] = d[x]; }
    return out;
  }
  // phi = (distance to the inside) - (distance to the outside), shifted by half a cell so the zero set sits between pixels
  function sdfFromMask(inside, w, h) {
    const din = edt(inside, w, h), dout = edt(Uint8Array.from(inside, (v) => (v ? 0 : 1)), w, h), phi = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) phi[i] = inside[i] ? -(Math.sqrt(dout[i]) - 0.5) : Math.sqrt(din[i]) - 0.5;
    return phi;
  }
  const circlePhi = (w, h, cx, cy, r) => { const p = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = Math.hypot(x - cx, y - cy) - r; return p; };

  // ------------------------------------------------------------------ the zero level set (marching squares), as closed or open polylines
  function contours(p, w, h, level = 0) {
    const segs = [], key = (a, b) => `${a},${b}`;
    const at = (x, y) => p[y * w + x] - level;
    // a point on the edge between two grid nodes, by linear interpolation; edges named by their two nodes
    const pt = (x0, y0, x1, y1) => { const a = at(x0, y0), b = at(x1, y1), t = a / (a - b); return [x0 + t * (x1 - x0), y0 + t * (y1 - y0), key(Math.min(y0 * w + x0, y1 * w + x1), Math.max(y0 * w + x0, y1 * w + x1))]; };
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = at(x, y) < 0, b = at(x + 1, y) < 0, c = at(x + 1, y + 1) < 0, d = at(x, y + 1) < 0, code = a | (b << 1) | (c << 2) | (d << 3);
      if (code === 0 || code === 15) continue;
      const T = () => pt(x, y, x + 1, y), R = () => pt(x + 1, y, x + 1, y + 1), B = () => pt(x, y + 1, x + 1, y + 1), L = () => pt(x, y, x, y + 1);
      const center = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 < 0;
      switch (code) {
        case 1: case 14: segs.push([L(), T()]); break;
        case 2: case 13: segs.push([T(), R()]); break;
        case 3: case 12: segs.push([L(), R()]); break;
        case 4: case 11: segs.push([R(), B()]); break;
        case 6: case 9: segs.push([T(), B()]); break;
        case 7: case 8: segs.push([L(), B()]); break;
        case 5: if (center) { segs.push([L(), B()]); segs.push([T(), R()]); } else { segs.push([L(), T()]); segs.push([R(), B()]); } break;
        case 10: if (center) { segs.push([L(), T()]); segs.push([R(), B()]); } else { segs.push([T(), R()]); segs.push([L(), B()]); } break;
      }
    }
    // link segments that share an edge point into polylines
    const ends = new Map(); segs.forEach((s, i) => { for (const e of [0, 1]) { const k = s[e][2]; if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
    const used = new Uint8Array(segs.length), lines = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue; used[i] = 1;
      const line = [segs[i][0], segs[i][1]];
      for (const dir of [1, 0]) {                     // grow forward from the end, then backward from the start
        while (true) {
          const tip = dir ? line[line.length - 1] : line[0], next = (ends.get(tip[2]) || []).find((j) => !used[j]);
          if (next === undefined) break; used[next] = 1;
          const s = segs[next], q = s[0][2] === tip[2] ? s[1] : s[0];
          if (dir) line.push(q); else line.unshift(q);
        }
      }
      lines.push(line.map((q) => [q[0], q[1]]));
    }
    return lines;
  }
  const loops = (lines, minLen = 6) => lines.filter((l) => l.length >= minLen);

  // ------------------------------------------------------------------ the image: stopping factor on the half-resolution grid
  const W = SK.W / 2, H = SK.H / 2;
  function stopping(img, { sigma = 3, scale = 255, form = "exp", half = true } = {}) {
    const sm = SK.gauss(Float32Array.from(img, (v) => v * scale), SK.W, SK.H, sigma), [gx, gy] = SK.grad(sm, SK.W, SK.H);
    const k = Float32Array.from(gx, (v, i) => { const M = Math.hypot(v, gy[i]); return form === "exp" ? Math.exp(-M) : 1 / (1 + M); });
    return half ? down(k) : k;
  }
  function down(a) {                               // 2 x 2 average onto the half-resolution grid
    const o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = 2 * y * SK.W + 2 * x; o[y * W + x] = (a[i] + a[i + 1] + a[i + SK.W] + a[i + SK.W + 1]) / 4; }
    return o;
  }

  // ------------------------------------------------------------------ colors for phi (inside: cyan to deep blue; outside: violet to pink)
  const NEG = [[0, [150, 235, 255]], [0.35, [80, 170, 235]], [1, [40, 70, 160]]], POS = [[0, [170, 130, 240]], [0.5, [200, 110, 220]], [1, [235, 120, 170]]];
  function ramp(stops, u) { for (let j = 1; j < stops.length; j++) if (u <= stops[j][0]) { const [a, ca] = stops[j - 1], [b, cb] = stops[j], t = (u - a) / (b - a || 1); return ca.map((v, q) => v + (cb[q] - v) * t); } return stops[stops.length - 1][1]; }
  const phiColor = (v, sn = 40, sp = 120) => (v < 0 ? ramp(NEG, Math.min(1, -v / sn)) : ramp(POS, Math.min(1, v / sp)));
  const GOLD = "#ffd36b";

  // ------------------------------------------------------------------ a 3D height field, drawn with the painter's algorithm (orthographic camera)
  // view = { az, el } in degrees; the grid (w x h, values phi) is shown over [-1, 1] x [-h/w, h/w] with height zs * phi / w
  function Surface(canvas) {
    const ctx = canvas.getContext("2d");
    let view = { az: -20, el: 36, zoom: 1 }, drag = null;
    const proj = (X, Y, Z) => {                      // world -> screen
      const a = view.az * Math.PI / 180, e = view.el * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
      const xr = X * ca - Y * sa, yr = X * sa + Y * ca;            // rotate about the vertical axis
      const sx = xr, sy = -(yr * se) - Z * ce, depth = yr * ce - Z * se;   // tilt; larger depth = farther
      const s = canvas.width * 0.36 * view.zoom;
      return [canvas.width / 2 + sx * s, canvas.height * 0.56 + sy * s, depth];
    };
    canvas.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY, view.az, view.el]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => { if (!drag) return; view.az = drag[2] + (e.clientX - drag[0]) * 0.4; view.el = Math.min(80, Math.max(12, drag[3] - (e.clientY - drag[1]) * 0.3)); S.onview && S.onview(); });
    canvas.addEventListener("pointerup", () => (drag = null));
    canvas.style.touchAction = "pan-y";
    const S = {
      get view() { return view; }, set view(v) { view = { ...view, ...v }; },
      // phi: Float32Array (w x h); opts: step (grid stride), zs (height scale), floor (ImageBitmap/canvas of the image), lines (zero set), plane
      draw(phi, w, h, { step = 4, zs = 0.5, floor = null, lines = [], plane = true, sn = 40, sp = 120, clip = 1e9, extraLevels = [], level = 0 } = {}) {
        const sc = 2 / (w - 1), X = (x) => -1 + x * sc, Y = (y) => (h - 1) / (w - 1) - y * sc, Zof = (v) => Math.max(-clip, Math.min(clip, v)) * sc * zs, Z0 = -0.42;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#0c0d11"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        // the floor: the image (an affine map, since the camera is orthographic)
        const c00 = proj(X(0), Y(0), Z0), c10 = proj(X(w - 1), Y(0), Z0), c01 = proj(X(0), Y(h - 1), Z0);
        if (floor) { ctx.save(); ctx.globalAlpha = 0.9;
          ctx.setTransform((c10[0] - c00[0]) / floor.width, (c10[1] - c00[1]) / floor.width, (c01[0] - c00[0]) / floor.height, (c01[1] - c00[1]) / floor.height, c00[0], c00[1]);
          ctx.drawImage(floor, 0, 0); ctx.restore(); }
        else { const c11 = proj(X(w - 1), Y(h - 1), Z0); ctx.fillStyle = "#16181e"; ctx.beginPath(); [c00, c10, c11, c01].forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.fill(); }
        // other level sets on the floor, then the zero set on the floor
        const line3 = (L, z, style, width) => { ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath(); L.forEach((l) => l.forEach((q, i) => { const s = proj(X(q[0]), Y(q[1]), z); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); })); ctx.stroke(); };
        extraLevels.forEach(([L, col]) => line3(L, Z0 + 0.002, col, 1.2));
        line3(lines, Z0 + 0.003, "rgba(255,211,107,.7)", 2);
        // the surface: quads sorted far to near; the plane phi = 0 is inserted at its depth as a translucent sheet
        const quads = [];
        for (let y = 0; y + step < h; y += step) for (let x = 0; x + step < w; x += step) {
          const v = [phi[y * w + x], phi[y * w + x + step], phi[(y + step) * w + x + step], phi[(y + step) * w + x]];
          const P = [proj(X(x), Y(y), Zof(v[0])), proj(X(x + step), Y(y), Zof(v[1])), proj(X(x + step), Y(y + step), Zof(v[2])), proj(X(x), Y(y + step), Zof(v[3]))];
          const m = (v[0] + v[1] + v[2] + v[3]) / 4, col = phiColor(m, sn, sp);
          // simple shading from the surface slope
          const gxv = (v[1] + v[2] - v[0] - v[3]) / (2 * step), gyv = (v[3] + v[2] - v[0] - v[1]) / (2 * step), shade = 0.78 + 0.22 * Math.max(-1, Math.min(1, (-gxv * 0.6 + gyv * 0.8) * zs * 0.9));
          quads.push([(P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4, P, col.map((q) => Math.min(255, q * shade))]);
        }
        quads.sort((a, b) => b[0] - a[0]);
        const zl = Zof(level), planeCorners = [proj(X(0), Y(0), zl), proj(X(w - 1), Y(0), zl), proj(X(w - 1), Y(h - 1), zl), proj(X(0), Y(h - 1), zl)];
        const planeDepth = (planeCorners[0][2] + planeCorners[1][2] + planeCorners[2][2] + planeCorners[3][2]) / 4;
        let planeDone = !plane;
        const drawPlane = () => { ctx.fillStyle = "rgba(200,215,255,.10)"; ctx.strokeStyle = "rgba(200,215,255,.55)"; ctx.lineWidth = 1; ctx.beginPath(); planeCorners.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.stroke(); planeDone = true; };
        for (const [d, P, col] of quads) {
          if (!planeDone && d < planeDepth - 0.6) drawPlane();
          ctx.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        if (!planeDone) drawPlane();
        // the zero level set on the surface (height 0)
        ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 8; line3(lines, Zof(level), GOLD, 2.6); ctx.restore();
      },
    };
    return S;
  }

  // ------------------------------------------------------------------ an image panel with the zero level set drawn on it
  function imageCanvas(img, crop) {               // a canvas holding the image (full resolution), cropped
    const [x0, y0, cw, ch] = crop, c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const d = c.getContext("2d").createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const g = Math.pow(Math.min(1, Math.max(0, img[(y + y0) * SK.W + x + x0])), 0.95) * 255, i = 4 * (y * cw + x);
      d.data[i] = g * 0.97; d.data[i + 1] = g * 0.99; d.data[i + 2] = Math.min(255, g * 1.02); d.data[i + 3] = 255; }
    c.getContext("2d").putImageData(d, 0, 0);
    return c;
  }
  function drawLines(ctx, lines, { scale = 2, dx = 0, dy = 0, color = GOLD, width = 2.4, glow = true } = {}) {
    ctx.save(); if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 7; } ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round";
    ctx.beginPath(); lines.forEach((l) => l.forEach((q, i) => { const x = (q[0] + 0.5) * scale - 0.5 - dx, y = (q[1] + 0.5) * scale - 0.5 - dy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); })); ctx.stroke(); ctx.restore();
  }

  window.LSKit = { W, H, upwind, curvature, Front, edt, sdfFromMask, circlePhi, contours, loops, stopping, down, phiColor, ramp, NEG, POS, GOLD, Surface, imageCanvas, drawLines };

  // ------------------------------------------------------------------ a runner: image, front, the surface and the image side by side
  // a rounded rectangle as a starting contour, in grid units
  const boxPhi = (x0, y0, x1, y1, r = 12) => { const p = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
      p[y * W + x] = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; }
    return p; };
  // scenes: crop = [x0, y0, w, h] of the 960 x 540 image (w x h = 720 x 405), seed = [x, y, r] in grid units (inside starts) or box (outside starts)
  const CELL_CROP = [118, 76, 720, 404];
  const SCENES = {
    cell: { name: "Inside a cell", image: () => SK.blobNoHaze(), crop: CELL_CROP, c: 0.5, seed: [210, 125, 15] },
    haze: { name: "With a bright haze above it", image: () => SK.imageOf("object"), crop: CELL_CROP, c: 0.5, seed: [210, 125, 15] },
    two: { name: "Two objects", image: () => SK.twoNoHaze(), crop: [190, 68, 720, 404], c: -0.5, box: [118, 56, 445, 228] },
    ushape: { name: "A U shape", image: () => SK.imageOf("ushape"), crop: [120, 82, 720, 404], c: -0.5, box: [135, 46, 345, 228] },
  };
  const stopCache = {};
  const sceneData = (key) => stopCache[key] || (stopCache[key] = (() => { const sc = SCENES[key], img = sc.image(); return { img, kI: stopping(img), pic: imageCanvas(img, sc.crop) }; })());
  function runner(root, { scenes = ["two", "cell"], controls = false, label = "Start" } = {}) {
    root.innerHTML = `<div class="lab-row snk-top"><span class="bench-label">${label}</span>
        ${scenes.map((k, i) => `<button type="button" class="chip" data-scene="${k}" aria-pressed="${i === 0}">${SCENES[k].name}</button>`).join("")}</div>
      <div class="ls-pair"><canvas class="ls-3d" width="640" height="440" role="img" aria-label="The level set function phi drawn as a surface over the image; its zero level set in gold"></canvas>
        <canvas class="ls-img" width="720" height="404" role="img" aria-label="The image with the zero level set of phi drawn on it"></canvas></div>
      ${controls ? `<div class="lab-row"><label class="snk-slider">ε <input type="range" data-k="eps" min="0" max="2.5" step="0.05" value="0.625"><output>0.63</output></label>
        <button type="button" class="chip" data-act="reinit" aria-pressed="true">Keep φ a distance function</button></div>` : ""}
      <div class="lab-row"><button type="button" class="chip chip-strong" data-act="play">Play</button><button type="button" class="chip" data-act="reset">Reset</button><span class="snk-k"></span></div>`;
    const c3 = root.querySelector(".ls-3d"), ci = root.querySelector(".ls-img"), note = root.querySelector(".snk-k"), play = root.querySelector('[data-act="play"]');
    const surf = Surface(c3), ictx = ci.getContext("2d"), epsIn = root.querySelector('[data-k="eps"]');
    let key = scenes[0], F = null, seed = null, playing = false, raf = 0, hist = [], done = false, reinit = true, more = false;
    const hint = () => (SCENES[key].seed ? "Click the image to move the starting circle. " : "") + "Drag the surface to turn it.";
    function reset() {
      const sc = SCENES[key], D = sceneData(key); playing = false; done = false; more = false; cancelAnimationFrame(raf); hist = [];
      seed = seed || sc.seed;
      const phi = sc.seed ? circlePhi(W, H, seed[0], seed[1], seed[2]) : boxPhi(...sc.box);
      F = Front(phi, W, H, D.kI, { c: sc.c, eps: epsIn ? +epsIn.value : 0.625, tau: 1, reinit: reinit ? 1 : 0 });
      play.textContent = "Play"; note.textContent = hint(); draw();
    }
    const G = () => SCENES[key].crop.map((v) => v / 2);
    const crop = () => { const [gx, gy, gw, gh] = G(), p = new Float32Array(gw * gh); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) p[y * gw + x] = F.phi[(y + gy) * W + x + gx]; return p; };
    function draw() {
      const D = sceneData(key), [gx, gy, gw, gh] = G(), pc = crop(), L = loops(contours(pc, gw, gh));
      surf.draw(pc, gw, gh, { step: 4, zs: 0.5, floor: D.pic, lines: L, sn: 45, sp: 90, clip: 90 });
      ictx.drawImage(D.pic, 0, 0); drawLines(ictx, L);
      if (F.k === 0 && SCENES[key].seed) { ictx.save(); ictx.setLineDash([5, 5]); ictx.strokeStyle = "rgba(255,211,107,.9)"; ictx.lineWidth = 1.5; ictx.beginPath(); ictx.arc((seed[0] - gx) * 2, (seed[1] - gy) * 2, seed[2] * 2, 0, 7); ictx.stroke(); ictx.restore(); }
      if (F.k) {
        let extra = "";
        if (controls) { let s = 0, m = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (Math.abs(F.phi[i]) < 2) { s += Math.hypot(F.phi[i + 1] - F.phi[i - 1], F.phi[i + W] - F.phi[i - W]) / 2; m++; } }
          extra = m ? ` · |∇φ| near the front ≈ ${(s / m).toFixed(2)}` : ""; }
        note.textContent = `${L.length === 1 ? "one curve" : L.length + " curves"} · iteration ${F.k}${extra}${done ? (done === "leak" ? " · stopped: the front reached the edge of the view" : done === "gone" ? " · the front vanished" : " · settled") : ""}`;
      }
    }
    function tick() {
      F.step(4);
      const m = F.inside(); hist.push([F.k, m]);
      const back = hist.find((h) => h[0] >= F.k - 60);          // settled: fewer than 90 cells changed over the last 60 time units
      if (!more && F.k >= 60 && back && Math.abs(m - back[1]) < 90) done = "settled";
      const [gx, gy, gw, gh] = G();
      if (SCENES[key].c > 0) { for (let x = gx; x < gx + gw && !done; x++) if (F.phi[(gy + 2) * W + x] < 0 || F.phi[(gy + gh - 3) * W + x] < 0) done = "leak";
        for (let y = gy; y < gy + gh && !done; y++) if (F.phi[y * W + gx + 2] < 0 || F.phi[y * W + gx + gw - 3] < 0) done = "leak"; }
      if (m === 0) done = "gone";
      if (F.k >= 3000) done = "settled";
      draw();
      if (playing && !done) raf = requestAnimationFrame(tick); else { playing = false; play.textContent = controls && done === "settled" && F.k < 3000 ? "Keep going" : done ? "Play again" : "Play"; }
    }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.scene) { key = b.dataset.scene; seed = null; root.querySelectorAll("[data-scene]").forEach((q) => q.setAttribute("aria-pressed", String(q === b))); note.textContent = "Computing the stopping factor…"; setTimeout(reset, 20); }
      if (b.dataset.act === "reinit") { reinit = !reinit; b.setAttribute("aria-pressed", String(reinit)); reset(); }
      if (b.dataset.act === "reset") reset();
      if (b.dataset.act === "play") { if (playing) { playing = false; play.textContent = "Play"; return; } if (controls && done === "settled" && F.k < 3000) { done = false; more = true; } else if (done) reset(); playing = true; play.textContent = "Pause"; raf = requestAnimationFrame(tick); }
    });
    if (epsIn) { epsIn.addEventListener("input", () => (epsIn.nextElementSibling.textContent = (+epsIn.value).toFixed(2))); epsIn.addEventListener("change", reset); }
    ci.addEventListener("click", (e) => {
      if (!SCENES[key].seed) return;
      const r = ci.getBoundingClientRect(), [gx, gy] = G();
      seed = [gx + (e.clientX - r.left) / r.width * 360, gy + (e.clientY - r.top) / r.height * 202, SCENES[key].seed[2]]; reset();
    });
    surf.onview = () => { if (!playing) draw(); };
    note.textContent = "Computing the stopping factor…";
    setTimeout(reset, 20);
  }
  Object.assign(window.LSKit, { runner, SCENES, sceneData, boxPhi });
  const mount = () => document.querySelectorAll('[data-lab="ls-run"]:not([data-on])').forEach((r) => { r.dataset.on = 1; runner(r); });
  window.LSKit.mount = mount;
  mount();
})();
