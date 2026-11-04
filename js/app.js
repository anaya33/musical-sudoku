import { generate, peers, rowOf, colOf, boxOf, rowCells, colCells, boxCells } from './sudoku.js';
import { Audio, SYMBOLS, INSTRUMENTS, KEYS } from './audio.js';

const SAVE_KEY = 'musical-sudoku-v2';
const $ = (id) => document.getElementById(id);

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
  difficulty: 'easy',
  instrument: 'piano',
  key: 'C',
  volume: 70,
  tempo: 120,
  theme: 'paper',
  size: 'm',
  autocheck: true,
  matching: true,
  celebrate: true,
  timer: true,
  sound: true,
};

let game = null; // { difficulty, puzzle, solution, grid, marks, mistakes, hints, elapsed, won }
let selected = -1;
let pencil = false;
let history = [];
let playTimers = [];

// storage can be blocked (private mode etc), so every access is guarded
function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ settings, game })); } catch { }
}

const glyph = (v) => {
  const f = fit[v - 1];
  return `<span class="glyph sym" style="--s:${f.s.toFixed(3)};--dy:${f.dy.toFixed(3)}em">${SYMBOLS[v - 1].glyph}</span>`;
};

// ---------- setup ----------

const boardEl = $('board');
const cells = new Array(81);
const keys = [];

for (let b = 0; b < 9; b++) {
  const box = document.createElement('div');
  box.className = 'box';
  for (const i of boxCells(b)) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.setAttribute('role', 'gridcell');
    el.addEventListener('pointerdown', () => { audio.unlock(); select(i, true); });
    box.appendChild(el);
    cells[i] = el;
  }
  boardEl.appendChild(box);
}

SYMBOLS.forEach((s, n) => {
  const v = n + 1;
  const el = document.createElement('button');
  el.className = 'key';
  el.setAttribute('aria-label', s.name);
  el.title = `${s.name} (${v})`;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); input(v); flashKey(v); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); input(v); } });
  $('pad').appendChild(el);
  keys.push(el);

  const item = document.createElement('button');
  item.dataset.v = v;
  item.addEventListener('pointerdown', () => { audio.unlock(); audio.play(v); });
  $('legend').appendChild(item);
});

const instSeg = document.querySelector('[data-setting="instrument"]');
for (const [k, inst] of Object.entries(INSTRUMENTS)) instSeg.insertAdjacentHTML('beforeend', `<button data-value="${k}">${inst.name}</button>`);
const keySeg = document.querySelector('[data-setting="key"]');
for (const k of Object.keys(KEYS)) keySeg.insertAdjacentHTML('beforeend', `<button data-value="${k}">${k.replace('b', '♭')}</button>`);

// ---------- game state ----------

function newGame(difficulty = settings.difficulty) {
  stopPlayback();
  const { puzzle, solution } = generate(difficulty);
  game = {
    difficulty,
    puzzle,
    solution,
    grid: puzzle.slice(),
    marks: new Array(81).fill(0),
    mistakes: 0,
    hints: 0,
    elapsed: 0,
    won: false,
  };
  history = [];
  selected = -1;
  pencil = false;
  save();
  render();
}

const isGiven = (i) => game.puzzle[i] !== 0;

function isWrong(i) {
  const v = game.grid[i];
  if (!v || isGiven(i)) return false;
  if (settings.autocheck) return v !== game.solution[i];
  return peers(i).some((p) => game.grid[p] === v);
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
  if (!game || game.won || selected < 0 || isGiven(selected)) {
    // nothing editable selected: the pad works as a little instrument
    audio.play(v);
    if (game && !game.won && selected < 0) say('Tap a square first, then a symbol.');
    return;
  }
  if (pencil) {
    if (game.grid[selected]) { audio.play(v); return; }
    snapshot();
    game.marks[selected] ^= 1 << v;
    audio.tick();
    save();
    render();
    return;
  }
  place(selected, v);
}

