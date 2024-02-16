---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
---

**Find the full list of my publications on [Google Scholar](https://scholar.google.com/citations?user=GQGYangAAAAJ&hl=en).**

{% include base_path %}

{% for post in site.publications reversed %}
  {% include archive-single.html %}
{% endfor %}
