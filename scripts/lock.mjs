// npm run lock
// Encrypts every lecture in private/atlas/ into src/_data/lockedData/<id>.json.
// Only that ciphertext is committed and published; private/ never leaves your computer.
//
// The password is asked for twice (or read from LECTURE_PASSWORD). Use the same password for
// every lecture of a course: students who open one lecture then open the rest without retyping.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { webcrypto, randomBytes } from "node:crypto";
import readline from "node:readline";

const OUT = ".lockbuild", DATA = "src/_data/lockedData", ITER = 310000;
const subtle = webcrypto.subtle;
const b64 = (u8) => Buffer.from(u8).toString("base64");

function ask(q) {
  return new Promise((done) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(q); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); done(a); });
  });
}

async function key(pw, salt) {
  const base = await subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function opens(pw, file) {
  const P = JSON.parse(readFileSync(file, "utf8"));
  try {
    const base = await subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const k = await subtle.deriveKey({ name: "PBKDF2", salt: Buffer.from(P.salt, "base64"), iterations: P.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    await subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(P.iv, "base64") }, k, Buffer.from(P.ct, "base64"));
    return true;
  } catch { return false; }
}

const ids = existsSync("private/atlas") ? readdirSync("private/atlas").filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)) : [];
if (!ids.length) { console.log("Nothing to lock: private/atlas/ has no lectures."); process.exit(0); }

let pw = process.env.LECTURE_PASSWORD;
if (!pw) {
  pw = await ask("Course password: ");
  if ((await ask("Again: ")) !== pw) { console.error("The two passwords differ. Nothing was changed."); process.exit(1); }
}
if (pw.length < 8) { console.error("Use at least 8 characters. Nothing was changed."); process.exit(1); }

mkdirSync(DATA, { recursive: true });
const existing = readdirSync(DATA).filter((f) => f.endsWith(".json")).map((f) => `${DATA}/${f}`);
if (existing.length && !(await opens(pw, existing[0]))) {
  const a = await new Promise((done) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question("This is not the password the published lectures use. Lock with it anyway? (y/N) ", (x) => { rl.close(); done(x); }); });
  if (!/^y/i.test(a)) { console.log("Nothing was changed."); process.exit(0); }
}

// build once with the private lectures in full, then cut each lecture out of its page
const env = { ...process.env }; delete env.LOCKED;
execSync(`npx @11ty/eleventy --quiet --output=${OUT}`, { stdio: "inherit", env });

for (const id of ids) {
  const page = `${OUT}/teaching/atlas/${id}/index.html`;
  if (!existsSync(page)) { console.warn(`  ${id}: no page at src/teaching/atlas/${id}/index.md, skipped`); continue; }
  const html = readFileSync(page, "utf8");
  const m = html.match(/<!--lecture-->([\s\S]*?)<!--\/lecture-->/);
  if (!m) { console.warn(`  ${id}: page is not marked locked, skipped`); continue; }
  // the labs go inside the ciphertext too, so their code is not public either
  const body = m[1].replace(/<script src="\/assets\/js\/labs\/([\w-]+)\.js[^"]*"><\/script>/g, (_, lab) =>
    `<script>${readFileSync(`private/labs/${lab}.js`, "utf8").replace(/<\/script/gi, "<\\/script")}</script>`);
  const salt = randomBytes(16), iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, await key(pw, salt), new TextEncoder().encode(body));
  writeFileSync(`${DATA}/${id}.json`, JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }) + "\n");
  console.log(`  ${id}: locked (${Math.round(body.length / 1024)} KB)`);
}
rmSync(OUT, { recursive: true, force: true });
console.log("Done. Commit src/_data/lockedData/ and push. private/ stays on this computer.");
