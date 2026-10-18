// Hover (or focus) a shaded country on the Visitors map to see how many visitors came from it.
(() => {
  const box = document.querySelector("[data-vz]");
  if (!box) return;
  const tip = box.querySelector(".vz-tip");
  const t = box.querySelector(".t");
  const fmt = new Intl.NumberFormat("en-US");
  let on = null;

  function show(el, x, y) {
    const n = +el.dataset.n;
    tip.textContent = `${el.dataset.name} · ${fmt.format(n)} ${n === 1 ? "visitor" : "visitors"}`;
    tip.hidden = false;
    const r = t.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.min(Math.max(x - r.left - w / 2, 0), r.width - w);
    tip.style.left = `${left}px`;
    tip.style.top = `${y - r.top - tip.offsetHeight - 12}px`;
    if (on && on !== el) on.classList.remove("is-on");
    el.classList.add("is-on");
    box.classList.add("has-on");
    on = el;
  }
  function hide() {
    tip.hidden = true;
    if (on) on.classList.remove("is-on");
    box.classList.remove("has-on");
    on = null;
  }

  box.addEventListener("pointermove", (e) => {
    const el = e.target.closest(".vz-place");
    if (el) show(el, e.clientX, e.clientY); else if (on) hide();
  });
  box.addEventListener("pointerleave", hide);
  box.addEventListener("focusin", (e) => {
    const el = e.target.closest(".vz-place");
    if (!el) return;
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.top);
  });
  box.addEventListener("focusout", hide);
})();
