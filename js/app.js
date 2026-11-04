import { generate, peers, rowOf, colOf, boxOf, rowCells, colCells, boxCells } from './sudoku.js';
import { Audio, SCALES, INSTRUMENTS, noteLabels } from './audio.js';

const SAVE_KEY = 'musical-sudoku-v1';
const $ = (id) => document.getElementById(id);

const audio = new Audio();

const settings = {
  difficulty: 'easy',
  scale: 'major',
  instrument: 'piano',
  labels: 'solfege',
  tempo: 140,
  volume: 70,
  muted: false,
  autocheck: true,
};

let game = null; // { puzzle, solution, grid, marks, mistakes, hints, elapsed, won }
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

// ---------- setup ----------

const boardEl = $('board');
const padEl = $('pad');
const cells = [];
const keys = [];

for (let i = 0; i < 81; i++) {
  const el = document.createElement('div');
  el.className = `cell r${rowOf(i)} c${colOf(i)}`;
  el.setAttribute('role', 'gridcell');
  el.addEventListener('pointerdown', () => { unlock(); select(i, true); });
  boardEl.appendChild(el);
  cells.push(el);
}

for (let v = 1; v <= 9; v++) {
  const el = document.createElement('button');
  el.className = 'key';
  el.style.setProperty('--note', `var(--n${v})`);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); unlock(); input(v); flashKey(v); });
  padEl.appendChild(el);
  keys.push(el);
}

for (const [k, s] of Object.entries(SCALES)) $('scale').add(new Option(s.name, k));
for (const [k, name] of Object.entries(INSTRUMENTS)) $('instrument').add(new Option(name, k));

function unlock() { audio.unlock(); }

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
  $('win').hidden = true;
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
  if (!prev) return;
  game.grid = prev.grid;
  game.marks = prev.marks;
  save();
  render();
}

