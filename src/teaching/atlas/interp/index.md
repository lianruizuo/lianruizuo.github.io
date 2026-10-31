---
node: interp
title: Transformation and interpolation
date: 2026-10-31
question: An image has values only at its pixels. How do we move it, when every moved pixel lands between them?
summary: Moving an image means moving coordinates, and the moved image is best built backwards, one output pixel at a time. Rigid and affine transformations as one 3 × 3 matrix, interpolation as scaled copies of a kernel, and why the smooth quadratic B-spline needs coefficients that are solved rather than copied.
kicker: Atlas
source:
  authors: P. Thévenaz, T. Blu and M. Unser
  title: "Interpolation revisited"
  venue: IEEE Transactions on Medical Imaging
  details: "vol. 19, no. 7, pp. 739–758"
  year: 2000
  doi: 10.1109/42.875199
locked: true
labs: [interp]
previews:
  - lab: ip-rotate
    caption: "An image has values only at its pixels, so turning it means guessing the values in between. Choose a way to guess: take the nearest pixel, join neighbouring pixels by straight lines, or fit a smooth curve through them. Then turn the image by 30° twelve times, a full turn, which should bring it back exactly. The number is how far the result is from the original: the guesses pile up, and the three ways pile up differently."
scripts: ["/assets/js/atlas.js", "/assets/js/lock.js", "/assets/js/previews/interp.js"]
---
