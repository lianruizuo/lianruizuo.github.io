---
title: "Revisiting registration-based synthesis: A focus on unsupervised MR image synthesis"
collection: publications
permalink: /publication/revisiting_dir_for_synthesis
date: 2024-02-21
venue: 'SPIE Medical Imaging'
paperurl: 'https://arxiv.org/abs/2402.12288'
---
- **Authors:** Savannah P. Hays, **Lianrui Zuo**, Yihao Liu, Anqi Feng, Jiachen Zhuo, Jerry L. Prince, Aaron Carass
- **Paper:** [<img src="/images/pdf_icon.png" width="25"/>](https://arxiv.org/abs/2402.12288)
- **Abstract:** Deep learning (DL) has led to significant improvements in medical image synthesis, enabling advanced image-to-image translation to generate synthetic images. However, DL methods face challenges such as domain shift and high demands for training data, limiting their generalizability and applicability. Historically, image synthesis was also carried out using deformable image registration (DIR), a method that warps moving images of a desired modality to match the anatomy of a fixed image. However, concerns about its speed and accuracy led to its decline in popularity. With the recent advances of DL-based DIR, we now revisit and reinvigorate this line of research. In this paper, we propose a fast and accurate synthesis method based on DIR. We use the task of synthesizing a rare magnetic resonance (MR) sequence, white matter nulled (WMn) T1-weighted (T1-w) images, to demonstrate the potential of our approach. During training, our method learns a DIR model based on the widely available MPRAGE sequence, which is a cerebrospinal fluid nulled (CSFn) T1-w inversion recovery gradient echo pulse sequence. During testing, the trained DIR model is first applied to estimate the deformation between moving and fixed CSFn images. Subsequently, this estimated deformation is applied to align the paired WMn counterpart of the moving CSFn image, yielding a synthetic WMn image for the fixed CSFn image. Our experiments demonstrate promising results for unsupervised image synthesis using DIR. These findings highlight the potential of our technique in contexts where supervised synthesis methods are constrained by limited training data.
     <img src="/images/dir_synthesis_hays.png" width="900"/>
