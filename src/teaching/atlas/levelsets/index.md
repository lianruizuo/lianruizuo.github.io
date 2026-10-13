---
node: levelsets
title: Level sets
date: 2026-10-13
question: How can one boundary become two, without anyone deciding where to cut?
summary: Stop storing the boundary as points. Store a function whose zero set is the boundary, move the function, and the boundary can split, merge and grow branches on its own. Where the speed comes from, how to compute it on a grid, how to check it, and where it leaks.
kicker: Atlas
source:
  authors: R. Malladi, J. A. Sethian and B. C. Vemuri
  title: "Shape modeling with front propagation: a level set approach"
  venue: IEEE Transactions on Pattern Analysis and Machine Intelligence
  details: vol. 17, no. 2, pp. 158–175
  year: 1995
  doi: 10.1109/34.368173
locked: true
labs: [levelsets]
previews:
  - lab: ls-run
    caption: "Left: a function φ drawn as a surface over the image; its zero level set (gold) is the boundary. Right: the same boundary on the image. One contour around two objects shrinks, pinches, and becomes two. Started inside a cell instead, the front flows around the dark nucleus and closes behind it. Nothing in the program decides where to cut."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/snakes.js", "/assets/js/previews/levelsets.js"]
---
