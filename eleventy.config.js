import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItFootnote from "markdown-it-footnote";
import texmath from "markdown-it-texmath";
import katex from "katex";
import { load as yamlLoad } from "js-yaml";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import { atlasLayout, crossingsOf } from "./lib/atlas.js";

const isBuild = process.env.ELEVENTY_RUN_MODE === "build" && !process.env.DRAFTS;

export default function (eleventyConfig) {
  // ---------- data ----------
  eleventyConfig.addDataExtension("yaml", (contents) => yamlLoad(contents));

  // ---------- static files ----------
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/files": "files" });
  eleventyConfig.addPassthroughCopy("src/teaching/**/*.{png,jpg,jpeg,gif,svg,webp,pdf}");
  eleventyConfig.addPassthroughCopy("src/outside/**/*.{png,jpg,jpeg,gif,svg,webp}");
  eleventyConfig.addPassthroughCopy({ "node_modules/katex/dist/katex.min.css": "assets/katex/katex.min.css" });
  eleventyConfig.addPassthroughCopy({ "node_modules/katex/dist/fonts": "assets/katex/fonts" });
  eleventyConfig.addPassthroughCopy({ "src/.nojekyll": ".nojekyll" });

  // ---------- drafts: visible with `npm start`, never published ----------
  eleventyConfig.addPreprocessor("drafts", "*", (data) => {
    if (data.draft && isBuild) return false;
  });

  // ---------- markdown: math, footnotes, heading anchors ----------
  const md = markdownIt({ html: true, typographer: true, linkify: true })
    .use(markdownItFootnote)
    .use(markdownItAnchor, { level: [2, 3], tabIndex: false })
    .use(texmath, { engine: katex, delimiters: ["dollars", "brackets"], katexOptions: { throwOnError: false } });
  eleventyConfig.setLibrary("md", md);
  eleventyConfig.addFilter("md", (s) => (s ? md.renderInline(String(s)) : ""));
  eleventyConfig.addFilter("mdBlock", (s) => (s ? md.render(String(s)) : ""));

  eleventyConfig.addPlugin(syntaxHighlight);

  // Margin notes for lecture notes and journal entries.
  //   {% marginnote %}Text in the margin.{% endmarginnote %}
  let noteId = 0;
  eleventyConfig.addPairedShortcode("marginnote", (content) => {
    const id = `mn-${++noteId}`;
    return `<label for="${id}" class="mn-toggle" aria-label="Show margin note">&#8853;</label><input type="checkbox" id="${id}" class="mn-check"/><span class="marginnote">${md.renderInline(content.trim())}</span>`;
  });
  // A diagnosis: a symptom the reader judges before opening it.
  //   {% diagnosis "Symptom, in a sentence or two.", "criterion" %}Explanation in Markdown.{% enddiagnosis %}
  //   layer: code | search | criterion | reach | tie
  eleventyConfig.addPairedShortcode("diagnosis", (content, symptom, layer = "criterion") => {
    const names = { code: "Code", search: "Search", criterion: "Criterion", reach: "Reach", tie: "Nowhere" };
    const kinds = { code: "a bug", search: "a bug", criterion: "a boundary", reach: "a boundary", tie: "a tie, not an error" };
    return `<details class="dx dx-${layer}"><summary><span class="dx-mark" aria-hidden="true"></span><span class="dx-symptom">${md.renderInline(symptom)}</span><span class="dx-open">Where does it live?</span></summary><div class="dx-answer"><p class="dx-verdict"><span class="layer-chip layer-${layer}">${names[layer] || layer}</span> ${kinds[layer] || ""}.</p>${md.render(content.trim())}</div></details>`;
  });
  // Numbered figure: {% figure "/teaching/ece6357/otsu.png", "Caption text" %}
  eleventyConfig.addShortcode("figure", (src, caption = "", alt = "") => {
    return `<figure class="fig"><img src="${src}" alt="${alt || caption.replace(/<[^>]+>/g, "")}" loading="lazy"/>${caption ? `<figcaption>${md.renderInline(caption)}</figcaption>` : ""}</figure>`;
  });

  // ---------- collections ----------
  // Atlas nodes: one folder per node, src/teaching/atlas/<id>/index.md
  eleventyConfig.addCollection("atlas", (api) =>
    api.getFilteredByGlob("src/teaching/atlas/*/index.md").sort((a, b) => (a.data.title || "").localeCompare(b.data.title || ""))
  );
  eleventyConfig.addCollection("notes", (api) =>
    api.getFilteredByGlob("src/teaching/**/*.md").filter((p) => !p.inputPath.includes("/atlas/")).sort((a, b) =>
      (a.data.course || "").localeCompare(b.data.course || "") || (a.data.lecture ?? 0) - (b.data.lecture ?? 0) || a.date - b.date)
  );
  eleventyConfig.addCollection("journal", (api) =>
    api.getFilteredByGlob("src/outside/*.md").sort((a, b) => b.date - a.date)
  );
  eleventyConfig.addCollection("writing", (api) =>
    api.getFilteredByGlob(["src/teaching/**/*.md", "src/outside/*.md"]).filter((p) => !p.data.eleventyExcludeFromCollections && !p.inputPath.endsWith("contribute.md")).sort((a, b) => b.date - a.date)
  );

  // ---------- filters ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  eleventyConfig.addFilter("longDate", (d) => { const x = new Date(d); return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}, ${x.getUTCFullYear()}`; });
  eleventyConfig.addFilter("shortDate", (d) => { const x = new Date(d); return `${MONTHS[x.getUTCMonth()].slice(0, 3)} ${x.getUTCFullYear()}`; });
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().slice(0, 10));
  eleventyConfig.addFilter("newsDate", (d) => {
    const m = String(d).match(/^(\d{4})-(\d{2})/);
    return m ? `${MONTHS[Number(m[2]) - 1].slice(0, 3)} ${m[1]}` : String(d);
  });
  eleventyConfig.addFilter("year", (d) => new Date(d).getUTCFullYear());
  eleventyConfig.addFilter("take", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("where", (arr, key, val) => (arr || []).filter((x) => { const v = x.data && key in x.data ? x.data[key] : x[key]; return val === undefined ? v : v === val; }));
  eleventyConfig.addFilter("byKeys", (pubs, keys) => keys.map((k) => pubs.find((p) => p.key === k)).filter(Boolean));
  eleventyConfig.addFilter("readingTime", (html) => {
    const text = String(html || "").replace(/<math[\s\S]*?<\/math>/g, " ").replace(/<[^>]+>/g, " ");
    const words = text.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length;
    return Math.max(1, Math.round(words / 200));
  });
  eleventyConfig.addFilter("neighbors", (arr, url) => {
    const i = (arr || []).findIndex((x) => x.url === url);
    return { prev: i > 0 ? arr[i - 1] : null, next: i >= 0 && i < arr.length - 1 ? arr[i + 1] : null };
  });
  // The atlas: layout computed from what each method sees and the year of its source (lib/atlas.js)
  eleventyConfig.addFilter("atlasLayout", (atlas, pages) => atlasLayout(atlas, pages));
  eleventyConfig.addFilter("crossingsOf", (layout, id) => crossingsOf(layout, id));
  eleventyConfig.addFilter("layerOf", (atlas, id) => (atlas.layers || []).find((l) => l.id === id) || {});
  eleventyConfig.addFilter("upperFirst", (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : ""));
  eleventyConfig.addFilter("inCourse", (pages, code) => (pages || []).flatMap((p) =>
    (p.data.courses || []).filter((c) => c.code === code).map((c) => ({ page: p, where: c.where }))));
  eleventyConfig.addFilter("json", (x) => JSON.stringify(x));

  // ---------- feed (teaching notes + journal) ----------
  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: { name: "writing", limit: 30 },
    metadata: {
      language: "en",
      title: "Lianrui Zuo",
      subtitle: "Lecture notes and notes from outside research.",
      base: "https://lianruizuo.github.io/",
      author: { name: "Lianrui Zuo" },
    },
  });

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"],
  };
}
