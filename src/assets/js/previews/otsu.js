// The public preview for the Otsu lecture: one widget, readable without the course password.
// It repeats only the parts of private/labs/otsu.js that the widget needs.
//   <div data-lab="otsu-preview">   the image, its histogram, and a shuffle button
(() => {
  const L = 256, SIZE = 128;

  // ------------------------------------------------------------------ worlds
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function world(P) {
    const r = rng(P.seed || 7);
    const gauss = () => { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const mu0 = 128 - P.contrast / 2, mu1 = 128 + P.contrast / 2;
    const s0 = P.noise / Math.sqrt(P.ratio), s1 = P.noise * Math.sqrt(P.ratio);
    const R = Math.sqrt(P.frac / Math.PI);
    const img = new Uint8Array(SIZE * SIZE), truth = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE - 0.5, v = y / SIZE - 0.5, a = Math.atan2(v, u);
      const rr = R * (1 + 0.12 * Math.sin(3 * a + 0.6) + 0.06 * Math.sin(5 * a - 1.1));
      const obj = P.frac > 0 && u * u + v * v < rr * rr;
      let val = obj ? mu1 + s1 * gauss() : mu0 + s0 * gauss();
      val *= 1 + P.bias * u;
      img[y * SIZE + x] = Math.max(0, Math.min(255, Math.round(val)));
      truth[y * SIZE + x] = obj ? 1 : 0;
    }
    return { img, truth };
  }
  const WORLDS = {
    clean:   { name: "Clean",               frac: 0.30, contrast: 90, noise: 15, ratio: 1,   bias: 0,   note: "Two classes, equal spread, comparable size." },
  };

  const hist = (img) => { const n = new Float64Array(L); for (let j = 0; j < img.length; j++) n[img[j]]++; return n; };
  function sigmaB(n) {                       // sigma_B^2(k), with NaN where 0/0, as NumPy would give
    let N = 0; for (let i = 0; i < L; i++) N += n[i];
    let muT = 0; for (let i = 0; i < L; i++) muT += i * n[i] / N;
    const s = new Float64Array(L), N0 = new Float64Array(L);
    let om = 0, mu = 0, c = 0;
    for (let k = 0; k < L; k++) { om += n[k] / N; mu += k * n[k] / N; c += n[k]; N0[k] = c; s[k] = (muT * om - mu) ** 2 / (om * (1 - om)); }
    let sT = 0; for (let i = 0; i < L; i++) sT += (i - muT) ** 2 * n[i] / N;
    return { s, N0, N, sT };
  }
  const nanargmax = (a) => { let b = -1, bv = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] === a[i] && a[i] > bv) { bv = a[i]; b = i; } return b; };
  function otsuK(n) {
    const { s, N0, N } = sigmaB(n);
    return nanargmax(Float64Array.from(s, (v, k) => (N0[k] === 0 || N0[k] === N ? NaN : v)));
  }

  // ------------------------------------------------------------------ drawing helpers
  function colors() {
    const cs = getComputedStyle(document.documentElement), g = (n, d) => cs.getPropertyValue(n).trim() || d;
    return { ink: g("--ink", "#1b2029"), graphite: g("--graphite", "#5a6170"), hair: g("--hairline", "#d3d7d0"), accent: g("--accent", "#2f43a3"),
      code: g("--l-code", "#b5650d"), search: g("--l-search", "#8a4f7d"), criterion: g("--l-criterion", "#2f43a3"), reach: g("--l-reach", "#0f7f78") };
  }
  const rgb = (h) => { const v = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
  function paintImage(cv, img) {
    const x = cv.getContext("2d"), d = x.createImageData(SIZE, SIZE);
    for (let j = 0; j < img.length; j++) { const g = img[j]; d.data[4 * j] = d.data[4 * j + 1] = d.data[4 * j + 2] = g; d.data[4 * j + 3] = 255; }
    x.putImageData(d, 0, 0);
  }
  function paintSplit(cv, img, k, truth, showErr, order) {
    const C = colors(), err = rgb(C.code), x = cv.getContext("2d"), d = x.createImageData(SIZE, SIZE);
    for (let j = 0; j < img.length; j++) {
      const src = order ? order[j] : j, on = img[src] > k;
      let c = on ? [236, 238, 233] : [34, 38, 46];
      if (showErr && truth && on !== !!truth[src]) c = err;
      d.data.set([c[0], c[1], c[2], 255], 4 * j);
    }
    x.putImageData(d, 0, 0);
  }
  function paintHist(cv, o) {
    const C = colors(), dpr = Math.min(devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const h = cv.getContext("2d"); h.setTransform(dpr, 0, 0, dpr, 0, 0); h.clearRect(0, 0, W, H);
    const top = 16, bot = 18, ph = H - top - bot, X = (i) => (i + 0.5) / L * W;
    let nMax = 0; for (let i = 0; i < L; i++) nMax = Math.max(nMax, o.n[i]);
    const bars = (arr, col, a) => { h.globalAlpha = a; h.fillStyle = col; for (let i = 0; i < L; i++) if (arr[i]) { const bh = arr[i] / nMax * ph; h.fillRect(i / L * W, top + ph - bh, W / L + 0.4, bh); } };
    if (o.split) { bars(o.split[0], C.reach, 0.5); bars(o.split[1], C.code, 0.5); } else bars(o.n, C.graphite, 0.42);
    h.globalAlpha = 1;
    if (o.s) { let m = 0; for (let i = 0; i < L; i++) if (o.s[i] > m) m = o.s[i];
      h.strokeStyle = C.accent; h.lineWidth = 1.7; h.beginPath(); let pen = false;
      for (let i = 0; i < L; i++) { const v = o.s[i]; if (!(v >= 0) || !isFinite(v)) { pen = false; continue; } const y = top + ph - v / m * ph; pen ? h.lineTo(X(i), y) : h.moveTo(X(i), y); pen = true; }
      h.stroke(); }
    h.strokeStyle = C.hair; h.lineWidth = 1; h.beginPath(); h.moveTo(0, top + ph + 0.5); h.lineTo(W, top + ph + 0.5); h.stroke();
    h.font = '500 11px "Schibsted Grotesk", system-ui, sans-serif'; h.fillStyle = C.graphite; h.textBaseline = "top";
    h.textAlign = "left"; h.fillText("0", 0, top + ph + 4); h.textAlign = "right"; h.fillText("255", W, top + ph + 4);
    if (o.best != null) { h.setLineDash([4, 3]); h.strokeStyle = C.ink; h.lineWidth = 1.2; h.beginPath(); h.moveTo(X(o.best), top); h.lineTo(X(o.best), top + ph); h.stroke(); h.setLineDash([]);
      h.fillStyle = C.ink; h.textAlign = "center"; h.textBaseline = "bottom"; h.fillText("best", X(o.best), top - 2); }
    if (o.kStar != null) { h.fillStyle = C.accent; h.beginPath(); h.moveTo(X(o.kStar), top + ph + 1); h.lineTo(X(o.kStar) - 5, top + ph + 9); h.lineTo(X(o.kStar) + 5, top + ph + 9); h.fill(); }
    if (o.k != null) { h.strokeStyle = C.ink; h.lineWidth = 2; h.beginPath(); h.moveTo(X(o.k), top - 3); h.lineTo(X(o.k), top + ph); h.stroke(); h.fillStyle = C.ink; h.beginPath(); h.arc(X(o.k), top - 3, 3.6, 0, 7); h.fill(); }
  }
  // repaint a canvas only when its box really changes size (a full redraw can shift layout and re-trigger the observer)
  function onResize(cv, fn) {
    let w = cv.clientWidth, h = cv.clientHeight;
    new ResizeObserver(() => { if (cv.clientWidth === w && cv.clientHeight === h) return; w = cv.clientWidth; h = cv.clientHeight; fn(); }).observe(cv);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fn);
  }
  const canvasPair = () => `<figure><canvas width="${SIZE}" height="${SIZE}" data-c="img"></canvas><figcaption data-cap="img">Image</figcaption></figure>
    <figure><canvas width="${SIZE}" height="${SIZE}" data-c="seg"></canvas><figcaption data-cap="seg">Split</figcaption></figure>`;

  // ------------------------------------------------------------------ widget: what it sees
  function sees(root) {
    const { img, truth } = world({ ...WORLDS.clean, seed: 7 });
    const n = hist(img), sb = sigmaB(n), kStar = otsuK(n);
    let k = 70, order = null;
    root.innerHTML = `<div class="lab-stage">${canvasPair()}<figure class="lab-hist"><canvas data-c="hist" tabindex="0" aria-label="Histogram and the between-class variance. Drag, or use the arrow keys, to move the threshold k."></canvas>
      <figcaption><span class="key key-hist"></span>histogram <span class="key key-sb"></span>σ<sub>B</sub>²(<i>k</i>), the score of each split</figcaption></figure></div>
      <div class="lab-row"><button type="button" class="chip chip-strong" data-act="shuffle" aria-pressed="false">Shuffle the pixels</button><button type="button" class="chip" data-act="otsu">Move <i>k</i> to Otsu’s choice</button></div>
      <p class="lab-readout" aria-live="polite"></p>`;
    const $ = (s) => root.querySelector(s), cI = $('[data-c="img"]'), cS = $('[data-c="seg"]'), cH = $('[data-c="hist"]');
    function draw() {
      if (order) { const sh = new Uint8Array(img.length); for (let j = 0; j < img.length; j++) sh[j] = img[order[j]]; paintImage(cI, sh); }
      else paintImage(cI, img);
      paintSplit(cS, img, k, truth, false, order);
      paintHist(cH, { n, s: sb.s, k, kStar });
      $('[data-cap="img"]').textContent = order ? "Shuffled image" : "Image";
      $('[data-cap="seg"]').innerHTML = `Pixels above <i>k</i> = ${k}`;
      const sc = sb.s[k] === sb.s[k] ? (sb.s[k] / sb.sT).toFixed(3) : "undefined";
      $(".lab-readout").innerHTML = `<span><b>Score at k</b> ${sc}</span><span class="acc"><b>Otsu’s k*</b> ${kStar}</span>` +
        (order ? `<span class="note">Same histogram, same score, same k*. Otsu cannot tell these two images apart.</span>` : "");
    }
    const setX = (cx) => { const r = cH.getBoundingClientRect(); k = Math.max(0, Math.min(L - 1, Math.floor((cx - r.left) / r.width * L))); draw(); };
    cH.addEventListener("pointerdown", (e) => { cH.setPointerCapture(e.pointerId); setX(e.clientX); });
    cH.addEventListener("pointermove", (e) => e.buttons && setX(e.clientX));
    cH.addEventListener("keydown", (e) => { const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (!d) return; e.preventDefault(); k = Math.max(0, Math.min(L - 1, k + d * (e.shiftKey ? 10 : 1))); draw(); });
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.act === "otsu") { k = kStar; draw(); }
      if (b.dataset.act === "shuffle") {
        if (order) order = null;
        else { const r = rng(11); order = Uint32Array.from({ length: img.length }, (_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
        b.setAttribute("aria-pressed", String(!!order)); b.textContent = order ? "Put them back" : "Shuffle the pixels"; draw();
      }
    });
    onResize(cH, () => paintHist(cH, { n, s: sb.s, k, kStar }));
    draw();
  }

  document.querySelectorAll('[data-lab="otsu-preview"]').forEach(sees);
})();
