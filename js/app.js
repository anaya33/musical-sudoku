import { geometry, candidateMask, candidates, conflicts, isSolved, popcount } from './sudoku.js?v=19';
import { nextPlacement, TECHNIQUES } from './solvers/logic.js?v=19';
import { Audio, SYMBOLS, INSTRUMENTS } from './audio.js?v=19';

const SAVE_KEY = 'musical-sudoku-v3';
const $ = (id) => document.getElementById(id);

// which of the nine symbols each grid size uses (1-based ids into SYMBOLS)
const SETS = {
  4: [1, 2, 4, 5],
  6: [1, 2, 4, 5, 7, 8],
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

// how much help each level gives.
// flag: 'solution' = any wrong symbol turns red, 'rules' = only symbols that clash turn red
const MODES = {
  learn: { name: 'Learn', dim: true, explain: true, flag: 'solution',
    info: 'Lots of symbols to start. Symbols that can\'t fit are greyed out, and an arrow explains every move.' },
  easy: { name: 'Easy', flag: 'solution',
    info: 'Solvable with the simplest logic. Wrong symbols turn red.' },
  medium: { name: 'Medium', flag: 'solution',
    info: 'Needs pairs and pointing tricks. Wrong symbols turn red.' },
  hard: { name: 'Hard', flag: 'rules',
    info: 'Needs advanced logic like X-wings. Mistakes only show when they break a rule.' },
  tutorial: { name: 'Learn', dim: true, flag: 'solution', info: '' },
};
const mode = () => MODES[game.difficulty] ?? MODES.easy;

// each symbol is a small image (symbols/*.png) used as a mask and filled with the text colour,
// so it shows on every phone without needing a music font
const FILES = ['treble-clef', 'bass-clef', 'half-note', 'quarter-note', 'eighth-note', 'sixteenth-note', 'sharp', 'flat', 'fermata'];

const audio = new Audio();

const settings = {
  grid: '9',
  difficulty: 'easy',
  instrument: 'piano',
  key: 'C',
  volume: 70,
  dark: false,
  timer: true,
  sound: true,
  walkthrough: false, // seen the Learn walkthrough already
  best: {}, // fastest time in seconds per "size-level", e.g. "9-hard"
};
const MATCHING = true; // highlight every copy of the selected symbol
const CELEBRATE = true; // play finished rows, columns and boxes
const TEMPO = 72; // slow enough to hear each note in the melody; each instrument adjusts it with its pace

let game = null; // { n, difficulty, puzzle, solution, grid, marks, mistakes, hints, elapsed, won, techniques }
let geo = null;
let selected = -1;
let pencil = false;
let history = [];
let playTimers = [];
let cells = [];
let keys = [];
let hint = null; // { cell, value } while a hint is showing, a second press fills it
let busy = false;

// storage can be blocked (private mode etc), so every access is guarded
function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function save() {
  if (game?.difficulty === 'tutorial') return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ settings, game })); } catch { }
}

// grid values are 1..n, this maps them to a symbol id 1..9
const symOf = (v) => SETS[game.n][v - 1];
const nameOf = (v) => SYMBOLS[symOf(v) - 1].name.toLowerCase();
const sound = (v, opts) => audio.play(symOf(v), opts);
const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { } };

const glyph = (id) => `<span class="glyph" style="--img:url(symbols/${FILES[id - 1]}.png)" aria-hidden="true"></span>`;

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
  pad.style.setProperty('--keys', n);
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

