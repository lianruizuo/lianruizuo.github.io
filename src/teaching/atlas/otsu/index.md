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
  - { to: mixtures, layer: criterion, when: "one class is much smaller or more spread out than the other" }
  - { to: reddi, layer: reach, when: "there are more than two classes" }
  - { to: biasfield, layer: reach, when: "brightness drifts across the image" }
record:
  - { term: Fall 2026, kind: Silent bug, title: "Plain `np.argmax` lets an empty class win", by: Instructors }
  - { term: Fall 2026, kind: Silent bug, title: "`astype(np.uint8)` wraps 12-bit values instead of rescaling them", by: Instructors }
  - { term: Fall 2026, kind: Silent bug, title: "Scoring the split at *k* − 1 and reporting it as *k*", by: Instructors }
  - { term: Fall 2026, kind: Test, title: "The whole pipeline on a clean phantom, from 12-bit values", by: Instructors }
  - { term: Fall 2026, kind: Failure case, title: "A small object pulls the threshold into the background", by: Instructors }
scripts: ["/assets/js/atlas.js", "/assets/js/labs/otsu.js"]
---

## Question

Segmenting by intensity starts with one decision: choose a gray level, and call everything brighter *object* and everything darker *background*. Looking at a histogram, a person cuts at the valley between two humps. Otsu’s paper begins by noting that valleys are often flat, noisy, or missing altogether when one hump is much taller than the other, so “cut at the valley” is not a rule a machine can follow.{% marginnote %}Keep the unequal humps in mind. They are the problem the paper set out to solve, and, in a different form, the place where its method fails.{% endmarginnote %}

<div class="reading">
<div>
<h3>What the paper claims</h3>

- A threshold can be chosen from the gray-level histogram alone, with no other prior knowledge.
- The choice needs only cumulative sums of the histogram and its first moment, so the search is simple.
- The best score, *η*\*, measures how separable the image is, and does not change if the gray levels are shifted or scaled.
- The method extends directly to two or more thresholds.

</div>
<div>
<h3>What it rests on</h3>

- **A conjecture, named as one.** Well-thresholded classes should be separated in gray level, and conversely, “a threshold giving the best separation of classes in gray levels would be the best threshold.” The converse is the claim that can fail.
- **Two classes.** The paper itself warns that thresholds become less credible as the number of classes grows.
- **Thresholds where both classes exist.** The search is limited to an *effective range*. Most implementations drop this line, and Build shows what that costs.
- **Evidence by eye.** The examples are a few 64 × 64 pictures, with no ground truth to measure against.

</div>
</div>

## Intuition

Otsu is handed a histogram, not an image. Everything else on this page follows from that, so start there: shuffle the pixels into random positions. The picture is destroyed. The histogram, and the threshold Otsu returns, do not change at all.

<div class="lab" data-lab="otsu-sees"></div>

Drag the line across the histogram to watch the score. It rises when the two sides have well-separated means *and* both sides are substantial: a cut at the far left isolates a few dark pixels and scores almost nothing, however consistent that tiny class is.

## Math

**Setup.** Gray levels are $i \in \{1, \dots, L\}$. Let $n_i$ be the number of pixels at level $i$ and $N = \sum_i n_i$, so $p_i = n_i / N$ is a probability distribution. A threshold $k$ splits the pixels into $C_0 = \{ i \le k \}$ and $C_1 = \{ i > k \}$.

**Cumulative moments.** Everything is built from two running sums and one constant:

$$
\omega(k) = \sum_{i=1}^{k} p_i, \qquad \mu(k) = \sum_{i=1}^{k} i\, p_i, \qquad \mu_T = \mu(L).
$$

The class probabilities are $\omega_0 = \omega(k)$ and $\omega_1 = 1 - \omega(k)$, and the class means are

$$
\mu_0 = \frac{\mu(k)}{\omega(k)}, \qquad \mu_1 = \frac{\mu_T - \mu(k)}{1 - \omega(k)}, \qquad \omega_0 \mu_0 + \omega_1 \mu_1 = \mu_T .
$$

