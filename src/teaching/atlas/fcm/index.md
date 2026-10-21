---
node: fcm
title: Fuzzy c-means
date: 2026-10-20
question: When a sample sits between two classes, how much of it belongs to each?
summary: Replace each label by a row of memberships that sum to one, raise them to a power, and k-means becomes fuzzy c-means. Why the power is needed, how a Lagrange multiplier gives the memberships, what the fuzzifier m controls, and why a membership is not a probability.
kicker: Atlas
source:
  authors: J. C. Bezdek
  title: "Pattern Recognition with Fuzzy Objective Function Algorithms"
  venue: Plenum Press
  details: New York
  year: 1981
  doi: 10.1007/978-1-4757-0450-1
locked: true
labs: [fcm]
previews:
  - lab: fcm-run
    caption: "Fuzzy c-means on points in two dimensions, one half-step at a time. Each point is coloured by its memberships: saturated when it belongs mostly to one class, pale grey when it is shared. Memberships: every point shares itself among the rings, more to the nearer ones. Representatives: every ring moves to an average of all the points, weighted by how much each belongs to it. The plot on the right records the cost after every half-step. Try m = 1.2 and m = 4, and drag the rings to choose your own start."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/fcm.js"]
---
