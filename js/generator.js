// makes puzzles: build a random full grid (backtracking), then take symbols away in
// mirror-image pairs. a symbol only comes out if dancing links proves the puzzle still
// has exactly one solution and the logic solver can still finish it without guessing.
// the finished puzzle is graded by the hardest technique it needs.

import { geometry, shuffle } from './sudoku.js?v=12';
import { dlxCount } from './solvers/dlx.js?v=12';
import { randomFullGrid } from './solvers/backtrack.js?v=12';
import { logicSolve } from './solvers/logic.js?v=12';

// what each level means: which technique tiers it needs, and how many symbols it starts with
export const LEVELS = {
  9: {
    learn: { tiers: [1, 1], clues: [45, 50] },
    easy: { tiers: [1, 1], clues: [36, 42] },
    medium: { tiers: [2, 2], clues: [27, 35] },
    hard: { tiers: [3, 3], clues: [22, 32] },
  },
  6: {
    learn: { tiers: [1, 1], clues: [22, 26] },
    easy: { tiers: [1, 1], clues: [18, 22] },
    medium: { tiers: [1, 2], clues: [13, 17] },
    hard: { tiers: [1, 3], clues: [9, 13] },
  },
  4: {
    learn: { tiers: [1, 1], clues: [10, 12] },
    easy: { tiers: [1, 1], clues: [8, 10] },
    medium: { tiers: [1, 1], clues: [6, 7] },
    hard: { tiers: [1, 2], clues: [4, 6] },
  },
};

function dig(geo, solution, spec, rng) {
  const puzzle = solution.slice();
  const [minClues, maxClues] = spec.clues;
  // easy puzzles stop early at a random count in range, harder ones dig as far as they can
  const target = spec.tiers[1] === 1 ? minClues + Math.floor(rng() * (maxClues - minClues + 1)) : minClues;
  let clues = geo.total;
  const half = [...Array(Math.ceil(geo.total / 2)).keys()];
  for (const i of shuffle(half, rng)) {
    if (clues <= target) break;
    const j = geo.total - 1 - i;
    const a = puzzle[i], b = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    const removed = i === j ? 1 : 2;
    const ok = clues - removed >= minClues
      && dlxCount(geo, puzzle, 2) === 1
      && logicSolve(geo, puzzle, { maxTier: spec.tiers[1] }).solved;
    if (ok) clues -= removed; else { puzzle[i] = a; puzzle[j] = b; }
  }
  return { puzzle, clues };
}

export function generate(n = 9, difficulty = 'easy', { rng = Math.random, maxMs = 5000 } = {}) {
  const geo = geometry(n);
  const spec = LEVELS[n][difficulty] ?? LEVELS[n].easy;
  const start = Date.now();
  let best = null;
  for (let attempt = 0; ; attempt++) {
    const solution = randomFullGrid(geo, rng);
    const { puzzle, clues } = dig(geo, solution, spec, rng);
    const grade = logicSolve(geo, puzzle);
    const tierOk = grade.tier >= spec.tiers[0] && grade.tier <= spec.tiers[1];
    const cluesOk = clues >= spec.clues[0] && clues <= spec.clues[1];
    const result = { puzzle, solution, clues, tier: grade.tier, techniques: Object.keys(grade.used), attempts: attempt + 1 };
    if (tierOk && cluesOk) return result;
    // keep the closest miss in case time runs out
    const miss = Math.abs(grade.tier - spec.tiers[1]) * 100 + (cluesOk ? 0 : Math.abs(clues - spec.clues[1]));
    if (!best || miss < best.miss) best = { ...result, miss };
    if (Date.now() - start > maxMs) return best;
  }
}