function drawLegend() {
  for (const item of $('legend').children) {
    const id = Number(item.dataset.id), s = SYMBOLS[id - 1];
    item.innerHTML = `${glyph(id)}<b>${s.name}</b><small>${audio.noteName(id)}</small>`;
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

for (const [k, inst] of Object.entries(INSTRUMENTS)) $('instrument').add(new Option(inst.name, k));

// ---------- making puzzles ----------

// puzzles are built in a worker so a hard one never freezes the page
let worker = null, jobId = 0;
const jobs = new Map();
function makePuzzle(n, difficulty) {
  if (!worker && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./worker.js?v=19', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { jobs.get(e.data.id)?.(e.data.result); jobs.delete(e.data.id); };
      worker.onerror = () => { worker = false; };
    } catch { worker = false; }
  }
  if (worker) {
    const id = ++jobId;
    return new Promise((res) => { jobs.set(id, res); worker.postMessage({ id, n, difficulty }); });
  }
  return import('./generator.js?v=19').then((m) => m.generate(n, difficulty));
}

async function newGame() {
  stopPlayback();
  hideCoach();
  tutorialStep = -1;
  setBusy(true);
  const n = Number(settings.grid);
  const difficulty = settings.difficulty;
  const r = await makePuzzle(n, difficulty);
  setBusy(false);
  start({ n, difficulty, puzzle: r.puzzle, solution: r.solution, techniques: r.techniques ?? [] });
}

function start({ n, difficulty, puzzle, solution, techniques = [] }) {
  game = {
    n, difficulty, puzzle, solution, techniques,
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
  hint = null;
  build();
  save();
  render();
}

function setBusy(on) {
  busy = on;
  $('board').classList.toggle('busy', on);
  $('busy').hidden = !on;
}

// ---------- rules ----------

const isGiven = (i) => game.puzzle[i] !== 0;
const hasProgress = () => game.grid.some((v, i) => v !== game.puzzle[i]) || game.marks.some(Boolean);
let clashCache = null;
const clashes = () => clashCache ?? (clashCache = conflicts(geo, game.grid));

function isWrong(i) {
  const v = game.grid[i];
  if (!v || isGiven(i)) return false;
  return mode().flag === 'solution' ? v !== game.solution[i] : clashes().has(i);
}

const solved = () => isSolved(geo, game.grid);
const groupDone = (list) => list.every((c) => game.grid[c] && !isWrong(c));

function snapshot() {
  history.push({ grid: game.grid.slice(), marks: game.marks.slice() });
  if (history.length > 200) history.shift();
}

function changedGrid() {
  clashCache = null;
}

function undo() {
  const prev = history.pop();
  if (!prev || game.won) return;
  game.grid = prev.grid;
  game.marks = prev.marks;
  changedGrid();
  hint = null;
  hideCoach();
  save();
  render();
}

// ---------- moves ----------

function input(v) {
  if (busy) return;
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

function place(i, v, { fromHint = false } = {}) {
  if (game.grid[i] === v) { sound(v); return; }
  const before = game.grid.slice();
  snapshot();
  game.grid[i] = v;
  game.marks[i] = 0;
  for (const p of geo.peers[i]) game.marks[p] &= ~(1 << v);
  changedGrid();
  hint = null;

  const wrong = isWrong(i);
  if (wrong) game.mistakes++;
  buzz(wrong ? [30, 50, 30] : 10);
  sound(v, { sour: wrong });
  if (wrong) audio.wrong();
  save();
  render();
  animate(i, wrong ? 'shake' : 'pop');

  if (wrong) {
    flashMistakes();
    if (mode().explain || game.difficulty === 'tutorial') explainWrong(i, v);
    else say(mode().flag === 'solution' ? "That one's out of tune here. Try another." : 'That symbol is already in this row, column or box.', true);
  } else {
    hideCoach();
    clearSay();
    if (mode().explain && !fromHint) explainRight(i, v, before);
    if (CELEBRATE) celebrateGroups(i);
  }
  if (game.difficulty === 'tutorial') tutorialMoved(i, v, wrong);
  checkWin();
}

function fillNotes() {
  if (game.won) return;
  snapshot();
  for (let i = 0; i < geo.total; i++) game.marks[i] = game.grid[i] ? 0 : candidateMask(geo, game.grid, i);
  audio.tick();
  save();
  render();
  say('Every square now shows the symbols that could still go there.');
}

function erase() {
  if (selected < 0 || isGiven(selected) || game.won) return;
  if (!game.grid[selected] && !game.marks[selected]) return;
  snapshot();
  game.grid[selected] = 0;
  game.marks[selected] = 0;
  changedGrid();
  hideCoach();
  save();
  render();
}

// ---------- explanations ----------

const unitName = (u) => u.kind;
const unitsOf = (i) => [
  { kind: 'row', cells: geo.rows[geo.rowOf(i)] },
  { kind: 'column', cells: geo.cols[geo.colOf(i)] },
  { kind: 'box', cells: geo.boxes[geo.boxOf(i)] },
];

// why v is right at i, judged from the board as it was just before the move
function reasonFor(i, v, grid) {
  const mask = candidateMask(geo, grid, i);
  if (popcount(mask) === 1) {
    return {
      text: `Only the ${nameOf(v)} fits here. Its row, column and box already have every other symbol.`,
      cells: geo.peers[i].filter((p) => grid[p]),
    };
  }
  for (const u of unitsOf(i)) {
    const others = u.cells.filter((c) => c !== i && !grid[c]);
    if (others.every((c) => !(candidateMask(geo, grid, c) & (1 << v)))) {
      return { text: `This is the only spot in this ${unitName(u)} where the ${nameOf(v)} can go.`, cells: u.cells };
    }
  }
  return null;
}

function explainRight(i, v, before) {
  const r = reasonFor(i, v, before);
  const text = r ? `Right! ${r.text}` : `Right! This one takes a trickier chain of logic to prove from here.`;
  showCoach(cells[i], text, { cells: r?.cells ?? [], timeout: 6000 });
}

function explainWrong(i, v) {
  const clash = geo.peers[i].find((p) => game.grid[p] === v);
  if (clash !== undefined) {
    const kind = geo.rowOf(clash) === geo.rowOf(i) ? 'row' : geo.colOf(clash) === geo.colOf(i) ? 'column' : 'box';
    showCoach(cells[i], `The ${nameOf(v)} is already in this ${kind}. Each symbol can only appear once.`, { cells: [clash], bad: true, timeout: 6000 });
  } else {
    showCoach(cells[i], `The ${nameOf(v)} doesn't break a rule yet, but it isn't the answer here. Try another symbol.`, { bad: true, timeout: 6000 });
  }
}

// ---------- hints ----------

const techniqueName = (t) => TECHNIQUES[t].label.toLowerCase();

function giveHint() {
  if (game.won || busy) return;
  // a second press on the same hint fills it in
  if (hint && selected === hint.cell && !game.grid[hint.cell]) {
    game.hints++;
    place(hint.cell, hint.value, { fromHint: true });
    return;
  }
  // fix mistakes first: logic from a wrong board would point the wrong way
  const wrongCell = game.grid.findIndex((v, i) => v && !isGiven(i) && v !== game.solution[i]);
  if (wrongCell >= 0) {
    selected = wrongCell;
    render();
    showCoach(cells[wrongCell], `This symbol isn't right. Erase it, then try again.`, { bad: true, timeout: 6000 });
    return;
  }
  const step = nextPlacement(geo, game.grid);
  let cell, value, text, marked = [];
  if (step) {
    cell = step.place.cell;
    value = step.place.value;
    if (step.technique === 'nakedSingle') {
      text = `Look here. Every symbol but one is already in this square's row, column or box.`;
      marked = geo.peers[cell].filter((p) => game.grid[p]);
    } else {
      text = `Look at this ${step.unit.kind}. There's only one spot left for one of the symbols.`;
      marked = step.unit.cells;
    }
    if (step.before.length) {
      const tricks = [...new Set(step.before)].map(techniqueName).join(', ');
      text = `Tricky one. First a ${tricks} rules some symbols out. ${text}`;
    }
  } else {
    const open = game.grid.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    cell = open[Math.floor(Math.random() * open.length)];
    value = game.solution[cell];
    text = 'This one needs guessing-level logic, so here is a free square.';
  }
  hint = { cell, value };
  selected = cell;
  render();
  showCoach(cells[cell], `${text} Press Hint again to fill it in.`, { cells: marked });
  sound(value);
}

// ---------- finishing ----------

// a finished row, column or box plays back as a little phrase
function celebrateGroups(i) {
  const groups = unitsOf(i).map((u) => u.cells).filter(groupDone);
  if (!groups.length || solved()) return;
  stopPlayback();
  let start = 500;
  for (const g of groups) start = perform(g, { step: 380 / audio.pace, start }) + 500;
}

function checkWin() {
  if (!solved()) return;
  game.won = true;
  selected = -1;
  hint = null;
  hideCoach();
  if (game.difficulty !== 'tutorial') {
    const key = `${game.n}-${game.difficulty}`;
    const prev = settings.best[key];
    game.result = { best: Math.min(prev ?? Infinity, game.elapsed), isNew: prev === undefined || game.elapsed < prev, first: prev === undefined };
    settings.best[key] = game.result.best;
  }
  save();
  render();
  wave();
  buzz([20, 40, 20, 40, 80]);
  if (game.difficulty !== 'tutorial') setTimeout(playBoard, 300 + game.n * 2 * 40);
}

// a ripple across the board from the top left corner
function wave() {
  cells.forEach((el, i) => {
    el.style.setProperty('--wave-delay', `${(geo.rowOf(i) + geo.colOf(i)) * 40}ms`);
    el.classList.remove('wave');
    void el.offsetWidth;
    el.classList.add('wave');
    setTimeout(() => el.classList.remove('wave'), 900 + (geo.rowOf(i) + geo.colOf(i)) * 40);
  });
}

// ---------- playback ----------

const beatMs = () => 60000 / (TEMPO * audio.pace) / 2;

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

function stopPlayback() {
  playTimers.forEach(clearTimeout);
  playTimers = [];
  cells.forEach((el) => el.classList.remove('playing'));
}

function playBoard() {
  if (playTimers.length) { stopPlayback(); return; }
  const end = perform([...Array(geo.total).keys()], { rowGap: 1 });
  playTimers.push(setTimeout(stopPlayback, end + 200));
}

// ---------- coach: the speech bubble with an arrow ----------

let coachTimer = null;
let coachTarget = null;
let coachCells = [];

function showCoach(target, text, { cells: marked = [], bad = false, timeout = 0, action = null, onAction = null } = {}) {
  clearTimeout(coachTimer);
  const coach = $('coach');
  coach.querySelector('p').textContent = text;
  const btn = coach.querySelector('button');
  btn.hidden = !action;
  btn.textContent = action ?? '';
  btn.onclick = onAction;
  coach.classList.toggle('bad', bad);
  coach.hidden = false;
  document.querySelectorAll('.cell.why').forEach((el) => el.classList.remove('why'));
  coachCells = marked;
  for (const c of marked) cells[c]?.classList.add('why');
  document.querySelectorAll('.coach-target').forEach((el) => el.classList.remove('coach-target'));
  coachTarget = target;
  target?.classList.add('coach-target');
  placeCoach();
  if (timeout) coachTimer = setTimeout(hideCoach, timeout);
}

function hideCoach() {
  clearTimeout(coachTimer);
  $('coach').hidden = true;
  coachCells = [];
  coachTarget = null;
  document.querySelectorAll('.cell.why').forEach((el) => el.classList.remove('why'));
  document.querySelectorAll('.coach-target').forEach((el) => el.classList.remove('coach-target'));
}

// sit below the target if there's room, otherwise above, with the arrow pointing at it
function placeCoach() {
  const coach = $('coach');
  if (coach.hidden) return;
  const app = document.querySelector('.app').getBoundingClientRect();
  const width = Math.min(320, app.width - 16);
  coach.style.width = `${width}px`;
  if (!coachTarget) {
    const b = $('board').getBoundingClientRect();
    coach.style.left = `${b.left - app.left + (b.width - width) / 2}px`;
    coach.style.top = `${b.top - app.top + b.height / 2 - coach.offsetHeight / 2}px`;
    coach.dataset.side = 'none';
    return;
  }
  const t = coachTarget.getBoundingClientRect();
  const cx = t.left + t.width / 2 - app.left;
  const left = Math.max(8, Math.min(app.width - width - 8, cx - width / 2));
  coach.style.left = `${left}px`;
  coach.style.setProperty('--arrow-x', `${cx - left}px`);
  const below = t.bottom - app.top + 12;
  const above = t.top - app.top - coach.offsetHeight - 12;
  const roomBelow = window.innerHeight - t.bottom > coach.offsetHeight + 24;
  if (roomBelow || above < 0) { coach.style.top = `${below}px`; coach.dataset.side = 'below'; }
  else { coach.style.top = `${above}px`; coach.dataset.side = 'above'; }
}
window.addEventListener('resize', placeCoach);

// ---------- tutorial ----------

// a fixed 4x4 puzzle so every step points at a square with one clear answer
const TUTORIAL = {
  puzzle: [1, 2, 3, 0, 3, 0, 0, 2, 0, 1, 0, 3, 4, 0, 2, 0],
  solution: [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1],
};
let tutorialStep = -1;

const TUTORIAL_STEPS = [
  { text: 'Welcome! This is sudoku played with music. Every row, column and box needs each symbol exactly once.', target: () => null, next: true },
  { text: 'These are your symbols. Each one is a real note on the staff. Tap them to hear how they sound.', target: () => $('pad'), next: true },
  { text: 'This row already has the treble clef, bass clef and quarter note. Only one is missing. Tap this square, then the eighth note.', target: () => cells[3], cells: [0, 1, 2], wait: 3 },
  { text: 'Columns work the same way. What is missing from this column? Tap the square and choose it.', target: () => cells[8], cells: [0, 4, 12], wait: 8 },
  { text: 'And boxes too. This box has three symbols already. Fill in the last one.', target: () => cells[5], cells: [0, 1, 4], wait: 5 },
  { text: 'If a symbol doesn\'t fit, it turns red and plays out of tune. Undo takes it back.', target: () => $('undoBtn'), next: true },
  { text: 'Not sure yet? Notes lets you pencil in small options.', target: () => $('pencilBtn'), next: true },
  { text: 'Stuck? Hint points at the next square, plays its note and tells you why it works.', target: () => $('hintBtn'), next: true },
  { text: 'Now finish the board on your own. Every row, column and box needs all four.', target: () => null, solve: true, timeout: 5000 },
  { text: 'You solved it! Every finished board plays back as music. From here on, symbols that can\'t fit are greyed out and an arrow explains each move.', target: () => null, finish: true },
];

function startTutorial() {
  $('help').close();
  $('settings').close();
  stopPlayback();
  start({ n: 4, difficulty: 'tutorial', puzzle: TUTORIAL.puzzle, solution: TUTORIAL.solution });
  showTutorialStep(0);
}

function showTutorialStep(k) {
  tutorialStep = k;
  const s = TUTORIAL_STEPS[k];
  if (!s) return;
  const opts = { cells: s.cells ?? [], timeout: s.timeout ?? 0 };
  if (s.next) Object.assign(opts, { action: 'Next', onAction: () => showTutorialStep(k + 1) });
  if (s.finish) Object.assign(opts, { action: 'Start a Learn puzzle', onAction: finishTutorial });
  showCoach(s.target(), s.text, opts);
}

function tutorialMoved(i, v, wrong) {
  const s = TUTORIAL_STEPS[tutorialStep];
  if (!s) return;
  if (s.wait === i && !wrong) setTimeout(() => showTutorialStep(tutorialStep + 1), 900);
  else if (s.wait !== undefined && !wrong) setTimeout(() => showTutorialStep(tutorialStep), 1200);
  if (s.solve && solved()) setTimeout(() => { playBoard(); showTutorialStep(tutorialStep + 1); }, 400);
}


function finishTutorial() {
  hideCoach();
  settings.walkthrough = true;
  settings.difficulty = 'learn';
  applySettings();
  newGame();
}

// Learn mode: the walkthrough the first time, puzzles that explain every move after that
function startLearn() {
  $('help').close();
  if (!settings.walkthrough) { startTutorial(); return; }
  settings.difficulty = 'learn';
  applySettings();
  newGame();
}

// ---------- view ----------

let sayTimer = null;
function say(text, bad = false) {
  clearTimeout(sayTimer);
  $('hintLine').textContent = text;
  $('hintLine').classList.toggle('bad', bad);
  sayTimer = setTimeout(clearSay, 3500);
}
function clearSay() {
  clearTimeout(sayTimer);
  sayTimer = null;
  $('hintLine').textContent = defaultLine();
  $('hintLine').classList.remove('bad');
}
function defaultLine() {
  if (game?.won) return 'Nice work. Press play to hear your board.';
  if (busy) return '';
  return pencil ? 'Notes are on: symbols go in small.' : 'Tap a square, then tap a symbol.';
}

function flashMistakes() {
  $('mistakes').classList.remove('flash');
  void $('mistakes').offsetWidth;
  $('mistakes').classList.add('flash');
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
  if (game.won || busy) return;
  if (selected !== i && game.difficulty !== 'tutorial' && hint?.cell !== i) hideCoach();
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
  const m = mode();
  const clash = clashes();

  for (let i = 0; i < geo.total; i++) {
    const el = cells[i];
    const v = game.grid[i];
    const keep = ['playing', 'pop', 'shake', 'why', 'coach-target', 'wave'].filter((c) => el.classList.contains(c));
    el.className = 'cell';
    el.classList.add(...keep);
    if (v) {
      el.classList.add(isGiven(i) ? 'given' : 'user');
      if (isWrong(i)) el.classList.add('wrong');
      else if (clash.has(i)) el.classList.add('clash');
      el.innerHTML = glyph(symOf(v));
      el.setAttribute('aria-label', `${SYMBOLS[symOf(v) - 1].name}${isGiven(i) ? ', given' : ''}`);
    } else {
      const marks = game.marks[i];
      el.innerHTML = marks ? '<div class="marks">' + SETS[n].map((id, k) =>
        `<span>${marks & (1 << (k + 1)) ? glyph(id) : ''}</span>`).join('') + '</div>' : '';
      el.setAttribute('aria-label', 'empty');
    }
    if (i === selected) el.classList.add('selected');
    else if (MATCHING && selV && v === selV) el.classList.add('match');
    else if (selPeers.has(i)) el.classList.add('peer');
  }

  // learn mode only: grey out symbols that can't go in the selected square
  const allowed = m.dim && selected >= 0 && !isGiven(selected) && !game.grid[selected]
    ? new Set(candidates(geo, game.grid, selected)) : null;

  keys.forEach((el, k) => {
    const v = k + 1;
    const placed = game.grid.filter((x, c) => x === v && !isWrong(c)).length;
    el.classList.toggle('done', placed === n);
    el.classList.toggle('blocked', !!allowed && !allowed.has(v));
    el.innerHTML = `${glyph(SETS[n][k])}<span class="left">${n - placed || ''}</span>`;
  });

  document.body.classList.toggle('pencil-on', pencil);
  document.body.classList.toggle('no-timer', !settings.timer || game.difficulty === 'tutorial');
  $('pencilBtn').setAttribute('aria-pressed', String(pencil));
  $('controls').hidden = game.won;
  $('win').hidden = !game.won || game.difficulty === 'tutorial';
  if (game.won) {
    const r = game.result;
    $('winTime').textContent = fmt(game.elapsed);
    $('winBest').textContent = !r ? '' : r.first ? 'First win at this level' : r.isNew ? 'New best time!' : `Best ${fmt(r.best)}`;
    $('winBest').classList.toggle('new', !!r?.isNew && !r.first);
    const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    $('winStats').textContent = `${n}×${n} ${m.name} · ${plural(game.mistakes, 'mistake')} · ${plural(game.hints, 'hint')}`;
  }
  $('learnNote').hidden = game.difficulty !== 'learn' && game.difficulty !== 'tutorial';
  $('fillNotesBtn').hidden = !pencil || game.won;
  $('levelLabel').textContent = game.difficulty === 'tutorial' ? 'Learn · walkthrough' : `${n}×${n} · ${m.name}`;
  $('mistakes').textContent = `${game.mistakes} mistake${game.mistakes === 1 ? '' : 's'}`;
  $('timer').textContent = fmt(game.elapsed);
  if (!sayTimer) $('hintLine').textContent = defaultLine();
  placeCoach();
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

setInterval(() => {
  if (!game || game.won || busy || document.hidden || game.difficulty === 'tutorial' || $('start').open) return;
  game.elapsed++;
  $('timer').textContent = fmt(game.elapsed);
  if (game.elapsed % 5 === 0) save();
}, 1000);

// ---------- settings ----------

function applySettings() {
  if (!INSTRUMENTS[settings.instrument]) settings.instrument = 'piano';
  if (!MODES[settings.difficulty] || settings.difficulty === 'tutorial') settings.difficulty = 'easy';
  if (settings.theme) { settings.dark = settings.theme === 'ink'; delete settings.theme; }
  if (audio.instrument !== settings.instrument || audio.key !== settings.key) {
    audio.instrument = settings.instrument;
    audio.key = settings.key;
    audio.load();
    drawLegend();
  }
  audio.setVolume(settings.volume / 100);
  audio.setMuted(!settings.sound);
  document.documentElement.dataset.theme = settings.dark ? 'ink' : 'paper';
  document.documentElement.dataset.size = 'm';
  $('instrument').value = settings.instrument;
  $('walkthroughBtn').hidden = !settings.walkthrough;
  document.querySelectorAll('.seg').forEach((seg) => {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.value === settings[seg.dataset.setting]));
  });
  document.querySelectorAll('[data-toggle]').forEach((t) => { t.checked = settings[t.dataset.toggle]; });
  $('volume').value = settings.volume;
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
    // a new size or level starts a fresh puzzle
    const differs = Number(settings.grid) !== game.n || settings.difficulty !== game.difficulty;
    if (differs) newGame();
  });
});
document.querySelectorAll('[data-toggle]').forEach((t) => {
  t.addEventListener('change', () => { settings[t.dataset.toggle] = t.checked; changed(); });
});
$('instrument').addEventListener('change', (e) => { settings.instrument = e.target.value; changed(); audio.preview(); });
$('volume').addEventListener('input', (e) => { settings.volume = Number(e.target.value); changed(); });
$('volume').addEventListener('change', () => audio.play(4));

