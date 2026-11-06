// algorithm 2: depth-first search with bitmask constraint propagation.
// each row, column and box keeps a bitmask of the values it already holds, so the
// options for a cell are one AND away. it always branches on the cell with the fewest
// options (minimum remaining values) and fills forced cells before branching.
// independent from dancing links, so the two can check each other.
// with a random generator it also builds the full random grids puzzles are cut from.

import { popcount, lowBit } from '../sudoku.js?v=21';

export function btSolve(geo, grid, { limit = 2, rng = null } = {}) {
  const { n, total, all } = geo;
  const g = grid.slice();
  const rowM = new Int32Array(n), colM = new Int32Array(n), boxM = new Int32Array(n);
  const R = new Int32Array(total), C = new Int32Array(total), B = new Int32Array(total);
  for (let i = 0; i < total; i++) {
    R[i] = geo.rowOf(i); C[i] = geo.colOf(i); B[i] = geo.boxOf(i);
    const v = g[i];
    if (!v) continue;
    const bit = 1 << v;
    // a repeated given means there is no solution at all
    if ((rowM[R[i]] | colM[C[i]] | boxM[B[i]]) & bit) return { count: 0, solution: null };
    rowM[R[i]] |= bit; colM[C[i]] |= bit; boxM[B[i]] |= bit;
  }

  let count = 0, solution = null;
  const set = (i, v) => { const b = 1 << v; g[i] = v; rowM[R[i]] |= b; colM[C[i]] |= b; boxM[B[i]] |= b; };
  const unset = (i, v) => { const b = ~(1 << v); g[i] = 0; rowM[R[i]] &= b; colM[C[i]] &= b; boxM[B[i]] &= b; };

  const rec = () => {
    // propagate: keep filling cells that have exactly one option
    const forced = [];
    let best = -1, bestMask = 0, bestCount = 99;
    for (;;) {
      best = -1; bestCount = 99;
      let progress = false;
      for (let i = 0; i < total; i++) {
        if (g[i]) continue;
        const m = all & ~(rowM[R[i]] | colM[C[i]] | boxM[B[i]]);
        const k = popcount(m);
        if (k === 0) { for (const f of forced) unset(f, g[f]); return; }
        if (k === 1) { set(i, lowBit(m)); forced.push(i); progress = true; continue; }
        if (k < bestCount) { best = i; bestMask = m; bestCount = k; }
      }
      if (!progress) break;
    }

    if (best === -1) {
      if (count === 0) solution = g.slice();
      count++;
    } else {
      const vals = [];
      for (let m = bestMask; m; m &= m - 1) vals.push(lowBit(m));
      if (rng) for (let k = vals.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [vals[k], vals[j]] = [vals[j], vals[k]]; }
      for (const v of vals) {
        set(best, v);
        rec();
        unset(best, v);
        if (count >= limit) break;
      }
    }
    for (const f of forced) unset(f, g[f]);
  };
  rec();
  return { count, solution };
}

// a random complete, valid grid
export function randomFullGrid(geo, rng = Math.random) {
  return btSolve(geo, new Array(geo.total).fill(0), { limit: 1, rng }).solution;
}
