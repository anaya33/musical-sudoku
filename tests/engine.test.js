// run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, conflicts, isSolved, candidateMask } from '../js/sudoku.js';
import { dlxSolve } from '../js/solvers/dlx.js';
import { btSolve, randomFullGrid } from '../js/solvers/backtrack.js';
import { logicSolve, nextPlacement, initCandidates } from '../js/solvers/logic.js';
import { generate, LEVELS } from '../js/generator.js';

const parse = (s) => [...s].map(Number);
const g9 = geometry(9);

// a well known puzzle and its solution
const CLASSIC = parse('003020600900305001001806400008102900700000008006708200002609500800203009005010300');
const CLASSIC_SOLUTION = parse('483921657967345821251876493548132976729564138136798245372689514814253769695417382');
// a 17-clue puzzle, the fewest a 9x9 can have and still be unique
const SEVENTEEN = parse('000000010400000000020000000000050407008000300001090000300400200050100000000806000');

// tiny seeded random so failures can be replayed
function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

test('geometry: every unit has n cells and every cell has the right number of peers', () => {
  for (const n of [4, 6, 9]) {
    const g = geometry(n);
    assert.equal(g.units.length, 3 * n);
    for (const u of g.units) assert.equal(new Set(u.cells).size, n);
    // peers = row + column + box minus overlaps minus itself
    const expected = 2 * (n - 1) + (n - g.br - g.bc + 1);
    for (const p of g.peers) assert.equal(p.length, expected);
  }
});

test('rules: the classic solution is valid and conflicts are found', () => {
  assert.ok(isSolved(g9, CLASSIC_SOLUTION));
  const broken = CLASSIC_SOLUTION.slice();
  [broken[0], broken[1]] = [broken[1], broken[0]];
  assert.ok(conflicts(g9, broken).size > 0);
  assert.equal(candidateMask(g9, CLASSIC, 0), (1 << 4) | (1 << 5));
});

test('dancing links and backtracking both solve the classic puzzle', () => {
  const a = dlxSolve(g9, CLASSIC);
  const b = btSolve(g9, CLASSIC);
  assert.equal(a.count, 1);
  assert.equal(b.count, 1);
  assert.deepEqual(a.solution, CLASSIC_SOLUTION);
  assert.deepEqual(b.solution, CLASSIC_SOLUTION);
});

test('both solvers agree on the 17-clue puzzle', () => {
  const a = dlxSolve(g9, SEVENTEEN);
  const b = btSolve(g9, SEVENTEEN);
  assert.equal(a.count, 1);
  assert.equal(b.count, 1);
  assert.deepEqual(a.solution, b.solution);
  assert.ok(isSolved(g9, a.solution));
});

test('both solvers see multiple solutions and no solutions', () => {
  const open = CLASSIC.slice();
  for (let i = 0; i < 81; i++) if (i % 3) open[i] = 0; // far too few clues
  assert.equal(dlxSolve(g9, open, 2).count, 2);
  assert.equal(btSolve(g9, open, { limit: 2 }).count, 2);
  const bad = CLASSIC.slice();
  bad[0] = 2; // clashes with the 2 already in row 1
  assert.equal(dlxSolve(g9, bad).count, 0);
  assert.equal(btSolve(g9, bad).count, 0);
  assert.equal(dlxSolve(g9, new Array(81).fill(0), 2).count, 2);
});

test('random full grids are always valid, for every size', () => {
  const rng = seeded(7);
  for (const n of [4, 6, 9]) {
    const g = geometry(n);
    for (let k = 0; k < 30; k++) assert.ok(isSolved(g, randomFullGrid(g, rng)));
  }
});

test('the logic solver only ever makes true moves', () => {
  const rng = seeded(11);
  for (let k = 0; k < 40; k++) {
    const { puzzle, solution } = generate(9, ['easy', 'medium', 'hard'][k % 3], { rng });
    const r = logicSolve(g9, puzzle);
    assert.ok(r.solved, 'generated puzzles never need guessing');
    assert.deepEqual(r.grid, solution);
  }
});

test('candidate eliminations never remove the real answer', () => {
  // replay the logic solver step by step through hints and check every placement
  const rng = seeded(23);
  for (let k = 0; k < 15; k++) {
    const { puzzle, solution } = generate(9, 'hard', { rng });
    const grid = puzzle.slice();
    while (grid.some((v) => !v)) {
      const step = nextPlacement(g9, grid);
      assert.ok(step, 'a hint always exists for a generated puzzle');
      assert.equal(step.place.value, solution[step.place.cell]);
      grid[step.place.cell] = step.place.value;
    }
    const cands = initCandidates(g9, puzzle);
    for (let i = 0; i < 81; i++) if (!puzzle[i]) assert.ok(cands[i] & (1 << solution[i]));
  }
});

test('generated puzzles: unique, match their solution, symmetric, right level', () => {
  const rng = seeded(99);
  for (const n of [4, 6, 9]) {
    const g = geometry(n);
    for (const level of ['learn', 'easy', 'medium', 'hard']) {
      for (let k = 0; k < 6; k++) {
        const r = generate(n, level, { rng });
        assert.equal(dlxSolve(g, r.puzzle, 2).count, 1, `${n} ${level} unique`);
        assert.equal(btSolve(g, r.puzzle, { limit: 2 }).count, 1, `${n} ${level} unique (backtracking)`);
        assert.ok(isSolved(g, r.solution));
        r.puzzle.forEach((v, i) => {
          if (v) assert.equal(v, r.solution[i]);
          assert.equal(!!v, !!r.puzzle[g.total - 1 - i], 'mirror symmetric');
        });
        const spec = LEVELS[n][level];
        assert.ok(r.tier >= spec.tiers[0] && r.tier <= spec.tiers[1], `${n} ${level} tier ${r.tier}`);
        assert.ok(r.clues >= spec.clues[0] && r.clues <= spec.clues[1], `${n} ${level} clues ${r.clues}`);
      }
    }
  }
});
