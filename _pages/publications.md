---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
---

**Find the full list of my publications on [GoogleScholar](https://scholar.google.com/citations?user=GQGYangAAAAJ&hl=en).**

## **1. HACA3: A unified approach for Multi-site MR image harmonization**
   - **Authors:** **Lianrui Zuo**, Yihao Liu, Yuan Xue, Blake E. Dewey, Samuel W. Remedios, Savannah P. Hays, Murat Bilgel, Ellen M. Mowry, Scott D. Newsome, Peter A. Calabresi, Susan M. Resnick, Jerry L. Prince, and Aaron Carass
   - **Submitted to:** Computerized Medical Imaging and Graphics
   - **Paper link:** [https://www.sciencedirect.com/science/article/pii/S0895611123001039](https://www.sciencedirect.com/science/article/pii/S0895611123001039)
   - **Code:** [GitHub](https://github.com/lianruizuo/haca3)
   - **Abstract:** The lack of standardization and consistency of acquisition is a prominent issue in magnetic resonance (MR) imaging. This often causes undesired contrast variations in the acquired images due to differences in hardware and acquisition parameters. In recent years, image synthesis-based MR harmonization with disentanglement has been proposed to compensate for the undesired contrast variations. The general idea is to disentangle anatomy and contrast information from MR images to achieve cross-site harmonization. Despite the success of existing methods, we argue that major improvements can be made from three aspects. First, most existing methods are built upon the assumption that multi-contrast MR images of the same subject share the same anatomy. This assumption is questionable, since different MR contrasts are specialized to highlight different anatomical features. Second, these methods often require a fixed set of MR contrasts for training (e.g., both T1-weighted and T2-weighted images), limiting their applicability. Lastly, existing methods are generally sensitive to imaging artifacts. In this paper, we present Harmonization with Attention-based Contrast, Anatomy, and Artifact Awareness (HACA3), a novel approach to address these three issues. HACA3 incorporates an anatomy fusion module that accounts for the inherent anatomical differences between MR contrasts. Furthermore, HACA3 can be trained and applied to any combination of MR contrasts and is robust to imaging artifacts. HACA3 is developed and evaluated on diverse MR datasets acquired from 21 sites with varying field strengths, scanner platforms, and acquisition protocols. Experiments show that HACA3 achieves state-of-the-art harmonization performance under multiple image quality metrics. We also demonstrate the versatility and potential clinical impact of HACA3 on downstream tasks including white matter lesion segmentation for people with multiple sclerosis and longitudinal volumetric analyses for normal aging subjects. 
     <img src="/images/haca3_ga.png" width="900"/>
   - **Citation:**   
     ```@article{zuo2023haca3,
     title={HACA3: A unified approach for multi-site MR image harmonization},
     author={Zuo, Lianrui and Liu, Yihao and Xue, Yuan and Dewey, Blake E and Remedios, Samuel W and
             Hays, Savannah P and Bilgel, Murat and Mowry, Ellen M and Newsome, Scott D and Calabresi, Peter A and
             Renick, Susan M and Prince, Jerry L and Carass, Aaron},
     journal={Computerized Medical Imaging and Graphics},
     volume={109},
     pages={102285},
     year={2023},
     publisher={Elsevier}}
