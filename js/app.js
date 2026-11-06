import { generate, geometry, candidates } from './sudoku.js?v=6';
import { Audio, SYMBOLS, INSTRUMENTS, KEYS } from './audio.js?v=6';

const SAVE_KEY = 'musical-sudoku-v3';
const $ = (id) => document.getElementById(id);

// which of the nine symbols each grid size uses (1-based ids into SYMBOLS)
const SETS = {
  4: [1, 2, 4, 5],
  6: [1, 2, 4, 5, 7, 8],
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

// music glyphs come in very different sizes and heights, so each one is measured
// and scaled to a target height (in em), then centred in its tile
const TARGET = [0.92, 0.6, 0.78, 0.78, 0.78, 0.78, 0.62, 0.66, 0.42];
let fit = TARGET.map(() => ({ s: 1, dy: 0 }));

function measureGlyphs() {
  const ctx = document.createElement('canvas').getContext('2d');
  const size = 200;
  ctx.font = `${size}px "Noto Music"`;
  fit = SYMBOLS.map((sym, n) => {
    const m = ctx.measureText(sym.glyph);
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (!h || !m.fontBoundingBoxAscent) return { s: 1, dy: 0 };
    const s = TARGET[n] / (h / size);
    // with line-height 1 the baseline sits here, measured from the top of the 1em box
    const baseline = 0.5 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 / size;
    const centre = baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 / size;
    return { s, dy: (0.5 - centre) * s };
  });
}

const audio = new Audio();

const settings = {
  grid: '9',
  difficulty: 'easy',
  instrument: 'piano',
  key: 'C',
  volume: 70,
  tempo: 120,
  theme: 'paper',
  size: 'm',
  autocheck: true,
  matching: true,
  dim: true,
  celebrate: true,
  timer: true,
  sound: true,
};

let game = null; // { n, difficulty, puzzle, solution, grid, marks, mistakes, hints, elapsed, won }
let geo = null;
let selected = -1;
let pencil = false;
let history = [];
let playTimers = [];
let cells = [];
let keys = [];

// storage can be blocked (private mode etc), so every access is guarded
function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ settings, game })); } catch { }
}

// grid values are 1..n, this maps them to a symbol id 1..9
const symOf = (v) => SETS[game.n][v - 1];
const sound = (v, opts) => audio.play(symOf(v), opts);

const glyph = (id) => {
  const f = fit[id - 1];
  return `<span class="glyph sym" style="--s:${f.s.toFixed(3)};--dy:${f.dy.toFixed(3)}em">${SYMBOLS[id - 1].glyph}</span>`;
};

// ---------- building the board for the current size ----------

function build() {
  geo = geometry(game.n);
  const { n, br, bc } = geo;
  const board = $('board');
  board.style.setProperty('--n', n);
  board.style.setProperty('--box-cols', n / bc);
  board.style.setProperty('--box-rows', n / br);
  board.style.setProperty('--br', br);
  board.style.setProperty('--bc', bc);
  board.innerHTML = '';
  cells = new Array(geo.total);
  geo.boxes.forEach((list) => {
    const box = document.createElement('div');
    box.className = 'box';
    for (const i of list) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.setAttribute('role', 'gridcell');
      el.addEventListener('pointerdown', () => select(i, true));
      box.appendChild(el);
      cells[i] = el;
    }
    board.appendChild(box);
  });

  const pad = $('pad');
  pad.innerHTML = '';
  pad.dataset.n = n;
  keys = SETS[n].map((id, k) => {
    const v = k + 1;
    const el = document.createElement('button');
    el.className = 'key';
    el.setAttribute('aria-label', SYMBOLS[id - 1].name);
    el.title = `${SYMBOLS[id - 1].name} (${v})`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); input(v); flashKey(v); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); input(v); } });
    pad.appendChild(el);
    return el;
  });
}

