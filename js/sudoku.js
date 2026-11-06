// puzzle generation + solving for 4x4, 6x6 and 9x9 grids.
// a grid is a flat array of n*n numbers, 0 = empty, 1..n = a symbol

// box shape (rows x cols) for each grid size
const BOX = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };

const geoCache = {};

// everything about the shape of an n x n grid: which cells share a row, column or box
export function geometry(n) {
  if (geoCache[n]) return geoCache[n];
  const [br, bc] = BOX[n];
  const total = n * n;
  const rowOf = (i) => Math.floor(i / n);
  const colOf = (i) => i % n;
  const boxOf = (i) => Math.floor(rowOf(i) / br) * (n / bc) + Math.floor(colOf(i) / bc);
  const rows = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => r * n + c));
  const cols = Array.from({ length: n }, (_, c) => Array.from({ length: n }, (_, r) => r * n + c));
  const boxes = Array.from({ length: n }, () => []);
  for (let i = 0; i < total; i++) boxes[boxOf(i)].push(i);
  const peers = Array.from({ length: total }, (_, i) => {
    const s = new Set([...rows[rowOf(i)], ...cols[colOf(i)], ...boxes[boxOf(i)]]);
    s.delete(i);
    return [...s];
  });
  return (geoCache[n] = { n, br, bc, total, rowOf, colOf, boxOf, rows, cols, boxes, peers });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function candidates(geo, grid, i) {
  if (grid[i]) return [];
  const used = new Set(geo.peers[i].map((p) => grid[p]));
  const out = [];
  for (let v = 1; v <= geo.n; v++) if (!used.has(v)) out.push(v);
  return out;
}

// backtracking with fewest-candidates heuristic. returns number of solutions found (stops at limit)
function search(geo, grid, limit, randomize, onSolution) {
  let best = -1, bestCands = null;
  for (let i = 0; i < geo.total; i++) {
    if (grid[i]) continue;
    const c = candidates(geo, grid, i);
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
    count += search(geo, grid, limit - count, randomize, onSolution);
    if (count >= limit) break;
  }
  grid[best] = 0;
  return count;
}

export const countSolutions = (geo, grid, limit = 2) => search(geo, grid.slice(), limit, false);

// how many symbols are given at the start
const CLUES = {
  4: { easy: 8, medium: 6, hard: 5 },
  6: { easy: 20, medium: 16, hard: 13 },
  9: { easy: 40, medium: 32, hard: 26 },
};

export function generate(n = 9, difficulty = 'easy') {
  const geo = geometry(n);
  let solution = null;
  search(geo, new Array(geo.total).fill(0), 1, true, (s) => { solution = s.slice(); });
  const puzzle = solution.slice();
  const target = CLUES[n][difficulty] ?? CLUES[n].easy;
  let filled = geo.total;
  // remove symmetric pairs while the solution stays unique
  const half = Math.ceil(geo.total / 2);
  for (const i of shuffle([...Array(half).keys()])) {
    if (filled <= target) break;
    const j = geo.total - 1 - i;
    const a = puzzle[i], b = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    if (countSolutions(geo, puzzle) !== 1) { puzzle[i] = a; puzzle[j] = b; continue; }
    filled -= i === j ? 1 : 2;
  }
  return { puzzle, solution };
}
