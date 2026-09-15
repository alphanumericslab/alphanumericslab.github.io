/* The single authoritative playback clock.

   One rAF loop advances one number. Every panel reads that number, so the RR
   handle and both hysteresis points cannot drift apart. The ECG snapshot is
   deliberately NOT driven from here - it keeps its own timestamp (see sync.js). */

export class Clock {
  constructor({ duration, onTick }) {
    this.duration = duration;
    this.onTick = onTick;
    this.time = 0;
    this.rate = 10;
    this.loop = true;
    this.playing = false;
    this.scrubbing = false;
    this.resumeAfterScrub = false;
    this._frame = null;
    this._last = 0;

    this._step = this._step.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  get reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this._last = performance.now();
    this._frame = requestAnimationFrame(this._step);
    this.emit({ resumed: true });
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
    this.emit({});
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /* Any jump in time: click, keyboard step, URL restore, subject change. */
  seek(time, options = {}) {
    const clamped = Math.min(this.duration, Math.max(0, time));
    this.time = clamped;
    this.emit(Object.assign({ seeked: true }, options));
  }

  step(delta) {
    this.seek(this.time + delta);
  }

  setRate(rate) {
    this.rate = rate;
    this.emit({});
  }

  setLoop(loop) {
    this.loop = loop;
    this.emit({});
  }

  beginScrub() {
    this.scrubbing = true;
    this.resumeAfterScrub = this.playing;
    if (this.playing) this.pause();
  }

  endScrub() {
    this.scrubbing = false;
    if (this.resumeAfterScrub) this.play();
    this.resumeAfterScrub = false;
  }

  emit(info) {
    this.onTick(this.time, info);
  }

  _step(now) {
    if (!this.playing) return;
    const elapsed = (now - this._last) / 1000;
    this._last = now;
    let next = this.time + elapsed * this.rate;
    let wrapped = false;

    if (next >= this.duration) {
      if (this.loop) {
        next = next % this.duration;
        wrapped = true;
      } else {
        next = this.duration;
        this.time = next;
        this.playing = false;
        this._frame = null;
        this.emit({ ended: true, seeked: true });
        return;
      }
    }

    this.time = next;
    this.emit(wrapped ? { wrapped: true, seeked: true } : {});
    this._frame = requestAnimationFrame(this._step);
  }

  /* A hidden tab accrues no time at all, so returning never causes a jump. */
  _onVisibility() {
    if (document.hidden) {
      if (this.playing) {
        this._wasPlaying = true;
        this.pause();
      }
    } else if (this._wasPlaying) {
      this._wasPlaying = false;
      this.play();
      this.emit({ seeked: true });
    }
  }

  destroy() {
    this.pause();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}
