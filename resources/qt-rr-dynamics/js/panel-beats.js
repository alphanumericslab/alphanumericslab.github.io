/* R-peak aligned averaged beats.

   At a given moment the panel shows one averaged beat: every beat whose R-peak
   falls within +/-30 s of that moment, aligned on R and averaged. A new curve
   is added as playback advances; earlier curves stay on screen in grey, so the
   family builds up and you watch the T wave move in as heart rate rises.

   Two different widths are in play, deliberately:

   - Each curve's own extent comes from the average RR of the minute it sits in:
     -0.25 * RR to +0.75 * RR. Stopping at three quarters of the cycle keeps the
     next beat's QRS out of the average always, and its P wave out too wherever
     diastole is long enough. Near peak heart rate it is not: the T wave itself
     runs past where the next P begins, so they genuinely overlap.
   - The axis is locked for the whole record at the largest smoothed RR, rounded
     up, so every per-minute curve fits on it and the grey family stays
     comparable from the first curve to the last.

   The highlighted curve follows the playhead continuously. Only the grey family
   is laid down on a grid, one curve every 3 s of real time. */

import { fit, createBuffer, Frame, ticks, drawGrid, polyline, withAlpha, cssColor, badge, AXIS_FONT } from './draw.js';
import { validity } from './overlays.js';

const MARGIN = { top: 12, right: 14, bottom: 32, left: 52 };
const FS = 100;
const MS_PER_SAMPLE = 1000 / FS;
const HALF_WINDOW_S = 30;      // beats averaged from t-30 s to t+30 s
const MINUTE_S = 60;
const MIN_BEATS = 3;           // below this an average is not worth drawing
const MIN_LANDMARKS = 5;       // below this a marker average is suppressed
const QRS_FROM_MS = -60;       // QRS span excluded from the T-wave amplitude range
const QRS_TO_MS = 100;

