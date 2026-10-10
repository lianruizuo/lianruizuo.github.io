// Otsu, as an instrument.
//
// One engine, three widgets:
//   <div data-lab="otsu-sees">      the image, its histogram, and a shuffle button
//   <div data-lab="otsu-bench">     a world you can push past its assumptions, an implementation you can
//                                   swap for a plausible wrong one, live tests, and the error ledger
//   <div data-lab="otsu-diagnose">  four wrong answers; say where each error lives
//
// The ledger splits the error against a known truth into four layers:
//   code      = error(what the code returned)   - error(what the math gives)
//   search    = error(what the math gives)      - error(the criterion's optimum)     (0: Otsu tries every k)
//   criterion = error(the criterion's optimum)  - error(the best threshold there is)
//   reach     = error(the best threshold there is)
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
    small:   { name: "Small object",        frac: 0.03, contrast: 90, noise: 25, ratio: 1,   bias: 0,   note: "The object covers about 3% of the image." },
    spread:  { name: "Unequal spread",      frac: 0.30, contrast: 90, noise: 15, ratio: 6.5, bias: 0,   note: "A tight background and a widely spread object." },
    light:   { name: "Uneven lighting",     frac: 0.30, contrast: 90, noise: 15, ratio: 1,   bias: 0.9, note: "Brightness drifts from left to right." },
    overlap: { name: "Overlapping classes", frac: 0.30, contrast: 26, noise: 22, ratio: 1,   bias: 0,   note: "The two classes share most of their gray levels." },
  };
  const IMPLS = {
    faithful: { name: "Faithful",           note: "The implementation on this page." },
    argmax:   { name: "Plain argmax",       note: "Skips the effective range and calls np.argmax; NaN from empty classes wins." },
    offbyone: { name: "C₀ = {i < k}",       note: "Scores the split at k − 1 and reports it as k." },
    cast:     { name: "12-bit cast",        note: "The scanner’s 12-bit values reach Otsu through astype(np.uint8), which wraps." },
  };

  // ------------------------------------------------------------------ Otsu and friends
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
  function otsuK(n, impl = "faithful") {
    const { s, N0, N } = sigmaB(n);
    if (impl === "argmax") {                 // np.argmax: the first NaN, if there is one, counts as the largest
      for (let k = 0; k < L; k++) if (s[k] !== s[k]) return k;
      return nanargmax(s);
    }
    const f = Float64Array.from(s, (v, k) => (N0[k] === 0 || N0[k] === N ? NaN : v));
    if (impl === "offbyone") { const g = new Float64Array(L).fill(NaN); for (let k = 1; k < L; k++) g[k] = f[k - 1]; return nanargmax(g); }
    return nanargmax(f);
  }
  const to12 = (img) => Uint16Array.from(img, (v) => Math.round(v * 4095 / 255));
  const to8 = (raw, impl) => Uint8Array.from(raw, (v) => (impl === "cast" ? v & 255 : Math.round(v * 255 / 4095)));
  function errorCurve(img, truth) {           // error of "img > k" against truth, for every k
    const n0 = new Float64Array(L), n1 = new Float64Array(L);
    for (let j = 0; j < img.length; j++) (truth[j] ? n1 : n0)[img[j]]++;
    const e = new Float64Array(L); let fp = 0, fn = 0; for (let i = 0; i < L; i++) fp += n0[i];
    for (let k = 0; k < L; k++) { fp -= n0[k]; fn += n1[k]; e[k] = (fp + fn) / img.length; }
    return { e, n0, n1 };
  }

  // ------------------------------------------------------------------ the tests (fixed inputs: they test the code, not the world)
  const CLEAN = world({ ...WORLDS.clean, seed: 3 });
  function bruteForce(n) {                   // argmin of sigma_W^2 from class variances, the slow way
    let best = -1, bv = Infinity;
    for (let k = 0; k < L - 1; k++) {
      let c0 = 0, s0 = 0, q0 = 0, c1 = 0, s1 = 0, q1 = 0;
      for (let i = 0; i < L; i++) { const w = n[i]; if (!w) continue; if (i <= k) { c0 += w; s0 += w * i; q0 += w * i * i; } else { c1 += w; s1 += w * i; q1 += w * i * i; } }
      if (!c0 || !c1) continue;
      const v = (q0 - s0 * s0 / c0) + (q1 - s1 * s1 / c1);
      if (v < bv - 1e-9) { bv = v; best = k; }
    }
    return best;
  }
  const TESTS = [
    { id: "definition", name: "Matches the definition", run: (impl) => otsuK(hist(CLEAN.img), impl === "cast" ? "faithful" : impl) === bruteForce(hist(CLEAN.img)) },
    { id: "shift", name: "Shifts with the intensities", run: (impl) => {
        const f = impl === "cast" ? "faithful" : impl, n = hist(CLEAN.img), m = new Float64Array(L);
        for (let i = 0; i + 20 < L; i++) m[i + 20] = n[i];
        return otsuK(m, f) === otsuK(n, f) + 20; } },
    { id: "spikes", name: "Separates two spikes", run: (impl) => {
        const n = new Float64Array(L); n[50] = 100; n[200] = 300; const k = otsuK(n, impl === "cast" ? "faithful" : impl); return k >= 50 && k < 200; } },
    { id: "e2e", name: "Whole pipeline, clean case", run: (impl) => {
        const seen = to8(to12(CLEAN.img), impl), k = otsuK(hist(seen), impl === "cast" ? "faithful" : impl);
        let wrong = 0; for (let j = 0; j < seen.length; j++) wrong += (seen[j] > k) !== !!CLEAN.truth[j];
        return wrong / seen.length < 0.02; } },
  ];
  const testCache = {};
  const testsFor = (impl) => (testCache[impl] ||= TESTS.map((t) => ({ ...t, pass: t.run(impl) })));

  // ------------------------------------------------------------------ the ledger
  function ledger(P, impl) {
    const { img, truth } = world(P);
    const seen = to8(to12(img), impl);
    const kGot = otsuK(hist(seen), impl === "cast" ? "faithful" : impl);
    let wrong = 0; for (let j = 0; j < seen.length; j++) wrong += (seen[j] > kGot) !== !!truth[j];
    const errGot = wrong / seen.length;
    const n = hist(img), kMath = otsuK(n), { e, n0, n1 } = errorCurve(img, truth);
    let kBest = 0; for (let k = 1; k < L; k++) if (e[k] < e[kBest] - 1e-12) kBest = k;
    const errMath = e[kMath], errBest = e[kBest];
    const tests = testsFor(impl);
    const sb = sigmaB(hist(seen));
    return { img, truth, seen, kGot, kMath, kBest, errGot, errMath, errBest, n: hist(seen), n0, n1, sb, tests,
      gaps: { code: errGot - errMath, search: 0, criterion: errMath - errBest, reach: errBest },
      eta: sb.s[kGot] === sb.s[kGot] ? sb.s[kGot] / sb.sT : NaN };
  }
  function verdict(Lg) {
    const failing = Lg.tests.filter((t) => !t.pass).length, g = Lg.gaps, tot = Lg.errGot;
    if (failing && g.code > 0.01) return { layer: "code", text: `Mostly code. ${failing} of ${Lg.tests.length} tests fail, and the bug costs ${pp(g.code)} of error.` };
    if (failing && g.code < -0.01) return { layer: "code", text: `Right for the wrong reason. ${failing === 1 ? "One test fails" : failing + " tests fail"}, and on this image the bug happens to improve the answer by ${pp(-g.code)}. It will not be so lucky on the next one.` };
    if (failing) return { layer: "code", text: `A bug that has not bitten yet. ${failing === 1 ? "One test fails" : failing + " tests fail"}, but on this image the answer barely changes.` };
    if (tot < 0.02) return { layer: null, text: "Inside the boundary. The code is right and so is the answer." };
    if (g.criterion > 0.7 * (g.criterion + g.reach)) return { layer: "criterion", text: `Mostly the criterion. The tests pass and k* is Otsu’s true optimum, yet the best threshold would cut the error to ${pc(g.reach)}.` };
    if (g.reach > 0.7 * (g.criterion + g.reach)) return { layer: "reach", text: `Mostly reach. Even the best threshold there is gets ${pc(g.reach)} wrong. No criterion can fix this; the method has to see more.` };
    return { layer: "both", text: `Both boundaries at once: ${pp(g.criterion)} from the criterion, ${pc(g.reach)} that no threshold can avoid.` };
  }
  const pc = (x) => `${(x * 100).toFixed(1)}%`;
  const pp = (x) => `${(x * 100).toFixed(1)} points`;

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

  // ------------------------------------------------------------------ the ledger panel (shared by bench and diagnose)
  const LAYERS = [["code", "Code", "what the code returned vs what the math gives"], ["search", "Search", "the math vs its optimum"], ["criterion", "Criterion", "the criterion’s optimum vs the best threshold there is"], ["reach", "Reach", "what even the best threshold gets wrong"]];
  function ledgerHTML(Lg, opts = {}) {
    const g = Lg.gaps, tot = Math.max(Lg.errGot, 1e-9);
    const seg = LAYERS.map(([id]) => { const v = g[id] >= 0.0005 ? g[id] : 0; return v > 0 ? `<span class="lg-seg layer-bg-${id}" style="flex:${v / tot}"></span>` : ""; }).join("");
    const rows = LAYERS.map(([id, name, w]) => {
      let what = w;
      let val = Math.abs(g[id]) < 0.0005 ? "0" : (g[id] < 0 ? "−" : "") + pc(Math.abs(g[id]));
      if (id === "search") what = "the math vs its optimum; always 0 here, because Otsu tries every k";
      let extra = "";
      if (id === "code") extra = `<span class="tests" aria-label="Tests">${Lg.tests.map((t) => `<span class="t ${t.pass ? "ok" : "no"}" title="${t.name}: ${t.pass ? "passes" : "fails"}">${t.pass ? "✓" : "✗"}</span>`).join("")}</span>`;
      return `<li class="lg-row"><span class="layer-chip layer-${id}">${name}</span>${extra}<span class="lg-val">${val}</span><span class="lg-what">${what}</span></li>`;
    }).join("");
    return `<div class="lg-total"><span><b>Error</b> ${pc(Lg.errGot)}</span><span class="lg-bar" aria-hidden="true">${seg}</span></div><ol class="lg-rows">${rows}</ol>` +
      (opts.verdict === false ? "" : `<p class="lg-verdict">${verdict(Lg).text}</p>`);
  }

  // ------------------------------------------------------------------ widget: the bench
  const SLIDERS = [["frac", "Object size", 0, 0.6, 0.01, (v) => `${Math.round(v * 100)}%`], ["contrast", "Contrast", 0, 160, 1, (v) => v],
    ["noise", "Noise", 1, 40, 1, (v) => v], ["ratio", "Spread ratio", 1, 8, 0.1, (v) => `${(+v).toFixed(1)}×`], ["bias", "Lighting drift", 0, 1.2, 0.01, (v) => `${Math.round(v * 100)}%`]];
  function bench(root) {
    let wkey = "clean", P = { ...WORLDS.clean, seed: 7 }, impl = "faithful", showTruth = true;
    root.innerHTML = `
      <div class="bench-controls">
        <div class="bench-group"><span class="bench-label">World</span><div class="chips">${Object.entries(WORLDS).map(([id, w]) => `<button type="button" class="chip" data-world="${id}">${w.name}</button>`).join("")}</div>
          <details class="lab-sliders"><summary>Adjust the world</summary><div class="sliders">${SLIDERS.map(([id, lab, lo, hi, st]) => `<label><span>${lab} <output data-o="${id}"></output></span><input type="range" min="${lo}" max="${hi}" step="${st}" data-s="${id}"></label>`).join("")}</div></details></div>
        <div class="bench-group"><span class="bench-label">Implementation</span><div class="chips">${Object.entries(IMPLS).map(([id, m]) => `<button type="button" class="chip" data-impl="${id}">${m.name}</button>`).join("")}</div></div>
        <p class="bench-note" aria-live="polite"></p>
      </div>
      <div class="bench-main">
        <div class="lab-stage">${canvasPair()}<figure class="lab-hist"><canvas data-c="hist"></canvas><figcaption><span class="key key-t0"></span><span class="key key-t1"></span>true classes <span class="key key-sb"></span>σ<sub>B</sub>² <span class="key key-k"></span>returned k</figcaption></figure></div>
        <div class="bench-ledger" aria-live="polite"></div>
      </div>`;
    const $ = (s) => root.querySelector(s), cI = $('[data-c="img"]'), cS = $('[data-c="seg"]'), cH = $('[data-c="hist"]');
    let hOpts = null;
    function draw() {
      const Lg = ledger(P, impl);
      root.querySelectorAll("[data-world]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.world === wkey)));
      root.querySelectorAll("[data-impl]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.impl === impl)));
      SLIDERS.forEach(([id, , , , , f]) => { const s = $(`[data-s="${id}"]`); s.value = P[id]; $(`[data-o="${id}"]`).textContent = f(P[id]); });
      $(".bench-note").innerHTML = `${wkey ? WORLDS[wkey].note : "Your own world."} <span class="impl-note">${IMPLS[impl].note}</span>`;
      paintImage(cI, Lg.seen); paintSplit(cS, Lg.seen, Lg.kGot, Lg.truth, showTruth);
      $('[data-cap="img"]').textContent = impl === "cast" ? "What the code receives" : "Image";
      $('[data-cap="seg"]').innerHTML = `Split at <i>k</i> = ${Lg.kGot}; orange is wrong`;
      const split = impl === "cast" ? null : [Lg.n0, Lg.n1];
      hOpts = { n: Lg.n, split, s: Lg.sb.s, k: Lg.kGot, best: impl === "cast" ? null : Lg.kBest };
      paintHist(cH, hOpts);
      $(".bench-ledger").innerHTML = ledgerHTML(Lg);
    }
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.world) { wkey = b.dataset.world; P = { ...WORLDS[wkey], seed: 7 }; draw(); }
      if (b.dataset.impl) { impl = b.dataset.impl; draw(); }
    });
    root.addEventListener("input", (e) => { const id = e.target.dataset && e.target.dataset.s; if (!id) return; P[id] = +e.target.value; wkey = null; draw(); });
    onResize(cH, () => hOpts && paintHist(cH, hOpts));
    draw();
  }

  // ------------------------------------------------------------------ widget: diagnose
  const CASES = [
    { world: "small", impl: "faithful", answer: "criterion",
      why: "The tests pass, and k* really is the maximum of Otsu’s score. The score prefers two classes of similar size, so cutting the background in half beats isolating a small object. A different threshold would be nearly perfect." },
    { world: "overlap", impl: "faithful", answer: "reach",
      why: "Even the best threshold there is gets this wrong, because the two classes share most of their gray levels. No criterion can repair that. Only more information can: neighbors, a second contrast, a better scan." },
    { world: "clean", impl: "argmax", answer: "code",
      why: "A clean image, and the code returns k = 0. The empty class at level 0 gives 0/0 = NaN, and np.argmax treats NaN as the largest value. All four tests fail. The method never got a chance." },
    { world: "small", impl: "argmax", answer: "code",
      why: "Nearly right, and the code is broken: this is the plain-argmax version again. Here the first NaN sits at the top of the histogram, so it returns k = 255 and calls everything background. On an image that is 97% background, that is almost right. All four tests fail; the next image will not be so kind." },
  ];
  function diagnose(root) {
    let i = 0, score = 0, answered = false;
    const prompt = ["This answer is wrong. Where does the error live?", "Wrong again, differently. Where does this error live?", "A clean image this time. Where does the error live?", "Nearly right. Is anything wrong, and if so, where?"];
    function render() {
      const c = CASES[i], Lg = ledger({ ...WORLDS[c.world], seed: 7 }, c.impl);
      root.innerHTML = `<div class="dg-head"><span class="dg-count">Case ${i + 1} of ${CASES.length}</span><span class="dg-score">${score} right</span></div>
        <div class="dg-body"><div class="lab-stage lab-stage-2">${canvasPair()}</div>
        <div class="dg-side"><p class="dg-q">${prompt[i]}</p><p class="dg-facts"><span>Otsu returned <b>k = ${Lg.kGot}</b></span><span>Error against the truth <b>${pc(Lg.errGot)}</b></span></p>
        <div class="dg-choices" role="group" aria-label="Where does the error live?">${LAYERS.map(([id, name]) => `<button type="button" class="dg-choice layer-${id}" data-pick="${id}"><span class="layer-chip layer-${id}">${name}</span></button>`).join("")}</div>
        <div class="dg-reveal" aria-live="polite"></div></div></div>`;
      const $ = (s) => root.querySelector(s);
      paintImage($('[data-c="img"]'), Lg.seen); paintSplit($('[data-c="seg"]'), Lg.seen, Lg.kGot, Lg.truth, false);
      $('[data-cap="img"]').textContent = "Image"; $('[data-cap="seg"]').textContent = "Otsu’s split";
      answered = false;
      root.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
        if (answered) return; answered = true;
        const ok = b.dataset.pick === c.answer; if (ok) score++;
        root.querySelectorAll("[data-pick]").forEach((x) => { x.disabled = true; x.classList.toggle("is-answer", x.dataset.pick === c.answer); x.classList.toggle("is-wrong", x === b && !ok); });
        paintSplit($('[data-c="seg"]'), Lg.seen, Lg.kGot, Lg.truth, true); $('[data-cap="seg"]').textContent = "Otsu’s split; orange is wrong";
        $(".dg-score").textContent = `${score} right`;
        $(".dg-reveal").innerHTML = `<p class="dg-verdict">${ok ? "Right." : "Not quite."} ${c.why}</p>${ledgerHTML(Lg, { verdict: false })}
          <button type="button" class="chip chip-strong" data-next>${i + 1 < CASES.length ? "Next case" : "Start over"}</button>`;
        $("[data-next]").addEventListener("click", () => { if (i + 1 < CASES.length) i++; else { i = 0; score = 0; } render(); });
      }));
    }
    render();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
  }

  window.__otsuLab = { WORLDS, IMPLS, ledger, verdict, testsFor };
  document.querySelectorAll('[data-lab="otsu-sees"]').forEach(sees);
  document.querySelectorAll('[data-lab="otsu-bench"]').forEach(bench);
  document.querySelectorAll('[data-lab="otsu-diagnose"]').forEach(diagnose);
})();
