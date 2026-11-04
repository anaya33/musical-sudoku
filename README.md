# Musical Sudoku

Sudoku with nine music symbols instead of numbers: treble clef, bass clef, half, quarter, eighth and sixteenth notes, sharp, flat and fermata. Every row, column and box needs each symbol once.

Every symbol has its own sound, and it plays the moment you place it:

| symbol | sound |
| --- | --- |
| treble clef | a bright high G |
| bass clef | a deep low F |
| half note | a long C, two beats |
| quarter note | one E, one beat |
| eighth note | two quick Gs |
| sixteenth note | four fast As |
| sharp | a D that slides up |
| flat | a B that slides down |
| fermata | a high C that holds and swells |

- the play button plays the whole board row by row (empty squares are silent)
- finished rows, columns and boxes play back
- Listen plays the right symbol for a square without showing it
- notes, undo, erase, reveal, progress saved in the browser
- settings: level, instrument (piano, music box, marimba, soft synth), key, volume, tempo, paper or ink theme, symbol size, and help toggles

Black and white, flat paper tiles. All sound is made live with the Web Audio API, so there are no audio files and no build step.

## Run it locally

```
python3 -m http.server 8000
```

then open http://localhost:8000 (opening index.html directly won't work because it uses JS modules).

## Put it on GitHub Pages

Settings → Pages → Deploy from a branch → `main` / root.
