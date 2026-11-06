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
- symbols that can't go in the selected square are greyed out
- the play button plays the whole board; finished rows, columns and boxes play back
- Listen plays the right note for a square without showing it
- settings: grid size, level, instrument (piano, guitar, strings, violin, harp, flute, music box, marimba, synth), a row to try every note, key, volume, tempo, paper or ink theme, symbol size, help toggles

Black and white, flat paper look. No build step.

Instrument sounds are the FluidR3 GM soundfont, loaded from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts). If they can't load, a built-in synth plays instead.

## Run it locally

```
python3 -m http.server 8777
```

or any static server, then open http://localhost:8777 (opening index.html directly won't work because it uses JS modules).

## Put it on GitHub Pages

Settings → Pages → Deploy from a branch → `main` / root.
