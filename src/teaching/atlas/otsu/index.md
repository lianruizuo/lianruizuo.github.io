---
node: otsu
title: Otsu thresholding
date: 2026-10-10
question: Handed only a histogram, where should one cut it in two?
summary: The first node of the atlas. A method that never sees where a pixel is, the tests that prove the code is right, and the cases where a correct implementation still gives the wrong answer.
kicker: Atlas
source:
  authors: N. Otsu
  title: A threshold selection method from gray-level histograms
  venue: IEEE Transactions on Systems, Man, and Cybernetics
  details: vol. SMC-9, no. 1, pp. 62–66
  year: 1979
  doi: 10.1109/TSMC.1979.4310076
crossings:
  - { to: mixtures, layer: criterion, when: "one class is much smaller or more spread out than the other", how: "same information, better criterion" }
  - { to: reddi, layer: reach, when: "there are more than two classes", how: "says more: several thresholds" }
  - { to: biasfield, layer: reach, when: "brightness drifts across the image", how: "sees more: where each pixel is" }
record:
  - { term: Fall 2026, kind: Silent bug, title: "Plain `np.argmax` lets an empty class win", by: Instructors }
  - { term: Fall 2026, kind: Silent bug, title: "`astype(np.uint8)` wraps 12-bit values instead of rescaling them", by: Instructors }
  - { term: Fall 2026, kind: Silent bug, title: "Scoring the split at *k* − 1 and reporting it as *k*", by: Instructors }
  - { term: Fall 2026, kind: Test, title: "The whole pipeline on a clean phantom, from 12-bit values", by: Instructors }
  - { term: Fall 2026, kind: Failure case, title: "A small object pulls the threshold into the background", by: Instructors }
locked: true
labs: [otsu]
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js"]
---
