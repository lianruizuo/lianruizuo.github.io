# lianruizuo.github.io

My personal site. It's built with [Eleventy](https://www.11ty.dev/) and published to GitHub Pages by a GitHub Action whenever I push to `main`. There's no theme: every layout and style is in this repository.

## Where things live

| What | File |
|---|---|
| Lecture notes (ECE 6357) | `src/teaching/ece6357/*.md` |
| Journal entries | `src/journal/*.md` |
| Publications | `src/_data/own-bib.bib`, the same file as the CV |
| Research arcs, selected papers, funding | `src/_data/research.yaml` |
| News | `src/_data/news.yaml` |
| About page (appointments, honors, talks, service, teaching, mentoring) | `src/_data/cv.yaml` |
| Name, email, profile links, reader-trace switches | `src/_data/site.json` |
| CV PDF | `src/files/LianruiZuo_CV.pdf` (the CV link appears once this file exists) |
| Styles | `src/assets/css/site.css` |
| Home-page figure | `src/assets/js/field.js` |

## Preview on my computer

```sh
npm install        # once
npm start          # then open http://localhost:8080
```

Drafts (`draft: true`) are visible in the preview and never published.

## Post a lecture note

Create `src/teaching/ece6357/02-kmeans.md`:

```markdown
---
title: From thresholds to k-means
lecture: 2
date: 2026-09-03
summary: One sentence for the list on the Teaching page.
draft: true          # remove when it's ready
---

Text in Markdown. Inline math $\mu_k$ and display math:

$$
J = \sum_{k} \sum_{x \in C_k} \lVert x - \mu_k \rVert^2
$$

{% marginnote %}A note that sits in the right margin.{% endmarginnote %}

{% figure "/teaching/ece6357/kmeans.png", "A caption. Figures are numbered automatically." %}
```

Put images next to the Markdown file. The file name becomes the URL (`/teaching/ece6357/02-kmeans/`), and `lecture:` sets the order. A note links to the previous and next lectures automatically. `src/teaching/ece6357/01-otsu.md` is an example draft that shows every feature; edit it or delete it.

For a new course, make a new folder like `src/teaching/ece6357/`, copy `ece6357.11tydata.json` into it with the new course code, and add a section to `src/teaching/index.njk`.

## Post a journal entry

Create `src/journal/2026-10-12-some-title.md` with `title`, `date`, an optional `place` and `summary`, then write. The date prefix is dropped from the URL. `src/journal/2026-10-09-template.md` is an example draft.

## Update publications

Copy the newest `own-bib.bib` from the CV folder over `src/_data/own-bib.bib`. The page understands the same keywords as the CV (`underreview`, `preprint`, `accepted`, `oral`, `longoral`, `award` with `note={...}`, `mentee`, `cofirstauthor`). `@misc` abstracts are left out, as in the CV.

A title links to the paper when the entry has a `url` or `doi` field. Otherwise it links to a Google Scholar search for the title. You can also add `code={https://github.com/...}` or `pdf={...}`. Manuscripts tagged `underreview` are listed without the journal name.

## Reader traces

Both are off until switched on in `src/_data/site.json`. Nothing either one collects is shown publicly.

**1. Reads and "this was useful" marks: GoatCounter.** Free for personal sites, no cookies, no consent banner needed.
1. Sign up at <https://www.goatcounter.com/> and pick a code, e.g. `lianruizuo`. The dashboard is then at `https://lianruizuo.goatcounter.com`.
2. Set `"goatcounter": "lianruizuo"` in `site.json`.
3. The dashboard shows views per page, where readers came from (referrers), and rough location and device. Each click on "This was useful" or "I enjoyed this" appears as an event named `useful/<page>`, e.g. `useful/teaching/ece6357/02-kmeans/`.

**2. "Tell me who you are": Formspree.** This is a private form that emails you. The free tier covers 50 messages a month.
1. Sign up at <https://formspree.io/>, create a form, and copy its ID (the part after `/f/`).
2. Set `"formspree": "<that id>"` in `site.json`.
3. Messages arrive by email with the reader's name, affiliation, optional email, a note, and the page they were on. Formspree also keeps them in its dashboard, so you can export the list as CSV. Readers who leave an email asked to hear about new notes; that's your mailing list.

## Deploy

1. Replace the contents of the `lianruizuo.github.io` repository with this folder. Keep the old site on a branch, e.g. `git switch -c old-academicpages`, if you'd like a copy.
2. In the repository on GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`. The site rebuilds in about a minute.
