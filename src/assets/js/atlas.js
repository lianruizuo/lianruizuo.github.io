// Atlas pages: the section rail on node pages, and courses on the map.
(() => {
  // ---- rail: built from the node's own section headings, so each node can choose its sections
  const rail = document.querySelector(".arc-rail ol");
  const heads = [...document.querySelectorAll(".node-prose > h2[id]")];
  if (rail && heads.length) {
    rail.innerHTML = heads.map((h) => `<li><a href="#${h.id}" data-arc="${h.id}">${h.textContent.trim()}</a></li>`).join("");
    const links = [...rail.querySelectorAll("a")];
    const onScroll = () => {
      let cur = heads[0].id;
      for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.3) cur = h.id;
      links.forEach((a) => a.toggleAttribute("aria-current", a.dataset.arc === cur));
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---- courses: a course pulls its methods into teaching order (down) while keeping their year (across)
  document.querySelectorAll("[data-amap]").forEach((fig) => {
    const buttons = [...fig.querySelectorAll("[data-route]")];
    const nodes = [...fig.querySelectorAll(".am-node")];
    const paths = [...fig.querySelectorAll("[data-route-path]")];
    const hint = fig.querySelector("[data-hint]"), hint0 = hint && hint.textContent;
    const show = (id) => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.route === id)));
      fig.classList.toggle("routing", !!id);
      for (const g of nodes) {
        const at = id && g.getAttribute(`data-${id}`);
        const [num, y] = at ? at.split(",") : [null, g.dataset.y];
        g.style.transform = `translate(${g.dataset.x}px,${y}px)`;
        g.classList.toggle("on", !!at);
        g.querySelector(".am-num text").textContent = num || "";
      }
      paths.forEach((p) => p.classList.toggle("shown", p.dataset.routePath === id));
      if (hint) hint.textContent = id ? "Down: the order we meet them in the course. Across: the year each idea appeared." : hint0;
    };
    buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.route)));
    // on a narrow screen the map scrolls sideways; open it on the first written method
    const sc = fig.querySelector(".amap-scroll"), w = fig.querySelector(".am-node.written");
    if (sc && w && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = w.getBoundingClientRect().left - sc.getBoundingClientRect().left - 24;
  });
})();
