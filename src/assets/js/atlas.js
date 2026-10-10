// Atlas pages: the section rail on node pages, and course routes on the map.
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

  // ---- routes: show one course's path through the map
  document.querySelectorAll("[data-amap]").forEach((fig) => {
    const buttons = [...fig.querySelectorAll("[data-route]")];
    const show = (id) => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.route === id)));
      fig.querySelectorAll("[data-route-path]").forEach((g) => g.toggleAttribute("hidden", g.dataset.routePath !== id)); // SVG has no .hidden property
      fig.classList.toggle("routing", !!id);
    };
    buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.route)));
  });
})();
