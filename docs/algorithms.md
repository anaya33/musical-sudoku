<div align="center">

| [🏠 Home](../README.md) | [📖 How to play](how-to-play.md) | **🧠 Algorithms** | [💻 Run it](run-it.md) |
| :---: | :---: | :---: | :---: |

</div>

# Algorithms

Three solvers that check each other.

| | Algorithm | Job |
| :---: | --- | --- |
| 1 | **Dancing Links** (Knuth's Algorithm X) | Proves a puzzle has exactly one answer |
| 2 | **Bitmask backtracking** | Builds random full grids and double-checks #1 |
| 3 | **Logic solver** | Solves like a person, grades difficulty, powers hints |

## How a puzzle is made

1. Build a random full grid (#2)
2. Remove symbols in mirror-image pairs
3. Keep a removal only if #1 still finds one answer and #3 can still solve it without guessing
4. Grade it by the hardest technique #3 needed

## Techniques the logic solver knows

| Level | Techniques |
| --- | --- |
| Easy | Naked single, hidden single |
| Medium | Naked pair, pointing pair, box/line reduction |
| Hard | Hidden pair, naked triple, hidden triple, X-wing |

Code lives in [`js/solvers/`](../js/solvers/).
