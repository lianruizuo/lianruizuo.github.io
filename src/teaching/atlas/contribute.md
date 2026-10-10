---
layout: page.njk
title: Contributing to the atlas
permalink: /teaching/atlas/contribute/
eleventyExcludeFromCollections: true
intro: Each node grows across semesters. The most valuable additions make a method harder to misuse.
---

<div class="prose contribute">

**What counts as a contribution.**

- **A silent bug.** A mistake that produces a plausible answer and no error, with a minimal example that triggers it.
- **A test.** A property the method must satisfy, written so that it fails on a known bug.
- **A verification strategy.** A way to check an implementation without knowing the right answer for a real image.
- **A world.** A synthetic case with known truth that separates two layers of error more cleanly than the existing ones.
- **A failure case.** An input where a correct implementation gives a poor result, with the assumption it violates.
- **A crossing.** A boundary of one method and the method that crosses it, with the layer it fixes: a better criterion, or more information.

**How it is recorded.** Accepted contributions are added to the node’s teaching record with the semester and, with your permission, your name. Nothing is anonymous by default and nothing is published without asking.

**How to submit.** Students in ECE 6357 submit through the course. Anyone else can open an issue on the [site’s repository](https://github.com/lianruizuo/lianruizuo.github.io/issues) or [email me](mailto:lianrui.zuo@vanderbilt.edu).

</div>

<section class="span">
  <div class="row section-head"><div class="m"></div><div class="t"><h2>The record so far</h2></div></div>
  <ul class="row-list">
    {%- for p in collections.atlas %}{% for r in p.data.record %}
    <li class="row"><div class="m">{{ r.term }}</div><div class="t"><p><a href="{{ p.url }}">{{ p.data.title }}</a>, {{ r.kind | lower }}: {{ r.title | md | safe }}<br><span class="muted">{{ r.by }}</span></p></div></li>
    {%- endfor %}{% endfor %}
  </ul>
</section>