// help sheet legend shows all nine symbols
SYMBOLS.forEach((s, k) => {
  const item = document.createElement('button');
  item.dataset.id = k + 1;
  item.addEventListener('pointerdown', () => audio.play(k + 1));
  $('legend').appendChild(item);
});
// the try-it row in settings: tap each symbol to hear the current instrument
SYMBOLS.forEach((s, k) => {
  const b = document.createElement('button');
  b.dataset.id = k + 1;
  b.setAttribute('aria-label', s.name);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.play(k + 1); });
  $('tryPad').appendChild(b);
});

function drawLegend() {
  for (const item of $('legend').children) {
    const id = Number(item.dataset.id), s = SYMBOLS[id - 1];
    item.innerHTML = `${glyph(id)}<b>${s.name}</b><small>${audio.noteName(id)} · ${s.place}<br>${s.how}</small>`;
  }
  for (const b of $('tryPad').children) {
    const id = Number(b.dataset.id);
    b.innerHTML = `${glyph(id)}<small>${audio.noteName(id)}</small>`;
  }
}

audio.onstatus = (state) => {
  const name = INSTRUMENTS[settings.instrument].name;
  $('soundStatus').textContent = {
    loading: `Loading ${name.toLowerCase()} sounds…`,
    ready: '',
    failed: `Couldn't load ${name.toLowerCase()}. Using the built-in sound for now.`,
  }[state];
};

const instSeg = document.querySelector('[data-setting="instrument"]');
for (const [k, inst] of Object.entries(INSTRUMENTS)) instSeg.insertAdjacentHTML('beforeend', `<button data-value="${k}">${inst.name}</button>`);
const keySeg = document.querySelector('[data-setting="key"]');
for (const k of Object.keys(KEYS)) keySeg.insertAdjacentHTML('beforeend', `<button data-value="${k}">${k.replace('b', '♭')}</button>`);

// ---------- game state ----------

function newGame() {
  stopPlayback();
  const n = Number(settings.grid);
  const { puzzle, solution } = generate(n, settings.difficulty);
  game = {
    n,
    difficulty: settings.difficulty,
    puzzle,
    solution,
    grid: puzzle.slice(),
    marks: new Array(n * n).fill(0),
    mistakes: 0,
    hints: 0,
    elapsed: 0,
    won: false,
  };
  history = [];
  selected = -1;
  pencil = false;
  $('gameNote').hidden = true;
  build();
  save();
  render();
}

const isGiven = (i) => game.puzzle[i] !== 0;
const hasProgress = () => game.grid.some((v, i) => v !== game.puzzle[i]) || game.marks.some(Boolean);

function isWrong(i) {
  const v = game.grid[i];
  if (!v || isGiven(i)) return false;
  if (settings.autocheck) return v !== game.solution[i];
  return geo.peers[i].some((p) => game.grid[p] === v);
}

function snapshot() {
  history.push({ grid: game.grid.slice(), marks: game.marks.slice() });
  if (history.length > 200) history.shift();
}

function undo() {
  const prev = history.pop();
  if (!prev || game.won) return;
  game.grid = prev.grid;
  game.marks = prev.marks;
  save();
  render();
}

function input(v) {
  if (game.won || selected < 0 || isGiven(selected)) {
    // nothing editable selected: the pad works as a little instrument
    sound(v);
    if (!game.won && selected < 0) say('Tap a square first, then a symbol.');
    return;
  }
  if (pencil) {
    if (game.grid[selected]) { sound(v); return; }
    snapshot();
    game.marks[selected] ^= 1 << v;
    sound(v, { gain: 0.2 });
    save();
    render();
    return;
  }
  place(selected, v);
}

