---
node: snakes
title: Snakes
date: 2026-10-11
question: Given scattered evidence of edges, how do we find one closed boundary?
summary: A closed elastic curve that settles on an object's boundary. Where its energy comes from, how it moves, how to know the code is right, and where it stops working.
kicker: Atlas
source:
  authors: M. Kass, A. Witkin and D. Terzopoulos
  title: "Snakes: active contour models"
  venue: International Journal of Computer Vision
  details: vol. 1, no. 4, pp. 321–331
  year: 1988
  doi: 10.1007/BF00133570
locked: true
labs: [snakes]
previews:
  - lab: snakes-settle
    caption: "A loop of 64 beads, started as a circle, settles on the object’s boundary. It prefers to be short and smooth, and the image pulls it toward edges. Switch to the energy landscape to see what the beads feel: valleys along edges, flat ground elsewhere."
  - lab: snakes-shrink
    caption: "The same loop with the image switched off. Short and smooth is all it wants, so it shrinks straight through the boundary to a point."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/snakes.js"]
---
