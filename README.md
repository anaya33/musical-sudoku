# Musical Sudoku

Sudoku with music symbols instead of numbers. Every row, column and box needs each symbol once. Play on a 4×4, 6×6 or 9×9 grid.

Each symbol is a real note on the treble staff (lines E G B D F, spaces F A C E), played with real instrument recordings:

| symbol | note | how it plays |
| --- | --- | --- |
| treble clef | G, 2nd line | one beat |
| bass clef | F, 1st space | one beat |
| half note | B, middle line | two beats |
| quarter note | D, 4th line | one beat |
| eighth note | E, bottom line | two quick notes |
| sixteenth note | F, top line | four fast notes |
| sharp | A, 2nd space | slides up |
| flat | C, 3rd space | slides down |
| fermata | E, top space | holds |

- tap any square to hear it; a wrong symbol turns red, shakes and plays out of tune
- finished rows, columns, boxes and boards play back as music
- top bar: new puzzle, settings, how to play
- tools: undo, erase, notes, hint (points at the next square, plays its note and says why; press again to fill it in)
- settings: level, grid size, sound, instrument, volume, dark mode, timer

## Levels

- **Learn** (from the ? button): a short walkthrough the first time, then puzzles where impossible symbols are greyed out and an arrow explains every move
- **Easy**: only needs singles. Wrong symbols turn red
- **Medium**: needs pairs, pointing pairs or box/line reduction. Wrong symbols turn red
- **Hard**: needs hidden pairs, triples or X-wings. Mistakes only show when they break a rule

## How the puzzles are made

Three separate algorithms in `js/solvers/`:

1. **Dancing links** (`dlx.js`): Knuth's Algorithm X on the exact cover form of sudoku. Proves a puzzle has exactly one solution.
2. **Bitmask backtracking** (`backtrack.js`): search with constraint propagation and fewest-options-first. Builds the random full grids and double-checks dancing links.
3. **Logic solver** (`logic.js`): solves like a person with named techniques and never guesses. Grades difficulty and powers the hints.

`generator.js` takes symbols away in mirror pairs, keeping one only if dancing links still finds a single solution and the logic solver can still finish without guessing. Puzzles are built in a web worker so the page never freezes.

Run the tests (Node 18+), which cross-check all three on hundreds of puzzles:

```
npm test
```

Black and white, flat paper look. No build step.

Instrument sounds are the FluidR3 GM soundfont via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), CC BY 3.0, saved in `samples/` (see `samples/CREDITS.md`). If they can't load, a built-in synth plays instead.

## Run it locally

```
python3 -m http.server 8777
```

or any static server, then open http://localhost:8777 (opening index.html directly won't work because it uses JS modules).

## Put it on GitHub Pages

Settings → Pages → Deploy from a branch → `main` / root.
