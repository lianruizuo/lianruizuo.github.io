// Pulls aggregate visitor totals from GoatCounter into src/_data/visitors.json,
// which the Visitors corner on the Outside Work page draws from.
//
// Only totals are kept: visits per country, per US state, per section of the site,
// and per hour of the day. Nothing about any single visit is written.
//
// Needs two things, both set in the deploy workflow:
//   GOATCOUNTER_TOKEN  an API key (GoatCounter → Settings → API, read-only "Read statistics")
//   the site code      "goatcounter" in src/_data/site.json
// Without either, or if GoatCounter can't be reached, it writes nothing and exits
// cleanly, so the build goes on and the corner simply stays hidden.
//
// Run locally:  GOATCOUNTER_TOKEN=... node scripts/visitors.mjs
import fs from "node:fs";

const OUT = new URL("../src/_data/visitors.json", import.meta.url);
const site = JSON.parse(fs.readFileSync(new URL("../src/_data/site.json", import.meta.url), "utf8"));
const code = site.goatcounter;
const token = process.env.GOATCOUNTER_TOKEN;
const since = site.visitorsSince || "2026-10-17"; // the day counting started
const TZ = "America/Chicago";                     // hours are shown in Nashville time

// Sections of the site, matched by the start of the page path. First match wins.
const SECTIONS = [
  ["Outside Work", "/outside/"],
  ["Teaching", "/teaching/"],
  ["Research", "/research/"],
  ["Publications", "/publications/"],
  ["About", "/about/"],
  ["Home", "/"],
];

const quit = (msg) => { console.log(`[visitors] ${msg}; leaving the corner as it was.`); process.exit(0); };
if (!code) quit("no GoatCounter code in site.json");
if (!token) quit("no GOATCOUNTER_TOKEN");

const API = `https://${code}.goatcounter.com/api/v0`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, params) {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(300); // the API allows 4 requests a second
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  }
  throw new Error(`rate-limited on ${path}`);
}

// Ask in month-sized windows, so no single request spans too long a range.
function windows() {
  const out = [];
  let a = new Date(`${since}T00:00:00Z`);
  const now = new Date(); now.setUTCMinutes(0, 0, 0);
  while (a < now) {
    const b = new Date(a); b.setUTCMonth(b.getUTCMonth() + 1);
    out.push([a, b < now ? b : now]);
    a = b;
  }
  return out;
}
const iso = (d) => d.toISOString().replace(/\.\d+Z$/, "Z");

// Everything from a paged /stats/{page} endpoint, summed into a map by id.
async function allStats(path, range, into) {
  for (let offset = 0; ; offset += 100) {
    const r = await get(path, { start: iso(range[0]), end: iso(range[1]), limit: 100, offset });
    for (const s of r.stats || []) {
      const k = s.id || s.name;
      if (!k) continue;
      const cur = into.get(k) || { code: k, name: s.name || k, count: 0 };
      cur.count += s.count || 0;
      into.set(k, cur);
    }
    if (!r.more) break;
  }
}

const localHour = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" });

try {
  let visits = 0;
  const hours = Array(24).fill(0);
  const sections = new Map(SECTIONS.map(([name]) => [name, 0]));
  const countries = new Map();
  const states = new Map();

  for (const range of windows()) {
    // Totals, with hourly counts per day (GoatCounter keeps these in UTC).
    const t = await get("/stats/total", { start: iso(range[0]), end: iso(range[1]) });
    visits += (t.total || 0) - (t.total_events || 0);
    for (const day of t.stats || []) {
      (day.hourly || []).forEach((n, h) => {
        if (!n) return;
        const at = new Date(`${day.day}T${String(h).padStart(2, "0")}:00:00Z`);
        hours[+localHour.format(at) % 24] += n;
      });
    }

    // Views per page, folded into sections. "This was useful" clicks are events; skip them.
    const h = await get("/stats/hits", { start: iso(range[0]), end: iso(range[1]), limit: 100 });
    for (const p of h.hits || []) {
      if (p.event) continue;
      const hit = SECTIONS.find(([, pre]) => pre === "/" ? p.path === "/" : p.path.startsWith(pre));
      if (hit) sections.set(hit[0], sections.get(hit[0]) + (p.count || 0));
    }

    // Countries, then US states.
    await allStats("/stats/locations", range, countries);
    try { await allStats("/stats/locations/US", range, states); } catch (e) { console.log(`[visitors] no state detail (${e.message})`); }
  }

  const sorted = (m) => [...m.values()].filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
  const data = {
    since,
    updated: new Date().toISOString(),
    visits,
    countries: sorted(countries)
      .map((c) => ({ code: String(c.code).toUpperCase().slice(0, 2), name: c.name, count: c.count }))
      .filter((c) => /^[A-Z]{2}$/.test(c.code)),
    states: sorted(states)
      .map((s) => ({ code: String(s.code).toUpperCase().replace(/^US-/, ""), name: s.name, count: s.count }))
      .filter((s) => /^[A-Z]{2}$/.test(s.code)),
    sections: [...sections].map(([name, count]) => ({ name, count })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count),
    hours,
  };
  if (!data.visits) quit("no visits yet");
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
  console.log(`[visitors] ${data.visits} visits, ${data.countries.length} countries, ${data.states.length} states.`);
} catch (e) {
  quit(`couldn't read GoatCounter (${e.message})`);
}
