---
node: linreg
title: Linear registration
date: 2026-11-09
question: We can score how well two scans match for any rotation, shift or stretch. With far too many candidates to try them all, how do we find the best one?
summary: Registration as a search that improves one guess step by step. Gradient descent and the chain rule that gives its direction, why the parameters need their own scales and a centered origin, blurring first when the start is far away, and choosing the start when the score has more than one valley. Then the overlap, a real registration tool, and what one matrix for the whole image cannot do.
kicker: Atlas
source:
  authors: M. Jenkinson and S. Smith
  title: "A global optimisation method for robust affine registration of brain images"
  venue: Medical Image Analysis
  details: "vol. 5, no. 2, pp. 143–156"
  year: 2001
  doi: 10.1016/S1361-8415(01)00036-6
locked: true
labs: [linreg]
previews:
  - lab: lr-valley
    caption: "The moving image is a head slice turned by 150°. A computer turns it back a little at a time, always in the direction in which the match gets better, until no small turn helps. The curve shows how poor the match is at every angle. Pick a start and press Run: from some starts it ends at 150° with the head upright, from others it stops with the head upside down, at the bottom of a different valley."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/head.js", "/assets/js/previews/linreg.js"]
---
