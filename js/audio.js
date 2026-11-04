// all sound is synthesized with the web audio api, no sample files needed

export const SCALES = {
  major: { name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11, 12, 14] },
  minor: { name: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10, 12, 14] },
  pentatonic: { name: 'Pentatonic', steps: [0, 2, 4, 7, 9, 12, 14, 16, 19] },
  dorian: { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10, 12, 14] },
};

const LETTERS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOLFEGE = { 0: 'Do', 2: 'Re', 3: 'Me', 4: 'Mi', 5: 'Fa', 7: 'Sol', 8: 'Le', 9: 'La', 10: 'Te', 11: 'Ti' };

export function noteLabels(scaleKey) {
  const steps = SCALES[scaleKey].steps;
  return steps.map((s, i) => {
    const pc = s % 12;
    const octaveUp = s >= 12;
    return {
      letter: LETTERS[pc] + (octaveUp ? "'" : ''),
      solfege: (SOLFEGE[pc] ?? LETTERS[pc]) + (octaveUp ? "'" : ''),
      number: String(i + 1),
    };
  });
}

const BASE_MIDI = 60; // middle C
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const INSTRUMENTS = {
  piano: 'Piano',
  marimba: 'Marimba',
  bells: 'Bells',
  synth: 'Synth',
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.scale = 'major';
    this.instrument = 'piano';
    this.volume = 0.7;
    this.muted = false;
  }

  // browsers only allow audio after a user gesture, so this runs on first tap/key
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.dry = this.ctx.createGain();
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.22;
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.2);
      this.dry.connect(comp);
      this.wet.connect(this.reverb).connect(comp);
      comp.connect(this.master).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeImpulse(seconds) {
    const rate = this.ctx.sampleRate, len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.02);
  }

  setMuted(m) {
    this.muted = m;
    this.setVolume(this.volume);
  }

  freq(value) {
    return midiToHz(BASE_MIDI + SCALES[this.scale].steps[value - 1]);
  }

  out() {
    const g = this.ctx.createGain();
    g.connect(this.dry);
    g.connect(this.wet);
    return g;
  }

  // value is 1-9. when is seconds from now. returns nothing; nodes clean themselves up
  play(value, { when = 0, length = 0.9, gain = 0.5 } = {}) {
    if (!this.ctx || !value) return;
    const t = this.ctx.currentTime + when;
    const f = this.freq(value);
    this[this.instrument](f, t, length, gain);
  }

  env(node, t, attack, peak, decay) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  osc(type, f, t, stop, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  piano(f, t, len, gain) {
    const out = this.out();
    const decay = Math.max(0.6, len * 1.6);
    this.env(out, t, 0.005, gain, decay);
    const partials = [[1, 1], [2, 0.45], [3, 0.2], [4, 0.1]];
    for (const [mult, amp] of partials) {
      const g = this.ctx.createGain();
      g.gain.value = amp * 0.5;
      g.connect(out);
      this.osc(mult === 1 ? 'triangle' : 'sine', f * mult, t, t + decay + 0.1, g, mult === 1 ? 0 : 3);
    }
  }

  marimba(f, t, len, gain) {
    const out = this.out();
    this.env(out, t, 0.003, gain, 0.7);
    this.osc('sine', f, t, t + 0.8, out);
    const click = this.ctx.createGain();
    this.env(click, t, 0.002, 0.25, 0.08);
    click.connect(out);
    this.osc('sine', f * 4, t, t + 0.1, click);
  }

  bells(f, t, len, gain) {
    const out = this.out();
    this.env(out, t, 0.004, gain * 0.8, 2.4);
    // inharmonic partials give the bell colour
    for (const [mult, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]]) {
      const g = this.ctx.createGain();
      this.env(g, t, 0.004, amp * 0.5, 2.4 / mult + 0.3);
      g.connect(out);
      this.osc('sine', f * mult, t, t + 2.6, g);
    }
  }

  synth(f, t, len, gain) {
    const out = this.out();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(f * 8, t);
    filter.frequency.exponentialRampToValueAtTime(f * 1.5, t + len);
    filter.connect(out);
    const decay = Math.max(0.4, len);
    this.env(out, t, 0.02, gain * 0.5, decay);
    this.osc('sawtooth', f, t, t + decay + 0.1, filter, -7);
    this.osc('sawtooth', f, t, t + decay + 0.1, filter, 7);
  }

  // a sour, muted thud for a note that breaks the rules
  wrong() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.dry);
    this.env(g, t, 0.01, 0.25, 0.35);
    this.osc('square', 110, t, t + 0.4, g);
    this.osc('square', 116.5, t, t + 0.4, g);
  }

  // plays a list of values (0 = rest) as a melody. returns total duration in seconds
  sequence(values, { step = 0.18, start = 0, length = 0.5, gain = 0.4 } = {}) {
    values.forEach((v, i) => { if (v) this.play(v, { when: start + i * step, length, gain }); });
    return start + values.length * step;
  }

  chord(values, { when = 0, length = 1.6, gain = 0.22 } = {}) {
    values.forEach((v) => this.play(v, { when, length, gain }));
  }
}
