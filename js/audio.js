// real instrument recordings, one file per note, played through the web audio api.
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

// real recordings, one file per note. where an instrument skips notes, the nearest
// recording is pitched up or down a little. sustain = it can hold a note (violin, flute)
const SHARPS = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const PRETTY = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// versilian studios orchestra recordings (vsco 2) via nbrosowsky/tonejs-instruments
const vsco = (dir, notes, extra = {}) => ({
  dir: `samples/vsco/${dir}`,
  remote: `https://nbrosowsky.github.io/tonejs-instruments/samples/${dir}`,
  names: SHARPS,
  notes,
  ...extra,
});

export const INSTRUMENTS = {
  piano: { name: 'Piano', ...vsco('piano', range(64, 86)) },
  guitar: {
    name: 'Guitar',
    dir: 'samples/acoustic_guitar_nylon',
    remote: 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_guitar_nylon-mp3',
    names: FLATS,
    notes: range(64, 86),
  },
  violin: { name: 'Violin', ...vsco('violin', [64, 67, 69, 72, 76, 79, 81, 84]), sustain: true },
  flute: { name: 'Flute', ...vsco('flute', [64, 69, 72, 76, 81, 84]), sustain: true },
  harp: { name: 'Harp', ...vsco('harp', [65, 69, 72, 76, 79, 83, 86]) },
  xylophone: { name: 'Xylophone', ...vsco('xylophone', [67, 72, 79, 84]) },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.instrument = 'piano';
    this.key = 'C';
    this.volume = 0.7;
    this.muted = false;
    this.raw = new Map(); // url -> Promise<ArrayBuffer>
    this.level = new WeakMap(); // AudioBuffer -> gain that evens out its loudness
    this.loading = Promise.resolve();
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

  // the closest recording to pitch m, and how much to speed it up or slow it down
  sampleFor(m, inst = INSTRUMENTS[this.instrument]) {
    const s = inst.notes.reduce((best, n) => (Math.abs(n - m) < Math.abs(best - m) ? n : best));
    const file = `${inst.names[s % 12]}${Math.floor(s / 12) - 1}.mp3`;
    return { url: `${inst.dir}/${file}`, remote: `${inst.remote}/${file}`, rate: Math.pow(2, (m - s) / 12) };
  }

  fetchNote(u, remote) {
    const get = (x) => fetch(x).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
    return get(u).catch(() => (remote ? get(remote) : Promise.reject(new Error('missing'))));
  }

  // fetch every note the current instrument + key needs. bends use the same file, pitched by playback rate
  load() {
    this.init();
    const picks = SYMBOLS.map((_, k) => this.sampleFor(this.midi(k + 1)));
    for (const p of picks) this.fetchOnce(p);
    const urls = [...new Set(picks.map((p) => p.url))];
    if (urls.every((u) => this.buffers.has(u))) { this.onstatus?.('ready'); return (this.loading = Promise.resolve()); }
    this.onstatus?.('loading');
    const want = this.instrument + this.key;
    this.loading = Promise.all(urls.map((u) => this.decode(u)))
      .then(() => { if (want === this.instrument + this.key) this.onstatus?.('ready'); })
      .catch(() => { if (want === this.instrument + this.key) this.onstatus?.('failed'); });
    return this.loading;
  }

  // turning raw bytes into sound needs the audio context, which only exists after the first tap
  fetchOnce({ url, remote }) {
    if (!this.raw.has(url)) {
      this.raw.set(url, this.fetchNote(url, remote));
      this.raw.get(url).catch(() => this.raw.delete(url));
    }
  }

  decode(u, remote) {
    if (this.buffers.has(u)) return Promise.resolve(this.buffers.get(u));
    this.fetchOnce({ url: u, remote });
    if (!this.decoding.has(u)) {
      const p = this.raw.get(u)
        .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab.slice(0), res, rej)))
        .then((b) => { this.level.set(b, this.levelFor(b)); this.buffers.set(u, b); return b; });
      p.catch(() => this.decoding.delete(u));
      this.decoding.set(u, p);
    }
    return this.decoding.get(u);
  }

  // how much to turn a recording up or down so every note sits at the same loudness
  levelFor(buf) {
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i += 4) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
    }
    return peak > 0.001 ? 0.8 / peak : 1;
  }

  // the context is made straight away (paused) so recordings can be decoded before the first tap.
  // browsers only let it make sound after a tap or key, which unlock() handles
  init() {
    if (!this.ctx) {
      // treat the game like a music app so it plays even with the ringer switched off
      // (iphones with ios 17+; older ones are handled by the silent track in unlock)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      // a call or another app can pause the sound. wake it up again as soon as we can
      this.ctx.onstatechange = () => { if (this.ctx.state === 'interrupted') this.wake(); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.wake(); });
      window.addEventListener('focus', () => this.wake());
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.ratio.value = 2;
      comp.attack.value = 0.01;
      this.dry = this.ctx.createGain();
      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.06;
      const reverb = this.ctx.createConvolver();
      reverb.buffer = this.makeImpulse(1.4);
      this.dry.connect(comp);
      this.wet.connect(reverb).connect(comp);
      comp.connect(this.master).connect(this.ctx.destination);
    }
  }

  unlock() {
    this.init();
    this.wake();
    this.keepPlaying();
  }

  // iphones mute web audio when the ringer is off unless a real media element is playing.
  // a looping, silent track flips the page into "media" mode so the notes are heard anyway
  keepPlaying() {
    if (!this.silent) {
      const rate = 8000, len = rate / 2; // half a second of silence, 8-bit mono wav
      const buf = new ArrayBuffer(44 + len), v = new DataView(buf);
      const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); v.setUint32(4, 36 + len, true); str(8, 'WAVEfmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
      str(36, 'data'); v.setUint32(40, len, true);
      for (let i = 0; i < len; i++) v.setUint8(44 + i, 128);
      this.silent = document.createElement('audio');
      this.silent.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      this.silent.loop = true;
      this.silent.setAttribute('playsinline', '');
      this.silent.setAttribute('x-webkit-airplay', 'deny');
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.silent.pause(); });
    }
    if (this.silent.paused && !document.hidden) this.silent.play().catch(() => {});
  }

  wake() {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
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
      // if waking takes too long (say a call is still going) the moment has passed, so skip it
      const asked = performance.now();
      this.ctx.resume().then(() => { if (performance.now() - asked < 800) this.play(symbol, opts); }).catch(() => {});
      return;
    }
    const { when = 0, beat = 0.34, gain = 0.6, sour = false, plain = false } = opts;
    const m = this.midi(symbol);
    const inst = INSTRUMENTS[this.instrument];
    const pick = this.sampleFor(m);
    const buf = this.buffers.get(pick.url);
    if (!buf) {
      // the recording isn't ready yet: wait for it rather than play a different sound.
      // if it takes too long the moment has passed, so skip it
      const asked = performance.now();
      this.decode(pick.url, pick.remote).then(() => {
        if (performance.now() - asked < 1500) this.play(symbol, { ...opts, when: Math.max(0, when - (performance.now() - asked) / 1000) });
      }).catch(() => {});
      return;
    }
    const t = this.ctx.currentTime + 0.005 + when;

    for (const n of plain ? [{ o: 0, d: 1 }] : PATTERNS[symbol - 1]) {
      const at = t + n.o * beat, len = n.d * beat;
      const copies = sour ? [{ detune: 45 }, { detune: -40 }] : [{ detune: 0 }];
      for (const c of copies) {
        const o = { ...n, detune: c.detune, wobble: sour };
        const g = gain * (sour ? 0.6 : 1);
        this.sample(buf, pick.rate, at, len, g, o, inst);
      }
    }
  }

  // rate pitches the nearest recording to the exact note
  sample(buf, rate, t, len, gain, { bend = 0, swell = false, detune = 0, wobble = false }, inst) {
    gain *= this.level.get(buf) ?? 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, t);
    src.detune.value = detune;
    if (bend) {
      src.playbackRate.setValueAtTime(rate, t + len * 0.35);
      src.playbackRate.exponentialRampToValueAtTime(rate * Math.pow(2, bend / 12), t + len * 0.35 + 0.12);
    }
    if (wobble) src.detune.linearRampToValueAtTime(detune - 70, t + Math.max(len, 0.3) + 0.2);

    const out = this.out();
    const g = out.gain;
    // ringing instruments keep their natural decay, held ones stop when the note ends
    const ring = inst.sustain ? 0.35 : Math.min(2.4, Math.max(1, len * 3));
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

  // E G B D F, the lines of the staff, one clean note each
  preview() {
    this.unlock();
    const want = this.instrument + this.key;
    this.loading.then(() => {
      if (want !== this.instrument + this.key) return;
      [5, 1, 3, 4, 6].forEach((s, k) => this.play(s, { plain: true, when: k * 0.26, beat: k === 4 ? 0.9 : 0.3, gain: 0.5 }));
    });
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
