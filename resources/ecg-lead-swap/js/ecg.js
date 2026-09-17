/* ===========================================================================
   ecg.js — ECG canvas rendering + morph animation
   ---------------------------------------------------------------------------
   Renders the six limb leads (I, II, III, aVR, aVL, aVF) from precomputed
   waveform arrays supplied by data/cases.json. `renderLeads` draws a static
   ECG-monitor-style strip; `morphLeads` tweens between two waveform sets for
   the recorded <-> corrected transition.
   =========================================================================== */
(function (global) {
  'use strict';

  var LIMB_LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];

  function getVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  function drawGrid(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = getVar('--ecg-bg', '#0a0f1e');
    ctx.fillRect(0, 0, w, h);
    var small = 8;
    ctx.lineWidth = 1;
    ctx.strokeStyle = getVar('--ecg-grid', 'rgba(255,90,90,0.16)');
    ctx.beginPath();
    for (var x = 0; x <= w; x += small) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (var y = 0; y <= h; y += small) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = getVar('--ecg-grid-strong', 'rgba(255,90,90,0.30)');
    ctx.beginPath();
    for (var x2 = 0; x2 <= w; x2 += small * 5) { ctx.moveTo(x2, 0); ctx.lineTo(x2, h); }
    for (var y2 = 0; y2 <= h; y2 += small * 5) { ctx.moveTo(0, y2); ctx.lineTo(w, y2); }
    ctx.stroke();
    ctx.restore();
  }

  // Plot 6 stacked limb leads. `signals` = array of 6 numeric arrays.
  function renderLeads(canvas, signals) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var cssW = canvas.clientWidth || 320;
    var rowH = 58;
    var cssH = rowH * 6;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = cssH + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawGrid(ctx, cssW, cssH);

    var trace = getVar('--ecg-trace', '#35e08f');
    var padX = 6;
    var plotW = cssW - padX * 2;
    var gain = 16; // px per mV

    for (var r = 0; r < 6; r++) {
      var sig = signals[r];
      var midY = r * rowH + rowH / 2;

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 12px -apple-system, system-ui, sans-serif';
      ctx.fillText(LIMB_LEADS[r], padX + 2, r * rowH + 14);

      ctx.beginPath();
      ctx.strokeStyle = trace;
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      for (var i = 0; i < sig.length; i++) {
        var x = padX + (i / (sig.length - 1)) * plotW;
        var y = midY - sig[i] * gain;
        if (y < r * rowH + 3) y = r * rowH + 3;
        if (y > (r + 1) * rowH - 3) y = (r + 1) * rowH - 3;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (r < 5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, (r + 1) * rowH);
        ctx.lineTo(cssW, (r + 1) * rowH);
        ctx.stroke();
      }
    }
  }

  // Tween from one set of 6 signals to another (recorded <-> corrected).
  function morphLeads(canvas, fromSignals, toSignals, durationMs, onDone) {
    var start = null;
    var dur = durationMs || 650;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var blended = fromSignals.map(function (f, idx) {
        var t = toSignals[idx];
        var out = new Array(f.length);
        for (var i = 0; i < f.length; i++) out[i] = f[i] + (t[i] - f[i]) * ease;
        return out;
      });
      renderLeads(canvas, blended);
      if (p < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  // Mix true-identity RA/LA/LL electrode potentials into the 6 limb leads, given
  // which identity currently occupies each anatomical slot (occupant.RA/LA/LL).
  // Standard Einthoven/Goldberger relations — mirrors the limb-lead rows of
  // ELEC_TO_LEAD_FULL in ecg-lead-swapping/codes/src/ecg_transform_consts.py.
  function leadsFromElectrodes(electrodes, occupant) {
    var RA = electrodes[occupant.RA], LA = electrodes[occupant.LA], LL = electrodes[occupant.LL];
    var n = RA.length;
    var I = new Array(n), II = new Array(n), III = new Array(n),
        aVR = new Array(n), aVL = new Array(n), aVF = new Array(n);
    for (var i = 0; i < n; i++) {
      var ra = RA[i], la = LA[i], ll = LL[i];
      I[i] = la - ra;
      II[i] = ll - ra;
      III[i] = ll - la;
      aVR[i] = ra - la / 2 - ll / 2;
      aVL[i] = la - ra / 2 - ll / 2;
      aVF[i] = ll - ra / 2 - la / 2;
    }
    return [I, II, III, aVR, aVL, aVF];
  }

  global.ECG = {
    LIMB_LEADS: LIMB_LEADS,
    renderLeads: renderLeads,
    morphLeads: morphLeads,
    leadsFromElectrodes: leadsFromElectrodes
  };
})(window);
