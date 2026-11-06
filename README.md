# 𝄞 Musical Sudoku

Sudoku, but every symbol is a real note.

**▶ Play it: [anaya33.github.io/musical-sudoku](https://anaya33.github.io/musical-sudoku/)**

---

## How to play

Fill the grid so every **row**, **column** and **box** has each symbol once.

| Symbol | Note | Sound |
| :---: | :---: | --- |
| 𝄞 Treble clef | G | one beat |
| 𝄢 Bass clef | F | one beat |
| 𝅗𝅥 Half note | B | two beats |
| ♩ Quarter note | D | one beat |
| ♪ Eighth note | E | two quick notes |
| 𝅘𝅥𝅯 Sixteenth note | F | four fast notes |
| ♯ Sharp | A | slides up |
| ♭ Flat | C | slides down |
| 𝄐 Fermata | E | holds |

> The notes are the treble staff: lines **E G B D F**, spaces **F A C E**.

| Mode | What it's like |
| --- | --- |
| **Learn** | A quick walkthrough, then help with every move |
| **Easy** | Simple logic. Wrong notes turn red |
| **Medium** | Needs pairs and pointing tricks |
| **Hard** | Needs advanced logic. No help until you break a rule |

Grids come in **4×4**, **6×6** and **9×9**.

---

## The algorithms

| | Algorithm | Job |
| :---: | --- | --- |
| 1 | **Dancing Links** (Knuth's Algorithm X) | Proves every puzzle has exactly one answer |
| 2 | **Bitmask backtracking** | Builds random full grids and double-checks #1 |
| 3 | **Logic solver** | Solves like a person, grades difficulty, powers hints |

A puzzle is made by removing symbols from a full grid, keeping only removals where #1 still finds one answer and #3 can still solve it without guessing.

---

## Run it yourself

```bash
python3 -m http.server 8000
```

Then open `localhost:8000`. Run the tests with `npm test`.

---

<sub>Sounds: FluidR3 GM soundfont via <a href="https://github.com/gleitz/midi-js-soundfonts">gleitz/midi-js-soundfonts</a> (CC BY 3.0)</sub>
