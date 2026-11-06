// algorithm 3: solving the way a person does, one named technique at a time, never guessing.
// it keeps a candidate bitmask per cell and always uses the easiest technique that works.
// the hardest technique a puzzle needs is its real difficulty, and the same steps
// power the in-game hints ("only one spot left for the flat in this row").
//
// tier 1: naked single, hidden single
// tier 2: naked pair, pointing pair, box/line reduction
// tier 3: hidden pair, naked triple, hidden triple, x-wing

import { popcount, lowBit, bitsToValues, candidateMask } from '../sudoku.js?v=14';

export const TECHNIQUES = {
  nakedSingle: { tier: 1, label: 'Last option' },
  hiddenSingle: { tier: 1, label: 'Only spot left' },
  nakedPair: { tier: 2, label: 'Naked pair' },
  pointing: { tier: 2, label: 'Pointing pair' },
  boxLine: { tier: 2, label: 'Box/line reduction' },
  hiddenPair: { tier: 3, label: 'Hidden pair' },
  nakedTriple: { tier: 3, label: 'Naked triple' },
  hiddenTriple: { tier: 3, label: 'Hidden triple' },
  xWing: { tier: 3, label: 'X-wing' },
};

export function initCandidates(geo, grid) {
  const cands = new Int32Array(geo.total);
  for (let i = 0; i < geo.total; i++) cands[i] = candidateMask(geo, grid, i);
  return cands;
}

// every way to choose k items from list
function combos(list, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push(acc.slice()); return out; }
  for (let i = start; i < list.length; i++) { acc.push(list[i]); combos(list, k, i + 1, acc, out); acc.pop(); }
  return out;
}

// a step either places a value or removes candidates. returns null when nothing applies
function findStep(geo, grid, cands) {
  const { total, units, n } = geo;

  // ----- tier 1 -----
  for (let i = 0; i < total; i++) {
    if (!grid[i] && popcount(cands[i]) === 1) {
      return { technique: 'nakedSingle', place: { cell: i, value: lowBit(cands[i]) } };
    }
  }
  for (const u of units) {
    for (let v = 1; v <= n; v++) {
      const bit = 1 << v;
      let spot = -1, k = 0;
      for (const i of u.cells) {
        if (grid[i] === v) { k = -1; break; }
        if (!grid[i] && cands[i] & bit) { spot = i; k++; }
      }
      if (k === 1) return { technique: 'hiddenSingle', place: { cell: spot, value: v }, unit: u };
    }
  }

  const elim = (technique, removals, unit, extra = {}) =>
    removals.length ? { technique, eliminate: removals, unit, ...extra } : null;

  // removals: list of [cell, mask] where mask bits are taken out of that cell
  const removeFrom = (cells, mask, keep) => {
    const out = [];
    for (const i of cells) if (!grid[i] && !keep.has(i) && cands[i] & mask) out.push([i, cands[i] & mask]);
    return out;
  };

  // naked subsets: k cells in a unit whose candidates together are exactly k values
  const nakedSubset = (k, technique) => {
    for (const u of units) {
      const open = u.cells.filter((i) => !grid[i] && popcount(cands[i]) <= k);
      for (const set of combos(open, k)) {
        let m = 0;
        for (const i of set) m |= cands[i];
        if (popcount(m) !== k) continue;
        const step = elim(technique, removeFrom(u.cells, m, new Set(set)), u, { cells: set, values: bitsToValues(m) });
        if (step) return step;
      }
    }
    return null;
  };

  // hidden subsets: k values in a unit that can only go in the same k cells
  const hiddenSubset = (k, technique) => {
    for (const u of units) {
      const open = u.cells.filter((i) => !grid[i]);
      const placed = new Set(u.cells.map((i) => grid[i]).filter(Boolean));
      const values = [];
      for (let v = 1; v <= n; v++) {
        if (placed.has(v)) continue;
        const c = open.filter((i) => cands[i] & (1 << v)).length;
        if (c >= 2 && c <= k) values.push(v);
      }
      for (const vs of combos(values, k)) {
        const m = vs.reduce((a, v) => a | (1 << v), 0);
        const spots = open.filter((i) => cands[i] & m);
        if (spots.length !== k) continue;
        const removals = [];
        for (const i of spots) if (cands[i] & ~m) removals.push([i, cands[i] & ~m]);
        const step = elim(technique, removals, u, { cells: spots, values: vs });
        if (step) return step;
      }
    }
    return null;
  };

  // ----- tier 2 -----
  let s = nakedSubset(2, 'nakedPair');
  if (s) return s;

  // pointing: inside a box, a value only fits along one row or column, so it can't be elsewhere on that line
  // box/line: inside a row or column, a value only fits in one box, so it can't be elsewhere in that box
  for (const u of units) {
    for (let v = 1; v <= n; v++) {
      const bit = 1 << v;
      const spots = u.cells.filter((i) => !grid[i] && cands[i] & bit);
      if (spots.length < 2) continue;
      if (u.kind === 'box') {
        for (const [lineOf, lines, kind] of [[geo.rowOf, geo.rows, 'row'], [geo.colOf, geo.cols, 'column']]) {
          const l = lineOf(spots[0]);
          if (spots.every((i) => lineOf(i) === l)) {
            const step = elim('pointing', removeFrom(lines[l], bit, new Set(u.cells)), u,
              { cells: spots, values: [v], line: { kind, k: l, cells: lines[l] } });
            if (step) return step;
          }
        }
      } else {
        const b = geo.boxOf(spots[0]);
        if (spots.every((i) => geo.boxOf(i) === b)) {
          const step = elim('boxLine', removeFrom(geo.boxes[b], bit, new Set(u.cells)), u,
            { cells: spots, values: [v], box: { kind: 'box', k: b, cells: geo.boxes[b] } });
          if (step) return step;
        }
      }
    }
  }

  // ----- tier 3 -----
  if ((s = hiddenSubset(2, 'hiddenPair'))) return s;
  if ((s = nakedSubset(3, 'nakedTriple'))) return s;
  if ((s = hiddenSubset(3, 'hiddenTriple'))) return s;

  // x-wing: a value fits in exactly the same two columns in two rows (or vice versa),
  // so those two columns can't have it anywhere else
  for (const [lines, crossOf, cross] of [[geo.rows, geo.colOf, geo.cols], [geo.cols, geo.rowOf, geo.rows]]) {
    for (let v = 1; v <= n; v++) {
      const bit = 1 << v;
      const pairs = [];
      lines.forEach((cells, li) => {
        const spots = cells.filter((i) => !grid[i] && cands[i] & bit);
        if (spots.length === 2) pairs.push({ li, spots, key: spots.map(crossOf).join(',') });
      });
      for (let a = 0; a < pairs.length; a++) {
        for (let b = a + 1; b < pairs.length; b++) {
          if (pairs[a].key !== pairs[b].key) continue;
          const corners = new Set([...pairs[a].spots, ...pairs[b].spots]);
          const removals = [];
          for (const x of pairs[a].spots.map(crossOf)) removals.push(...removeFrom(cross[x], bit, corners));
          const step = elim('xWing', removals, null, { cells: [...corners], values: [v] });
          if (step) return step;
        }
      }
    }
  }
  return null;
}

