/* The ECG snapshot.

   The vertical scale is a robust fit to the visible window by default, so the
   T wave - the whole subject of this page - gets real vertical space. That can
   clip the R-peak, so clipping is never silent: excursions are counted, marked
   with chevrons on the exceeded edge, and named in a chip. "Full-range ECG"
   switches to a fixed per-subject scale that cannot clip at all. */

import { fit, createBuffer, Frame, ticks, drawGrid, polyline, withAlpha, cssColor, badge, AXIS_FONT } from './draw.js';
import { collectOverlays, MARKER_KINDS } from './overlays.js';

const MARGIN = { top: 12, right: 12, bottom: 30, left: 52 };
const FS = 100;

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const position = q * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export class EcgPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.buffer = null;
    this.snapshotKey = '';
  }

  setData(dataset, meta, palette, options) {
    this.dataset = dataset;
    this.meta = meta;
    this.palette = palette;
    this.options = options;
    this.buffer = null;
    this.snapshotKey = '';
  }

  setOptions(options) {
    this.options = options;
    this.buffer = null;
    this.snapshotKey = '';
  }

  invalidate() {
    this.buffer = null;
    this.snapshotKey = '';
  }

  /* Default is a robust fit to the visible window, because the panel's subject
     is the T wave: at full record range subject 2's 5.7 mV R-peak squashes a
     0.3 mV T wave into a couple of pixels. The fit can clip the R-peak, so
     clipping is never silent - excursions are counted, charted with chevrons
     and named in a chip - and "Full-range ECG" restores a scale that cannot
     clip at all. */
  _range(samples) {
    if (this.options.fullRange) {
      const pad = (this.meta.ecgMax - this.meta.ecgMin) * 0.05;
      return { range: [this.meta.ecgMin - pad, this.meta.ecgMax + pad], clipped: null };
    }
    const sorted = Array.from(samples).sort((a, b) => a - b);
    const lo = percentile(sorted, 0.004);
    const hi = percentile(sorted, 0.996);
    const pad = (hi - lo) * 0.12 || 0.1;
    const range = [lo - pad, hi + pad];
    let below = 0;
    let above = 0;
    let extreme = 0;
    for (const value of samples) {
      if (value < range[0]) { below += 1; extreme = Math.min(extreme, value); }
      if (value > range[1]) { above += 1; extreme = Math.max(extreme, value); }
    }
    return {
      range,
      clipped: below + above > 0 ? { below, above, extreme } : null,
    };
  }

  /* Rebuild only when the snapshot window actually moves. */
  render(snapshot, { force = false } = {}) {
    if (!this.dataset) return null;
    const { ctx, width, height, ratio } = fit(this.canvas);
    const [from, to] = snapshot.span;
    const key = [from.toFixed(3), to.toFixed(3), width, height, ratio,
      this.options.showMeasurements, this.options.fullRange].join('|');

    if (force || key !== this.snapshotKey || !this.buffer) {
      this._build(width, height, ratio, from, to);
      this.snapshotKey = key;
    }
    ctx.drawImage(this.buffer.canvas, 0, 0, width, height);
    return this.buffer.info;
  }

  _build(width, height, ratio, from, to) {
    const { ecg, beats } = this.dataset;
    const palette = this.palette;
    const s0 = Math.max(0, Math.round(from * FS));
    const s1 = Math.min(ecg.length - 1, Math.round(to * FS));
    const scale = this.meta.ecgScale;

    const samples = new Float64Array(Math.max(0, s1 - s0 + 1));
    for (let i = 0; i < samples.length; i += 1) samples[i] = ecg[s0 + i] * scale;

    const { range, clipped } = this._range(samples);
    const frame = new Frame({
      width, height, margin: MARGIN,
      xRange: [from, to],
      yRange: range,
    });

    const { canvas, ctx } = createBuffer(width, height, ratio);

    drawGrid(ctx, frame, palette, {
      xTicks: ticks(from, to, 5),
      yTicks: ticks(range[0], range[1], 4),
      xFormat: (v) => v.toFixed(1),
      yFormat: (v) => v.toFixed(1),
      xLabel: 'Time (s)',
      yLabel: 'ECG (mV)',
    });

    ctx.save();
    frame.clip(ctx);

    const overlays = this.options.showMeasurements
      ? collectOverlays(beats, s0, s1, ecg.length)
      : { markers: [], bands: [] };

    /* QT bands sit under the trace. True endpoints are kept; the frame clips,
       and a chevron marks the side that continues outside the window. */
    for (const band of overlays.bands) {
      const x1 = frame.x(band.from / FS);
      const x2 = frame.x(band.to / FS);
      ctx.fillStyle = withAlpha(palette.accent, palette.dark ? 0.15 : 0.11);
      ctx.fillRect(x1, frame.top, Math.max(1, x2 - x1), frame.plotHeight);
      ctx.strokeStyle = withAlpha(palette.accent, 0.35);
      ctx.lineWidth = 1;
      if (!band.clippedLeft) {
        ctx.beginPath();
        ctx.moveTo(Math.round(x1) + 0.5, frame.top);
        ctx.lineTo(Math.round(x1) + 0.5, frame.bottom);
        ctx.stroke();
      }
      if (!band.clippedRight) {
        ctx.beginPath();
        ctx.moveTo(Math.round(x2) + 0.5, frame.top);
        ctx.lineTo(Math.round(x2) + 0.5, frame.bottom);
        ctx.stroke();
      }
      if (band.clippedLeft || band.clippedRight) {
        ctx.fillStyle = withAlpha(palette.accent, 0.6);
        const y = frame.top + 6;
        const x = band.clippedLeft ? frame.left + 5 : frame.right - 5;
        const direction = band.clippedLeft ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 3.5);
        ctx.lineTo(x + direction * 5, y);
        ctx.lineTo(x, y + 3.5);
        ctx.fill();
      }
    }

    /* The trace. */
    const points = [];
    for (let i = 0; i < samples.length; i += 1) {
      points.push([frame.x((s0 + i) / FS), frame.y(samples[i])]);
    }
    polyline(ctx, points, { color: palette.text, width: 1.35, alpha: 1 });

    /* Markers. */
    for (const item of overlays.markers) {
      const x = frame.x(item.sample / FS);
      const y = frame.y(ecg[item.sample] * scale);
      drawMarker(ctx, x, y, item.kind, palette);
    }

    ctx.restore();

    if (clipped) {
      const text = 'clipped: ' + (clipped.below + clipped.above) + ' samples, peak '
        + clipped.extreme.toFixed(2) + ' mV';
      badge(ctx, frame.left + 4, frame.top + 4, text, palette);
      ctx.save();
      ctx.strokeStyle = withAlpha(palette.text, 0.5);
      ctx.lineWidth = 1.2;
      for (let x = frame.left + 6; x < frame.right; x += 14) {
        if (clipped.above) {
          ctx.beginPath();
          ctx.moveTo(x, frame.top + 2);
          ctx.lineTo(x + 5, frame.top + 7);
          ctx.lineTo(x + 10, frame.top + 2);
          ctx.stroke();
        }
        if (clipped.below) {
          ctx.beginPath();
          ctx.moveTo(x, frame.bottom - 2);
          ctx.lineTo(x + 5, frame.bottom - 7);
          ctx.lineTo(x + 10, frame.bottom - 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (this.options.showMeasurements) {
      legend(ctx, frame, palette);
    }

    this.buffer = {
      canvas,
      info: { s0, s1, from, to, clipped, bands: overlays.bands.length, markers: overlays.markers.length },
    };
  }
}

function drawMarker(ctx, x, y, kind, palette) {
  ctx.save();
  ctx.lineWidth = 1.4;
  if (kind === MARKER_KINDS.KIND_R) {
    ctx.strokeStyle = cssColor(palette.accent);
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y - 1);
    ctx.stroke();
  } else if (kind === MARKER_KINDS.KIND_QRS_ON) {
    ctx.strokeStyle = withAlpha(palette.muted, 0.95);
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
  } else if (kind === MARKER_KINDS.KIND_T_TIE) {
    /* T-peak and T-end fell on the same 10 ms sample: one combined glyph, so a
       rounding tie never looks like a single missing landmark. */
    ctx.fillStyle = cssColor(palette.marker);
    ctx.beginPath();
    ctx.moveTo(x, y - 4.5);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 4.5);
    ctx.lineTo(x - 4, y);
    ctx.closePath();
    ctx.fill();
  } else if (kind === MARKER_KINDS.KIND_T_PEAK) {
    ctx.fillStyle = cssColor(palette.marker);
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === MARKER_KINDS.KIND_T_OFF) {
    ctx.strokeStyle = cssColor(palette.marker);
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function legend(ctx, frame, palette) {
  /* The legend draws the real glyphs, so the marker shapes on the trace are
     identifiable rather than just colour-coded. */
  const entries = [
    [MARKER_KINDS.KIND_QRS_ON, 'QRS onset'],
    [MARKER_KINDS.KIND_R, 'R'],
    [MARKER_KINDS.KIND_T_PEAK, 'T peak'],
    [MARKER_KINDS.KIND_T_OFF, 'T end'],
    [MARKER_KINDS.KIND_T_TIE, 'T peak = T end'],
  ];
  ctx.save();
  ctx.font = AXIS_FONT + 'px ' + palette.font;
  ctx.textBaseline = 'middle';

  let total = 0;
  for (const [, label] of entries) total += ctx.measureText(label).width + 22;

  const y = frame.top + 8;
  let x = frame.right - total;
  /* A translucent plate keeps the legend readable over the trace. */
  ctx.fillStyle = withAlpha(palette.background, 0.78);
  ctx.fillRect(x - 6, y - 9, total + 8, 18);

  for (const [kind, label] of entries) {
    drawMarker(ctx, x + 5, y, kind, palette);
    ctx.fillStyle = cssColor(palette.muted);
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 13, y);
    x += ctx.measureText(label).width + 22;
  }
  ctx.restore();
}
