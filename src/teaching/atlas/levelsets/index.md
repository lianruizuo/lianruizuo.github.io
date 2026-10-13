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
    caption: "A front grows from a small circle inside a cell. Left: the function φ whose zero level set (gold) is the front, drawn as a surface over the image. Right: the same zero level set on the image. Watch it flow around the dark nucleus and close behind it: one curve becomes two, and nothing in the program decided where to cut. Then add a bright haze above the cell."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/snakes.js", "/assets/js/previews/levelsets.js"]
---
