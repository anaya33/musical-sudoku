// the rules of sudoku for 4x4, 6x6 and 9x9 grids.
// a grid is a flat array of n*n numbers, 0 = empty, 1..n = a symbol.
// candidate sets are bitmasks where bit v means "v is still possible"

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
  // every unit tagged with its kind, used by the logic solver and for explanations
  const units = [
    ...rows.map((cells, k) => ({ kind: 'row', k, cells })),
    ...cols.map((cells, k) => ({ kind: 'column', k, cells })),
    ...boxes.map((cells, k) => ({ kind: 'box', k, cells })),
  ];
  const peers = Array.from({ length: total }, (_, i) => {
    const s = new Set([...rows[rowOf(i)], ...cols[colOf(i)], ...boxes[boxOf(i)]]);
    s.delete(i);
    return [...s];
  });
  const all = ((1 << (n + 1)) - 1) & ~1; // bits 1..n
  return (geoCache[n] = { n, br, bc, total, all, rowOf, colOf, boxOf, rows, cols, boxes, units, peers });
}

// ---------- bit helpers ----------

export function popcount(m) {
  let c = 0;
  while (m) { m &= m - 1; c++; }
  return c;
}

// value of the lowest set bit
export const lowBit = (m) => 31 - Math.clz32(m & -m);

export function bitsToValues(m) {
  const out = [];
  while (m) { const v = lowBit(m); out.push(v); m &= m - 1; }
  return out;
}

// ---------- rules ----------

export function candidateMask(geo, grid, i) {
  if (grid[i]) return 0;
  let used = 0;
  for (const p of geo.peers[i]) used |= 1 << grid[p];
  return geo.all & ~used;
}

export const candidates = (geo, grid, i) => bitsToValues(candidateMask(geo, grid, i));

// every filled cell that repeats a symbol in its row, column or box
export function conflicts(geo, grid) {
  const bad = new Set();
  for (const u of geo.units) {
    const seen = new Map();
    for (const i of u.cells) {
      const v = grid[i];
      if (!v) continue;
      if (seen.has(v)) { bad.add(i); bad.add(seen.get(v)); } else seen.set(v, i);
    }
  }
  return bad;
}

export const isFull = (grid) => grid.every(Boolean);

// a finished, rule-following grid
export const isSolved = (geo, grid) => isFull(grid) && conflicts(geo, grid).size === 0;

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
