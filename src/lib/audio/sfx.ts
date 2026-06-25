// Procedural foley — metal-on-metal sounds synthesised live from noise + sine
// partials. No samples. Two recipes cover everything:
//   • impacts (clunk/thud/latch/reject) = a short noise TRANSIENT (the click) +
//     a MODAL RING of a few inharmonic decaying sines (what makes it read metal),
//     with a low pitch-dropping sine BODY for the dull weight of a thud.
//   • slides (pin turn / doors) = looped noise through a gliding band-pass with
//     an amplitude envelope + a slow random jitter on the cutoff for grit.
// Tuned in the Foley Lab. All nodes self-disconnect after their tail.

let actx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
const VOLUME = 0.9;

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!actx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}
function out(): GainNode | null {
  const c = ctx();
  if (!c) return null;
  if (!master) {
    master = c.createGain();
    master.gain.value = enabled ? VOLUME : 0;
    master.connect(c.destination);
  }
  return master;
}
function noise(c: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

// a single decaying sine partial — one "mode" of the metal
function partial(t: number, freq: number, dur: number, gain: number) {
  const c = actx!, m = master!;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(m);
  o.start(t);
  o.stop(t + dur + 0.05);
}
// a short noise transient through a filter — the click / thwack
function transient(
  t: number,
  opts: { type?: BiquadFilterType; freq?: number; q?: number; dur?: number; gain?: number },
) {
  const { type = 'lowpass', freq = 3000, q = 1, dur = 0.015, gain = 0.6 } = opts;
  const c = actx!, m = master!;
  const s = noise(c), f = c.createBiquadFilter(), g = c.createGain();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(m);
  s.start(t);
  s.stop(t + dur + 0.03);
}
// a low pitch-dropping sine — the body of a thud
function body(
  t: number,
  opts: { f0?: number; f1?: number; drop?: number; dur?: number; gain?: number },
) {
  const { f0 = 160, f1 = 72, drop = 0.06, dur = 0.24, gain = 0.9 } = opts;
  const c = actx!, m = master!;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + drop);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(m);
  o.start(t);
  o.stop(t + dur + 0.05);
}
// sustained friction — gliding + jittered band-pass over noise
function friction(
  t: number,
  opts: { from?: number; to?: number; dur?: number; q?: number; gain?: number; grain?: number },
) {
  const { from = 900, to = 780, dur = 0.45, q = 4, gain = 0.4, grain = 0.3 } = opts;
  const c = actx!, m = master!;
  const s = noise(c), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.linearRampToValueAtTime(to, t + dur);
  // random scrape texture: slow noise wobbles the cutoff
  const jn = noise(c), jg = c.createGain();
  jn.playbackRate.value = 0.0004;
  jg.gain.value = (from + to) * 0.5 * grain;
  jn.connect(jg).connect(f.frequency);
  jn.start(t);
  jn.stop(t + dur + 0.1);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.04);
  g.gain.setValueAtTime(gain, t + Math.max(0.05, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(m);
  s.start(t);
  s.stop(t + dur + 0.05);
}

// schedule a little ahead so the envelope's first ramp isn't clipped
const when = () => actx!.currentTime + 0.02;

export const sfx = {
  /** picking up / dropping a key */
  clunk() {
    if (!enabled || !out()) return;
    const t = when();
    transient(t, { type: 'lowpass', freq: 2600, q: 1.2, dur: 0.014, gain: 0.55 });
    partial(t, 2600, 0.09, 0.18);
    partial(t, 2600 * 1.84, 0.054, 0.11);
  },
  /** a wedge drops / the lock seats */
  thud() {
    if (!enabled || !out()) return;
    const t = when();
    body(t, { f0: 165, f1: 72, drop: 0.06, dur: 0.24, gain: 0.81 });
    transient(t, { type: 'lowpass', freq: 430, q: 0.8, dur: 0.04, gain: 0.3 });
  },
  /** a key bites and solves an angle */
  latch() {
    if (!enabled || !out()) return;
    const t = when();
    transient(t, { type: 'bandpass', freq: 2100, q: 1.5, dur: 0.02, gain: 0.3 });
    partial(t, 2100, 0.32, 0.21);
    partial(t, 2100 * 1.71, 0.224, 0.14);
    partial(t, 2100 * 2.94, 0.144, 0.092);
  },
  /** a key dropped where it doesn't fit (louder per tuning) */
  reject() {
    if (!enabled || !out()) return;
    const t = when();
    body(t, { f0: 116, f1: 100, drop: 0.04, dur: 0.12, gain: 1.15 });
    transient(t, { type: 'lowpass', freq: 700, q: 0.7, dur: 0.03, gain: 0.85 });
  },
  /** pins turning a quarter-turn (gentle downward drift; darker + quieter) */
  slide() {
    if (!enabled || !out()) return;
    friction(when(), { from: 720, to: 560, dur: 0.45, q: 3.5, gain: 0.27, grain: 0.3 });
  },
  /** the WHOLE lock sliding/seating — deeper, longer and louder than a pin */
  lockSlide() {
    if (!enabled || !out()) return;
    const t = when();
    friction(t, { from: 175, to: 110, dur: 0.85, q: 2.5, gain: 0.6, grain: 0.18 });
    body(t, { f0: 82, f1: 52, drop: 0.5, dur: 0.85, gain: 0.4 });
  },
  /** the doors sliding open at the end */
  door() {
    if (!enabled || !out()) return;
    const t = when();
    friction(t, { from: 240, to: 540, dur: 0.75, q: 3, gain: 0.5, grain: 0.25 });
    body(t, { f0: 90, f1: 60, drop: 0.3, dur: 0.75, gain: 0.22 });
  },
  /** one wedge dropping back. `size` 0..1 (small→high+quiet, large→low+loud,
   *  non-linear); `delay` seconds so a cascade can be scheduled in one go. The
   *  drop bounces, so a couple of quieter, higher taps follow the impact. */
  drop(size = 0.5, delay = 0) {
    if (!enabled || !out()) return;
    const c = ctx();
    if (!c) return;
    const s = Math.max(0, Math.min(1, size));
    const t = c.currentTime + 0.02 + Math.max(0, delay);
    const f0 = 120 + Math.pow(1 - s, 1.3) * 180; // small ≈300Hz, large ≈120Hz
    const gain = 0.2 + s * 0.5; // small quieter, large louder
    body(t, { f0, f1: f0 * 0.55, drop: 0.04, dur: 0.1 + s * 0.1, gain });
    transient(t, { type: 'lowpass', freq: 800 + (1 - s) * 1500, q: 0.8, dur: 0.012, gain: 0.22 + s * 0.18 });
    const tap = (dt: number, lvl: number) =>
      transient(t + dt, { type: 'bandpass', freq: f0 * 3, q: 2, dur: 0.01, gain: lvl });
    tap(0.13, 0.1 + s * 0.1); // the bounce
    tap(0.21, 0.05 + s * 0.05); // settle
  },
  /** mute/unmute all sfx */
  setMuted(muted: boolean) {
    enabled = !muted;
    if (master) master.gain.value = enabled ? VOLUME : 0;
  },
  get muted() {
    return !enabled;
  },
};
