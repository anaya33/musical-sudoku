# Musical Sudoku

Sudoku where the nine numbers are nine notes. Every row, column and box has to hold each note once, and you hear the grid as you fill it.

- tap a square, tap a note, hear it
- finishing a row, column or box plays it back
- **Play board** plays the whole grid row by row (empty squares are rests)
- **Ear hint** plays the right note without showing it
- 4 scales (major, minor, pentatonic, dorian), 4 sounds (piano, marimba, bells, synth)
- pencil marks, undo, progress saved in the browser

All sound is made live with the Web Audio API, so there are no audio files and no build step.

## Run it locally

```
python3 -m http.server 8000
```

then open http://localhost:8000 (opening index.html directly won't work because it uses JS modules).

## Put it on GitHub Pages

Settings → Pages → Deploy from a branch → `main` / root.
