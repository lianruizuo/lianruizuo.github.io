---
node: similarity
title: Image similarity
date: 2026-11-09
question: To line up two scans, a computer needs one number for how well they match. What should that number be, when even the brightness of the same tissue differs between the scans?
summary: Registration compares two images pixel by pixel, so it first turns them into a list of pairs of values. Three scores read those pairs differently. The sum of squared differences asks whether the values are close, normalized cross-correlation whether they rise together, and mutual information whether one value predicts the other.
kicker: Atlas
source:
  authors: F. Maes, A. Collignon, D. Vandermeulen, G. Marchal and P. Suetens
  title: "Multimodality image registration by maximization of mutual information"
  venue: IEEE Transactions on Medical Imaging
  details: "vol. 16, no. 2, pp. 187–198"
  year: 1997
  doi: 10.1109/42.563664
locked: true
labs: [similarity]
previews:
  - lab: sm-compare
    caption: "The fixed image is a T1-weighted MRI slice. A moving image slides over it, up or down, and three scores watch: are the two values at each pixel close, do they rise and fall together, and does knowing one value predict the other? The dot on each curve marks the shift that score likes best; the right answer is always 0. Try the T2-weighted image, where the same tissue has very different brightness."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/head.js", "/assets/js/previews/similarity.js"]
---
