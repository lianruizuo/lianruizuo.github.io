// Builds the publication list directly from the CV's BibTeX file.
// To update: replace src/_data/own-bib.bib with the latest copy from your CV folder.
//
// Keywords understood (same as the CV):
//   underreview, preprint  -> listed under "In review and preprints" (venue hidden for underreview)
//   accepted               -> "accepted" tag
//   oral, longoral         -> presentation tag
//   award (+ note={...})   -> award tag, text from `note`
//   mentee, cofirstauthor  -> ignored on the website
// Optional per-entry fields the site will use if present: url, doi, code, pdf.
// @misc entries (conference abstracts) are left out, as in the CV.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as bibtex from "@retorquere/bibtex-parser";

const here = path.dirname(fileURLToPath(import.meta.url));
const ME = (a) => a.lastName === "Zuo" && /^L/.test(a.firstName || "");

function name(a) {
  if (!a.lastName || a.lastName === "others") return null;
  const first = (a.firstName || "").replace(/\b([A-Z])(?=\s|$)/g, "$1.").replace(/\.\./g, ".");
  return `${first} ${a.lastName}`.trim();
}

function venueOf(e) {
  const f = e.fields;
  let v = f.journal || f.booktitle || "";
  const org = [].concat(f.organization || [], f.publisher || []).join(" ");
  if (/^Medical Imaging 20\d\d/.test(v) && /SPIE/.test(org)) v = `SPIE ${v}`;
  v = v.replace(/^PloS [Oo]ne$/, "PLOS ONE").replace(/~/g, " ")
    .replace(/^Medical Imaging with Deep Learning$/, "Medical Imaging with Deep Learning (MIDL)")
    .replace(/^JMIR formative research$/, "JMIR Formative Research")
    .replace(/^The 11th International Workshop on Medical Image Synthesis and Simulation, in conjunction with MICCAI$/, "International Workshop on Simulation and Synthesis in Medical Imaging (SASHIMI)");
  return v;
}

function shortVenue(v) {
  const m = v.match(/\(([A-Z][A-Za-z&]+)\)/);
  if (m) return m[1];
  if (/^SPIE Medical Imaging/.test(v)) return "SPIE";
  return v;
}

export default function () {
  const src = fs.readFileSync(path.join(here, "own-bib.bib"), "utf8");
  const { entries } = bibtex.parse(src, { sentenceCase: false });

  const pubs = entries
    .filter((e) => e.type !== "misc")
    .map((e) => {
      const f = e.fields;
      const kw = new Set((f.keywords || []).map((k) => k.trim().toLowerCase()));
      const authorsRaw = f.author || [];
      const hasOthers = authorsRaw.some((a) => a.lastName === "others");
      const authors = authorsRaw
        .filter((a) => a.lastName !== "others")
        .map((a) => ({ name: name(a), me: ME(a) }))
        .filter((a) => a.name);
      const myIdx = authors.findIndex((a) => a.me);
      const inReview = kw.has("underreview") || kw.has("preprint");
      let kind = { article: "journal", inproceedings: "conference", incollection: "chapter", book: "chapter" }[e.type] || "other";
      if (inReview) kind = "review";
      const venue = venueOf(e);
      const tags = [];
      if (kw.has("award")) tags.push({ k: "award", t: f.note || "Award" });
      if (kw.has("longoral")) tags.push({ k: "oral", t: "Long oral" });
      else if (kw.has("oral")) tags.push({ k: "oral", t: "Oral" });
      if (kw.has("accepted")) tags.push({ k: "status", t: "Accepted" });
      if (kw.has("underreview")) tags.push({ k: "status", t: "Under review" });
      if (kw.has("preprint")) tags.push({ k: "status", t: "Preprint" });
      const doi = f.doi ? `https://doi.org/${f.doi}` : null;
      const url = f.url || doi || null;
      // Long author lists are shortened for display: first five, my name, last author.
      let shown = authors;
      if (authors.length > 9) {
        const keep = new Set([0, 1, 2, 3, 4, myIdx, authors.length - 1]);
        shown = [];
        authors.forEach((a, i) => {
          if (keep.has(i)) shown.push(a);
          else if (shown.length && !shown[shown.length - 1].gap) shown.push({ gap: true });
        });
      }
      const isConf = e.type === "inproceedings";
      const abbr = (venue.match(/\(([A-Z][A-Za-z]+)\)/) || [])[1];
      return {
        key: e.key,
        authorsShown: shown,
        venueDisplay: kw.has("underreview") ? "" : (isConf && abbr && !/^SPIE/.test(venue) ? abbr + (/short paper/.test(venue) ? ", short paper" : "") : venue),
        venueFull: venue,
        title: (f.title || "").replace(/\$([^$]*)\$/g, "$1").replace(/\s+/g, " ").trim(),
        authors,
        etal: hasOthers,
        year: Number(f.year) || 0,
        kind,
        // A journal under review is not named publicly: decisions change faster than the .bib.
        venue: kw.has("underreview") ? "" : venue,
        venueShort: shortVenue(venue),
        tags,
        first: myIdx === 0 || kw.has("cofirstauthor"),
        senior: myIdx === authors.length - 1 && !hasOthers && authors.length > 1,
        mentee: kw.has("mentee"),
        url,
        link: url || `https://scholar.google.com/scholar?q=${encodeURIComponent('"' + (f.title || "") + '"')}`,
        linkIsSearch: !url,
        code: f.code || null,
        pdf: f.pdf || null,
      };
    })
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));

  const published = pubs.filter((p) => p.kind !== "review");
  const counts = {
    all: published.length,
    journal: published.filter((p) => p.kind === "journal").length,
    conference: published.filter((p) => p.kind === "conference").length,
    chapter: published.filter((p) => p.kind === "chapter").length,
    review: pubs.filter((p) => p.kind === "review").length,
    first: published.filter((p) => p.first).length,
    mentee: published.filter((p) => p.mentee).length,
  };

  const years = [...new Set(published.map((p) => p.year))].sort((a, b) => b - a);
  const byYear = years.map((y) => ({ year: y, items: published.filter((p) => p.year === y) }));

  return { all: pubs, published, review: pubs.filter((p) => p.kind === "review"), byYear, counts };
}
