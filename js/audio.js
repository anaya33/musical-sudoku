// real instrument samples (one recording per note) with a built-in synth as a fallback.
// the nine symbols are the nine notes of the treble staff:
// lines E G B D F ("every good boy does fine"), spaces F A C E

export const SYMBOLS = [
  { glyph: '\u{1D11E}', name: 'Treble clef', p: 7, place: '2nd line', how: 'the line the G clef curls around' },
  { glyph: '\u{1D122}', name: 'Bass clef', p: 5, place: '1st space', how: 'F, like the F clef' },
  { glyph: '\u{1D15E}', name: 'Half note', p: 11, place: 'middle line', how: 'held for two beats' },
  { glyph: '\u{1D15F}', name: 'Quarter note', p: 14, place: '4th line', how: 'one beat' },
  { glyph: '\u{1D160}', name: 'Eighth note', p: 4, place: 'bottom line', how: 'two quick notes' },
  { glyph: '\u{1D161}', name: 'Sixteenth note', p: 17, place: 'top line', how: 'four fast notes' },
  { glyph: '♯', name: 'Sharp', p: 9, place: '2nd space', how: 'slides up' },
  { glyph: '♭', name: 'Flat', p: 12, place: '3rd space', how: 'slides down' },
  { glyph: '\u{1D110}', name: 'Fermata', p: 16, place: 'top space', how: 'holds' },
];

// rhythm for each symbol: offset and length in beats, plus bends and holds
const PATTERNS = [
  [{ o: 0, d: 1 }],
  [{ o: 0, d: 1 }],
  [{ o: 0, d: 2 }],
  [{ o: 0, d: 1 }],
  [{ o: 0, d: 0.5 }, { o: 0.5, d: 0.5 }],
  [{ o: 0, d: 0.25 }, { o: 0.25, d: 0.25 }, { o: 0.5, d: 0.25 }, { o: 0.75, d: 0.25 }],
  [{ o: 0, d: 1, bend: 1 }],
  [{ o: 0, d: 1, bend: -1 }],
  [{ o: 0, d: 3, swell: true }],
];

export const KEYS = { C: 0, D: 2, Eb: 3, F: 5, G: 7, A: 9 };

// sampled instruments use General MIDI names from the FluidR3 soundfont.
// sustain = the instrument can hold a note (strings, flute), otherwise it rings out
export const INSTRUMENTS = {
  piano: { name: 'Piano', gm: 'acoustic_grand_piano' },
  guitar: { name: 'Guitar', gm: 'acoustic_guitar_nylon' },
  strings: { name: 'Strings', gm: 'string_ensemble_1', sustain: true },
  violin: { name: 'Violin', gm: 'violin', sustain: true },
  harp: { name: 'Harp', gm: 'orchestral_harp' },
  flute: { name: 'Flute', gm: 'flute', sustain: true },
  musicbox: { name: 'Music box', gm: 'music_box' },
  marimba: { name: 'Marimba', gm: 'marimba' },
  synth: { name: 'Synth', partials: [[1, 0.6, 'sawtooth'], [1.003, 0.6, 'sawtooth']], decay: 0.9, filter: true },
};

const SAMPLE_BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/';
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PRETTY = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const FALLBACK = { partials: [[1, 1, 'triangle'], [2, 0.4, 'sine'], [3, 0.15, 'sine'], [4, 0.08, 'sine']], decay: 1.4 };

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const fileName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

export class Audio {
  constructor() {
    this.ctx = null;
    this.instrument = 'piano';
    this.key = 'C';
    this.volume = 0.7;
    this.muted = false;
    this.raw = new Map(); // url -> Promise<ArrayBuffer>
    this.buffers = new Map(); // url -> AudioBuffer, once decoded
    this.decoding = new Map(); // url -> Promise<AudioBuffer>
    this.onstatus = null;
  }

  midi(symbol) {
    return 60 + KEYS[this.key] + SYMBOLS[symbol - 1].p;
  }

  noteName(symbol) {
    return PRETTY[this.midi(symbol) % 12];
  }

  url(m, inst = this.instrument) {
    return `${SAMPLE_BASE}${INSTRUMENTS[inst].gm}-mp3/${fileName(m)}.mp3`;
  }

