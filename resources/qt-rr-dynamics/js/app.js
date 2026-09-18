/* QT-RR Dynamics - bootstrap and wiring.

   One clock drives the RR handle and both hysteresis points. The ECG keeps its
   own snapshot timestamp and is re-latched on a wall-clock cadence, plus
   immediately on any discontinuity (seek, drag, subject change, loop wrap,
   replay, resume, tab return). */

import { readPalette, watchTheme } from './theme.js';
import { loadMeta, loadSubject, nextTicket, isCurrent, LoadError } from './data.js';
import { Clock } from './clock.js';
import { Snapshot, sampleAt } from './sync.js';
import { identifiedBeat, validity } from './overlays.js';
import { EcgPanel } from './panel-ecg.js';
import { BeatPanel } from './panel-beats.js';
import { HysteresisPanel } from './panel-hysteresis.js';
import { TimelinePanel } from './panel-timeline.js';
import { formatClock, formatNumber } from './draw.js';

const root = document.getElementById('qtrr-app');
if (root) start(root).catch(reportFatal);

function element(id) {
  return document.getElementById(id);
}

function reportFatal(error) {
  console.error('[qt-rr-dynamics]', error);
  const status = element('qtrr-status');
  if (status) {
    status.textContent = 'Could not load this visualisation.';
    status.classList.add('is-error');
  }
}