function place(i, v) {
  if (game.grid[i] === v) { sound(v); return; }
  snapshot();
  game.grid[i] = v;
  game.marks[i] = 0;
  for (const p of geo.peers[i]) game.marks[p] &= ~(1 << v);

  const wrong = isWrong(i);
  if (wrong && settings.autocheck) game.mistakes++;
  sound(v, { sour: wrong });
  if (wrong) audio.wrong();
  save();
  render();
  animate(i, wrong ? 'shake' : 'pop');
  if (wrong) {
    say(settings.autocheck ? "That one's out of tune here. Try another." : 'That symbol is already in this row, column or box.', true);
    $('mistakes').classList.remove('flash');
    void $('mistakes').offsetWidth;
    $('mistakes').classList.add('flash');
  } else {
    clearTimeout(sayTimer);
    sayTimer = null;
    $('hintLine').textContent = defaultLine();
    $('hintLine').classList.remove('bad');
    if (settings.celebrate) celebrateGroups(i);
  }
  checkWin();
}

function erase() {
  if (selected < 0 || isGiven(selected) || game.won) return;
  if (!game.grid[selected] && !game.marks[selected]) return;
  snapshot();
  game.grid[selected] = 0;
  game.marks[selected] = 0;
  save();
  render();
}

function reveal() {
  if (game.won) return;
  let i = selected;
  if (i < 0 || isGiven(i) || game.grid[i] === game.solution[i]) {
    const open = [...Array(geo.total).keys()].filter((c) => game.grid[c] !== game.solution[c]);
    if (!open.length) return;
    i = open[Math.floor(Math.random() * open.length)];
    selected = i;
  }
  game.hints++;
  place(i, game.solution[i]);
}

function listen() {
  if (game.won) return;
  if (selected < 0 || isGiven(selected)) { say('Pick an empty square to hear what goes there.'); return; }
  sound(game.solution[selected]);
  say('Listen, then find the symbol that sounds like that.');
}

const groupDone = (list) => list.every((c) => game.grid[c] && !isWrong(c));
const solved = () => game.grid.every((v, c) => v && !isWrong(c));

// a finished row, column or box plays back as a little phrase
function celebrateGroups(i) {
  const groups = [geo.rows[geo.rowOf(i)], geo.cols[geo.colOf(i)], geo.boxes[geo.boxOf(i)]].filter(groupDone);
  if (!groups.length || solved()) return;
  stopPlayback();
  let start = 500;
  for (const g of groups) start = perform(g, { step: 170, start }) + 300;
}

function checkWin() {
  if (!solved()) return;
  game.won = true;
  selected = -1;
  save();
  render();
  setTimeout(playBoard, 600);
}

// ---------- playback ----------

const beatMs = () => 60000 / settings.tempo / 2;

// plays cells in order (empty ones are silent) and lights them up. returns ms when it ends
function perform(list, { step = beatMs(), start = 0, rowGap = 0 } = {}) {
  let t = start;
  list.forEach((c, k) => {
    if (rowGap && k && k % game.n === 0) t += step * rowGap;
    playTimers.push(setTimeout(() => {
      const v = game.grid[c];
      if (v) sound(v, { beat: step / 1000, gain: 0.4 });
      cells[c].classList.add('playing');
      playTimers.push(setTimeout(() => cells[c].classList.remove('playing'), step * 0.85));
    }, t));
    t += step;
  });
  return t;
}

function setPlayIcon(playing) {
  $('playBtn').setAttribute('aria-pressed', String(playing));
  $('playBtn').innerHTML = `<svg><use href="#i-${playing ? 'stop' : 'play'}"/></svg>`;
}

function stopPlayback() {
  playTimers.forEach(clearTimeout);
  playTimers = [];
  cells.forEach((el) => el.classList.remove('playing'));
  setPlayIcon(false);
}

function playBoard() {
  if (playTimers.length) { stopPlayback(); return; }
  const end = perform([...Array(geo.total).keys()], { rowGap: 1 });
  setPlayIcon(true);
  playTimers.push(setTimeout(stopPlayback, end + 200));
}

// ---------- view ----------

let sayTimer = null;
function say(text, bad = false) {
  clearTimeout(sayTimer);
  $('hintLine').textContent = text;
  $('hintLine').classList.toggle('bad', bad);
  sayTimer = setTimeout(() => {
    sayTimer = null;
    $('hintLine').textContent = defaultLine();
    $('hintLine').classList.remove('bad');
  }, 3500);
}
function defaultLine() {
  if (game?.won) return 'Nice work. Press play to hear your board.';
  return pencil ? 'Notes are on: symbols go in small.' : 'Tap a square, then tap a symbol.';
}

