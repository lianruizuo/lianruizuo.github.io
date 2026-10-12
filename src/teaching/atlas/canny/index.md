---
node: canny
title: Canny edge detection
date: 2026-10-12
question: Where does the image change, and how do we find it through noise?
summary: What an edge is, why derivatives amplify noise, Canny's three criteria and the filter they lead to, and the detector built on it. How to check the code, and what an edge map can and cannot tell you.
kicker: Atlas
source:
  authors: J. Canny
  title: "A computational approach to edge detection"
  venue: IEEE Transactions on Pattern Analysis and Machine Intelligence
  details: vol. PAMI-8, no. 6, pp. 679–698
  year: 1986
  doi: 10.1109/TPAMI.1986.4767851
locked: true
labs: [canny]
previews:
  - lab: canny-pipeline
    caption: "Canny’s detector on a synthetic image, one stage at a time: blur, differentiate, keep the top of each ridge, then decide which tops are edges. Each object has a stretch where its contrast fades; watch what the last two stages do there. Change σ, the width of the blur, and watch noise and detail trade places."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/canny.js"]
---
