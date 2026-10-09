// Reader traces at the end of lecture notes and journal entries.
//  - "This was useful": a one-click, anonymous mark, sent to GoatCounter as an event
//    named  useful/<page path>. Remembered in this browser so it is counted once.
//  - "Tell me who you are": an optional private note, sent to your inbox via Formspree.
// Nothing here is shown publicly.
(() => {
  const box = document.querySelector("[data-trace]");
  if (!box) return;
  const path = location.pathname;
  const key = "useful:" + path;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  const btn = box.querySelector("[data-useful]");
  const status = box.querySelector("[data-useful-status]");
  if (btn) {
    const done = () => { btn.disabled = true; btn.textContent = btn.dataset.doneLabel || "Marked as useful"; if (status) status.textContent = "Thank you for letting me know."; };
    if (store.get(key)) done();
    btn.addEventListener("click", () => {
      try {
        if (window.goatcounter && window.goatcounter.count) {
          window.goatcounter.count({ path: "useful" + path, title: document.title, event: true });
        }
      } catch {}
      store.set(key, "1");
      done();
    });
  }

  const form = box.querySelector("form[data-note]");
  if (form) {
    const out = form.querySelector("[data-note-status]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const send = form.querySelector("button[type=submit]");
      send.disabled = true; out.textContent = "Sending…";
      try {
        const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        out.textContent = "Sent. Thank you for reading, and for saying hello.";
        store.set("note:" + path, "1");
      } catch (err) {
        out.textContent = "That didn't go through. Please try again, or email me instead.";
        send.disabled = false;
      }
    });
  }
})();
