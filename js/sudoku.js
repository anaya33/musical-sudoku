// puzzle generation + solving. a grid is a flat array of 81 numbers, 0 = empty, 1-9 = note index + 1

export const rowOf = (i) => Math.floor(i / 9);
export const colOf = (i) => i % 9;
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

export const rowCells = (r) => Array.from({ length: 9 }, (_, c) => r * 9 + c);
export const colCells = (c) => Array.from({ length: 9 }, (_, r) => r * 9 + c);
export const boxCells = (b) => {
  const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3;
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push((r0 + r) * 9 + c0 + c);
  return out;
};

// every cell that shares a row, column or box with i
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set([...rowCells(rowOf(i)), ...colCells(colOf(i)), ...boxCells(boxOf(i))]);
  s.delete(i);
  return [...s];
});
export const peers = (i) => PEERS[i];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function candidates(grid, i) {
  if (grid[i]) return [];
  const used = new Set(PEERS[i].map((p) => grid[p]));
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

// backtracking with fewest-candidates heuristic. returns number of solutions found (stops at limit)
function search(grid, limit, randomize, onSolution) {
  let best = -1, bestCands = null;
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    const c = candidates(grid, i);
    if (c.length === 0) return 0;
    if (!bestCands || c.length < bestCands.length) {
      best = i; bestCands = c;
      if (c.length === 1) break;
    }
  }
  if (best === -1) { onSolution?.(grid); return 1; }
  if (randomize) shuffle(bestCands);
  let count = 0;
  for (const v of bestCands) {
    grid[best] = v;
    count += search(grid, limit - count, randomize, onSolution);
    if (count >= limit) break;
  }
  grid[best] = 0;
  return count;
}

export function solve(grid) {
  const g = grid.slice();
  let sol = null;
  search(g, 1, false, (s) => { sol = s.slice(); });
  return sol;
}

export const countSolutions = (grid, limit = 2) => search(grid.slice(), limit, false);

function fullGrid() {
  const g = new Array(81).fill(0);
  let sol = null;
  search(g, 1, true, (s) => { sol = s.slice(); });
  return sol;
}

const CLUES = { easy: 40, medium: 32, hard: 26 };

export function generate(difficulty = 'easy') {
  const solution = fullGrid();
  const puzzle = solution.slice();
  const target = CLUES[difficulty] ?? 36;
  let filled = 81;
  // remove symmetric pairs while the solution stays unique
  for (const i of shuffle([...Array(41).keys()])) {
    if (filled <= target) break;
    const j = 80 - i;
    const a = puzzle[i], b = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    if (countSolutions(puzzle) !== 1) { puzzle[i] = a; puzzle[j] = b; continue; }
    filled -= i === j ? 1 : 2;
  }
  return { puzzle, solution };
}