**One total, two parts.** With class variances $\sigma_0^2, \sigma_1^2$, define the within-class and between-class variances

$$
\sigma_W^2 = \omega_0 \sigma_0^2 + \omega_1 \sigma_1^2, \qquad
\sigma_B^2 = \omega_0 (\mu_0 - \mu_T)^2 + \omega_1 (\mu_1 - \mu_T)^2 .
$$

They add up to the total variance, $\sigma_W^2 + \sigma_B^2 = \sigma_T^2$, which does not depend on $k$.{% marginnote %}The law of total variance, with the class label as the conditioning variable.{% endmarginnote %} So making the classes tight and pushing them apart are one goal, not two.

**Why the between-class form.** Substituting $\mu_T = \omega_0\mu_0 + \omega_1\mu_1$ gives $\mu_0 - \mu_T = \omega_1(\mu_0 - \mu_1)$ and $\mu_1 - \mu_T = \omega_0(\mu_1 - \mu_0)$, so

$$
\sigma_B^2 = \omega_0 \omega_1^2 (\mu_1 - \mu_0)^2 + \omega_1 \omega_0^2 (\mu_1 - \mu_0)^2 = \omega_0\, \omega_1\, (\mu_1 - \mu_0)^2 .
$$

This needs only probabilities and means, where $\sigma_W^2$ would need the class variances at every $k$. Writing the means through the cumulative moments, $\mu_1 - \mu_0 = \dfrac{\mu_T\,\omega(k) - \mu(k)}{\omega(k)\,[1 - \omega(k)]}$, so

$$
\sigma_B^2(k) = \frac{\big[\mu_T\, \omega(k) - \mu(k)\big]^2}{\omega(k)\,\big[1 - \omega(k)\big]}, \qquad
k^* = \operatorname*{arg\,max}_{0 < \omega(k) < 1} \sigma_B^2(k).
$$

The condition under the arg max is the paper’s effective range. Outside it one class is empty and $\sigma_B^2$ is $0/0$.

**Two consequences, for later.** The factor $\omega_0\omega_1$ is largest when the classes are equal in size: the criterion is biased toward balanced splits. And setting the derivative of $\sigma_B^2$ to zero puts an interior optimum midway between the class means, $k^* \approx \tfrac12(\mu_0 + \mu_1)$, a condition in which neither the class spreads nor the class sizes appear.{% marginnote %}Reddi, Rudin and Keshavan (1984) turn this midpoint condition into a fast search, and into several thresholds at once.{% endmarginnote %}

## Build

The implementation follows the math line by line. Levels run $0, \dots, L-1$ in code; shifting every level by one changes no variance, so $k^*$ shifts by one as well.

```python
import numpy as np

def otsu_threshold(image, L=256):
    """Otsu (1979). Returns k* with C0 = {i <= k*}, C1 = {i > k*}.
    `image` holds integer gray levels 0, ..., L-1."""
    n = np.bincount(image.ravel(), minlength=L)[:L]   # histogram n_i
    N = n.sum()
    p = n / N                                         # p_i
    i = np.arange(L)
    omega = np.cumsum(p)                              # omega(k)
    mu = np.cumsum(i * p)                             # mu(k)
    mu_T = mu[-1]                                     # total mean
    with np.errstate(divide="ignore", invalid="ignore"):
        sigma_B2 = (mu_T * omega - mu) ** 2 / (omega * (1 - omega))
    N0 = np.cumsum(n)
    sigma_B2[(N0 == 0) | (N0 == N)] = np.nan          # outside Otsu's effective range
    return int(np.nanargmax(sigma_B2))

def to_8bit(raw, bits=12):
    """Rescale a `bits`-bit image to 0..255."""
    return np.round(raw.astype(float) * 255 / (2 ** bits - 1)).astype(np.uint8)

def segment(raw, bits=12):
    """The whole pipeline: scanner values in, object mask out."""
    img = to_8bit(raw, bits)
    return img > otsu_threshold(img)
```

