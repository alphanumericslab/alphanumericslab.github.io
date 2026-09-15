/* QT-RR and T-amp-RR hysteresis loops.

   The loop itself never changes while a subject is on screen, so it is drawn
   once into an offscreen buffer and blitted each frame. Only the moving point
   (and the optional trail) is redrawn, which keeps the animation cheap and the
   line quality constant. */

import { fit, createBuffer, Frame, ticks, drawGrid, polyline, marker, withAlpha, cssColor, AXIS_FONT } from './draw.js';
import { sampleAt, trailPath } from './sync.js';

const MARGIN = { top: 12, right: 12, bottom: 34, left: 52 };

export class HysteresisPanel {
  constructor(canvas, { yKey, yLabel, yDigits, axisKey }) {
    this.canvas = canvas;
    this.yKey = yKey;            // 'qtS' or 'tampS'
    this.rawKey = yKey === 'qtS' ? 'qt' : 'tamp';
    this.yLabel = yLabel;
    this.yDigits = yDigits;
    this.axisKey = axisKey;      // 'qt' or 'tamp'
    this.buffer = null;
    this.state = null;
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

  _buildBuffer(width, height, ratio) {
    const { beats } = this.dataset;
    const axis = this.options.showScatter ? this.meta.axisAll : this.meta.axisSmooth;
    const frame = new Frame({
      width, height, margin: MARGIN,
      xRange: axis.rr,
      yRange: axis[this.axisKey],
    });

    const { canvas, ctx } = createBuffer(width, height, ratio);
    const palette = this.palette;

    drawGrid(ctx, frame, palette, {
      xTicks: ticks(frame.xRange[0], frame.xRange[1], 5),
      yTicks: ticks(frame.yRange[0], frame.yRange[1], 4),
      xFormat: (v) => String(Math.round(v)),
      yFormat: (v) => (this.yDigits ? v.toFixed(this.yDigits) : String(Math.round(v))),
      xLabel: 'RR (ms)',
      yLabel: this.yLabel,
    });

    ctx.save();
    frame.clip(ctx);

    const split = beats.firstRecoveryBeatIndex;

    /* Optional raw scatter, baked in here so it costs nothing per frame. */
    if (this.options.showScatter) {
      for (let i = 0; i < beats.n; i += 1) {
        const yv = beats[this.rawKey][i];
        const xv = beats.rr[i];
        if (!Number.isFinite(yv) || !Number.isFinite(xv)) continue;
        ctx.fillStyle = withAlpha(i < split ? palette.exercise : palette.recovery, 0.10);
        ctx.beginPath();
        ctx.arc(frame.x(xv), frame.y(yv), 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const toPoints = (from, to) => {
      const points = [];
      for (let i = from; i < to; i += 1) {
        points.push([frame.x(beats.rrS[i]), frame.y(beats[this.yKey][i])]);
      }
      return points;
    };

    polyline(ctx, toPoints(0, split + 1), { color: palette.exercise, width: 1.5, alpha: 0.5 });
    polyline(ctx, toPoints(split, beats.n), { color: palette.recovery, width: 1.5, alpha: 0.5 });

    ctx.restore();

    /* Compact legend, placed in whichever corner the loop leaves emptiest so it
       never sits on top of the data. */
    const corner = emptiestCorner(beats, frame, this.yKey);
    ctx.save();
    ctx.font = AXIS_FONT + 'px ' + palette.font;
    ctx.textBaseline = 'middle';
    const entries = [['exercise', palette.exercise], ['recovery', palette.recovery]];
    const widest = Math.max(...entries.map(([label]) => ctx.measureText(label).width));
    const blockWidth = widest + 16;
    const left = corner.right ? frame.right - blockWidth - 4 : frame.left + 6;
    let y = corner.bottom ? frame.bottom - 20 : frame.top + 9;
    for (const [label, color] of entries) {
      ctx.strokeStyle = cssColor(color);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + 10, y);
      ctx.stroke();
      ctx.fillStyle = cssColor(palette.muted);
      ctx.fillText(label, left + 15, y);
      y += 14;
    }
    ctx.restore();

    this.buffer = { canvas, frame, width, height, ratio };
  }

  render(time, hint) {
    if (!this.dataset) return;
    const { ctx, width, height, ratio } = fit(this.canvas);
    if (!this.buffer || this.buffer.width !== width
        || this.buffer.height !== height || this.buffer.ratio !== ratio) {
      this._buildBuffer(width, height, ratio);
    }

    const { canvas: buffer, frame } = this.buffer;
    ctx.drawImage(buffer, 0, 0, width, height);

    const beats = this.dataset.beats;
    const state = sampleAt(beats, time, hint);
    const palette = this.palette;
    const color = state.phase === 'exercise' ? palette.exercise : palette.recovery;

    ctx.save();
    frame.clip(ctx);

    if (this.options.showTrail) {
      const path = trailPath(beats, time, this.options.trailSeconds, 'rrS', this.yKey)
        .map(([xv, yv]) => [frame.x(xv), frame.y(yv)]);
      polyline(ctx, path, { color, width: 2, alpha: 0.55 });
    }

    marker(ctx, frame.x(state.rrS), frame.y(state[this.yKey]), {
      color: palette.accent,
      radius: 4.5,
    });
    ctx.restore();

    this.state = state;
    return state;
  }
}


/* Count smoothed points falling in each corner box and return the emptiest. */
function emptiestCorner(beats, frame, yKey) {
  const boxWidth = frame.plotWidth * 0.34;
  const boxHeight = frame.plotHeight * 0.3;
  const corners = [
    { right: false, bottom: false, x0: frame.left, y0: frame.top },
    { right: true, bottom: false, x0: frame.right - boxWidth, y0: frame.top },
    { right: false, bottom: true, x0: frame.left, y0: frame.bottom - boxHeight },
    { right: true, bottom: true, x0: frame.right - boxWidth, y0: frame.bottom - boxHeight },
  ].map((corner) => Object.assign(corner, { count: 0 }));

  for (let i = 0; i < beats.n; i += 3) {
    const px = frame.x(beats.rrS[i]);
    const py = frame.y(beats[yKey][i]);
    for (const corner of corners) {
      if (px >= corner.x0 && px <= corner.x0 + boxWidth
          && py >= corner.y0 && py <= corner.y0 + boxHeight) corner.count += 1;
    }
  }
  return corners.reduce((best, corner) => (corner.count < best.count ? corner : best), corners[0]);
}