function mean(values) {
  if (values.length === 0) return NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export class BeatPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.cache = new Map();
    this.lastCurve = null;
    this.history = null;
    this.historyKey = '';
    this.lastIndex = -1;
  }

  setData(dataset, meta, palette, options) {
    this.dataset = dataset;
    this.meta = meta;
    this.palette = palette;
    this.options = options;
    this.cache.clear();
    this.history = null;
    this.historyKey = '';
    this.prepared = null;
  }

  setOptions(options) {
    this.options = options;
    this.history = null;
    this.historyKey = '';
  }

  invalidate() {
    this.history = null;
    this.historyKey = '';
  }

  /* Per-subject constants: per-minute widths, the locked axis, the y range. */
  _prepare() {
    if (this.prepared) return this.prepared;
    const { beats } = this.dataset;
    const duration = this.meta.durationS;

    const minuteCount = Math.ceil(duration / MINUTE_S);
    const buckets = Array.from({ length: minuteCount }, () => []);
    for (let i = 0; i < beats.n; i += 1) {
      const bucket = Math.min(minuteCount - 1, Math.floor(beats.t[i] / MINUTE_S));
      buckets[bucket].push(beats.rrS[i]);
    }
    /* Each curve's extent is the average RR of its own minute: -0.25 to +0.75 of
       it, so the window ends at 0.75 x RR. That leaves roughly a quarter of the
       cycle clear before the next beat, which keeps the following P wave out of
       the average wherever diastole is long enough to allow it. */
    let fallback = mean(beats.rrS);
    const minuteWidthMs = buckets.map((values) => {
      const value = values.length ? mean(values) : fallback;
      if (values.length) fallback = value;
      return value;
    });

    /* Locked axis: the largest smoothed RR, rounded up to 100 ms. Every
       per-minute curve is an average RR and so no wider than that, which means
       they all fit without the axis ever moving. */
    let widest = 0;
    for (let i = 0; i < beats.n; i += 1) widest = Math.max(widest, beats.rrS[i]);
    const axisWidthMs = Math.ceil(widest / 100) * 100;
    const axisRange = [-0.25 * axisWidthMs, 0.75 * axisWidthMs];

    this.prepared = { minuteWidthMs, axisWidthMs, axisRange, yFull: null, yWave: null };

    /* Both amplitude ranges come from a fixed 30 s grid, so neither depends on
       the playback speed and both stay locked for the whole record.

       yFull covers the entire averaged beat. yWave deliberately ignores the QRS
       complex, because this panel exists to show the T wave: on this lead the
       R-peak is ~1.8 mV against a ~0.1 mV T wave, so a full-range axis flattens
       the T wave into the baseline. The R-peak then leaves the axis, and that
       is marked explicitly rather than silently. */
    let low = Infinity; let high = -Infinity;
    let waveLow = Infinity; let waveHigh = -Infinity;
    for (let centre = 0; centre <= duration; centre += 30) {
      const curve = this._curveAt(centre);
      if (!curve) continue;
      for (let k = 0; k < curve.mv.length; k += 1) {
        const value = curve.mv[k];
        if (value < low) low = value;
        if (value > high) high = value;
        const ms = curve.loMs + k * MS_PER_SAMPLE;
        if (ms > QRS_FROM_MS && ms < QRS_TO_MS) continue;
        if (value < waveLow) waveLow = value;
        if (value > waveHigh) waveHigh = value;
      }
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) { low = -1; high = 1; }
    if (!Number.isFinite(waveLow) || !Number.isFinite(waveHigh)) { waveLow = low; waveHigh = high; }
    const pad = (high - low) * 0.08 || 0.1;
    const wavePad = (waveHigh - waveLow) * 0.18 || 0.05;
    this.prepared.yFull = [low - pad, high + pad];
    this.prepared.yWave = [waveLow - wavePad, waveHigh + wavePad];
    return this.prepared;
  }

  /* The averaged beat centred on `centre` seconds.

     Grid positions are cached, because a rebuild after a scrub asks for the
     same ones over and over. The live curve is not: it moves with the playhead,
     so caching it would just fill memory with entries never asked for twice. */
  _curveAt(centre, cache = true) {
    const key = Math.round(centre * 100);
    if (cache && this.cache.has(key)) return this.cache.get(key);

    const { beats, ecg } = this.dataset;
    const prepared = this.prepared;
    const minuteIndex = Math.min(prepared.minuteWidthMs.length - 1,
      Math.max(0, Math.floor(centre / MINUTE_S)));
    const widthMs = prepared.minuteWidthMs[minuteIndex];
    const lo = Math.round((-0.25 * widthMs) / MS_PER_SAMPLE);
    const hi = Math.round((0.75 * widthMs) / MS_PER_SAMPLE);
    const length = hi - lo + 1;

    const sum = new Float64Array(length);
    let count = 0;
    let qrsSum = 0; let qrsCount = 0;
    let peakSum = 0; let offSum = 0; let tCount = 0;

    for (let i = 0; i < beats.n; i += 1) {
      const t = beats.t[i];
      if (t < centre - HALF_WINDOW_S) continue;
      if (t > centre + HALF_WINDOW_S) break;      // beats.t is sorted

      const r = beats.rIdx[i];
      if (!Number.isInteger(r) || r + lo < 0 || r + hi >= ecg.length) continue;

      for (let k = 0; k < length; k += 1) sum[k] += ecg[r + lo + k];
      count += 1;

      /* Landmark averages use the same validity rules as the strip view, so a
         beat whose markers are unusable there is not averaged in here either. */
      const check = validity(beats, i, ecg.length);
      if (check.showQrsOn) { qrsSum += beats.qrsOn[i] - r; qrsCount += 1; }
      if (check.showT) {
        peakSum += beats.tPeak[i] - r;
        offSum += beats.tOff[i] - r;
        tCount += 1;
      }
    }

    let curve = null;
    if (count >= MIN_BEATS) {
      const scale = this.meta.ecgScale / count;
      const mv = new Float64Array(length);
      for (let k = 0; k < length; k += 1) mv[k] = sum[k] * scale;
      curve = {
        mv,
        loMs: lo * MS_PER_SAMPLE,
        hiMs: hi * MS_PER_SAMPLE,
        beats: count,
        phase: centre <= this.meta.peakTimeS ? 'exercise' : 'recovery',
        qrsOnMs: qrsCount >= MIN_LANDMARKS ? (qrsSum / qrsCount) * MS_PER_SAMPLE : null,
        tPeakMs: tCount >= MIN_LANDMARKS ? (peakSum / tCount) * MS_PER_SAMPLE : null,
        tOffMs: tCount >= MIN_LANDMARKS ? (offSum / tCount) * MS_PER_SAMPLE : null,
        landmarkBeats: tCount,
      };
    }
    if (cache) this.cache.set(key, curve);
    return curve;
  }

  /* Grid spacing: 3 s of real time at the current playback rate, which makes
     the family a function of (playhead, rate) and so rebuildable after a jump. */
  _spacing() {
    return Math.max(1, 3 * (this.options.rate || 10));
  }

  _drawCurve(ctx, frame, curve, color, width, alpha) {
    const points = [];
    const step = curve.mv.length > 400 ? 2 : 1;
    for (let k = 0; k < curve.mv.length; k += step) {
      const ms = curve.loMs + k * MS_PER_SAMPLE;
      points.push([frame.x(ms), frame.y(curve.mv[k])]);
    }
    polyline(ctx, points, { color, width, alpha });
  }

  _rebuildHistory(width, height, ratio, frame, index) {
    const { canvas, ctx } = createBuffer(width, height, ratio);
    ctx.save();
    frame.clip(ctx);
    const spacing = this._spacing();
    for (let k = 0; k < index; k += 1) {
      const curve = this._curveAt(k * spacing);
      if (curve) this._drawCurve(ctx, frame, curve, this.palette.muted, 1, 0.38);
    }
    ctx.restore();
    this.history = { canvas, ctx, frame };
  }

  render(time) {
    if (!this.dataset) return null;
    if (this.canvas.hidden) return null;

    const { ctx, width, height, ratio } = fit(this.canvas);
    if (width < 2 || height < 2) return null;
    this.lastCurve = null;

    const prepared = this._prepare();
    const palette = this.palette;
    const yRange = this.options.fullRange ? prepared.yFull : prepared.yWave;
    const frame = new Frame({
      width, height, margin: MARGIN,
      xRange: prepared.axisRange,
      yRange,
    });

    const spacing = this._spacing();
    const index = Math.max(0, Math.floor(time / spacing));
    const key = [width, height, ratio, spacing, palette.dark,
      this.dataset.subject, this.options.fullRange].join('|');

    if (!this.history || this.historyKey !== key) {
      this._rebuildHistory(width, height, ratio, frame, index);
      this.historyKey = key;
      this.lastIndex = index;
    } else if (index > this.lastIndex) {
      /* Usual case: one step forward. Retire the previous newest into the grey
         buffer rather than redrawing the whole family. */
      this.history.ctx.save();
      frame.clip(this.history.ctx);
      for (let k = this.lastIndex; k < index; k += 1) {
        const curve = this._curveAt(k * spacing);
        if (curve) this._drawCurve(this.history.ctx, frame, curve, palette.muted, 1, 0.38);
      }
      this.history.ctx.restore();
      this.lastIndex = index;
    } else if (index < this.lastIndex) {
      this._rebuildHistory(width, height, ratio, frame, index);
      this.lastIndex = index;
    }

    /* --- paint --- */
    drawGrid(ctx, frame, palette, {
      xTicks: ticks(prepared.axisRange[0], prepared.axisRange[1], 6),
      yTicks: ticks(yRange[0], yRange[1], 4),
      xFormat: (v) => String(Math.round(v)),
      yFormat: (v) => v.toFixed(1),
      xLabel: 'Time from R-peak (ms)',
      yLabel: 'ECG (mV)',
    });

    /* R-peak reference at 0. */
    ctx.save();
    ctx.strokeStyle = withAlpha(palette.muted, 0.55);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    const zero = Math.round(frame.x(0)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(zero, frame.top);
    ctx.lineTo(zero, frame.bottom);
    ctx.stroke();
    ctx.restore();

    ctx.drawImage(this.history.canvas, 0, 0, width, height);

    /* The curve on top is the average at this exact moment, not at the last
       grid point - otherwise the panel would sit still for seconds at a time
       while the caption claimed a window that was not being shown. */
    const current = this._curveAt(time, false);
    this.lastCurve = current;
    if (!current) return null;

    const color = current.phase === 'exercise' ? palette.exercise : palette.recovery;
    ctx.save();
    frame.clip(ctx);
    this._drawCurve(ctx, frame, current, color, 2, 1);
    if (this.options.showMeasurements) this._drawMarkers(ctx, frame, current, palette);
    ctx.restore();

    this._drawClipping(ctx, frame, palette, current, yRange);
    this._drawLegend(ctx, frame, palette, current, index);
    return current;
  }

  /* The T-wave range leaves the R-peak off the axis. Say so, and mark the edge
     it leaves through, so nothing is ever cropped silently. */
  _drawClipping(ctx, frame, palette, curve, yRange) {
    let extreme = 0;
    let aboveFrom = Infinity; let aboveTo = -Infinity;
    let belowFrom = Infinity; let belowTo = -Infinity;
    for (let k = 0; k < curve.mv.length; k += 1) {
      const value = curve.mv[k];
      const ms = curve.loMs + k * MS_PER_SAMPLE;
      if (value > yRange[1]) {
        aboveFrom = Math.min(aboveFrom, ms); aboveTo = Math.max(aboveTo, ms);
        if (value > extreme) extreme = value;
      }
      if (value < yRange[0]) {
        belowFrom = Math.min(belowFrom, ms); belowTo = Math.max(belowTo, ms);
        if (value < extreme) extreme = value;
      }
    }
    if (aboveTo < aboveFrom && belowTo < belowFrom) return;

    /* Chevrons span only the stretch that actually leaves the axis - a narrow
       band around the QRS - rather than the full width of the panel. */
    ctx.save();
    ctx.strokeStyle = withAlpha(palette.text, 0.5);
    ctx.lineWidth = 1.2;
    const band = (fromMs, toMs, edgeY, direction) => {
      if (toMs < fromMs) return;
      const x1 = Math.max(frame.left + 2, frame.x(fromMs) - 6);
      const x2 = Math.min(frame.right - 12, frame.x(toMs) + 6);
      for (let x = x1; x <= x2; x += 11) {
        ctx.beginPath();
        ctx.moveTo(x, edgeY);
        ctx.lineTo(x + 4, edgeY + direction * 5);
        ctx.lineTo(x + 8, edgeY);
        ctx.stroke();
      }
    };
    band(aboveFrom, aboveTo, frame.top + 2, 1);
    band(belowFrom, belowTo, frame.bottom - 2, -1);
    ctx.restore();

    badge(ctx, frame.left + 4, frame.top + 4,
      'QRS off-axis, peak ' + extreme.toFixed(2) + ' mV', palette);
  }

  _valueAt(curve, ms) {
    const k = Math.round((ms - curve.loMs) / MS_PER_SAMPLE);
    if (k < 0 || k >= curve.mv.length) return null;
    return curve.mv[k];
  }

  _drawMarkers(ctx, frame, curve, palette) {
    const entries = [
      [curve.qrsOnMs, palette.muted, 'line'],
      [0, palette.accent, 'r'],
      [curve.tPeakMs, palette.marker, 'dot'],
      [curve.tOffMs, palette.marker, 'line'],
    ];

    /* QT band from average QRS onset to average T end, matching the strip. */
    if (curve.qrsOnMs !== null && curve.tOffMs !== null) {
      const x1 = frame.x(curve.qrsOnMs);
      const x2 = frame.x(curve.tOffMs);
      /* Kept light: this band sits on top of the whole grey family. */
      ctx.fillStyle = withAlpha(palette.accent, palette.dark ? 0.085 : 0.075);
      ctx.fillRect(x1, frame.top, Math.max(1, x2 - x1), frame.plotHeight);
    }

    for (const [ms, color, kind] of entries) {
      if (ms === null || ms === undefined) continue;
      const value = this._valueAt(curve, ms);
      if (value === null) continue;
      const x = frame.x(ms);
      const y = frame.y(value);
      ctx.save();
      ctx.lineWidth = 1.5;
      if (kind === 'dot') {
        ctx.fillStyle = cssColor(color);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'r') {
        ctx.strokeStyle = cssColor(color);
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x, y - 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = cssColor(color);
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawLegend(ctx, frame, palette, curve, index) {
    const rows = [[curve.phase, curve.phase === 'exercise' ? palette.exercise : palette.recovery, 2, 1]];
    if (index > 0) rows.push(['earlier \u00d7 ' + index, palette.muted, 1, 0.5]);

    ctx.save();
    ctx.font = AXIS_FONT + 'px ' + palette.font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let widest = 0;
    for (const row of rows) widest = Math.max(widest, ctx.measureText(row[0]).width);
    const left = frame.right - widest - 22;
    let y = frame.bottom - 10 - (rows.length - 1) * 14;

    ctx.fillStyle = withAlpha(palette.background, 0.75);
    ctx.fillRect(left - 6, y - 9, widest + 28, rows.length * 14 + 4);

    for (const row of rows) {
      ctx.strokeStyle = withAlpha(row[1], row[3]);
      ctx.lineWidth = row[2];
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + 10, y);
      ctx.stroke();
      ctx.fillStyle = withAlpha(palette.muted, 0.9);
      ctx.fillText(row[0], left + 15, y);
      y += 14;
    }
    ctx.restore();
  }
}
