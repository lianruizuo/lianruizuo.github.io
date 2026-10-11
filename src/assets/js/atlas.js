// Atlas pages: the section rail on node pages, and courses on the map.
(() => {
  // ---- rail: built from the node's own section headings, so each node can choose its sections
  const rail = document.querySelector(".arc-rail ol");
  let onScroll = null;
  const buildRail = () => {
    const heads = [...document.querySelectorAll(".node-prose h2[id]")];
    if (!rail || !heads.length) return;
    rail.innerHTML = heads.map((h) => `<li><a href="#${h.id}" data-arc="${h.id}">${h.textContent.trim()}</a></li>`).join("");
    const links = [...rail.querySelectorAll("a")];
    if (onScroll) removeEventListener("scroll", onScroll);
    onScroll = () => {
      let cur = heads[0].id;
      for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.3) cur = h.id;
      links.forEach((a) => a.toggleAttribute("aria-current", a.dataset.arc === cur));
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  };
  buildRail();
  document.addEventListener("lecture:open", buildRail); // a locked lecture adds its sections once opened

  // ---- courses: a course pulls its methods into teaching order (down) while keeping their year (across).
  // Several courses can be shown at once; each gets its own stretch of rows and its own color.
  const smooth = (P) => {
    if (!P.length) return "";
    let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, t = 6;
      const c1 = [p1[0] + (p2[0] - p0[0]) / t, p1[1] + (p2[1] - p0[1]) / t], c2 = [p2[0] - (p3[0] - p1[0]) / t, p2[1] - (p3[1] - p1[1]) / t];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  };
  document.querySelectorAll("[data-amap]").forEach((fig) => {
    const all = fig.querySelector('[data-route=""]');
    const chips = [...fig.querySelectorAll(".chip-course")];
    const nodes = [...fig.querySelectorAll(".am-node")];
    const courses = JSON.parse(fig.dataset.courses || "[]");
    const top = +fig.dataset.top, plotH = +fig.dataset.plotH;
    const hint = fig.querySelector("[data-hint]"), hint0 = hint && hint.textContent;
    const on = new Set();
    const render = () => {
      const active = courses.filter((c) => on.has(c.slug));
      all.setAttribute("aria-pressed", String(!active.length));
      chips.forEach((b) => b.setAttribute("aria-pressed", String(on.has(b.dataset.route))));
      fig.classList.toggle("routing", active.length > 0);
      // rows: each active course in turn, one blank row between courses
      const rows = active.reduce((a, c) => a + c.n, 0) + Math.max(0, active.length - 1);
      const step = rows > 1 ? plotH / (rows - 1) : 0;
      const place = {}; let row = 0;
      for (const c of active) {
        for (const g of nodes) { const i = g.getAttribute(`data-r-${c.slug}`); if (i && !place[g.dataset.id]) place[g.dataset.id] = { c, i: +i, x: +g.dataset.x, y: top + (row + +i - 1) * step }; }
        row += c.n + 1;
      }
      for (const g of nodes) {
        const p = place[g.dataset.id];
        g.style.transform = `translate(${g.dataset.x}px,${p ? p.y : g.dataset.y}px)`;
        g.classList.toggle("on", !!p);
        g.classList.remove("rc0", "rc1", "rc2", "rc3");
        if (p) g.classList.add(`rc${p.c.k % 4}`);
        g.querySelector(".am-num text").textContent = p ? p.i : "";
      }
      for (const c of courses) {
        const path = fig.querySelector(`[data-route-path="${c.slug}"]`);
        const pts = Object.values(place).filter((p) => p.c === c).sort((a, b) => a.i - b.i).map((p) => [p.x, p.y]);
        if (active.includes(c)) path.setAttribute("d", smooth(pts));
        path.classList.toggle("shown", active.includes(c));
      }
      if (hint) hint.textContent = active.length ? "Down: the order we meet them in the course. Across: the year each idea appeared." : hint0;
    };
    all.addEventListener("click", () => { on.clear(); render(); });
    chips.forEach((b) => b.addEventListener("click", () => { on.has(b.dataset.route) ? on.delete(b.dataset.route) : on.add(b.dataset.route); render(); }));
    // on a narrow screen the map scrolls sideways; open it on the first written method
    const sc = fig.querySelector(".amap-scroll"), w = fig.querySelector(".am-node.written");
    if (sc && w && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = w.getBoundingClientRect().left - sc.getBoundingClientRect().left - 24;
  });
})();
