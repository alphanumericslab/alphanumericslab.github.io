/* Palette derived from the site's own CSS custom properties.
   Nothing here hard-codes the site's neutrals: axes, grids, the RR trace and
   all chrome read whatever the active theme defines, so the panels follow the
   template in both light and dark and would follow a future re-theme too.

   The two phase hues are the one exception - they are a data encoding taken
   from the analysis code (exercise [0.85 0.325 0.098], recovery [0 0.447 0.741]).
   Hue is preserved in both themes; on dark backgrounds the colour is lightened
   only as far as needed to clear a 3:1 contrast ratio against the panel. */

const EXERCISE_BASE = [217, 83, 25];
const RECOVERY_BASE = [0, 114, 189];
/* T-wave markers need to stay legible on the orange exercise curve, the blue
   recovery curve and the grey history alike, so they get their own hue rather
   than borrowing a phase colour. */
const MARKER_BASE = [0, 140, 60];
const MIN_CONTRAST = 3;

let probe = null;

function normalise(value) {
  if (!probe) probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  return probe.fillStyle;
}

function toRgb(value, fallback) {
  const text = normalise((value || '').trim() || fallback);
  if (text[0] === '#') {
    const hex = text.length === 4
      ? text[1] + text[1] + text[2] + text[2] + text[3] + text[3]
      : text.slice(1);
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const parts = text.match(/[\d.]+/g) || [];
  return [Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0];
}

function channel(value) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* Lighten towards white in small steps, preserving hue, until readable. */
function readable(rgb, background) {
  let current = rgb.slice();
  for (let step = 0; step < 20 && contrast(current, background) < MIN_CONTRAST; step += 1) {
    current = current.map((component) => Math.round(component + (255 - component) * 0.08));
  }
  return current;
}

export function rgba(rgb, alpha) {
  return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
}

export function css(rgb) {
  return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}

function variable(styles, name, fallback) {
  return toRgb(styles.getPropertyValue(name), fallback);
}

function bodyFont() {
  const family = document.body
    ? getComputedStyle(document.body).getPropertyValue('font-family')
    : '';
  return family.trim() || '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
}

export function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  const background = variable(styles, '--global-bg-color', '#ffffff');
  const text = variable(styles, '--global-text-color', '#494e52');
  const muted = variable(styles, '--global-text-color-light', '#9ba1a6');
  const border = variable(styles, '--global-border-color', '#e3e4e5');
  const accent = variable(styles, '--global-link-color', '#52adc8');
  const dark = luminance(background) < 0.4;

  return {
    dark,
    background,
    text,
    muted,
    border,
    accent,
    exercise: dark ? readable(EXERCISE_BASE, background) : EXERCISE_BASE,
    recovery: dark ? readable(RECOVERY_BASE, background) : RECOVERY_BASE,
    marker: dark ? readable(MARKER_BASE, background) : MARKER_BASE,
    /* Neutral trace colour: the template's muted text, nudged for weight. */
    trace: dark ? muted : variable(styles, '--global-text-color-light', '#9ba1a6'),
    /* The template sets its body typeface on <body>, not on <html> (where the
       computed family is the browser default, Times). Read the body so canvas
       labels match the page instead of falling back to a serif. */
    font: bodyFont(),
  };
}

export function watchTheme(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  if (media.addEventListener) media.addEventListener('change', onChange);
  return () => observer.disconnect();
}
