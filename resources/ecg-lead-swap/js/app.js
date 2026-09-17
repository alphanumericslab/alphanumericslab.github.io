/* ===========================================================================
   app.js — flow controller / state machine for "Detect and Correct"
   ---------------------------------------------------------------------------
   Renders everything client-side. Top-level routing is hash-based (#/ home,
   #/case/:id case) so a GitHub Pages refresh won't 404; step-within-a-case is
   held in JS state. See ecg.js / bodyDiagram.js / cases.js for the pieces.
   =========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('app');

  var state = {
    caseId: null,
    step: null,
    swapGuess: null,     // 'swap' | 'noswap'
    classGuess: null,    // classId chosen in the quiz
    showingCorrected: false
  };

  // ---- tiny DOM helper ------------------------------------------------------
  function h(tag, props, children) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'html') e.innerHTML = props[k];
        else if (k.slice(0, 2) === 'on' && typeof props[k] === 'function') {
          e.addEventListener(k.slice(2).toLowerCase(), props[k]);
        } else if (props[k] != null) e.setAttribute(k, props[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function pct(p) { return Math.round(p * 100) + '%'; }

  // ---- shared components ----------------------------------------------------
  function topbar(crumb) {
    return h('div', { class: 'topbar' }, [
      h('button', { class: 'back', onclick: goHome }, ['← Examples']),
      h('span', { class: 'crumb' }, [crumb || ''])
    ]);
  }

  // ECG panel; returns { node, canvas, render(signals) }
  function ecgPanel(signals, pillText, pillClass) {
    var canvas = h('canvas', { class: 'ecg-canvas' });
    var wrap = h('div', { class: 'ecg-wrap' }, [canvas]);
    var caption = h('div', { class: 'ecg-caption' }, [
      h('span', {}, ['Limb leads · I, II, III, aVR, aVL, aVF']),
      pillText ? h('span', { class: 'pill ' + (pillClass || '') }, [pillText]) : null
    ]);
    var node = h('div', {}, [wrap, caption]);
    // render after layout so canvas.clientWidth is known
    requestAnimationFrame(function () { ECG.renderLeads(canvas, signals); });
    return { node: node, canvas: canvas, caption: caption };
  }

  function binaryReadout(c) {
    var p = c.binary.swapProbability;
    var detected = p >= c.binary.threshold;
    return h('div', { class: 'panel' }, [
      h('div', { class: 'section-label' }, ['Binary detector']),
      h('div', { class: 'readout' }, [
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Prediction']),
          h('span', { class: 'v' }, [detected ? 'Swap detected' : 'No swap detected'])
        ]),
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Swap probability']),
          h('span', { class: 'v' }, [
            pct(p),
            h('span', { class: 'sub' }, ['softmax confidence · threshold ' + pct(c.binary.threshold)])
          ])
        ])
      ])
    ]);
  }

  // Multiclass readout. `highlightClass` forces which row is emphasised (else top).
  function multiclassReadout(c, opts) {
    opts = opts || {};
    var probs = c.multiclass.probabilities;
    var topClass = opts.highlightClass != null ? opts.highlightClass : c.multiclass.predictedClass;

    var headParts = [];
    if (opts.scoreForClass != null) {
      headParts.push(h('div', { class: 'readout' }, [
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Score for your guess (' + CaseData.CLASS_LABELS[opts.scoreForClass] + ')']),
          h('span', { class: 'v' }, [pct(probs[opts.scoreForClass])])
        ])
      ]));
    } else {
      headParts.push(h('div', { class: 'readout' }, [
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Predicted swap']),
          h('span', { class: 'v' }, [CaseData.CLASS_LABELS[topClass]])
        ]),
        h('div', { class: 'row' }, [
          h('span', { class: 'k' }, ['Class probability']),
          h('span', { class: 'v' }, [pct(probs[topClass])])
        ])
      ]));
    }

    var bars = probs.map(function (p, idx) {
      return h('div', { class: 'prob' + (idx === topClass ? ' top' : '') }, [
        h('span', { class: 'lab' }, [CaseData.CLASS_LABELS[idx]]),
        h('span', { class: 'bar' }, [h('span', { style: 'width:' + pct(p) })]),
        h('span', { class: 'val' }, [pct(p)])
      ]);
    });

    var details = h('details', { class: 'more' }, [
      h('summary', {}, ['Show all class probabilities']),
      h('div', { class: 'probs' }, bars)
    ]);

    return h('div', { class: 'panel' }, [
      h('div', { class: 'section-label' }, ['Multiclass classifier (2-lead)'])
    ].concat(headParts, [details]));
  }

  function banner(kind, text) {
    var ico = kind === 'good' ? '✓' : kind === 'bad' ? '✕' : 'ℹ';
    return h('div', { class: 'result-banner ' + kind }, [
      h('span', { class: 'ico' }, [ico]),
      h('span', {}, [text])
    ]);
  }

  function quizButtons(onPick) {
    return h('div', { class: 'btn-stack' }, CaseData.QUIZ_OPTIONS.map(function (opt) {
      return h('button', { class: 'btn choice', onclick: function () { onPick(opt.classId); } }, [opt.label]);
    }));
  }

  // ---- HOME -----------------------------------------------------------------
  function renderHome() {
    var ecgIconSvg = '<svg viewBox="0 0 60 24" width="30" height="16" fill="none" stroke="#35e08f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="0,14 14,14 18,4 23,20 27,10 30,14 60,14"/></svg>';

    var cards = CaseData.all.map(function (c) {
      return h('button', { class: 'case-card fade-in', onclick: function () { openCase(c.id); } }, [
        h('div', { class: 'num' }, [String(c.num)]),
        h('div', { class: 'ecg-icon', html: ecgIconSvg }),
        h('div', { class: 'meta' }, [
          h('div', { class: 't' }, ['Example #' + c.num])
        ]),
        h('div', { class: 'chev' }, ['›'])
      ]);
    });

    mount([
      h('div', { class: 'hero fade-in' }, [
        h('div', { class: 'hero-ecg', 'aria-hidden': 'true' }),
        h('span', { class: 'badge' }, ['Detect & Correct']),
        h('h1', {}, ['Quiz yourself against the model!']),
        h('p', { style: 'color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:0.85rem' }, [
          'Detecting and Correcting ECG Limb-Lead Electrode Swapping via Deep Learning'
        ])
      ]),
      h('div', { class: 'about-wide fade-in', style: 'margin-top:24px' }, [
        h('div', { class: 'about-card' }, [
          h('h2', { class: 'about-title' }, ['Detecting and Correcting ECG Limb-Lead Electrode Swapping via Deep Learning']),
          h('p', { class: 'about-subtitle' }, [
            'A two-stage deep learning pipeline that detects, classifies, and corrects limb-lead electrode swaps in 12-lead ECGs — validated on real PTB-XL recordings. Alphanumerics Lab, Emory University.'
          ]),

          h('div', { class: 'about-full' }, [
            h('img', {
              src: './assets/poster/clinical-case.jpg',
              alt: 'Clinical case illustration: an undetected electrode swap in a chest-pain patient risks a misdiagnosis and an unnecessary $25K procedure.'
            })
          ]),

          h('div', { class: 'about-block' }, [
            h('div', { class: 'about-block-title' }, ['Quiz Yourself Against the Model']),
            h('div', { class: 'about-quiz-row' }, cards)
          ]),

          h('div', { class: 'about-block' }, [
            h('div', { class: 'about-block-title' }, ['The Problem: Why Electrode Misplacement?']),
            h('div', { class: 'about-block-subtitle' }, [
              h('ul', {}, [
                h('li', {}, ['Electrode misplacement occurs in 0.4% – 4% of high-acuity care settings.']),
                h('li', {}, ['Risks serious diagnostic errors, including obscuring or mimicking myocardial infarction, dextrocardia, and extreme axis deviation.'])
              ])
            ])
          ]),

          h('div', { class: 'about-block' }, [
            h('div', { class: 'about-block-title' }, ['Objective']),
            h('div', { class: 'about-block-subtitle' }, [
              h('ol', {}, [
                h('li', {}, ['Detect and classify limb lead electrode swaps using a deep learning approach.']),
                h('li', {}, ['Correct limb lead electrode swaps using the mathematical relationship between electrodes and leads.'])
              ])
            ])
          ]),

          h('div', { class: 'about-figures' }, [
            h('figure', {}, [
              h('img', {
                src: './assets/poster/data-generation.jpg',
                alt: 'Artificial data generation pipeline: lead space, electrode space, electrode swap, and the resulting "swapped" lead.'
              }),
              h('figcaption', {}, ['Artificial Data Generation — CODE-15%'])
            ]),
            h('figure', {}, [
              h('img', {
                src: './assets/poster/electrode-swap-classes.jpg',
                alt: 'The four electrode swap classes: no swap, RA-LA, RA-LL, and LA-LL, each shown as a body diagram with the swapped leads.'
              }),
              h('figcaption', {}, ['Electrode Swap Classes'])
            ]),
            h('figure', {}, [
              h('img', {
                src: './assets/poster/model-idea.jpg',
                alt: 'Diagram of the two-layer CNN model reading leads I, II, and III to detect and classify electrode swaps.'
              }),
              h('figcaption', {}, ['Model Idea — Layer 1 & Layer 2'])
            ])
          ])
        ])
      ])
    ]);
  }

  // ---- CASE dispatch --------------------------------------------------------
  function renderCase() {
    var c = CaseData.byId(state.caseId);
    if (!c) return goHome();
    if (c.category === 'synthetic_swap') return renderSyntheticSwap(c);
    if (c.category === 'clean') return renderClean(c);
    if (c.category === 'real_unconfirmed') return renderRealUnconfirmed(c);
  }

  // ---- Example 1: synthetic obvious swap ------------------------------------
  function renderSyntheticSwap(c) {
    var crumb = 'Example #' + c.num;

    if (state.step === 'inspect') {
      var panel = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Is this ECG swapped?']),
          panel.node,
          h('div', { class: 'btn-row' }, [
            h('button', { class: 'btn primary', onclick: function () { setStep('quiz'); state.swapGuess = 'swap'; } }, ['Swap']),
            h('button', { class: 'btn', onclick: function () { state.swapGuess = 'noswap'; setStep('binaryReveal'); } }, ['No swap'])
          ])
        ])
      ]);
    }

    if (state.step === 'binaryReveal') {   // reached only from a "No swap" (wrong) guess
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('bad', 'Incorrect — this ECG is swapped.'),
          binaryReadout(c),
          h('button', { class: 'btn primary', onclick: function () { setStep('quiz'); } }, ['Continue → which swap?'])
        ])
      ]);
    }

    if (state.step === 'quiz') {
      var panelQ = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Which electrodes were swapped?']),
          panelQ.node,
          quizButtons(function (classId) { state.classGuess = classId; setStep('final'); })
        ])
      ]);
    }

    if (state.step === 'final') {
      var correct = state.classGuess === c.trueClass;
      return mountFinalSwap(c, crumb, correct);
    }
  }

  // Shared final page for the quiz flow (Example 1 and Example 3 both converge here).
  // The electrode diagram is fully free-drag: whatever RA/LA/LL arrangement the
  // user lands on, the ECG is remixed live from the raw electrode signals to show
  // exactly what that wiring would record (see ECG.leadsFromElectrodes).
  function mountFinalSwap(c, crumb, correct, opts) {
    opts = opts || {};

    function pillClassFor(classId) { return classId === 0 ? 'corrected' : 'recorded'; }

    var initialOccupant = BodyDiagram.occupantFromClassId(c.multiclass.predictedClass);
    var currentLeads = ECG.leadsFromElectrodes(c.electrodes, initialOccupant);
    var panel = ecgPanel(currentLeads, CaseData.CLASS_LABELS[c.multiclass.predictedClass], pillClassFor(c.multiclass.predictedClass));

    var hint = h('p', { class: 'tiny', style: 'margin:10px 0 0;text-align:center' }, [
      'Drag any electrode to any position — the ECG updates live to match that exact wiring.'
    ]);

    var diagram = BodyDiagram.create(c.multiclass.predictedClass, function (occupant) {
      var newLeads = ECG.leadsFromElectrodes(c.electrodes, occupant);
      ECG.morphLeads(panel.canvas, currentLeads, newLeads, 650);
      currentLeads = newLeads;
      var classId = BodyDiagram.classIdFromOccupant(occupant);
      var newCaption = h('div', { class: 'ecg-caption' }, [
        h('span', {}, ['Limb leads · I, II, III, aVR, aVL, aVF']),
        h('span', { class: 'pill ' + pillClassFor(classId) }, [CaseData.CLASS_LABELS[classId]])
      ]);
      panel.caption.replaceWith(newCaption);
      panel.caption = newCaption;
    });

    var resetBtn = h('button', { class: 'btn ghost', style: 'margin-top:10px' }, ['Reset electrodes']);
    resetBtn.addEventListener('click', function () { diagram.reset(); });

    mount([
      topbar(crumb),
      h('div', { class: 'fade-in' }, [
        opts.notice ? h('div', { class: 'notice strong', style: 'font-weight:700;color:#000' }, [opts.notice]) : null,
        banner(correct ? 'good' : 'bad', correct ? (opts.correctText || 'Correct!') : (opts.wrongText || 'Not quite.')),
        binaryReadout(c),
        multiclassReadout(c),
        h('div', { class: 'panel' }, [
          h('div', { class: 'section-label' }, ['Electrode placement']),
          diagram.node,
          hint,
          h('p', { class: 'tiny', style: 'margin-top:6px;text-align:center' }, [c.explanation]),
          panel.node,
          resetBtn
        ])
      ])
    ]);
  }

  // ---- Example 2: clean, no swap --------------------------------------------
  function renderClean(c) {
    var crumb = 'Example #' + c.num;

    if (state.step === 'inspect') {
      var panel = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Is this ECG swapped?']),
          panel.node,
          h('div', { class: 'btn-row' }, [
            h('button', { class: 'btn', onclick: function () { state.swapGuess = 'swap'; setStep('quiz'); } }, ['Swap']),
            h('button', { class: 'btn primary', onclick: function () { state.swapGuess = 'noswap'; setStep('finalCorrect'); } }, ['No swap'])
          ])
        ])
      ]);
    }

    if (state.step === 'finalCorrect') {   // guessed "no swap" — correct, ends here
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('good', 'Correct — no swap here.'),
          binaryReadout(c),
          h('p', { class: 'tiny' }, [c.explanation]),
          h('button', { class: 'btn ghost', onclick: goHome }, ['Back to examples'])
        ])
      ]);
    }

    if (state.step === 'quiz') {           // guessed "swap" — wrong, quiz anyway
      var panelQ = ecgPanel(c.waveforms.recorded, 'Recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['If it were swapped — which electrodes?']),
          panelQ.node,
          quizButtons(function (classId) { state.classGuess = classId; setStep('finalWrong'); })
        ])
      ]);
    }

    if (state.step === 'finalWrong') {
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('bad', 'Incorrect — there is no swap in this ECG.'),
          binaryReadout(c),
          multiclassReadout(c, { scoreForClass: state.classGuess }),
          h('button', { class: 'btn ghost', onclick: goHome }, ['Back to examples'])
        ])
      ]);
    }
  }

  // ---- Example 3: real, confidently model-flagged ----------------------------
  function renderRealUnconfirmed(c) {
    var crumb = 'Example #' + c.num + ' · PTB-XL #' + c.ecg_id;

    if (state.step === 'inspect') {
      var panel = ecgPanel(c.waveforms.recorded, 'As recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Is this ECG swapped?']),
          panel.node,
          h('div', { class: 'btn-row' }, [
            h('button', { class: 'btn primary', onclick: function () { setStep('quiz'); state.swapGuess = 'swap'; } }, ['Swap']),
            h('button', { class: 'btn', onclick: function () { state.swapGuess = 'noswap'; setStep('binaryReveal'); } }, ['No swap'])
          ])
        ])
      ]);
    }

    if (state.step === 'binaryReveal') {   // reached only from a "No swap" (model-disagrees) guess
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          banner('bad', 'The model disagrees — it flagged this recording as swapped.'),
          binaryReadout(c),
          h('button', { class: 'btn primary', onclick: function () { setStep('quiz'); } }, ['Continue → which swap?'])
        ])
      ]);
    }

    if (state.step === 'quiz') {
      var panelQ = ecgPanel(c.waveforms.recorded, 'As recorded', 'recorded');
      return mount([
        topbar(crumb),
        h('div', { class: 'fade-in' }, [
          h('div', { class: 'prompt' }, ['Which electrodes were swapped?']),
          panelQ.node,
          quizButtons(function (classId) { state.classGuess = classId; setStep('final'); })
        ])
      ]);
    }

    if (state.step === 'final') {
      var correct = state.classGuess === c.trueClass;
      var swapLabel = CaseData.CLASS_LABELS[c.multiclass.predictedClass];
      return mountFinalSwap(c, crumb, correct, {
        notice: 'This is a real ECG — PTB-XL record #' + c.ecg_id + ', not synthetically swapped. ' +
          'The model flags it as a possible genuine ' + swapLabel + ' electrode swap in the wild.',
        correctText: 'Correct — matches the model’s flagged swap.',
        wrongText: 'Not quite — the model flagged a different swap.'
      });
    }
  }

  // ---- plumbing -------------------------------------------------------------
  function mount(nodes) {
    root.innerHTML = '';
    nodes.forEach(function (n) { if (n) root.appendChild(n); });
    window.scrollTo(0, 0);
  }

  function setStep(step) {
    state.step = step;
    state.showingCorrected = false;
    render();
  }

  function openCase(id) {
    state.caseId = id;
    state.step = 'inspect';
    state.swapGuess = null;
    state.classGuess = null;
    state.showingCorrected = false;
    location.hash = '#/case/' + id;
  }

  function goHome() {
    state.caseId = null;
    location.hash = '#/';
  }

  function render() {
    if (state.caseId) renderCase();
    else renderHome();
  }

  function onHashChange() {
    var m = location.hash.match(/^#\/case\/(.+)$/);
    if (m) {
      // entering (or refreshing) a case: start at its first step
      if (state.caseId !== m[1] || !state.step) {
        state.caseId = m[1];
        state.step = 'inspect';
        state.swapGuess = null;
        state.classGuess = null;
        state.showingCorrected = false;
      }
      render();
    } else {
      state.caseId = null;
      renderHome();
    }
  }

  function renderLoading() {
    mount([h('div', { class: 'panel fade-in', style: 'text-align:center' }, [
      h('p', { class: 'muted', style: 'margin:0' }, ['Loading examples…'])
    ])]);
  }

  function renderLoadError() {
    mount([h('div', { class: 'panel fade-in' }, [
      h('h2', {}, ['Couldn’t load case data']),
      h('p', {}, ['data/cases.json failed to load. If running locally, serve over http (not file://).']),
      h('button', { class: 'btn', onclick: function () { location.reload(); } }, ['Retry'])
    ])]);
  }

  // Case data loads asynchronously (fetch + service-worker cache), so wait for
  // it before wiring routing / first render.
  renderLoading();
  CaseData.load().then(function () {
    window.addEventListener('hashchange', onHashChange);
    onHashChange();
  }).catch(function (err) {
    if (window.console) console.error('case data load failed:', err);
    renderLoadError();
  });
})();
