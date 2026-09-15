/* One shared beat-selection and interpolation rule.

   Every panel that follows playback time calls sampleAt() - the RR handle,
   both hysteresis points and the smoothed readouts - so they are computed from
   the same numbers and cannot disagree.

   Smoothed series are interpolated between beats (beat gaps run 0.3-1.4 s,
   which is visibly steppy at 10x). Raw per-beat values are never interpolated
   and never coerced: a missing value stays null and is rendered as an em dash. */

export function findBeat(times, time, hint) {
  const n = times.length;
  if (n === 0) return -1;
  if (time < times[0]) return -1;
  if (time >= times[n - 1]) return n - 1;

  /* Monotonic playback means the answer is usually the previous index or the
     next one; check that before falling back to a binary search. */
  if (typeof hint === 'number' && hint >= 0 && hint < n - 1) {
    if (times[hint] <= time && time < times[hint + 1]) return hint;
    if (hint + 1 < n - 1 && times[hint + 1] <= time && time < times[hint + 2]) return hint + 1;
  }

  let low = 0;
  let high = n - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (times[mid] <= time) low = mid;
    else high = mid - 1;
  }
  return low;
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

/* Smoothed value at an arbitrary time, and the nearest beat for raw values. */
export function sampleAt(beats, time, hint) {
  const times = beats.t;
  const n = beats.n;
  const index = findBeat(times, time, hint);

  if (index < 0) {
    return boundary(beats, 0, time, true, false);
  }
  if (index >= n - 1) {
    return boundary(beats, n - 1, time, false, true);
  }

  const next = index + 1;
  const span = times[next] - times[index];
  const u = span > 0 ? (time - times[index]) / span : 0;

  return {
    index,
    next,
    u,
    time,
    atStart: false,
    atEnd: false,
    nearestBeat: u < 0.5 ? index : next,
    rrS: lerp(beats.rrS[index], beats.rrS[next], u),
    qtS: lerp(beats.qtS[index], beats.qtS[next], u),
    tampS: lerp(beats.tampS[index], beats.tampS[next], u),
    phase: index < beats.firstRecoveryBeatIndex ? 'exercise' : 'recovery',
  };
}

function boundary(beats, index, time, atStart, atEnd) {
  return {
    index,
    next: index,
    u: 0,
    time,
    atStart,
    atEnd,
    nearestBeat: index,
    rrS: beats.rrS[index],
    qtS: beats.qtS[index],
    tampS: beats.tampS[index],
    phase: index < beats.firstRecoveryBeatIndex ? 'exercise' : 'recovery',
  };
}

/* Interpolated path over the preceding `seconds` of data time, for the optional
   trail. Time-based rather than beat-based so its visual length does not change
   with heart rate. */
export function trailPath(beats, time, seconds, xKey, yKey) {
  const from = Math.max(0, time - seconds);
  const points = [];
  const start = findBeat(beats.t, from, undefined);
  const head = sampleAt(beats, time, undefined);

  if (start >= 0) {
    const first = sampleAt(beats, from, start);
    points.push([first[xKey], first[yKey]]);
  }
  for (let i = Math.max(0, start + 1); i <= head.index; i += 1) {
    points.push([beats[xKey][i], beats[yKey][i]]);
  }
  points.push([head[xKey], head[yKey]]);
  return points;
}

/* The ECG snapshot carries its own timestamp. It is refreshed on a wall-clock
   cadence, so at 10x with a 3 s refresh it can sit up to ~30 data seconds
   behind the playhead; at 1x, just under 3 s. Raw readouts shown alongside the
   ECG describe the beat in the snapshot, not the beat under the playhead. */
export class Snapshot {
  constructor({ windowSeconds = 5, latchMs = 3000, duration = 1200 } = {}) {
    this.windowSeconds = windowSeconds;
    this.latchMs = latchMs;
    this.duration = duration;
    this.time = 0;
    this.lastLatch = -Infinity;
  }

  /* Returns true when the snapshot moved. */
  update(playbackTime, { force = false, playing = true, now = performance.now() } = {}) {
    if (force || (playing && now - this.lastLatch >= this.latchMs)) {
      this.time = playbackTime;
      this.lastLatch = now;
      return true;
    }
    return false;
  }

  /* Clamped display span: never shorter than the window, never off the record. */
  get span() {
    const end = Math.min(this.duration, Math.max(this.windowSeconds, this.time));
    return [end - this.windowSeconds, end];
  }

  lagBehind(playbackTime) {
    return playbackTime - this.time;
  }
}