function animate(i, cls) {
  const el = cells[i];
  el.classList.remove('pop', 'shake');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 400);
}

function flashKey(v) {
  const el = keys[v - 1];
  el.classList.add('down');
  setTimeout(() => el.classList.remove('down'), 110);
}

function select(i, audition) {
  if (game.won) return;
  selected = i;
  // every tap makes a sound: the symbol if there is one, a soft tick if empty
  if (audition) game.grid[i] ? sound(game.grid[i]) : audio.unlock() || audio.tick();
  render();
}

function render() {
  if (!game) return;
  const selV = selected >= 0 ? game.grid[selected] : 0;
  const selPeers = selected >= 0 ? new Set(geo.peers[selected]) : new Set();
  const n = game.n;

  for (let i = 0; i < geo.total; i++) {
    const el = cells[i];
    const v = game.grid[i];
    const keep = ['playing', 'pop', 'shake'].filter((c) => el.classList.contains(c));
    el.className = 'cell';
    el.classList.add(...keep);
    if (v) {
      el.classList.add(isGiven(i) ? 'given' : 'user');
      if (isWrong(i)) el.classList.add('wrong');
      el.innerHTML = glyph(symOf(v));
      el.setAttribute('aria-label', `${SYMBOLS[symOf(v) - 1].name}${isGiven(i) ? ', given' : ''}`);
    } else {
      const m = game.marks[i];
      el.innerHTML = m ? '<div class="marks sym">' + SETS[n].map((id, k) =>
        `<span>${m & (1 << (k + 1)) ? SYMBOLS[id - 1].glyph : ''}</span>`).join('') + '</div>' : '';
      el.setAttribute('aria-label', 'empty');
    }
    if (i === selected) el.classList.add('selected');
    else if (settings.matching && selV && v === selV) el.classList.add('match');
    else if (selPeers.has(i)) el.classList.add('peer');
  }

  // grey out symbols that can't go in the selected square
  const allowed = settings.dim && selected >= 0 && !isGiven(selected) && !game.grid[selected]
    ? new Set(candidates(geo, game.grid, selected)) : null;

  keys.forEach((el, k) => {
    const v = k + 1;
    const placed = game.grid.filter((x, c) => x === v && !isWrong(c)).length;
    el.classList.toggle('done', placed === n);
    el.classList.toggle('blocked', !!allowed && !allowed.has(v));
    el.innerHTML = `${glyph(SETS[n][k])}<span class="left">${n - placed || ''}</span>`;
  });

  document.body.classList.toggle('pencil-on', pencil);
  document.body.classList.toggle('no-timer', !settings.timer);
  $('pencilBtn').setAttribute('aria-pressed', String(pencil));
  $('controls').hidden = game.won;
  $('win').hidden = !game.won;
  if (game.won) $('winStats').textContent = `${fmt(game.elapsed)} · ${game.mistakes} mistakes · ${game.hints} reveals`;
  $('levelLabel').textContent = `${n}×${n} · ${game.difficulty[0].toUpperCase()}${game.difficulty.slice(1)}`;
  $('mistakes').textContent = `${game.mistakes} mistake${game.mistakes === 1 ? '' : 's'}`;
  $('timer').textContent = fmt(game.elapsed);
  if (!sayTimer) $('hintLine').textContent = defaultLine();
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

setInterval(() => {
  if (!game || game.won || document.hidden) return;
  game.elapsed++;
  $('timer').textContent = fmt(game.elapsed);
  if (game.elapsed % 5 === 0) save();
}, 1000);

// ---------- settings ----------

function applySettings() {
  if (!INSTRUMENTS[settings.instrument]) settings.instrument = 'piano';
  if (audio.instrument !== settings.instrument || audio.key !== settings.key) {
    audio.instrument = settings.instrument;
    audio.key = settings.key;
    audio.load();
    drawLegend();
  }
  audio.setVolume(settings.volume / 100);
  audio.setMuted(!settings.sound);
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.size = settings.size;
  document.querySelectorAll('.seg').forEach((seg) => {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.value === settings[seg.dataset.setting]));
  });
  document.querySelectorAll('[data-toggle]').forEach((t) => { t.checked = settings[t.dataset.toggle]; });
  $('volume').value = settings.volume;
  $('tempo').value = settings.tempo;
}

