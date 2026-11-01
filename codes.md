---
layout: page
title: Codes
---

- The open-source projects of the Alphanumerics Lab on [GitHub](https://github.com/alphanumericslab).

### The open-source electrophysiological toolbox (OSET)

[OSET](https://github.com/alphanumericslab/OSET) is a collection of tools for biomedical signal processing, started in 2006. It covers the analysis, denoising and modeling of electrocardiogram (ECG), electroencephalogram (EEG), phonocardiogram (PCG) and other physiological signals, as well as synthetic data generation for training machine learning models. OSET is developed primarily in MATLAB, with parts in Python and C++, under a permissive open-source license.

- Source code: [github.com/alphanumericslab/OSET](https://github.com/alphanumericslab/OSET)

### WFDB-x: the WFDB software in seven programming languages

[WFDB-x](https://sameni.org/wfdb-x/) is a reimplementation of the WFDB Software Package (version 10.7.0), the reference software for the WFDB format of PhysioNet's databases, in Python, C++, Rust, Julia, R, MATLAB/Octave and Kotlin. Each implementation provides the complete WFDB library, its 33 command-line tools and a high-level interface in its own language, without depending on the C library, and reads and writes exactly the same files as the original C programs, as verified by a conformance suite of more than 1,000 test cases. WFDB-x is distributed under the GNU General Public License.

- Source code and documentation: [github.com/alphanumericslab/wfdb-x](https://github.com/alphanumericslab/wfdb-x)
- Python package: `pip install wfdb-x` ([PyPI](https://pypi.org/project/wfdb-x/))