Writing this takes minutes. So does writing each of the three versions below, and all three run without complaint and return a plausible number.

- **Plain argmax.** Drop the effective-range line and call `np.argmax`. Empty classes produce $0/0$ = NaN, and `np.argmax` treats NaN as the largest value, so it returns the position of the first one.
- **$C_0 = \{ i < k \}$.** Score the split below $k$ and report it as $k$. Every answer is one gray level too high.
- **12-bit cast.** Replace the rescaling with `raw.astype(np.uint8)`. Values are kept modulo 256, so a 12-bit image arrives as noise. Otsu itself is untouched.

## Verify

A test here checks a property the method must have, on an input where the right answer is known without trusting the code under test. Four of them:

```python
import numpy as np
from otsu import otsu_threshold, segment

def phantom(mu0=80, mu1=170, s0=15, s1=15, frac=0.3, size=128, seed=0):
    """A disk on a background, with Gaussian noise. Returns 8-bit image and truth."""
    r = np.random.default_rng(seed)
    yy, xx = np.mgrid[:size, :size] / size
    obj = (xx - .5) ** 2 + (yy - .5) ** 2 < frac / np.pi
    img = np.where(obj, r.normal(mu1, s1, obj.shape), r.normal(mu0, s0, obj.shape))
    return np.clip(np.round(img), 0, 255).astype(np.uint8), obj

def test_definition():
    # argmax of sigma_B^2 must equal argmin of sigma_W^2, computed slowly from class variances
    img, _ = phantom()
    x = img.ravel().astype(float)
    sw = [np.average([c0.var(), c1.var()], weights=[c0.size, c1.size])
          if c0.size and c1.size else np.inf
          for c0, c1 in ((x[x <= k], x[x > k]) for k in range(256))]
    assert otsu_threshold(img) == int(np.argmin(sw))

def test_shift():
    img, _ = phantom()
    assert img.max() + 20 <= 255                     # stay inside uint8
    assert otsu_threshold(img + 20) == otsu_threshold(img) + 20

def test_two_spikes():
    img = np.array([50] * 100 + [200] * 300, dtype=np.uint8)
    assert 50 <= otsu_threshold(img) < 200           # any k in the gap is optimal

def test_end_to_end():
    # the clean case, through the whole pipeline, from 12-bit scanner values
    img, truth = phantom()
    raw = np.round(img.astype(float) * 4095 / 255).astype(np.uint16)   # 12-bit scanner values
    assert np.mean(segment(raw) != truth) < 0.02
```

All four pass on the faithful version. Running them against each wrong version gives this catch matrix:

<div class="catch">
<table>
<thead><tr><th></th><th>Definition</th><th>Shift</th><th>Two spikes</th><th>End to end</th></tr></thead>
<tbody>
<tr><th>Plain argmax</th><td class="no">fails</td><td class="no">fails</td><td class="no">fails</td><td class="no">fails</td></tr>
<tr><th>C₀ = {i &lt; k}</th><td class="no">fails</td><td>passes</td><td>passes</td><td>passes</td></tr>
<tr><th>12-bit cast</th><td>passes</td><td>passes</td><td>passes</td><td class="no">fails</td></tr>
</tbody>
</table>
</div>

Read it by column as well as by row. No single test catches every bug. Only the slow brute-force comparison sees the off-by-one, because it alone knows the right answer to the gray level. Only the end-to-end test sees the cast, because that bug is not in Otsu at all. And none of the four ever asks whether Otsu was the right method for the image: they must pass on any input, so they say nothing about the world. That is the next section’s job.

## Break

The bench below works on a world where the truth is known, so the error of any answer can be split into four parts:

- **Code:** what the code returned against what the math gives;
- **Search:** what the math gives against the true optimum of the criterion;
- **Criterion:** that optimum against the best threshold there is;
- **Reach:** what even the best threshold gets wrong.

The first two are bugs; the last two are boundaries. For Otsu, search is always zero: it tries every $k$. Choose a world and an implementation, and watch where the error lands. The tests do not move when you change the world; that is the point of them.

