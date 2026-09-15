/* ECG measurement overlays: which markers and QT bands may be drawn.

   The delineator does not always succeed. Some beats have no landmarks, some
   have landmarks out of order, and the two failure modes do not coincide with
   the qt_ms quality flag: a beat can carry a finite qt_ms and still be missing
   its T landmarks (subject 1 beat 1924), and a beat can be strictly reversed
   while keeping a finite qt_ms (subject 1 beats 475, 483, 771, 965).

   So validity is checked conjunctively over landmarks AND ordering AND qt_ms.
   Source values are never reordered, repaired or clamped - an unusable beat is
   simply not annotated, and it still contributes to the smoothed loops. */

const KIND_QRS_ON = 'qrsOn';
const KIND_R = 'r';
const KIND_T_PEAK = 'tPeak';
const KIND_T_OFF = 'tOff';
const KIND_T_TIE = 'tTie';

function isIndex(value, sampleCount) {
  return Number.isInteger(value) && value >= 0 && value < sampleCount;
}

export function validity(beats, i, sampleCount) {
  const qrsOn = beats.qrsOn[i];
  const rIdx = beats.rIdx[i];
  const tPeak = beats.tPeak[i];
  const tOff = beats.tOff[i];

  const hasQrsOn = isIndex(qrsOn, sampleCount);
  const hasR = isIndex(rIdx, sampleCount);
  const hasTPeak = isIndex(tPeak, sampleCount);
  const hasTOff = isIndex(tOff, sampleCount);

  const qt = beats.qt[i];
  const tamp = beats.tamp[i];
  const qtOk = Number.isFinite(qt);

  const orderOk = hasQrsOn && hasR && hasTPeak && hasTOff
    && qrsOn <= rIdx && rIdx < tPeak && tPeak <= tOff && qrsOn < tOff;

  const showT = qtOk && orderOk;

  return {
    hasQrsOn,
    hasR,
    hasTPeak,
    hasTOff,
    qtOk,
    orderOk,
    /* R-peak and QRS-onset stand on their own when T landmarks are absent. */
    showQrsOn: hasQrsOn,
    showR: hasR,
    showT,
    showQtBand: showT,
    /* A 10 ms rounding tie is legitimate; it gets its own combined glyph. */
    isTie: showT && tPeak === tOff,
    /* The amplitude label needs a measurement as well as a position. */
    showTampLabel: showT && Number.isFinite(tamp),
  };
}

/* Collect everything drawable in the sample window [s0, s1].

   With fewer than 2000 beats per subject a full scan costs nothing, and it runs
   only when the snapshot is re-latched, not per frame. Scanning all beats also
   avoids the trap of seeking from a sorted landmark: markers and QT bands are
   checked independently, so a beat whose R-peak lies outside the window still
   contributes its band if the band crosses the window, and a beat with no usable
   band still contributes its R and QRS-onset markers. */
export function collectOverlays(beats, s0, s1, sampleCount) {
  const markers = [];
  const bands = [];

  for (let i = 0; i < beats.n; i += 1) {
    const v = validity(beats, i, sampleCount);

    if (v.showQrsOn && beats.qrsOn[i] >= s0 && beats.qrsOn[i] <= s1) {
      markers.push({ beat: i, kind: KIND_QRS_ON, sample: beats.qrsOn[i] });
    }
    if (v.showR && beats.rIdx[i] >= s0 && beats.rIdx[i] <= s1) {
      markers.push({ beat: i, kind: KIND_R, sample: beats.rIdx[i] });
    }
    if (v.showT) {
      if (v.isTie) {
        if (beats.tPeak[i] >= s0 && beats.tPeak[i] <= s1) {
          markers.push({ beat: i, kind: KIND_T_TIE, sample: beats.tPeak[i] });
        }
      } else {
        if (beats.tPeak[i] >= s0 && beats.tPeak[i] <= s1) {
          markers.push({ beat: i, kind: KIND_T_PEAK, sample: beats.tPeak[i] });
        }
        if (beats.tOff[i] >= s0 && beats.tOff[i] <= s1) {
          markers.push({ beat: i, kind: KIND_T_OFF, sample: beats.tOff[i] });
        }
      }
    }

    /* Bands are included on intersection, so one entering from the left or
       leaving on the right is drawn clipped to the panel rather than skipped.
       No endpoint is invented: the true endpoints are kept and the renderer
       clips, flagging the side that continues off-window. */
    if (v.showQtBand && beats.qrsOn[i] <= s1 && beats.tOff[i] >= s0) {
      bands.push({
        beat: i,
        from: beats.qrsOn[i],
        to: beats.tOff[i],
        clippedLeft: beats.qrsOn[i] < s0,
        clippedRight: beats.tOff[i] > s1,
      });
    }
  }

  return { markers, bands };
}

/* The beat the ECG snapshot is "about": the last R-peak inside the window.
   Raw readouts next to the ECG describe this beat, never the beat under the
   playhead, because the snapshot lags playback by design. */
export function identifiedBeat(beats, s0, s1) {
  let found = -1;
  for (let i = 0; i < beats.n; i += 1) {
    const r = beats.rIdx[i];
    if (Number.isInteger(r) && r >= s0 && r <= s1) found = i;
    else if (Number.isInteger(r) && r > s1) break;
  }
  return found;
}

export const MARKER_KINDS = {
  KIND_QRS_ON,
  KIND_R,
  KIND_T_PEAK,
  KIND_T_OFF,
  KIND_T_TIE,
};
