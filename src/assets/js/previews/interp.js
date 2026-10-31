// Image transformation and interpolation: the engine, and the public preview.
//
// The engine (window.IPKit) is shared with the lecture's own labs, which load after it. Conventions follow the notes:
//   x is the row (pointing down), y the column (pointing right), counted from 0 at the top-left pixel.
//   A transformation is a 3 x 3 matrix M acting on [x, y, 1]. Backward mapping: I_B(x_B) = I_A(M^-1 x_B).
//   Kernels: beta0 (nearest), beta1 (linear), beta2 (quadratic B-spline, coefficients solved with mirrored ends).
//   A point outside the input image gets the background value 0.
//
// Public widget:  <div data-lab="ip-rotate">   rotate an image by 30 degrees, again and again, with three kernels
(() => {
  // ------------------------------------------------------------------ images
  const Img = (h, w, data) => ({ h, w, data: data || new Float32Array(h * w) });
  const at = (im, x, y) => im.data[x * im.w + y];
  const copy = (im) => Img(im.h, im.w, new Float32Array(im.data));

  // the (modified) Shepp-Logan phantom: ellipses [intensity, a, b, x0, y0, angle]
  function phantom(n = 128) {
    const E = [[1, .69, .92, 0, 0, 0], [-.8, .6624, .874, 0, -.0184, 0], [-.2, .11, .31, .22, 0, -18], [-.2, .16, .41, -.22, 0, 18],
      [.1, .21, .25, 0, .35, 0], [.1, .046, .046, 0, .1, 0], [.1, .046, .046, 0, -.1, 0], [.1, .046, .023, -.08, -.605, 0],
      [.1, .023, .023, 0, -.606, 0], [.1, .023, .046, .06, -.605, 0]];
    const im = Img(n, n), c = (n - 1) / 2;
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const X = (q - c) / c, Y = -(r - c) / c; let v = 0;
      for (const [A, a, b, x0, y0, phi] of E) { const p = phi * Math.PI / 180, cs = Math.cos(p), sn = Math.sin(p);
        const u = (X - x0) * cs + (Y - y0) * sn, w = -(X - x0) * sn + (Y - y0) * cs; if ((u / a) ** 2 + (w / b) ** 2 <= 1) v += A; }
      im.data[r * n + q] = v;
    }
    return im;
  }

  // ------------------------------------------------------------------ 3 x 3 matrices on [x, y, 1]
  const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
  const inv = (M) => { const [a, b, c] = M[0], [d, e, f] = M[1], det = a * e - b * d;
    return [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det], [0, 0, 1]]; };
  const rot = (deg) => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  const shift = (tx, ty) => [[1, 0, tx], [0, 1, ty], [0, 0, 1]];
  const scale = (sx, sy) => [[sx, 0, 0], [0, sy, 0], [0, 0, 1]];
  const shear = (h) => [[1, h, 0], [0, 1, 0], [0, 0, 1]];
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // about the image center c: shift by -c, apply M, shift back by +c
  const aboutCenter = (M, h, w) => mul(shift((h - 1) / 2, (w - 1) / 2), mul(M, shift(-(h - 1) / 2, -(w - 1) / 2)));
  const apply = (M, x, y) => [M[0][0] * x + M[0][1] * y + M[0][2], M[1][0] * x + M[1][1] * y + M[1][2]];

  // ------------------------------------------------------------------ kernels and coefficients
  const beta0 = (t) => (t > -0.5 && t <= 0.5 ? 1 : 0);
  const beta1 = (t) => Math.max(0, 1 - Math.abs(t));
  const beta2 = (t) => { const a = Math.abs(t); return a <= 0.5 ? 0.75 - a * a : a <= 1.5 ? 0.5 * (a - 1.5) ** 2 : 0; };
  const KERNEL = [beta0, beta1, beta2];
  // index k reflected into 0..n-1 about the end samples: -1 -> 1, n -> n-2
  const mirror = (k, n) => { if (n === 1) return 0; const p = 2 * (n - 1); k = ((k % p) + p) % p; return k < n ? k : p - k; };
  // solve (c[n-1] + 6 c[n] + c[n+1]) / 8 = f[n], mirrored ends, by the Thomas algorithm
  function coef1(f) {
    const n = f.length; if (n === 1) return Float64Array.from(f);
    const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = Float64Array.from(f, (v) => 8 * v);
    for (let i = 0; i < n; i++) { a[i] = 1; b[i] = 6; c[i] = 1; }
    c[0] = 2; a[n - 1] = 2;                               // c[-1] = c[1] and c[N] = c[N-2]
    for (let i = 1; i < n; i++) { const m = a[i] / b[i - 1]; b[i] -= m * c[i - 1]; d[i] -= m * d[i - 1]; }
    const x = new Float64Array(n); x[n - 1] = d[n - 1] / b[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = (d[i] - c[i] * x[i + 1]) / b[i];
    return x;
  }
  function coefficients(im) {                              // along rows, then along columns
    const out = copy(im), { h, w } = im;
    for (let r = 0; r < h; r++) { const v = coef1(out.data.subarray(r * w, r * w + w)); for (let q = 0; q < w; q++) out.data[r * w + q] = v[q]; }
    for (let q = 0; q < w; q++) { const col = new Float64Array(h); for (let r = 0; r < h; r++) col[r] = out.data[r * w + q]; const v = coef1(col); for (let r = 0; r < h; r++) out.data[r * w + q] = v[r]; }
    return out;
  }
  // sum_k sum_l c[k, l] beta(x - k) beta(y - l)
  function sample(c, x, y, order) {
    const beta = KERNEL[order], s = order === 2 ? 1 : 0, k0 = Math.floor(x), l0 = Math.floor(y); let v = 0;
    for (let k = k0 - s; k <= k0 + 1 + s; k++) { const wx = beta(x - k); if (!wx) continue;
      for (let l = l0 - s; l <= l0 + 1 + s; l++) { const wy = beta(y - l); if (wy) v += wx * wy * c.data[mirror(k, c.h) * c.w + mirror(l, c.w)]; } }
    return v;
  }
  // backward mapping: every output pixel takes the input interpolated at M^-1 x_B (0 outside the input)
  function warp(im, M, order, { coef = null, out = null } = {}) {
    const Mi = inv(M), c = order === 2 ? coef || coefficients(im) : im, o = out || Img(im.h, im.w);
    for (let x = 0; x < o.h; x++) for (let y = 0; y < o.w; y++) {
      const [xa, ya] = apply(Mi, x, y);
      o.data[x * o.w + y] = xa < -0.5 || xa > im.h - 0.5 || ya < -0.5 || ya > im.w - 0.5 ? 0 : sample(c, xa, ya, order);
    }
    return o;
  }

  // ------------------------------------------------------------------ drawing
  const css = (v, f) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; } catch { return f; } };
  // grey levels between lo and hi; values outside are clipped
  function paint(canvas, im, { lo = 0, hi = 1 } = {}) {
    canvas.width = im.w; canvas.height = im.h;
    const ctx = canvas.getContext("2d"), id = ctx.createImageData(im.w, im.h);
    for (let i = 0; i < im.h * im.w; i++) { const g = Math.round(255 * Math.min(1, Math.max(0, (im.data[i] - lo) / (hi - lo)))); id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = g; id.data[4 * i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
  }
  function rmse(a, b, mask) { let s = 0, n = 0; for (let i = 0; i < a.data.length; i++) if (!mask || mask[i]) { s += (a.data[i] - b.data[i]) ** 2; n++; } return Math.sqrt(s / n); }
  const disk = (n, r) => { const m = new Uint8Array(n * n), c = (n - 1) / 2; for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) m[x * n + y] = Math.hypot(x - c, y - c) < r ? 1 : 0; return m; };

  window.IPKit = { Img, at, copy, phantom, mul, inv, rot, shift, scale, shear, I3, aboutCenter, apply, beta0, beta1, beta2, KERNEL, mirror, coef1, coefficients, sample, warp, css, paint, rmse, disk };

  // ------------------------------------------------------------------ the public widget: rotate by 30 degrees, again and again
  const NAMES = ["Nearest pixel", "Straight lines", "Smooth curve"];
  function rotateWidget(root) {
    root.innerHTML = `<div class="lab-row snk-top"><span class="bench-label">Read between pixels by</span>
        ${NAMES.map((s, k) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${k === 1}">${s}</button>`).join("")}</div>
      <div class="ip-pair"><figure><canvas class="ip-canvas" role="img" aria-label="The original image"></canvas><figcaption class="km-cap">original</figcaption></figure>
        <figure><canvas class="ip-canvas" role="img" aria-label="The image after the rotations so far"></canvas><figcaption class="km-cap ip-cap-out"></figcaption></figure></div>
      <div class="lab-row"><button type="button" class="chip" data-act="one">Rotate 30°</button><button type="button" class="chip chip-strong" data-act="twelve">Rotate 30°, twelve times</button>
        <button type="button" class="chip" data-act="reset">Reset</button><span class="snk-k"></span></div>`;
    const [ca, cb] = root.querySelectorAll("canvas"), cap = root.querySelector(".ip-cap-out"), note = root.querySelector(".snk-k");
    const P = phantom(128), M = aboutCenter(rot(30), 128, 128), mask = disk(128, 60);
    let order = 1, cur = copy(P), n = 0, timer = 0;
    paint(ca, P, { hi: 0.6 });
    function show() {
      paint(cb, cur, { hi: 0.6 });
      cap.textContent = n ? `after ${n} × 30° = ${n * 30}°` : "not rotated yet";
      note.textContent = n === 12 ? `A full turn: this should equal the original. Error ${rmse(cur, P, mask).toFixed(3)}` : n ? `error so far ${rmse(cur, P, mask).toFixed(3)}` : "";
    }
    const step = () => { cur = warp(cur, M, order); n++; show(); };
    function reset() { clearTimeout(timer); cur = copy(P); n = 0; show(); }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.k) { order = +b.dataset.k; root.querySelectorAll("[data-k]").forEach((q) => q.setAttribute("aria-pressed", String(q === b))); reset(); }
      if (b.dataset.act === "reset") reset();
      if (b.dataset.act === "one") { clearTimeout(timer); if (n >= 12) reset(); step(); }
      if (b.dataset.act === "twelve") { reset(); const go = () => { step(); if (n < 12) timer = setTimeout(go, 140); }; go(); }
    });
    show();
  }
  window.IPKit.rotateWidget = rotateWidget;
  const mount = () => document.querySelectorAll('[data-lab="ip-rotate"]:not([data-on])').forEach((r) => { r.dataset.on = 1; rotateWidget(r); });
  window.IPKit.mount = mount;
  mount();
})();