<div class="lab bench" data-lab="otsu-bench"></div>

Each symptom below comes from a world like these. Decide where the error lives before opening it.

{% diagnosis "The object covers 2% of the image. Otsu labels 44% of the image as object.", "criterion" %}
The tests pass, and $k^*$ is the true maximum of $\sigma_B^2$. The factor $\omega_0\omega_1$ rewards balanced classes, so cutting the background in two outscores isolating a small object. On the test phantom, $k^* = 84$, while the best threshold, 152, misclassifies 0.7% of pixels. Crossed by mixture models, which estimate how large each class is.
{% enddiagnosis %}

{% diagnosis "A tight background and a widely spread object. Otsu’s threshold sits deep inside the object’s range.", "criterion" %}
The optimum sits midway between the class means, whatever their spreads; the best boundary between a narrow and a wide distribution lies close to the narrow one. With spreads 6 and 40 on the test phantom, $k^* = 132$ (5.0% wrong) against a best threshold of 97 (1.2%). Crossed by giving each class its own variance.
{% enddiagnosis %}

{% diagnosis "Brightness drifts from left to right. The errors pile up on one side of the image.", "reach" %}
Partly criterion, mostly reach. The object on the bright side is brighter than the object on the dark side, and so is the background, so the classes overlap in the histogram although they are clearly apart in space. On the test phantom the best single threshold still gets 5.3% wrong, and Otsu adds 2.8 points more. No criterion over the histogram can recover space. Crossed by bias field correction, which sees it.
{% enddiagnosis %}

{% diagnosis "Two tissues share most of their gray levels. Even the best possible threshold misclassifies more than a fifth of the image.", "reach" %}
Nothing on this page can fix it, because the information is not in the histogram. This boundary is crossed by a different measurement, such as a second contrast, a longer acquisition or a better scanner, more than by a different algorithm.
{% enddiagnosis %}

{% diagnosis "Three tissues, three humps in the histogram. Otsu merges two of them.", "reach" %}
One threshold can only ever say two things. The method needs to say more: crossed by multilevel thresholding, which keeps the same criterion and adds thresholds.
{% enddiagnosis %}

{% diagnosis "On the small-object world, a classmate’s version gets only 2% wrong, far better than yours. Their code must be better.", "code" %}
Run their code against the tests. If it is the plain-argmax version, all four fail: the first NaN sits at the top of this histogram, so it returns the brightest gray level and calls everything background. On an image that is 98% background, that is nearly right. A good answer is not evidence of correct code.
{% enddiagnosis %}

{% diagnosis "Two spikes, at 50 and 200. Your code returns 50; a classmate’s returns 199.", "tie" %}
Every $k$ from 50 to 199 gives the same perfect split, so the maximum is a plateau and both answers are right. That is why the test asks for a split in the gap, not for a particular number.
{% enddiagnosis %}

## Learn

**Carry forward.**

- Otsu sees values, never positions. Anything spatial, such as shape, neighbors or a smooth drift, is outside its reach.
- Minimizing within-class variance and maximizing between-class variance are the same problem. The second needs only cumulative first-order sums, so one pass suffices.
- The criterion favors balanced classes and places the cut midway between the means. Class size and spread are ignored by construction, and both reappear as failures.
- Tests decide whether the code computes the math. A world with known truth decides whether the math answers your question. Neither can do the other’s job.

**Work on.**

1. Show that $\sigma_B^2(k)$ is unchanged by a shift of all intensities, and find what a scaling by $a > 0$ does to $k^*$ and to $\eta^*$.
2. Prove that $\eta^* = 2/\pi$ for a single Gaussian. Then use the bench to find a two-class world with a lower $\eta^*$, and explain why $\eta^*$ cannot tell you whether a second class exists.
3. Write a test that catches the off-by-one version without the brute-force comparison.
4. Add a fourth wrong version that the catch matrix above misses entirely, and the test that would catch it.