function place(i, v) {
  if (game.grid[i] === v) { audio.play(v); return; }
  snapshot();
  game.grid[i] = v;
  game.marks[i] = 0;
  for (const p of peers(i)) game.marks[p] &= ~(1 << v);

  const wrong = isWrong(i);
  if (wrong && settings.autocheck) game.mistakes++;
  audio.play(v, { gain: wrong ? 0.3 : 0.5 });
  if (wrong) audio.wrong();
  save();
  render();
  animate(i, wrong ? 'shake' : 'pop');
  if (wrong) say(settings.autocheck ? "That symbol doesn't go there." : 'That symbol is already in this row, column or box.');
  else {
    clearTimeout(sayTimer);
    sayTimer = null;
    $('hintLine').textContent = defaultLine();
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
    const open = [...Array(81).keys()].filter((c) => game.grid[c] !== game.solution[c]);
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
  audio.play(game.solution[selected]);
  say('Listen, then find the symbol that sounds like that.');
}

const groupDone = (list) => list.every((c) => game.grid[c] && !isWrong(c));
const solved = () => game.grid.every((v, c) => v && !isWrong(c));

// a finished row, column or box plays back as a little phrase
function celebrateGroups(i) {
  const groups = [rowCells(rowOf(i)), colCells(colOf(i)), boxCells(boxOf(i))].filter(groupDone);
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
  list.forEach((c, n) => {
    if (rowGap && n && n % 9 === 0) t += step * rowGap;
    playTimers.push(setTimeout(() => {
      const v = game.grid[c];
      if (v) audio.play(v, { beat: step / 1000, gain: 0.4 });
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
  const end = perform([...Array(81).keys()], { rowGap: 1 });
  setPlayIcon(true);
  playTimers.push(setTimeout(stopPlayback, end + 200));
}

// ---------- view ----------

let sayTimer = null;
function say(text) {
  clearTimeout(sayTimer);
  $('hintLine').textContent = text;
  sayTimer = setTimeout(() => { sayTimer = null; $('hintLine').textContent = defaultLine(); }, 3500);
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
  setTimeout(() => el.classList.remove(cls), 350);
}

function flashKey(v) {
  const el = keys[v - 1];
  el.classList.add('down');
  setTimeout(() => el.classList.remove('down'), 110);
}

function select(i, audition) {
  if (game.won) return;
  selected = i;
  if (audition && game.grid[i]) audio.play(game.grid[i]);
  render();
}

function render() {
  if (!game) return;
  const selV = selected >= 0 ? game.grid[selected] : 0;
  const selPeers = selected >= 0 ? new Set(peers(selected)) : new Set();

  for (let i = 0; i < 81; i++) {
    const el = cells[i];
    const v = game.grid[i];
    const keep = ['playing', 'pop', 'shake'].filter((c) => el.classList.contains(c));
    el.className = 'cell';
    el.classList.add(...keep);
    if (v) {
      el.classList.add(isGiven(i) ? 'given' : 'user');
      if (isWrong(i)) el.classList.add('wrong');
      el.innerHTML = glyph(v);
      el.setAttribute('aria-label', `${SYMBOLS[v - 1].name}${isGiven(i) ? ', given' : ''}`);
    } else {
      const m = game.marks[i];
      el.innerHTML = m ? '<div class="marks sym">' + SYMBOLS.map((s, k) =>
        `<span>${m & (1 << (k + 1)) ? s.glyph : ''}</span>`).join('') + '</div>' : '';
      el.setAttribute('aria-label', 'empty');
    }
    if (i === selected) el.classList.add('selected');
    else if (settings.matching && selV && v === selV) el.classList.add('match');
    else if (selPeers.has(i)) el.classList.add('peer');
  }

  keys.forEach((el, n) => {
    const v = n + 1;
    const placed = game.grid.filter((x, c) => x === v && !isWrong(c)).length;
    el.classList.toggle('done', placed === 9);
    el.innerHTML = `${glyph(v)}<span class="left">${9 - placed || ''}</span>`;
  });

  document.body.classList.toggle('pencil-on', pencil);
  document.body.classList.toggle('no-timer', !settings.timer);
  $('pencilBtn').setAttribute('aria-pressed', String(pencil));
  $('controls').hidden = game.won;
  $('win').hidden = !game.won;
  if (game.won) $('winStats').textContent = `${fmt(game.elapsed)} · ${game.mistakes} mistakes · ${game.hints} reveals`;
  $('levelLabel').textContent = game.difficulty[0].toUpperCase() + game.difficulty.slice(1);
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
  audio.instrument = settings.instrument;
  audio.key = settings.key;
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
    audio.unlock();
    if (key === 'instrument' || key === 'key') {
      audio.play(3, { beat: 0.25 });
      audio.play(4, { when: 0.3, beat: 0.25 });
      audio.play(1, { when: 0.6, beat: 0.25 });
    }
  });
});
document.querySelectorAll('[data-toggle]').forEach((t) => {
  t.addEventListener('change', () => { settings[t.dataset.toggle] = t.checked; changed(); });
});
$('volume').addEventListener('input', (e) => { settings.volume = Number(e.target.value); changed(); });
$('volume').addEventListener('change', () => { audio.unlock(); audio.play(4); });
$('tempo').addEventListener('input', (e) => { settings.tempo = Number(e.target.value); changed(); });

// ---------- controls ----------

$('newBtn').addEventListener('click', () => { $('settings').close(); newGame(settings.difficulty); });
$('winNew').addEventListener('click', () => newGame(settings.difficulty));
$('winPlay').addEventListener('click', () => { audio.unlock(); stopPlayback(); playBoard(); });
$('pencilBtn').addEventListener('click', () => { pencil = !pencil; render(); });
$('eraseBtn').addEventListener('click', erase);
$('undoBtn').addEventListener('click', undo);
$('hintBtn').addEventListener('click', () => { audio.unlock(); reveal(); });
$('listenBtn').addEventListener('click', () => { audio.unlock(); listen(); });
$('playBtn').addEventListener('click', () => { audio.unlock(); playBoard(); });
$('settingsBtn').addEventListener('click', () => $('settings').showModal());
$('helpBtn').addEventListener('click', () => $('help').showModal());

// close sheets with their buttons or by tapping the backdrop
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
});

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input')) return;
  audio.unlock();
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-9]$/.test(k)) { input(Number(k)); flashKey(Number(k)); return; }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { erase(); return; }
  if (k === 'n' || k === 'N' || k === 'p' || k === 'P') { pencil = !pencil; render(); return; }
  if (k === 'l' || k === 'L') { listen(); return; }
  if (k === ' ') { e.preventDefault(); playBoard(); return; }
  if (k === 'Escape') { selected = -1; render(); return; }
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (k in moves) {
    e.preventDefault();
    if (selected < 0) { select(40, true); return; }
    const [dr, dc] = moves[k];
    select(((rowOf(selected) + dr + 9) % 9) * 9 + (colOf(selected) + dc + 9) % 9, true);
  }
});

// ---------- start ----------

function drawLegend() {
  for (const item of $('legend').children) {
    const s = SYMBOLS[item.dataset.v - 1];
    item.innerHTML = `${glyph(Number(item.dataset.v))}<b>${s.name}</b><small>${s.sound}</small>`;
  }
}
drawLegend();
document.fonts?.load('1em "Noto Music"', SYMBOLS.map((s) => s.glyph).join('')).then(() => {
  measureGlyphs();
  drawLegend();
  render();
});

const saved = load();
if (saved?.settings) Object.assign(settings, saved.settings);
applySettings();
if (saved?.game?.grid?.length === 81) {
  game = saved.game;
  render();
} else {
  newGame();
}
if (!saved) $('help').showModal();
