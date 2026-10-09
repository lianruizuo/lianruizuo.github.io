// Publication filters: kind (all / journal / conference / chapter), first author, mentored, text search.
(() => {
  const root = document.querySelector("[data-pubs]");
  if (!root) return;
  const items = [...root.querySelectorAll(".pub[data-kind]")];
  const groups = [...root.querySelectorAll(".year-group")];
  const kindBtns = [...document.querySelectorAll("[data-filter-kind]")];
  const flagBtns = [...document.querySelectorAll("[data-filter-flag]")];
  const search = document.querySelector("[data-filter-text]");
  const counter = document.querySelector("[data-count]");
  let kind = "all";
  const flags = new Set();

  function apply() {
    const q = (search?.value || "").trim().toLowerCase();
    let shown = 0;
    for (const el of items) {
      const ok = (kind === "all" || el.dataset.kind === kind)
        && [...flags].every((f) => el.dataset[f] === "1")
        && (!q || el.dataset.text.includes(q));
      el.hidden = !ok;
      if (ok) shown++;
    }
    for (const g of groups) g.hidden = !g.querySelector(".pub:not([hidden])");
    if (counter) counter.textContent = shown === 1 ? "1 paper" : `${shown} papers`;
  }

  kindBtns.forEach((b) => b.addEventListener("click", () => {
    kind = b.dataset.filterKind;
    kindBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply();
  }));
  flagBtns.forEach((b) => b.addEventListener("click", () => {
    const f = b.dataset.filterFlag;
    if (flags.has(f)) flags.delete(f); else flags.add(f);
    b.setAttribute("aria-pressed", String(flags.has(f)));
    apply();
  }));
  search?.addEventListener("input", apply);
  document.querySelector("[data-pubs-tools]")?.removeAttribute("hidden");
})();