function apply(geo, grid, cands, step) {
  if (step.place) {
    const { cell, value } = step.place;
    grid[cell] = value;
    cands[cell] = 0;
    for (const p of geo.peers[cell]) cands[p] &= ~(1 << value);
  } else {
    for (const [i, m] of step.eliminate) cands[i] &= ~m;
  }
}

// solve as far as logic goes. tier = hardest tier needed, Infinity if logic gets stuck
export function logicSolve(geo, puzzle, { maxTier = 3 } = {}) {
  const grid = puzzle.slice();
  const cands = initCandidates(geo, grid);
  const used = {};
  let tier = 0, steps = 0;
  for (;;) {
    if (grid.every(Boolean)) return { solved: true, tier, used, steps, grid };
    // an empty cell with no options left means the puzzle is broken
    for (let i = 0; i < geo.total; i++) if (!grid[i] && !cands[i]) return { solved: false, tier: Infinity, used, steps, grid, contradiction: true };
    const step = findStep(geo, grid, cands);
    if (!step || TECHNIQUES[step.technique].tier > maxTier) return { solved: false, tier: Infinity, used, steps, grid };
    tier = Math.max(tier, TECHNIQUES[step.technique].tier);
    used[step.technique] = (used[step.technique] || 0) + 1;
    steps++;
    apply(geo, grid, cands, step);
  }
}

// the next square a person could fill by logic from where the player is now.
// runs any elimination steps it needs first and reports them, so the hint can say why
export function nextPlacement(geo, current) {
  const grid = current.slice();
  const cands = initCandidates(geo, grid);
  const before = [];
  for (let guard = 0; guard < 500; guard++) {
    const step = findStep(geo, grid, cands);
    if (!step) return null;
    if (step.place) return { ...step, before };
    before.push(step.technique);
    apply(geo, grid, cands, step);
  }
  return null;
}