async function start(root) {
  const ui = {
    status: element('qtrr-status'),
    ecgNote: element('qtrr-ecg-note'),
    qtReadout: element('qtrr-qt-readout'),
    tampReadout: element('qtrr-tamp-readout'),
    time: element('qtrr-time'),
    play: element('qtrr-play'),
    loop: element('qtrr-loop'),
    measure: element('qtrr-measure'),
    scatter: element('qtrr-scatter'),
    trail: element('qtrr-trail'),
    peakAxis: element('qtrr-peakaxis'),
    fullRange: element('qtrr-fullrange'),
    windowSelect: element('qtrr-window'),
    latchSelect: element('qtrr-latch'),
  };

  const options = {
    /* On by default: the markers are the point of the ECG panel. Must stay in
       step with the `checked` attribute on #qtrr-measure in the page markup. */
    showMeasurements: true,
    showScatter: false,
    showTrail: false,
    trailSeconds: 8,
    fromPeak: false,
    fullRange: false,
    ecgView: 'beats',
    /* The beat panel derives its grid spacing from the playback rate, so it
       needs to see rate changes. */
    rate: 10,
  };

  let palette = readPalette();
  let meta = null;
  let subjectMeta = null;
  let dataset = null;
  let subject = readSubjectParam(root);
  /* Read once, up front: the first selectSubject() writes the URL, which would
     otherwise overwrite the incoming ?t before it has been used. */
  const initialTime = readTimeParam();
  let hint;

  const snapshot = new Snapshot({ windowSeconds: 5, latchMs: 3000, duration: 1200 });

  const ecg = new EcgPanel(element('qtrr-canvas-ecg'));
  const beatsPanel = new BeatPanel(element('qtrr-canvas-beats'));
  const qt = new HysteresisPanel(element('qtrr-canvas-qt'), {
    yKey: 'qtS', yLabel: 'QT (ms)', yDigits: 0, axisKey: 'qt',
  });
  const tamp = new HysteresisPanel(element('qtrr-canvas-tamp'), {
    yKey: 'tampS', yLabel: 'T-amp (mV)', yDigits: 2, axisKey: 'tamp',
  });

  const clock = new Clock({
    duration: 1200,
    onTick: (time, info) => {
      if (info.seeked || info.wrapped || info.resumed || info.ended) {
        snapshot.update(time, { force: true });
      }
      render(time);
    },
  });

  const timeline = new TimelinePanel(element('qtrr-canvas-timeline'), {
    onSeek: (seconds) => clock.seek(seconds),
    onScrubStart: () => clock.beginScrub(),
    onScrubEnd: () => { clock.endScrub(); writeUrl(); },
  });

  const panels = [ecg, beatsPanel, qt, tamp, timeline];

  function setStatus(text, isError) {
    ui.status.textContent = text;
    ui.status.classList.toggle('is-error', Boolean(isError));
  }

  function showRetry(message, error) {
    console.error('[qt-rr-dynamics] load failed:', error && error.url ? error.url : '', error);
    ui.status.innerHTML = '';
    ui.status.classList.add('is-error');
    ui.status.append(message + ' ');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qtrr-retry';
    button.textContent = 'Retry';
    button.addEventListener('click', () => selectSubject(subject, { force: true }));
    ui.status.append(button);
  }

  /* Registered before any await so a theme flip during loading is not missed. */
  watchTheme(() => {
    palette = readPalette();
    if (!dataset) return;
    for (const panel of panels) panel.setData(dataset, subjectMeta, palette, options);
    render(clock.time, { force: true });
  });

  /* --- data -------------------------------------------------------------- */

  try {
    meta = await loadMeta();
  } catch (error) {
    showRetry('Could not load the dataset index.', error);
    return;
  }

  async function selectSubject(next, { force = false } = {}) {
    if (!force && dataset && dataset.subject === next) return;
    const ticket = nextTicket();
    subject = next;
    updateSubjectChips();
    setStatus('Loading subject ' + next + '…');

    let loaded;
    try {
      loaded = await loadSubject(next);
    } catch (error) {
      if (!isCurrent(ticket)) return;           // a newer request already won
      showRetry('Could not load subject ' + next + '.', error);
      return;
    }
    /* Out-of-order responses are dropped, so rapid switching cannot leave the
       panels showing a mixture of two subjects. */
    if (!isCurrent(ticket)) return;

    /* Atomic swap: every panel is re-seeded before anything is drawn. */
    dataset = loaded;
    subjectMeta = meta.subjects.find((entry) => entry.subject === next);
    hint = undefined;
    /* Re-read here as well as in the observer: the site's own script sets
       data-theme after the document is parsed, which can land while this load
       is still in flight. */
    palette = readPalette();
    for (const panel of panels) panel.setData(dataset, subjectMeta, palette, options);
    snapshot.update(clock.time, { force: true });
    setStatus(describeSubject());
    writeUrl();
    render(clock.time, { force: true });
  }

  function describeSubject() {
    const quality = subjectMeta.annotationQuality;
    const suppressed = quality.incompleteLandmarks.length + quality.reversalsWithFiniteQt.length;
    return subjectMeta.nBeats + ' beats · ' + subjectMeta.nExercise + ' exercise / '
      + subjectMeta.nRecovery + ' recovery · ' + suppressed
      + ' beat' + (suppressed === 1 ? '' : 's') + ' without usable T markers';
  }

  function updateSubjectChips() {
    root.querySelectorAll('[data-subject]').forEach((chip) => {
      const active = Number(chip.dataset.subject) === subject;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  /* --- rendering --------------------------------------------------------- */

  function render(time, { force = false } = {}) {
    if (!dataset) return;

    const moved = snapshot.update(time, { playing: clock.playing && !clock.scrubbing });
    const state = sampleAt(dataset.beats, time, hint);
    hint = state.index;

    if (options.ecgView === 'beats') beatsPanel.render(time);
    else ecg.render(snapshot, { force: force || moved });
    qt.render(time, hint);
    tamp.render(time, hint);
    timeline.render(time, hint, snapshot);

    ui.time.textContent = formatClock(time);
    const slider = element('qtrr-canvas-timeline');
    slider.setAttribute('aria-valuenow', String(Math.round(time)));
    slider.setAttribute('aria-valuetext', formatClock(time) + ', ' + state.phase);

    /* Smoothed readouts follow playback time. */
    ui.qtReadout.textContent = 'RR ' + Math.round(state.rrS) + ' ms · QT '
      + Math.round(state.qtS) + ' ms · smoothed';
    ui.tampReadout.textContent = 'RR ' + Math.round(state.rrS) + ' ms · T-amp '
      + state.tampS.toFixed(3) + ' mV · smoothed';

    /* ECG readouts describe whichever view is on screen: the strip's note is
       about its lagging snapshot, the beat view's about the averaging window. */
    if (options.ecgView === 'beats') updateBeatNote(time);
    else updateEcgNote(time);
  }

  function updateEcgNote(time) {
    const [from, to] = snapshot.span;
    const lag = Math.max(0, snapshot.lagBehind(time));
    const s0 = Math.round(from * 100);
    const s1 = Math.round(to * 100);
    const beatIndex = identifiedBeat(dataset.beats, s0, s1);

    let detail = '';
    if (beatIndex >= 0) {
      const beats = dataset.beats;
      const check = validity(beats, beatIndex, dataset.ecg.length);
      const qtText = formatNumber(beats.qt[beatIndex], 0);
      const tampText = formatNumber(beats.tamp[beatIndex], 3);
      detail = ' · beat ' + beatIndex + ': QT ' + qtText + ' ms, T-amp ' + tampText + ' mV (raw)';
      if (options.showMeasurements && !check.showT) detail += ' · T markers unavailable';
    }

    ui.ecgNote.textContent = formatClock(from) + '–' + formatClock(to)
      + ' · ' + lag.toFixed(1) + ' s behind' + detail;
  }

  function updateBeatNote(time) {
    const curve = beatsPanel.lastCurve;
    /* Describes the curve actually on screen: it is averaged over the beats
       within +/-30 s of the playhead, clipped at the ends of the record. */
    const from = Math.max(0, time - 30);
    const to = Math.min(1200, time + 30);
    let detail = '';
    if (curve) {
      detail = ' \u00b7 ' + curve.beats + ' beats averaged';
      if (options.showMeasurements) {
        if (curve.tOffMs !== null && curve.qrsOnMs !== null) {
          detail += ' \u00b7 QT ' + Math.round(curve.tOffMs - curve.qrsOnMs) + ' ms (from markers)';
        } else {
          detail += ' \u00b7 T markers unavailable';
        }
      }
    }
    ui.ecgNote.textContent = formatClock(from) + '\u2013' + formatClock(to)
      + ' \u00b7 \u00b130 s window' + detail;
  }

  function repaint() {
    for (const panel of panels) panel.setOptions(options);
    render(clock.time, { force: true });
  }

  /* --- URL state --------------------------------------------------------- */

  /* Switches the ECG panel between the 5 s strip and the averaged-beat view. */
  function applyView(view) {
    options.ecgView = view === 'strip' ? 'strip' : 'beats';
    root.querySelectorAll('[data-ecgview]').forEach((chip) => {
      const active = chip.dataset.ecgview === options.ecgView;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    element('qtrr-canvas-ecg').hidden = options.ecgView !== 'strip';
    element('qtrr-canvas-beats').hidden = options.ecgView !== 'beats';
  }

  function readViewParam() {
    const raw = new URLSearchParams(window.location.search).get('view');
    return raw === 'strip' ? 'strip' : 'beats';
  }

  function readSubjectParam(root) {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('subject');
    if (raw === '1' || raw === '2') return Number(raw);
    const fallback = Number(root.dataset.initialSubject);
    return fallback === 2 ? 2 : 1;
  }

  function readTimeParam() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('t');
    if (raw === null) return 0;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;
    return Math.min(1200, Math.max(0, value));
  }

  /* Written on pause, drag end and subject change only - never per frame. */
  function writeUrl() {
    const params = new URLSearchParams(window.location.search);
    params.set('subject', String(subject));
    params.set('view', options.ecgView);
    params.set('t', clock.time.toFixed(1));
    const url = window.location.pathname + '?' + params.toString();
    window.history.replaceState(null, '', url);
  }

  /* --- controls ---------------------------------------------------------- */

  ui.play.addEventListener('click', () => {
    clock.toggle();
    if (!clock.playing) writeUrl();
  });

  root.querySelectorAll('[data-subject]').forEach((chip) => {
    chip.addEventListener('click', () => selectSubject(Number(chip.dataset.subject)));
  });

  root.querySelectorAll('[data-rate]').forEach((chip) => {
    chip.addEventListener('click', () => {
      clock.setRate(Number(chip.dataset.rate));
      options.rate = Number(chip.dataset.rate);
      beatsPanel.invalidate();
      root.querySelectorAll('[data-rate]').forEach((other) => {
        const active = other === chip;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    });
  });

  root.querySelectorAll('[data-ecgview]').forEach((chip) => {
    chip.addEventListener('click', () => {
      applyView(chip.dataset.ecgview);
      writeUrl();
      repaint();
    });
  });

  ui.loop.addEventListener('change', () => clock.setLoop(ui.loop.checked));
  ui.measure.addEventListener('change', () => {
    options.showMeasurements = ui.measure.checked;
    repaint();
  });
  ui.scatter.addEventListener('change', () => {
    options.showScatter = ui.scatter.checked;
    repaint();
  });
  ui.trail.addEventListener('change', () => {
    options.showTrail = ui.trail.checked;
    repaint();
  });
  ui.peakAxis.addEventListener('change', () => {
    options.fromPeak = ui.peakAxis.checked;
    repaint();
  });
  ui.fullRange.addEventListener('change', () => {
    options.fullRange = ui.fullRange.checked;
    repaint();
  });
  ui.windowSelect.addEventListener('change', () => {
    snapshot.windowSeconds = Number(ui.windowSelect.value);
    snapshot.update(clock.time, { force: true });
    repaint();
  });
  ui.latchSelect.addEventListener('change', () => {
    snapshot.latchMs = Number(ui.latchSelect.value) * 1000;
    snapshot.update(clock.time, { force: true });
    repaint();
  });

  function syncPlayButton() {
    ui.play.setAttribute('aria-label', clock.playing ? 'Pause' : 'Play');
    ui.play.querySelector('.qtrr-btn__glyph').textContent = clock.playing ? '‖' : '▶';
  }
  const originalEmit = clock.emit.bind(clock);
  clock.emit = (info) => { originalEmit(info); syncPlayButton(); };

  document.addEventListener('keydown', (event) => {
    if (!root.contains(document.activeElement) && document.activeElement !== document.body) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const key = event.key;
    if (key === ' ' || key === 'Spacebar') { event.preventDefault(); clock.toggle(); if (!clock.playing) writeUrl(); }
    else if (key === 'ArrowLeft') { event.preventDefault(); clock.step(event.shiftKey ? -30 : -5); writeUrl(); }
    else if (key === 'ArrowRight') { event.preventDefault(); clock.step(event.shiftKey ? 30 : 5); writeUrl(); }
    else if (key === 'Home') { event.preventDefault(); clock.seek(0); writeUrl(); }
    else if (key === 'End') { event.preventDefault(); clock.seek(1200); writeUrl(); }
    else if (key === '1') selectSubject(1);
    else if (key === '2') selectSubject(2);
    else if (key === 'm' || key === 'M') { ui.measure.checked = !ui.measure.checked; ui.measure.dispatchEvent(new Event('change')); }
    else if (key === 'l' || key === 'L') { ui.loop.checked = !ui.loop.checked; ui.loop.dispatchEvent(new Event('change')); }
  });

  /* --- layout ------------------------------------------------------------ */

  const resize = new ResizeObserver(() => {
    for (const panel of panels) panel.invalidate();
    render(clock.time, { force: true });
  });
  resize.observe(root);

  /* --- go ---------------------------------------------------------------- */

  applyView(readViewParam());
  await selectSubject(subject, { force: true });
  clock.seek(initialTime);
  syncPlayButton();

  if (!clock.reducedMotion) clock.play();
}
