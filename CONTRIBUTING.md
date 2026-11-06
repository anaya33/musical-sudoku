# Contributing

## Run it

```bash
python3 -m http.server 8000
```

Open `localhost:8000`. Run the tests (Node 18+) with:

```bash
npm test
```

## Algorithms

Three solvers that check each other, in [`js/solvers/`](js/solvers/).

| | Algorithm | Job |
| :---: | --- | --- |
| 1 | **Dancing Links** (Knuth's Algorithm X) | Proves a puzzle has exactly one answer |
| 2 | **Bitmask backtracking** | Builds random full grids and double-checks #1 |
| 3 | **Logic solver** | Solves like a person, grades difficulty, powers hints |

### How a puzzle is made

1. Build a random full grid (#2)
2. Remove symbols in mirror-image pairs
3. Keep a removal only if #1 still finds one answer and #3 can still solve it without guessing
4. Grade it by the hardest technique #3 needed

| Level | Techniques |
| --- | --- |
| Easy | Naked single, hidden single |
| Medium | Naked pair, pointing pair, box/line reduction |
| Hard | Hidden pair, naked triple, hidden triple, X-wing |

## References

- Donald E. Knuth. **Dancing Links.** *Millennial Perspectives in Computer Science*, 2000, pp. 187–214. [arXiv:cs/0011047](https://arxiv.org/abs/cs/0011047)
- Donald E. Knuth. ***The Art of Computer Programming*, Volume 4B: Combinatorial Algorithms, Part 2.** Addison-Wesley, 2022. Section 7.2.2.1, "Dancing links."

## Making a change

1. Fork the repo and make a branch
2. Keep it simple and run `npm test`
3. Open a pull request saying what changed

## Credits

Sounds: FluidR3 GM soundfont via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (CC BY 3.0). See [`samples/CREDITS.md`](samples/CREDITS.md).
