/* ===========================================================================
   cases.js — loads precomputed case data from data/cases.json
   ---------------------------------------------------------------------------
   The JSON is produced by ecg-lead-swapping/codes/website_export/export_cases.py
   (real model outputs + real PTB-XL waveforms). It is fetched once at startup
   and cached by the service worker, so the app still works offline.

   Each case object carries:
     id, category, num, title, subtitle, explanation, ecg_id, trueClass,
     binary { swapProbability, threshold },
     multiclass { predictedClass, probabilities[6] },
     leadOrder, samplingRateHz, reconstructionMetrics|null,
     waveforms { recorded[6][], corrected?[6][], reference?[6][] },
     electrodeOrder ["RA","LA","LL"], electrodes { RA[], LA[], LL[] } — true-identity
     electrode potentials; ECG.leadsFromElectrodes() mixes these into leads live for
     whatever RA/LA/LL wiring the body diagram is currently showing.
   =========================================================================== */
(function (global) {
  'use strict';

  var CLASS_LABELS = {
    0: 'No swap', 1: 'RA ↔ LA', 2: 'RA ↔ LL',
    3: 'LA ↔ LL', 4: 'RA→LA→LL', 5: 'RA→LL→LA'
  };

  // Quiz still only offers the three single swaps.  option -> classId
  var QUIZ_OPTIONS = [
    { label: 'RA ↔ LA', classId: 1 },
    { label: 'RA ↔ LL', classId: 2 },
    { label: 'LA ↔ LL', classId: 3 }
  ];

  var CaseData = {
    all: [],
    byId: function (id) {
      for (var i = 0; i < CaseData.all.length; i++) if (CaseData.all[i].id === id) return CaseData.all[i];
      return null;
    },
    CLASS_LABELS: CLASS_LABELS,
    QUIZ_OPTIONS: QUIZ_OPTIONS,
    load: function () {
      return fetch('./data/cases.json', { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (payload) {
          CaseData.all = payload.cases || [];
          if (payload.classLabels) CaseData.CLASS_LABELS = payload.classLabels;
          CaseData.disclaimer = payload.disclaimer;
          return CaseData;
        });
    }
  };

  global.CaseData = CaseData;
})(window);
