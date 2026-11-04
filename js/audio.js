// all sound is synthesized with the web audio api, no sample files needed.
// each symbol sounds like what it means: clefs set high/low, note values set length, sharp/flat bend, fermata holds.

export const SYMBOLS = [
  { glyph: '\u{1D11E}', name: 'Treble clef', sound: 'a bright high G' },
  { glyph: '\u{1D122}', name: 'Bass clef', sound: 'a deep low F' },
  { glyph: '\u{1D15E}', name: 'Half note', sound: 'a long C, two beats' },
  { glyph: '\u{1D15F}', name: 'Quarter note', sound: 'one E, one beat' },
  { glyph: '\u{1D160}', name: 'Eighth note', sound: 'two quick Gs' },
  { glyph: '\u{1D161}', name: 'Sixteenth note', sound: 'four fast As' },
  { glyph: '♯', name: 'Sharp', sound: 'a D that slides up' },
  { glyph: '♭', name: 'Flat', sound: 'a B that slides down' },
  { glyph: '\u{1D110}', name: 'Fermata', sound: 'a high C that holds and swells' },
];

// pitch in semitones from the key's root, offset and length in beats
const PATTERNS = [
  [{ p: 19, o: 0, d: 1 }],
  [{ p: -7, o: 0, d: 1.2 }, { p: -19, o: 0, d: 1.2, g: 0.6 }],
  [{ p: 0, o: 0, d: 2 }],
  [{ p: 4, o: 0, d: 1 }],
  [{ p: 7, o: 0, d: 0.5 }, { p: 7, o: 0.5, d: 0.5 }],
  [{ p: 9, o: 0, d: 0.25 }, { p: 9, o: 0.25, d: 0.25 }, { p: 9, o: 0.5, d: 0.25 }, { p: 9, o: 0.75, d: 0.25 }],
  [{ p: 2, o: 0, d: 1, bend: 1 }],
  [{ p: 11, o: 0, d: 1, bend: -1 }],
  [{ p: 12, o: 0, d: 3, swell: true }],
];

export const KEYS = { C: 0, D: 2, Eb: 3, F: 5, G: 7, A: 9 };

export const INSTRUMENTS = {
  piano: { name: 'Piano', partials: [[1, 1, 'triangle'], [2, 0.4, 'sine'], [3, 0.15, 'sine'], [4, 0.08, 'sine']], decay: 1.4 },
  musicbox: { name: 'Music box', partials: [[1, 1, 'sine'], [3, 0.35, 'sine'], [6.1, 0.12, 'sine']], decay: 1.8 },
  marimba: { name: 'Marimba', partials: [[1, 1, 'sine'], [4, 0.25, 'sine']], decay: 0.6 },
  synth: { name: 'Soft synth', partials: [[1, 0.6, 'sawtooth'], [1.003, 0.6, 'sawtooth']], decay: 0.9, filter: true },
};

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.instrument = 'piano';
    this.key = 'C';
    this.volume = 0.7;
    this.muted = false;
  }

  // browsers only allow audio after a user gesture, so this runs on the first tap/key
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.dry = this.ctx.createGain();
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.2;
      const reverb = this.ctx.createConvolver();
      reverb.buffer = this.makeImpulse(2);
      this.dry.connect(comp);
      this.wet.connect(reverb).connect(comp);
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

  // symbol is 1-9. beat is seconds per beat. when is seconds from now
  play(symbol, { when = 0, beat = 0.32, gain = 0.5 } = {}) {
    if (!this.ctx || !symbol) return;
    const t = this.ctx.currentTime + when;
    const root = 60 + KEYS[this.key];
    for (const n of PATTERNS[symbol - 1]) {
      this.voice(midiToHz(root + n.p), t + n.o * beat, n.d * beat, gain * (n.g ?? 1), n);
    }
  }

  voice(f, t, len, gain, { bend = 0, swell = false } = {}) {
    const inst = INSTRUMENTS[this.instrument];
    const out = this.ctx.createGain();
    out.connect(this.dry);
    out.connect(this.wet);

    let dest = out;
    if (inst.filter) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 4;
      lp.frequency.setValueAtTime(f * 6, t);
      lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + len + 0.2);
      lp.connect(out);
      dest = lp;
    }

    // envelope: plucky by default, slow swell for the fermata
    const tail = Math.max(len, 0.12) + inst.decay * 0.5;
    const end = t + tail + 0.1;
    const g = out.gain;
    g.setValueAtTime(0.0001, t);
    if (swell) {
      g.exponentialRampToValueAtTime(gain * 0.5, t + 0.08);
      g.exponentialRampToValueAtTime(gain, t + len * 0.6);
      g.exponentialRampToValueAtTime(0.0001, t + tail);
    } else {
      g.exponentialRampToValueAtTime(gain, t + 0.004);
      g.exponentialRampToValueAtTime(gain * 0.35, t + Math.min(len, 0.25));
      g.exponentialRampToValueAtTime(0.0001, t + tail);
    }

    // gentle vibrato on the held note
    let lfo = null;
    if (swell) {
      lfo = this.ctx.createOscillator();
      const depth = this.ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.008, t + len * 0.5);
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(end);
      lfo.depth = depth;
    }

    for (const [mult, amp, type] of inst.partials) {
      const pg = this.ctx.createGain();
      pg.gain.value = amp * 0.5;
      pg.connect(dest);
      const o = this.ctx.createOscillator();
      o.type = type;
      const fp = f * mult;
      o.frequency.setValueAtTime(fp, t);
      if (bend) {
        o.frequency.setValueAtTime(fp, t + len * 0.35);
        o.frequency.exponentialRampToValueAtTime(fp * Math.pow(2, bend / 12), t + len * 0.35 + 0.12);
      }
      if (lfo) {
        const scaled = this.ctx.createGain();
        scaled.gain.value = mult;
        lfo.depth.connect(scaled).connect(o.frequency);
      }
      o.connect(pg);
      o.start(t);
      o.stop(end);
    }
  }

  // a muted thud for a symbol that breaks the rules
  wrong() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.dry);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    for (const f of [98, 104]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.35);
    }
  }

  // soft tick used for pencil marks
  tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.dry);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const o = this.ctx.createOscillator();
    o.frequency.value = 1800;
    o.connect(g);
    o.start(t);
    o.stop(t + 0.06);
  }
}
