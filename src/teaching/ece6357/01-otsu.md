---
title: Thresholding as a variance problem
lecture: 1
date: 2026-08-27
summary: Otsu's method, derived from the decomposition of variance, and a ten-line implementation.
draft: true
---

*This is an example note that shows what a lecture note can contain: math, margin notes, code, and figures. It is a draft, so it only appears when you preview the site on your own computer. Edit it into your first note, or delete it.*

## The problem

Take a grayscale image with $L$ intensity levels, $i \in \{0, 1, \dots, L-1\}$. Let $n_i$ be the number of pixels at level $i$ and $N = \sum_i n_i$ the total, so the normalized histogram is

$$
p_i = \frac{n_i}{N}, \qquad \sum_{i=0}^{L-1} p_i = 1 .
$$

A threshold $t$ splits the pixels into a dark class $C_0 = \{ i \le t \}$ and a bright class $C_1 = \{ i > t \}$. We want the $t$ that makes the two classes as internally consistent as possible.{% marginnote %}Otsu proposed this in 1979. In one dimension with two classes it optimizes the same objective as $k$-means with $k=2$, but finds the global optimum by trying every $t$.{% endmarginnote %}

## Defining the pieces

For each class, its probability mass and mean are

$$
\omega_0(t) = \sum_{i \le t} p_i, \quad \omega_1(t) = 1 - \omega_0(t), \qquad
\mu_0(t) = \frac{1}{\omega_0} \sum_{i \le t} i\, p_i, \quad \mu_1(t) = \frac{1}{\omega_1} \sum_{i > t} i\, p_i ,
$$

and the mean of the whole image is $\mu_T = \sum_i i\,p_i = \omega_0 \mu_0 + \omega_1 \mu_1$, which does not depend on $t$.

## From within-class to between-class variance

The total variance splits into a within-class part and a between-class part, $\sigma_T^2 = \sigma_W^2 + \sigma_B^2$, with

$$
\sigma_W^2 = \omega_0 \sigma_0^2 + \omega_1 \sigma_1^2, \qquad
\sigma_B^2 = \omega_0 (\mu_0 - \mu_T)^2 + \omega_1 (\mu_1 - \mu_T)^2 .
$$

Because $\sigma_T^2$ is fixed, minimizing $\sigma_W^2$ is the same as maximizing $\sigma_B^2$. Substituting $\mu_T = \omega_0\mu_0 + \omega_1\mu_1$ gives $\mu_0 - \mu_T = \omega_1(\mu_0 - \mu_1)$ and $\mu_1 - \mu_T = \omega_0(\mu_1 - \mu_0)$, so

$$
\sigma_B^2(t) = \omega_0\omega_1^2(\mu_0-\mu_1)^2 + \omega_1\omega_0^2(\mu_0-\mu_1)^2 = \omega_0(t)\,\omega_1(t)\,\big(\mu_0(t) - \mu_1(t)\big)^2 .
$$

Everything in it is a cumulative sum of the histogram, which is why the method is fast.

## Implementation

```python
import numpy as np

def otsu(image, levels=256):
    p = np.bincount(image.ravel(), minlength=levels) / image.size
    i = np.arange(levels)
    w0 = np.cumsum(p)              # omega_0(t)
    m = np.cumsum(i * p)           # sum_{i <= t} i p_i
    w1 = 1.0 - w0
    with np.errstate(divide="ignore", invalid="ignore"):
        sb = (m[-1] * w0 - m) ** 2 / (w0 * w1)   # sigma_B^2(t)
    return int(np.nanargmax(sb))
```

The last line uses the fact that $\mu_0 - \mu_1 = (m - \mu_T\,\omega_0) / (\omega_0 \omega_1)$, where $m(t) = \sum_{i\le t} i\,p_i$.

## Where it breaks

Otsu works when the histogram is bimodal and the two classes are of comparable size. When one class is small, $\omega_0\omega_1$ pulls the threshold toward the larger class; when the image has a smooth intensity bias across the field of view, no single global $t$ is right. Both failures motivate the next lecture.