function input(v) {
  if (!game || game.won || selected < 0 || isGiven(selected)) {
    // no editable square selected: the keys work as a little keyboard
    audio.play(v);
    return;
  }
  if (pencil) {
    if (game.grid[selected]) { audio.play(v); return; }
    snapshot();
    game.marks[selected] ^= 1 << v;
    audio.play(v, { gain: 0.25, length: 0.4 });
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

  if (isWrong(i)) {
    if (settings.autocheck) game.mistakes++;
    audio.play(v, { gain: 0.35 });
    audio.wrong();
  } else {
    audio.play(v);
    ping(i);
    celebrateGroups(i);
  }
  save();
  render();
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

function earHint() {
  if (selected < 0 || game.won) return;
  const v = game.solution[selected];
  audio.play(v, { length: 1.2 });
  audio.play(v, { when: 0.55, length: 1.2, gain: 0.3 });
  ping(selected, v);
}

const groupDone = (list) => list.every((c) => game.grid[c] && !isWrong(c));

// when a row, column or box gets finished, play it back as a melody
function celebrateGroups(i) {
  const groups = [rowCells(rowOf(i)), colCells(colOf(i)), boxCells(boxOf(i))].filter(groupDone);
  if (!groups.length || game.grid.every((v, c) => v && !isWrong(c))) return;
  stopPlayback();
  let start = 450;
  for (const g of groups) start = perform(g, { step: 120, start }) + 250;
}

function checkWin() {
  if (!game.grid.every((v, c) => v && !isWrong(c))) return;
  game.won = true;
  selected = -1;
  save();
  render();
  const m = Math.floor(game.elapsed / 60), s = String(game.elapsed % 60).padStart(2, '0');
  $('winStats').textContent = `${m}:${s} · ${game.mistakes} mistakes · ${game.hints} reveals`;
  setTimeout(() => {
    $('win').hidden = false;
    playBoard();
  }, 500);
}

// ---------- playback ----------

const stepMs = () => (60 / settings.tempo) * 1000 / 2;

// plays cells in order (empty ones are rests) and lights them up. returns ms when it ends
function perform(list, { step = stepMs(), start = 0, rowGap = 0 } = {}) {
  let t = start;
  list.forEach((c, n) => {
    if (rowGap && n && n % 9 === 0) t += step * rowGap;
    const at = t;
    playTimers.push(setTimeout(() => {
      const v = game.grid[c];
      if (v) audio.play(v, { length: step / 1000 * 2.5, gain: 0.42 });
      cells[c].classList.add('playing');
      playTimers.push(setTimeout(() => cells[c].classList.remove('playing'), step * 0.9));
    }, at));
    t += step;
  });
  return t;
}

function stopPlayback() {
  playTimers.forEach(clearTimeout);
  playTimers = [];
  cells.forEach((el) => el.classList.remove('playing'));
  $('playBtn').textContent = 'Play board';
  $('playBtn').setAttribute('aria-pressed', 'false');
}

function playBoard() {
  if (playTimers.length) { stopPlayback(); return; }
  const end = perform([...Array(81).keys()], { rowGap: 1 });
  $('playBtn').textContent = 'Stop';
  $('playBtn').setAttribute('aria-pressed', 'true');
  playTimers.push(setTimeout(stopPlayback, end + 200));
}

function playGroup(kind) {
  const i = selected >= 0 ? selected : 0;
  const list = kind === 'row' ? rowCells(rowOf(i)) : kind === 'col' ? colCells(colOf(i)) : boxCells(boxOf(i));
  stopPlayback();
  perform(list);
}

// ---------- view ----------

function ping(i, v) {
  const el = cells[i];
  if (v) el.style.setProperty('--note', `var(--n${v})`);
  el.classList.remove('ping');
  void el.offsetWidth;
  el.classList.add('ping');
}

function flashKey(v) {
  const el = keys[v - 1];
  el.classList.add('down');
  setTimeout(() => el.classList.remove('down'), 120);
}

function select(i, audition) {
  selected = i;
  if (audition && game.grid[i]) audio.play(game.grid[i]);
  render();
}

function render() {
  if (!game) return;
  const labels = noteLabels(settings.scale);
  const selV = selected >= 0 ? game.grid[selected] : 0;
  const selPeers = selected >= 0 ? new Set(peers(selected)) : new Set();

  for (let i = 0; i < 81; i++) {
    const el = cells[i];
    const v = game.grid[i];
    const keep = ['playing', 'ping'].filter((c) => el.classList.contains(c));
    el.className = `cell r${rowOf(i)} c${colOf(i)}`;
    el.classList.add(...keep);
    if (v) {
      el.dataset.v = v;
      el.style.setProperty('--note', `var(--n${v})`);
      el.classList.add(isGiven(i) ? 'given' : 'user');
      if (isWrong(i)) el.classList.add('wrong');
      if (selV && v === selV && i !== selected) el.classList.add('same');
      el.innerHTML = settings.labels === 'color' ? '<span class="dot"></span>' : labels[v - 1][settings.labels];
      el.setAttribute('aria-label', `${labels[v - 1].solfege}${isGiven(i) ? ', given' : ''}`);
    } else {
      delete el.dataset.v;
      el.style.removeProperty('--note');
      const m = game.marks[i];
      if (m) {
        el.innerHTML = '<div class="marks">' + Array.from({ length: 9 }, (_, k) =>
          `<span class="${m & (1 << (k + 1)) ? 'on' : ''}" style="--note:var(--n${k + 1})"></span>`).join('') + '</div>';
      } else {
        el.innerHTML = '';
      }
      el.setAttribute('aria-label', 'empty');
    }
    if (i === selected) el.classList.add('selected');
    else if (selPeers.has(i)) el.classList.add('peer');
  }

  for (let v = 1; v <= 9; v++) {
    const placed = game.grid.filter((x, c) => x === v && !isWrong(c)).length;
    const el = keys[v - 1];
    el.classList.toggle('done', placed === 9);
    const name = settings.labels === 'color' ? '' : labels[v - 1][settings.labels];
    el.innerHTML = `<span class="left">${9 - placed}</span><span>${name}</span>`;
    el.setAttribute('aria-label', `${labels[v - 1].solfege}, ${9 - placed} left`);
  }

  $('mistakes').textContent = `Mistakes ${game.mistakes}`;
  $('pencilBtn').setAttribute('aria-pressed', String(pencil));
  updateTimer();
}

function updateTimer() {
  const m = Math.floor(game.elapsed / 60), s = String(game.elapsed % 60).padStart(2, '0');
  $('timer').textContent = `${m}:${s}`;
}

setInterval(() => {
  if (!game || game.won || document.hidden) return;
  game.elapsed++;
  updateTimer();
  if (game.elapsed % 5 === 0) save();
}, 1000);

// ---------- controls ----------

function applySettings() {
  audio.scale = settings.scale;
  audio.instrument = settings.instrument;
  audio.setVolume(settings.volume / 100);
  audio.setMuted(settings.muted);
  $('difficulty').value = settings.difficulty;
  $('scale').value = settings.scale;
  $('instrument').value = settings.instrument;
  $('labels').value = settings.labels;
  $('tempo').value = settings.tempo;
  $('volume').value = settings.volume;
  $('autocheck').checked = settings.autocheck;
  $('muteBtn').setAttribute('aria-pressed', String(settings.muted));
  $('muteBtn').textContent = settings.muted ? 'Unmute' : 'Mute';
}

function bindSetting(id, key, after) {
  $(id).addEventListener('input', (e) => {
    const t = e.target;
    settings[key] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
    applySettings();
    after?.();
    save();
    render();
  });
}

bindSetting('difficulty', 'difficulty');
bindSetting('scale', 'scale', () => { unlock(); audio.sequence([1, 2, 3, 4, 5, 6, 7, 8, 9], { step: 0.09 }); });
bindSetting('instrument', 'instrument', () => { unlock(); audio.chord([1, 3, 5]); });
bindSetting('labels', 'labels');
bindSetting('tempo', 'tempo');
bindSetting('volume', 'volume');
bindSetting('autocheck', 'autocheck');

$('newBtn').addEventListener('click', () => newGame(settings.difficulty));
$('winNew').addEventListener('click', () => newGame(settings.difficulty));
$('winPlay').addEventListener('click', () => { unlock(); stopPlayback(); playBoard(); });
$('pencilBtn').addEventListener('click', () => { pencil = !pencil; render(); });
$('eraseBtn').addEventListener('click', erase);
$('undoBtn').addEventListener('click', undo);
$('hintBtn').addEventListener('click', () => { unlock(); reveal(); });
$('listenBtn').addEventListener('click', () => { unlock(); earHint(); });
$('playBtn').addEventListener('click', () => { unlock(); playBoard(); });
$('rowBtn').addEventListener('click', () => { unlock(); playGroup('row'); });
$('colBtn').addEventListener('click', () => { unlock(); playGroup('col'); });
$('boxBtn').addEventListener('click', () => { unlock(); playGroup('box'); });
$('muteBtn').addEventListener('click', () => { settings.muted = !settings.muted; applySettings(); save(); });
$('helpBtn').addEventListener('click', () => $('help').showModal());

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('select, input, dialog')) return;
  unlock();
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-9]$/.test(k)) { input(Number(k)); flashKey(Number(k)); return; }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { erase(); return; }
  if (k === 'p' || k === 'P' || k === 'n' || k === 'N') { pencil = !pencil; render(); return; }
  if (k === 'e' || k === 'E') { earHint(); return; }
  if (k === ' ') { e.preventDefault(); playBoard(); return; }
  const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
  if (k in moves) {
    e.preventDefault();
    if (selected < 0) { select(0, true); return; }
    const r = rowOf(selected), c = colOf(selected);
    const nr = (r + (k === 'ArrowUp' ? 8 : k === 'ArrowDown' ? 1 : 0)) % 9;
    const nc = (c + (k === 'ArrowLeft' ? 8 : k === 'ArrowRight' ? 1 : 0)) % 9;
    select(nr * 9 + nc, true);
  }
});

// ---------- start ----------

const saved = load();
if (saved?.settings) Object.assign(settings, saved.settings);
applySettings();
if (saved?.game?.grid?.length === 81) {
  game = saved.game;
  render();
  if (game.won) $('win').hidden = false;
} else {
  newGame();
}
if (!saved) $('help').showModal();
