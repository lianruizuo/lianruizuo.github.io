// Opens a password-locked lecture. The page holds only ciphertext (AES-GCM, key from the
// password by PBKDF2); nothing readable is published until the right password decrypts it here.
(() => {
  const gate = document.querySelector("[data-gate]");
  if (!gate) return;
  const body = document.querySelector("[data-lecture]");
  const form = gate.querySelector("form"), msg = gate.querySelector(".gate-msg");
  const P = JSON.parse(gate.querySelector("[data-payload]").textContent);
  const STORE = "lecture-pass";
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function decrypt(pw) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(P.salt), iterations: P.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(P.iv) }, key, bytes(P.ct));
    return new TextDecoder().decode(plain);
  }

  function show(html) {
    body.innerHTML = html;
    body.hidden = false;
    gate.remove();
    const preview = document.querySelector("[data-preview]"); // the lecture shows the same widget in its own place
    if (preview) preview.remove();
    // scripts inserted as HTML do not run; recreate them so the labs start
    body.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
    document.dispatchEvent(new Event("lecture:open"));
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }

  async function tryOpen(pw, remember) {
    try {
      show(await decrypt(pw));
      if (remember) try { localStorage.setItem(STORE, pw); } catch {}
      return true;
    } catch { return false; }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = form.pw.value;
    msg.textContent = "Opening…";
    if (!(await tryOpen(pw, true))) { msg.textContent = "That password did not open it."; form.pw.select(); }
  });

  // a password that opened one lecture on this device opens the others
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch {}
  if (saved) tryOpen(saved, false).then((ok) => { if (!ok) try { localStorage.removeItem(STORE); } catch {} });
})();
