/* Small canvas helpers shared by the four panels.

   House style: thin curves, a subtle grid in the template's border colour,
   labels in the template's own font and text colours. Nothing heavier than it
   needs to be - the aim is a figure that reads cleanly at a glance. */

export const AXIS_FONT = 11;
export const LABEL_FONT = 11;

export function fit(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height, ratio };
}

export function createBuffer(width, height, ratio) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { canvas, ctx };
}

export class Frame {
  constructor({ width, height, margin, xRange, yRange }) {
    this.width = width;
    this.height = height;
    this.margin = margin;
    this.setRanges(xRange, yRange);
  }

  setRanges(xRange, yRange) {
    this.xRange = xRange;
    this.yRange = yRange;
    return this;
  }

  get left() { return this.margin.left; }
  get right() { return this.width - this.margin.right; }
  get top() { return this.margin.top; }
  get bottom() { return this.height - this.margin.bottom; }
  get plotWidth() { return Math.max(1, this.right - this.left); }
  get plotHeight() { return Math.max(1, this.bottom - this.top); }

  x(value) {
    const [lo, hi] = this.xRange;
    return this.left + ((value - lo) / (hi - lo || 1)) * this.plotWidth;
  }

  y(value) {
    const [lo, hi] = this.yRange;
    return this.bottom - ((value - lo) / (hi - lo || 1)) * this.plotHeight;
  }

  xInverse(pixel) {
    const [lo, hi] = this.xRange;
    return lo + ((pixel - this.left) / this.plotWidth) * (hi - lo);
  }

  clip(ctx) {
    ctx.beginPath();
    ctx.rect(this.left, this.top, this.plotWidth, this.plotHeight);
    ctx.clip();
  }
}

/* Roughly `count` ticks on a 1/2/5 x 10^n lattice. */
export function ticks(lo, hi, count) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const rough = span / Math.max(1, count);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
  let step = candidates[candidates.length - 1];
  for (const candidate of candidates) {
    if (candidate >= rough) { step = candidate; break; }
  }
  const out = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 1e-9; value += step) {
    out.push(Math.abs(value) < step * 1e-9 ? 0 : value);
  }
  return out;
}

export function drawGrid(ctx, frame, palette, { xTicks, yTicks, xFormat, yFormat, xLabel, yLabel }) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = withAlpha(palette.border, palette.dark ? 0.45 : 0.85);
  ctx.beginPath();
  for (const value of xTicks) {
    const px = Math.round(frame.x(value)) + 0.5;
    ctx.moveTo(px, frame.top);
    ctx.lineTo(px, frame.bottom);
  }
  for (const value of yTicks) {
    const py = Math.round(frame.y(value)) + 0.5;
    ctx.moveTo(frame.left, py);
    ctx.lineTo(frame.right, py);
  }
  ctx.stroke();

  /* Axis lines a touch stronger than the grid. */
  ctx.strokeStyle = withAlpha(palette.muted, 0.7);
  ctx.beginPath();
  ctx.moveTo(frame.left - 0.5, frame.top);
  ctx.lineTo(frame.left - 0.5, frame.bottom + 0.5);
  ctx.lineTo(frame.right, frame.bottom + 0.5);
  ctx.stroke();

  ctx.fillStyle = cssColor(palette.muted);
  ctx.font = AXIS_FONT + 'px ' + palette.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const value of xTicks) {
    /* Keep edge labels inside the panel: the last tick often sits on the frame
       edge and would otherwise be cut in half by the canvas boundary. */
    const label = xFormat(value);
    const half = ctx.measureText(label).width / 2 + 1;
    const px = Math.min(frame.width - half, Math.max(half, frame.x(value)));
    ctx.fillText(label, px, frame.bottom + 5);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const value of yTicks) {
    ctx.fillText(yFormat(value), frame.left - 6, frame.y(value));
  }

  ctx.fillStyle = cssColor(palette.text);
  ctx.font = '600 ' + LABEL_FONT + 'px ' + palette.font;
  if (xLabel) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(xLabel, (frame.left + frame.right) / 2, frame.height - 2);
  }
  if (yLabel) {
    ctx.save();
    ctx.translate(10, (frame.top + frame.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function cssColor(rgb) {
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}

export function withAlpha(rgb, alpha) {
  return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
}

export function polyline(ctx, points, { color, width = 1.4, alpha = 1 }) {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
  ctx.restore();
}

/* A restrained halo: one soft ring, then the point. */
export function marker(ctx, x, y, { color, radius = 4.5, halo = true }) {
  ctx.save();
  if (halo) {
    ctx.beginPath();
    ctx.fillStyle = withAlpha(color, 0.18);
    ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.fillStyle = cssColor(color);
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  ctx.restore();
}

export function badge(ctx, x, y, text, palette, { align = 'left' } = {}) {
  ctx.save();
  ctx.font = AXIS_FONT + 'px ' + palette.font;
  const padding = 4;
  const width = ctx.measureText(text).width + padding * 2;
  const height = AXIS_FONT + padding * 2 - 2;
  const left = align === 'right' ? x - width : x;
  ctx.fillStyle = withAlpha(palette.background, 0.82);
  ctx.fillRect(left, y, width, height);
  ctx.fillStyle = cssColor(palette.muted);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + padding, y + height / 2);
  ctx.restore();
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
}

export function formatNumber(value, digits) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toFixed(digits);
}
