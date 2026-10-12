---
node: gvf
title: Gradient vector flow
date: 2026-10-11
question: When the snake cannot feel the boundary, can a better force reach it?
summary: Keep the snake, replace its force. A field that keeps the edge information where it exists and spreads it where it does not, how to compute it, how to check it, and what it still cannot do.
kicker: Atlas
source:
  authors: C. Xu and J. L. Prince
  title: "Snakes, shapes, and gradient vector flow"
  venue: IEEE Transactions on Image Processing
  details: vol. 7, no. 3, pp. 359–369
  year: 1998
  doi: 10.1109/83.661186
locked: true
labs: [gvf]
previews:
  - lab: gvf-compare
    caption: "The same snake on a U-shaped object, under two external forces. Kass’s force (the edge gradient) is strong only beside the edges and points at the walls inside the notch, so the snake bridges the opening. Gradient vector flow spreads that edge information through the image, and the snake follows it into the notch."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/snakes.js", "/assets/js/previews/gvf.js"]
---