function changed() {
  applySettings();
  save();
  render();
}

document.querySelectorAll('.seg').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const key = seg.dataset.setting;
    settings[key] = b.dataset.value;
    changed();
    if (key === 'instrument' || key === 'key') {
      // a little run up the staff: E G B D
      audio.play(5, { beat: 0.3 });
      audio.play(1, { when: 0.3 });
      audio.play(3, { when: 0.6, beat: 0.3 });
      audio.play(4, { when: 0.9 });
    }
    // a new size or level starts right away unless you're mid-game
    if (key === 'grid' || key === 'difficulty') {
      const differs = Number(settings.grid) !== game.n || settings.difficulty !== game.difficulty;
      if (differs && (!hasProgress() || game.won)) newGame();
      else $('gameNote').hidden = !differs;
    }
  });
});
document.querySelectorAll('[data-toggle]').forEach((t) => {
  t.addEventListener('change', () => { settings[t.dataset.toggle] = t.checked; changed(); });
});
$('volume').addEventListener('input', (e) => { settings.volume = Number(e.target.value); changed(); });
$('volume').addEventListener('change', () => audio.play(4));
$('tempo').addEventListener('input', (e) => { settings.tempo = Number(e.target.value); changed(); });

// ---------- controls ----------

$('newBtn').addEventListener('click', () => { $('settings').close(); newGame(); });
$('winNew').addEventListener('click', newGame);
$('winPlay').addEventListener('click', () => { stopPlayback(); playBoard(); });
$('pencilBtn').addEventListener('click', () => { pencil = !pencil; render(); });
$('eraseBtn').addEventListener('click', erase);
$('undoBtn').addEventListener('click', undo);
$('hintBtn').addEventListener('click', reveal);
$('listenBtn').addEventListener('click', listen);
$('playBtn').addEventListener('click', () => { audio.unlock(); playBoard(); });
$('settingsBtn').addEventListener('click', () => $('settings').showModal());
$('helpBtn').addEventListener('click', () => $('help').showModal());

// close sheets with their buttons or by tapping the backdrop
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
});

// any first touch wakes the audio up so the first sound isn't lost
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input')) return;
  audio.unlock();
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-9]$/.test(k) && Number(k) <= game.n) { input(Number(k)); flashKey(Number(k)); return; }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { erase(); return; }
  if (k === 'n' || k === 'N' || k === 'p' || k === 'P') { pencil = !pencil; render(); return; }
  if (k === 'l' || k === 'L') { listen(); return; }
  if (k === ' ') { e.preventDefault(); playBoard(); return; }
  if (k === 'Escape') { selected = -1; render(); return; }
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (k in moves) {
    e.preventDefault();
    const n = game.n;
    if (selected < 0) { select(Math.floor(geo.total / 2), true); return; }
    const [dr, dc] = moves[k];
    select(((geo.rowOf(selected) + dr + n) % n) * n + (geo.colOf(selected) + dc + n) % n, true);
  }
});

// ---------- start ----------

drawLegend();
const saved = load();
if (saved?.settings) Object.assign(settings, saved.settings);
applySettings();
audio.load(); // start fetching the instrument right away so the first tap has real sound
if (saved?.game?.n && saved.game.grid?.length === saved.game.n ** 2) {
  game = saved.game;
  build();
  render();
} else {
  newGame();
}
if (!saved) $('help').showModal();

document.fonts?.load('1em "Noto Music"', SYMBOLS.map((s) => s.glyph).join('')).then(() => {
  measureGlyphs();
  drawLegend();
  render();
});
