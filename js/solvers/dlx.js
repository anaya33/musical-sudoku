// algorithm 1: knuth's algorithm x with dancing links.
// sudoku as an exact cover problem: pick placements (cell, value) so that every
// constraint is covered exactly once. for an n x n grid there are 4 * n^2 constraints:
//   each cell holds one value, each row / column / box holds each value once.
// this is the exact, proof-grade way to count solutions, so it decides uniqueness.

class Dancer {
  constructor(numCols, maxNodes) {
    const size = numCols + 1 + maxNodes;
    this.L = new Int32Array(size);
    this.R = new Int32Array(size);
    this.U = new Int32Array(size);
    this.D = new Int32Array(size);
    this.C = new Int32Array(size); // column header of each node
    this.row = new Int32Array(size); // which placement a node belongs to
    this.S = new Int32Array(numCols + 1); // how many nodes are left in each column
    // node 0 is the root, 1..numCols are column headers
    for (let c = 0; c <= numCols; c++) {
      this.L[c] = c - 1;
      this.R[c] = c + 1;
      this.U[c] = c;
      this.D[c] = c;
      this.C[c] = c;
    }
    this.L[0] = numCols;
    this.R[numCols] = 0;
    this.next = numCols + 1;
  }

  addRow(rowId, cols) {
    let first = -1;
    for (const col of cols) {
      const c = col + 1;
      const x = this.next++;
      this.C[x] = c;
      this.row[x] = rowId;
      // insert at the bottom of column c
      this.U[x] = this.U[c];
      this.D[x] = c;
      this.D[this.U[c]] = x;
      this.U[c] = x;
      this.S[c]++;
      if (first < 0) { first = x; this.L[x] = x; this.R[x] = x; } else {
        this.L[x] = this.L[first];
        this.R[x] = first;
        this.R[this.L[first]] = x;
        this.L[first] = x;
      }
    }
  }

  cover(c) {
    const { L, R, U, D, C, S } = this;
    R[L[c]] = R[c];
    L[R[c]] = L[c];
    for (let i = D[c]; i !== c; i = D[i]) {
      for (let j = R[i]; j !== i; j = R[j]) {
        D[U[j]] = D[j];
        U[D[j]] = U[j];
        S[C[j]]--;
      }
    }
  }

  uncover(c) {
    const { L, R, U, D, C, S } = this;
    for (let i = U[c]; i !== c; i = U[i]) {
      for (let j = L[i]; j !== i; j = L[j]) {
        S[C[j]]++;
        D[U[j]] = j;
        U[D[j]] = j;
      }
    }
    R[L[c]] = c;
    L[R[c]] = c;
  }

  // counts exact covers up to limit. chosen rows of the first cover go into this.first
  search(limit) {
    const stack = [];
    let count = 0;
    const rec = () => {
      const { R, D, S } = this;
      if (R[0] === 0) {
        if (count === 0) this.first = stack.slice();
        count++;
        return;
      }
      // pick the column with the fewest options (knuth's "S heuristic")
      let c = R[0];
      for (let j = R[c]; j !== 0; j = R[j]) if (S[j] < S[c]) c = j;
      if (S[c] === 0) return;
      this.cover(c);
      for (let r = D[c]; r !== c && count < limit; r = D[r]) {
        stack.push(this.row[r]);
        for (let j = this.R[r]; j !== r; j = this.R[j]) this.cover(this.C[j]);
        rec();
        for (let j = this.L[r]; j !== r; j = this.L[j]) this.uncover(this.C[j]);
        stack.pop();
      }
      this.uncover(c);
    };
    rec();
    return count;
  }
}

// returns { count, solution } where count stops at limit
export function dlxSolve(geo, grid, limit = 2) {
  const { n, total } = geo;
  const dancer = new Dancer(4 * total, total * n * 4);
  for (let i = 0; i < total; i++) {
    const r = geo.rowOf(i), c = geo.colOf(i), b = geo.boxOf(i);
    for (let v = 1; v <= n; v++) {
      if (grid[i] && grid[i] !== v) continue; // a given only allows its own value
      const d = v - 1;
      dancer.addRow(i * n + d, [i, total + r * n + d, 2 * total + c * n + d, 3 * total + b * n + d]);
    }
  }
  const count = dancer.search(limit);
  let solution = null;
  if (count > 0) {
    solution = new Array(total).fill(0);
    for (const id of dancer.first) solution[Math.floor(id / n)] = (id % n) + 1;
  }
  return { count, solution };
}

export const dlxCount = (geo, grid, limit = 2) => dlxSolve(geo, grid, limit).count;
