---
node: kmeans
title: k-means
date: 2026-10-13
question: When each sample carries several numbers, how do we split the samples into groups?
summary: One cost, two unknowns, and an algorithm that alternates between them. Why each step is exact, why the loop stops, what it shares with Otsu, and what the distance quietly decides for you.
kicker: Atlas
source:
  authors: J. MacQueen
  title: "Some methods for classification and analysis of multivariate observations"
  venue: Proceedings of the Fifth Berkeley Symposium on Mathematical Statistics and Probability
  details: vol. 1, pp. 281–297
  year: 1967
locked: true
labs: [kmeans]
previews:
  - lab: km-lloyd
    caption: "k-means on points in two dimensions, one half-step at a time. Assign: every point takes the colour of its nearest ring. Update: every ring moves to the average of its points. The plot on the right records the total squared distance from each point to its ring after every half-step; watch it. Drag the rings to choose your own start."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/kmeans.js"]
---
