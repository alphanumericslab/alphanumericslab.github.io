---
layout: home
title: Projects
---

***
## Biomedical Signal Processing and Modeling
### 1. Mathematical modeling of epidemic diseases

The Simulation and Estimation of Epidemics with Algorithms (SEEPIA) research group was formed at the very first weeks of the COVID-19 pandemic, in Grenoble Alpes University, France. The group was formed from independent researchers with various backgrounds (including mathematicians, control theory experts, signal processing experts, epidemiologists, and research engineers) who volunteered to synergize their expertise in modeling and forecasting the spread of the pandemic, under social and economic constraints.
  * Check-out my progressive technical report on this project on [arXiv](https://arxiv.org/abs/2003.11371).
  * I share my relayed source codes and simulations [here](https://github.com/rsameni/EpidemicModeling).
  * The [SEEPIA](http://51.178.55.78/SEEPIA/seepia.htm) (Simulation & Estimation of EPIdemics with Algorithms) work group.
  * Check-out my [LinkedIn](https://www.linkedin.com/in/reza-sameni-8a191229/) page.
  * Listen to my short courses on this topic in [Persian](https://youtu.be/Zfh2G0VpBY) and [English](https://youtu.be/pasyQympFGE)

### 2. Advances in fetal electrocardiography
This project has been one of my major fields of research since my PhD. Over the past years, our research team has contributed to many aspects of the problem, including theoretical modeling and signal processing, low-level signal processing engine design and implementation, and frontend software development. Some of our developments have been patented and licensed, leading to an FDA approved noninvasive fetal cardiac monitor system. Our research in this field has been continuously published in top-tier journals and presented in conferences. Our most recent scientific advances in this area include: a) online fetal ECG (fECG) extraction using online source separation algorithms; b) using the fECG for estimating and tracking fetal motions/rotations with respect to the maternal body coordinates; c) noninvasive fECG extraction from low-rank (as few as a single-channel) and time-varying mixtures; d) a novel semi-blind source separation algorithm for fECG extraction in presence of nonstationary noise and irregular maternal beats.
  * See the Meridian Monitor from [MindChild Medical Inc.](http://www.mindchild.com/)
  * Check-out my publications in this field from the [publications](https://rsameni.github.io/Research/Publications) page or on my [Google Scholar](https://scholar.google.com/citations?user=MkoXtWwAAAAJ&hl=en)

### 3. The open-source electrophysiological toolbox (OSET)
[OSET](http://oset.ir) is a collection of electrophysiological data and open source codes for biological signal generation, modeling, processing, and filtering, originally released in June 2006 and continuously updated. The latest version (the Pi version) can be cloned from my [gitlab](https://gitlab.com/rsameni/OSET) or [github](https://github.com/rsameni/OSET) mirror repositories.

### 4. Electromagneto-encephalography
We have contributed to various aspects of adult and fetal electroencephalography, including:
1. *EEG phase and frequency analysis:* The instantaneous phase (IP) and instantaneous frequency (IF) of the electroencephalogram (EEG) are notable complements for the EEG spectrum. Important phenomena such as phase coupling and phase resetting have been built on this property. We have theoretically proved that the common method used for EEG phase calculation in the literature is highly susceptible to noise and the smallest variations in algorithmic parameters. Based on this finding, we proposed a robust Monte Carlo algorithm for EEG phase calculation and, as proof of concept, successfully used it for brain computer interface applications. Open source codes of this project have been provided online for public use.
In a series of research we have proposed a robust statistical framework for EEG IP/IF estimation and analysis. See my [publications](https://rsameni.github.io/Research/Publications/journals.html) page for the full list of related papers. Here are the highlights of our related research:
    * [A Robust Statistical Framework for Instantaneous Electroencephalogram Phase and Frequency Estimation and Analysis](https://doi.org/10.1088/1361-6579/aa93a1)
    * The [Matlab codes](https://github.com/EsiSeraj/EEG-PhaseFreq-Analysis)
 2. *Fetal magnetoencephalography:* Using advanced multichannel signal processing techniques, we have been extracting and studying the magnetoencephalogram (MEG) of the fetus, from noninvasive signals recorded by SQUID technology systems. Our contribution in this project has been in the signal processing aspects and we have used datasets provided by our colleague Prof. Dirk Hoyer, from the Biomagnetic Center in Jena, Germany. See
    * [Validation of fetal auditory evoked cortical responses to enhance the assessment of early brain development using fetal MEG measurements](https://doi.org/10.1088/0967-3334/32/11/002)
    * [A general framework for extracting fetal magnetoencephalogram and audio-evoked responses](https://doi.org/10.1016/j.jneumeth.2012.10.021)
 3. *EEG artifact removal:* A very effective method for removing electrooculogram (EOG) artifacts from multichannel EEG recordings was proposed in:
    * [An iterative subspace denoising algorithm for removing electroencephalogram ocular artifacts](https://doi.org/10.1016/j.jneumeth.2014.01.024)
    * The Matlab source codes for this method are available in [OSET](http://oset.ir).

***
## Computational hardware/firmware architecture design
Hardware accelerators are currently at the heart of many machine learning and (biomedical) signal processing systems. In a continuous research, which I have directed over the past years, my graduate students and I have contributed to developing efficient computational firmware based on field-programmable gate array (FPGA) technologies. Our objective has been to develop firmware modules that are common in many machine learning and biomedical signal processing systems. To date, our contributions include the development of FPGA-based linear and nonlinear filter units, automated deep and shallow neural network architectures, low-level toolboxes for matrix and vector manipulation on hardware, automated mechanisms for porting state-space systems onto FPGA, and an automated mechanism for transforming recursive signal processing pseudo-codes into FPGA-based modules. The ultimate objective is to develop an ecosystem of open-source firmware modules, which can be integrated and used to develop machine learning and signal processing hardware accelerators. Considering that the FPGA technology is also used for prototyping application specific integrated circuits (ASIC), the developed units can be eventually used for developing customized machine learning chips. The FPGA hardware systems required for our firmware design and evaluation have also been designed and manufactured by our own team and used as trainer boards for an FPGA lab. Besides the engineering work, some of our scientific contributions in this area include:
 1. [Hardware efficient running median filters](https://doi.org/10.1109/TCSII.2015.2504945) and its [source codes](https://rsameni.github.io/Research/Projects/MedianFilter/median.html).

***
## Interpretive signal processing
Interpretive Signal Processing (ISP) is an ad hoc technique for customizing signal processing algorithms for non-numeric data. Genomic data such as DNA or protein sequences are examples of such data. Contrary to the conventional approach of coding and decoding non-numeric data to numeric values, the main idea in ISP is to interpret signal processing algorithm as they are and to taylor similar operators for the direct manipulation of non-numeric data. We have studied two cases of ISP in our previous research:
* [Similarity Search Using Matched Filtering in Genomic Data](https://doi.org/10.1109/AISP.2012.6313793)
* [Interpretive Time-Frequency Analysis of Non-numeric Genomic Data](https://doi.org/10.1186/s12859-017-1524-0)
* See also the extended version [here](https://rsameni.github.io/Research/Projects/ISP/ISP.html).

***