  // fetch every note the current instrument + key needs. bends use the same file, pitched by playback rate
  load() {
    const inst = INSTRUMENTS[this.instrument];
    if (!inst?.gm) { this.onstatus?.('ready'); return; }
    const urls = SYMBOLS.map((_, k) => this.url(this.midi(k + 1)));
    for (const u of urls) {
      if (!this.raw.has(u)) {
        this.raw.set(u, fetch(u).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }));
        this.raw.get(u).catch(() => this.raw.delete(u));
      }
    }
    this.onstatus?.('loading');
    const want = this.instrument + this.key;
    Promise.all(urls.map((u) => this.decode(u)))
      .then(() => { if (want === this.instrument + this.key) this.onstatus?.('ready'); })
      .catch(() => { if (want === this.instrument + this.key) this.onstatus?.('failed'); });
  }

  // turning raw bytes into sound needs the audio context, which only exists after the first tap
  decode(u) {
    if (this.buffers.has(u)) return Promise.resolve(this.buffers.get(u));
    if (!this.ctx) return this.raw.get(u) ?? Promise.reject(new Error('not fetched'));
    if (!this.decoding.has(u)) {
      const p = (this.raw.get(u) ?? Promise.reject(new Error('not fetched')))
        .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab.slice(0), res, rej)))
        .then((b) => { this.buffers.set(u, b); return b; });
      p.catch(() => this.decoding.delete(u));
      this.decoding.set(u, p);
    }
    return this.decoding.get(u);
  }

  // browsers only allow audio after a user gesture, so this runs on the first tap/key
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 3;
      this.dry = this.ctx.createGain();
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.16;
      const reverb = this.ctx.createConvolver();
      reverb.buffer = this.makeImpulse(1.8);
      this.dry.connect(comp);
      this.wet.connect(reverb).connect(comp);
      comp.connect(this.master).connect(this.ctx.destination);
      this.load();
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

  out() {
    const g = this.ctx.createGain();
    g.connect(this.dry);
    g.connect(this.wet);
    return g;
  }

  // symbol is 1-9 (index into SYMBOLS). beat is seconds per beat. when is seconds from now.
  // sour plays it out of tune, for a symbol in the wrong place
  play(symbol, opts = {}) {
    if (!symbol) return;
    this.unlock();
    // the very first tap can land while the context is still waking up, so wait for it
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(() => this.play(symbol, opts));
      return;
    }
    const { when = 0, beat = 0.34, gain = 0.6, sour = false } = opts;
    const t = this.ctx.currentTime + 0.005 + when;
    const m = this.midi(symbol);
    const inst = INSTRUMENTS[this.instrument];
    const buf = inst.gm ? this.buffers.get(this.url(m)) : null;
    if (inst.gm && !buf) this.decode(this.url(m)).catch(() => {});

    for (const n of PATTERNS[symbol - 1]) {
      const at = t + n.o * beat, len = n.d * beat;
      const copies = sour ? [{ detune: 45 }, { detune: -40 }] : [{ detune: 0 }];
      for (const c of copies) {
        const o = { ...n, detune: c.detune, wobble: sour };
        const g = gain * (sour ? 0.6 : 1);
        if (buf) this.sample(buf, at, len, g, o, inst);
        else this.synth(midiToHz(m), at, len, g * 0.8, o, inst.partials ? inst : FALLBACK);
      }
    }
  }

  sample(buf, t, len, gain, { bend = 0, swell = false, detune = 0, wobble = false }, inst) {
    gain *= 2.4; // the recordings are quieter than the synth
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.detune.value = detune;
    if (bend) {
      src.playbackRate.setValueAtTime(1, t + len * 0.35);
      src.playbackRate.exponentialRampToValueAtTime(Math.pow(2, bend / 12), t + len * 0.35 + 0.12);
    }
    if (wobble) src.detune.linearRampToValueAtTime(detune - 70, t + Math.max(len, 0.3) + 0.2);

    const out = this.out();
    const g = out.gain;
    // ringing instruments keep their natural decay, held ones stop when the note ends
    const ring = inst.sustain ? 0.12 : Math.min(1.6, Math.max(0.5, len * 2));
    const end = t + len + ring;
    if (swell && inst.sustain) {
      g.setValueAtTime(gain * 0.4, t);
      g.linearRampToValueAtTime(gain * 1.1, t + len * 0.7);
    } else {
      g.setValueAtTime(gain, t);
    }
    g.setValueAtTime(swell && inst.sustain ? gain * 1.1 : gain, t + len);
    g.exponentialRampToValueAtTime(0.0001, end);
    src.connect(out);
    src.start(t);
    src.stop(end + 0.05);
  }

  synth(f, t, len, gain, { bend = 0, swell = false, detune = 0, wobble = false }, inst) {
    const out = this.out();
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
    const tail = Math.max(len, 0.12) + inst.decay * 0.5;
    const end = t + tail + 0.1;
    const g = out.gain;
    g.setValueAtTime(0.0001, t);
    if (swell) {
      g.exponentialRampToValueAtTime(gain * 0.5, t + 0.08);
      g.exponentialRampToValueAtTime(gain, t + len * 0.6);
    } else {
      g.exponentialRampToValueAtTime(gain, t + 0.004);
      g.exponentialRampToValueAtTime(gain * 0.35, t + Math.min(len, 0.25));
    }
    g.exponentialRampToValueAtTime(0.0001, t + tail);

    for (const [mult, amp, type] of inst.partials) {
      const pg = this.ctx.createGain();
      pg.gain.value = amp * 0.5;
      pg.connect(dest);
      const o = this.ctx.createOscillator();
      o.type = type;
      const fp = f * mult;
      o.frequency.setValueAtTime(fp, t);
      o.detune.setValueAtTime(detune, t);
      if (wobble) o.detune.linearRampToValueAtTime(detune - 70, t + Math.max(len, 0.3) + 0.2);
      if (bend) {
        o.frequency.setValueAtTime(fp, t + len * 0.35);
        o.frequency.exponentialRampToValueAtTime(fp * Math.pow(2, bend / 12), t + len * 0.35 + 0.12);
      }
      o.connect(pg);
      o.start(t);
      o.stop(end);
    }
  }

  // a muted thud that sits under a wrong note
  wrong() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.12;
    const g = this.ctx.createGain();
    g.connect(this.dry);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    for (const f of [98, 104]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.3);
    }
  }

  // soft tick for tapping an empty square
  tick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.connect(this.dry);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const o = this.ctx.createOscillator();
    o.frequency.value = 1800;
    o.connect(g);
    o.start(t);
    o.stop(t + 0.06);
  }
}