// ---------- controls ----------

// replay = a new puzzle. if you're partway through, check first
// replay opens the size and level picker, which also offers to keep going
$('replayBtn').addEventListener('click', () => { hideCoach(); showStart(); });
$('winNew').addEventListener('click', newGame);
$('winPlay').addEventListener('click', () => { stopPlayback(); playBoard(); });
$('pencilBtn').addEventListener('click', () => { pencil = !pencil; render(); });
$('eraseBtn').addEventListener('click', erase);
$('fillNotesBtn').addEventListener('click', fillNotes);
$('undoBtn').addEventListener('click', undo);
$('hintBtn').addEventListener('click', giveHint);
$('settingsBtn').addEventListener('click', () => $('settings').showModal());
$('helpBtn').addEventListener('click', () => $('help').showModal());
$('learnBtn').addEventListener('click', startLearn);
$('walkthroughBtn').addEventListener('click', startTutorial);

// tapping anywhere else closes a bubble that's asking something (not during the walkthrough)
document.addEventListener('pointerdown', (e) => {
  if ($('coach').hidden || game?.difficulty === 'tutorial') return;
  if (e.target.closest('#coach, #hintBtn, #replayBtn, .key')) return;
  if (!$('coach').querySelector('button').hidden) hideCoach();
});

const phoneSheets = matchMedia('(max-width: 600px)');
document.querySelectorAll('dialog.sheet').forEach((d) => {
  let startY = null, dy = 0;
  d.addEventListener('pointerdown', (e) => {
    // only from the top strip, so lists and sliders inside still work
    if (!phoneSheets.matches || e.clientY - d.getBoundingClientRect().top > 64 || e.target.closest('button')) return;
    startY = e.clientY; dy = 0;
    d.style.transition = 'none';
    d.setPointerCapture(e.pointerId);
  });
  d.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.clientY - startY);
    d.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    d.style.transition = 'transform 0.2s ease-out';
    if (dy > 90) {
      d.style.transform = 'translateY(100%)';
      setTimeout(() => { d.close(); d.style.transform = ''; d.style.transition = ''; }, 180);
    } else {
      d.style.transform = '';
    }
  };
  d.addEventListener('pointerup', end);
  d.addEventListener('pointercancel', end);
});

