/* RR against time: the scrubber, and the panel that shows how the ECG snapshot
   relates to the playhead.

   The phase boundary drawn here is peak HR at 600 s. That is the definition the
   export is built around; the first recovery *beat* lands a fraction of a second
   later (600.428 s and 600.596 s for the two subjects) and is deliberately not
   used as the line position. */

import { fit, createBuffer, Frame, ticks, drawGrid, polyline, marker, withAlpha, cssColor, AXIS_FONT } from './draw.js';
import { sampleAt } from './sync.js';

const MARGIN = { top: 10, right: 12, bottom: 30, left: 52 };

export class TimelinePanel {
  constructor(canvas, { onSeek, onScrubStart, onScrubEnd }) {
    this.canvas = canvas;
    this.onSeek = onSeek;
    this.buffer = null;
    this.dragging = false;

    canvas.addEventListener('pointerdown', (event) => {
      /* Capture is an optimisation, not a requirement: it lets a drag that
         leaves the canvas keep tracking. Some pointer sources reject it, so a
         failure must not abort the seek. */
      try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
      this.dragging = true;
      onScrubStart();
      this._seekFromEvent(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (this.dragging) this._seekFromEvent(event);
    });
    const finish = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      } catch (_) { /* ignore */ }
      onScrubEnd();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
  }

  _seekFromEvent(event) {
    if (!this.buffer) return;
    const rect = this.canvas.getBoundingClientRect();
    const frame = this.buffer.frame;
    const minutes = frame.xInverse(event.clientX - rect.left);
    this.onSeek(this._toSeconds(minutes), { dragging: true });
  }

  _toSeconds(minutes) {
    const offset = this.options.fromPeak ? this.meta.peakTimeS : 0;
    return Math.min(this.meta.durationS, Math.max(0, minutes * 60 + offset));
  }

  _toMinutes(seconds) {
    const offset = this.options.fromPeak ? this.meta.peakTimeS : 0;
    return (seconds - offset) / 60;
  }

  setData(dataset, meta, palette, options) {
    this.dataset = dataset;
    this.meta = meta;
    this.palette = palette;
    this.options = options;
    this.buffer = null;
  }

  setOptions(options) {
    this.options = options;
    this.buffer = null;
  }

  invalidate() {
    this.buffer = null;
  }

  _build(width, height, ratio) {
    const { beats } = this.dataset;
    const palette = this.palette;
    const meta = this.meta;

    const xRange = this.options.fromPeak
      ? [-meta.peakTimeS / 60, (meta.durationS - meta.peakTimeS) / 60]
      : [0, meta.durationS / 60];

    const rrRange = meta.axisAll.rr;
    const frame = new Frame({ width, height, margin: MARGIN, xRange, yRange: rrRange });
    const { canvas, ctx } = createBuffer(width, height, ratio);

    /* Phase tints, split at peak HR. */
    const peakX = frame.x(this._toMinutes(meta.peakTimeS));
    ctx.fillStyle = withAlpha(palette.exercise, palette.dark ? 0.10 : 0.07);
    ctx.fillRect(frame.left, frame.top, Math.max(0, peakX - frame.left), frame.plotHeight);
    ctx.fillStyle = withAlpha(palette.recovery, palette.dark ? 0.10 : 0.07);
    ctx.fillRect(peakX, frame.top, Math.max(0, frame.right - peakX), frame.plotHeight);

    drawGrid(ctx, frame, palette, {
      xTicks: ticks(xRange[0], xRange[1], 6),
      yTicks: ticks(rrRange[0], rrRange[1], 4),
      xFormat: (v) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(0)),
      yFormat: (v) => String(Math.round(v)),
      xLabel: this.options.fromPeak ? 'Time from peak HR (min)' : 'Time (min)',
      yLabel: 'RR (ms)',
    });

    ctx.save();
    frame.clip(ctx);

    /* Raw RR in a theme neutral, smoothed RR over it in the phase colours. */
    const raw = [];
    for (let i = 0; i < beats.n; i += 1) {
      raw.push([frame.x(this._toMinutes(beats.t[i])), frame.y(beats.rr[i])]);
    }
    polyline(ctx, raw, { color: palette.trace, width: 1, alpha: palette.dark ? 0.5 : 0.6 });

    const split = beats.firstRecoveryBeatIndex;
    const smooth = (from, to) => {
      const points = [];
      for (let i = from; i < to; i += 1) {
        points.push([frame.x(this._toMinutes(beats.t[i])), frame.y(beats.rrS[i])]);
      }
      return points;
    };
    polyline(ctx, smooth(0, split + 1), { color: palette.exercise, width: 1.8, alpha: 0.95 });
    polyline(ctx, smooth(split, beats.n), { color: palette.recovery, width: 1.8, alpha: 0.95 });

    /* Peak HR at 600 s, dashed, in the exercise colour. */
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = withAlpha(palette.exercise, 0.85);
    ctx.beginPath();
    ctx.moveTo(peakX, frame.top);
    ctx.lineTo(peakX, frame.bottom);
    ctx.stroke();
    ctx.restore();

    ctx.font = AXIS_FONT + 'px ' + palette.font;
    ctx.fillStyle = cssColor(palette.muted);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('peak HR', peakX, frame.top + 2);

    ctx.restore();

    this.buffer = { canvas, frame, width, height, ratio };
  }

  render(time, hint, snapshot) {
    if (!this.dataset) return null;
    const { ctx, width, height, ratio } = fit(this.canvas);
    if (!this.buffer || this.buffer.width !== width
        || this.buffer.height !== height || this.buffer.ratio !== ratio) {
      this._build(width, height, ratio);
    }

    const { canvas: buffer, frame } = this.buffer;
    ctx.drawImage(buffer, 0, 0, width, height);

    const palette = this.palette;
    const state = sampleAt(this.dataset.beats, time, hint);

    ctx.save();
    frame.clip(ctx);

    /* Bracket showing which slice of record the ECG panel is displaying. The
       gap between this and the playhead is the snapshot lag, made visible. */
    if (snapshot) {
      const [from, to] = snapshot.span;
      const x1 = frame.x(this._toMinutes(from));
      const x2 = frame.x(this._toMinutes(to));
      const y = frame.top + 3;
      ctx.fillStyle = withAlpha(palette.accent, 0.16);
      ctx.fillRect(x1, frame.top, Math.max(2, x2 - x1), frame.plotHeight);
      ctx.strokeStyle = withAlpha(palette.accent, 0.75);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x1, y + 4);
      ctx.lineTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.lineTo(x2, y + 4);
      ctx.stroke();
    }

    /* Playhead + handle riding the smoothed RR curve. */
    const px = frame.x(this._toMinutes(time));
    ctx.strokeStyle = withAlpha(palette.accent, 0.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, frame.top);
    ctx.lineTo(px, frame.bottom);
    ctx.stroke();
    ctx.restore();

    marker(ctx, px, frame.y(state.rrS), { color: palette.accent, radius: 5 });

    return state;
  }
}