// close sheets with their buttons or by tapping the backdrop
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
});

// the real visible height, for older phones that don't support svh units
const setVH = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight / 100}px`);
setVH();
window.addEventListener('resize', setVH);
window.addEventListener('orientationchange', () => setTimeout(setVH, 200));

// no pinch or double-tap zoom: it's a game board, not a page
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

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
  if (k === 'h' || k === 'H') { giveHint(); return; }
  if (k === ' ') { e.preventDefault(); playBoard(); return; }
  if (k === 'Escape') { selected = -1; hideCoach(); render(); return; }
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (k in moves) {
    e.preventDefault();
    const n = game.n;
    if (selected < 0) { select(Math.floor(geo.total / 2), true); return; }
    const [dr, dc] = moves[k];
    select(((geo.rowOf(selected) + dr + n) % n) * n + (geo.colOf(selected) + dc + n) % n, true);
  }
});

// ---------- start screen: pick a size and level every time the game opens ----------

const pick = { grid: settings.grid, difficulty: settings.difficulty };

function showStart() {
  pick.grid = settings.grid;
  pick.difficulty = MODES[settings.difficulty] && settings.difficulty !== 'learn' && settings.difficulty !== 'tutorial' ? settings.difficulty : 'easy';
  drawStart();
  const inProgress = game && !game.won && hasProgress() && game.difficulty !== 'tutorial';
  $('startContinue').hidden = !inProgress;
  $('startPlay').textContent = inProgress ? 'New puzzle' : 'Play';
  $('startPlay').classList.toggle('primary', !inProgress);
  $('startContinue').classList.toggle('primary', inProgress);
  $('start').showModal();
}

function drawStart() {
  document.querySelectorAll('[data-start]').forEach((seg) => {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.value === pick[seg.dataset.start]));
  });
}

document.querySelectorAll('[data-start]').forEach((seg) => {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pick[seg.dataset.start] = b.dataset.value;
    drawStart();
  });
});

$('startPlay').addEventListener('click', () => {
  $('start').close();
  const same = game && Number(pick.grid) === game.n && pick.difficulty === game.difficulty && !hasProgress() && !game.won;
  settings.grid = pick.grid;
  settings.difficulty = pick.difficulty;
  applySettings();
  save();
  if (!same) newGame();
});
$('startContinue').addEventListener('click', () => $('start').close());
$('startLearn').addEventListener('click', () => { $('start').close(); startLearn(); });

// ---------- start ----------

drawLegend();
const saved = load();
if (saved?.settings) Object.assign(settings, saved.settings);
applySettings();
audio.load(); // start fetching the instrument right away so the first tap has real sound
if (!saved) {
  newGame();
} else if (saved.game?.n && saved.game.grid?.length === saved.game.n ** 2) {
  game = { techniques: [], ...saved.game };
  build();
  render();
} else {
  newGame();
}

let seenThisVisit = false;
try { seenThisVisit = sessionStorage.getItem('ms-started') === '1'; sessionStorage.setItem('ms-started', '1'); } catch { }
if (!seenThisVisit) showStart();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}


