# IBM 5100 Simulator

A working IBM 5100 portable computer, running a small BASIC, sitting inside an
old CRT television, in your browser.

The 1975 IBM 5100 is famous twice over: once as one of the first portable
computers, and again as the machine "John Titor" claimed he came back from
2036 to find, the legend that later inspired *Steins;Gate*'s IBN 5100.

> **License:** All rights reserved. You can read the code and run it locally,
> but you may **not** publish this website, under this name or any other.
> See [LICENSE](LICENSE).

## Features

- **A real 3D 5100.** Every key on the model moves. Type on your own keyboard,
  or click keys on the model.
- **BASIC interpreter.** PRINT, INPUT, IF/THEN, GOTO, GOSUB, FOR/NEXT, DIM, and
  the usual math and string functions. Ctrl+C breaks a running program.
- **Tape unit.** `SAVE "NAME"`, `LOAD "NAME"` and `DIR` store programs in your
  browser. The tape takes real time, whirrs and clunks.
- **Front-panel lamps.** IN PROCESS (amber) while busy, PROCESS CHECK (red)
  after an error.
- **The whole window is a CRT.** Barrel distortion, scanlines, phosphor glow,
  a power-on degauss, a power-off collapse and a fading afterglow.
- **Switches like the real thing.** DISPLAY cycles 64 / L32 / R32 columns;
  REVERSE inverts the screen.
- **Hidden things** for *Steins;Gate* fans and John Titor followers. Start with
  `HELP`, `DEMO` and `DIR`, then explore.

## Controls

| Action | How |
| --- | --- |
| Type | your keyboard, or click the model's keys |
| Zoom | scroll (zooms toward the pointer) |
| Move | drag |
| Reset view | double-click |
| Break a program | Ctrl+C |

## Easter eggs

Type any of these at the `READY` prompt and press Enter. They are not case
sensitive, and the names in brackets also work.

| Command | What happens |
| --- | --- |
| **John Titor** | |
| `TITOR` (`JOHN TITOR`, `TIMETRAVEL_0`) | A signal from 2036, and a tape left in the drive (try `DIR`) |
| `C204` (`TIME MACHINE`) | Specs of Titor's time machine |
| `2036` | Tries to reach the year 2036 |
| `2038` (`Y2K38`, `Y2038`) | Live countdown to the Unix 32-bit time overflow |
| `UNDOCUMENTED` (`HIDDEN`, `DEBUG`) | The 5100's real hidden feature |
| `PHOTOS` (`EVIDENCE`, `ATTACHMENTS`) | Titor's archived attachments |
| `PHOTO 1`, `PHOTO 2`, `PHOTO 3` | His photos of the time machine, loaded from tape onto the 5100's screen |
| `BLUEPRINT` (`SCHEMATIC`) | The C204 "major systems" cutaway drawing |
| `DIAGRAM` | The C204 unit layout, with its parts list |
| **Steins;Gate** | |
| `STEINS;GATE` (`STEINS GATE`, `STEINSGATE`) | The world line where nobody has to die |
| `EL PSY KONGROO` (`EL PSY CONGROO`) | An incoming transmission |
| `DIVERGENCE` (`WORLDLINE`, `WORLD LINE`) | Divergence meter reading, not always the same one |
| `IBN 5100` (`IBN`, `IBN5100`) | The machine from another world line |
| `SERN` | You are being watched |
| `D-MAIL` (`DMAIL`, `D MAIL`) | Try to send a D-Mail |
| `OPERATION SKULD` | Start the operation |
| `LAB` (`FUTURE GADGET`) | Future Gadget Lab member list |
| `OKABE` (`OKARIN`, `RINTAROU`, `KYOUMA`, `HOUOIN KYOUMA`, …) | The mad scientist introduces himself |
| `KURISU` (`MAKISE`, `MAKISE KURISU`) | Every nickname Kurisu has been given |
| `CHRISTINA` | She has something to say about that |
| `ZOMBIE`, `ASSISTANT`, `CELEB SEVENTEEN`, `KURIGOHAN` | Alias lookups for lab member 004 |
| `NURUPO` (`NULLPO`) | The @channel call and response |
| `SUZUHA` (`AMANE SUZUHA`) | A message from a part-timer |
| `TUTURU` (`TUTTURU`) | Mayushii says hi |
| `THANK YOU` (`THANKS`, `ARIGATOU`, `OMEDETOU`, `CONGRATULATIONS`) | The Steins;Gate 100% completion photo, scanned onto the 5100's screen |

The 5100 counts the 19 secrets above (not the pictures). Find them all and it
announces your 100% and tells you to say `THANK YOU`.

## Running locally

Requires Node.js 18+.

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # production build into dist/
npm run test:basic   # BASIC interpreter tests
```

Other scripts:

- `npm run smoke` takes a headless screenshot. It needs `CHROME=<path to chrome.exe>`
  and the dev server running.
- `node tools/pictures.mjs <folder>` rebuilds the 1-bit dot pictures in
  `public/images/` from their source images (not in this repo).
- `npm run model` re-compresses the source model into `public/models/ibm5100.web.glb`.
  The full-size source `ibm5100.glb` is not in this repo. Download it from the
  [model's Sketchfab page](https://sketchfab.com/3d-models/ibm5100-ba277a88f0b14fe3802d0f4e52afd2cb)
  and put it in the project root first.

## How it works

- **Stack:** React, TypeScript, Vite, three.js through `@react-three/fiber`,
  `drei` and `postprocessing`.
- **Fast first paint:** the 3D scene is a separate chunk. It is prefetched when
  the page goes idle, so the first load only needs about 60 KB of gzipped JS.
- **Moving keys:** the model's keyboard is one merged mesh. At load time it is
  split into connected pieces, and each piece is matched to a key by its measured
  position (`src/scene/keyMap.ts`).
- **The 5100's screen** is a 64×16 character grid drawn onto a canvas texture on
  the model's CRT face.
- **Audio:** apart from the looping CRT buzz, every sound is synthesised with
  the Web Audio API.

```
src/
  App.tsx              power sequence, keyboard input, wiring
  audio/sounds.ts      buzz, keyclicks, tape, relays (Web Audio)
  components/          CRT frame, HUD, loading readouts
  scene/               3D scene, model preparation, key map, CRT shader
  terminal/            the 5100 itself: screen grid, commands, BASIC, easter eggs
copyright.html         full credits and licences page
```

## Credits

Full credits, licences and trademark notes are on the site's
[copyright page](copyright.html).

- 3D model "IBM5100" by [JP_2793](https://sketchfab.com/3d-models/ibm5100-ba277a88f0b14fe3802d0f4e52afd2cb),
  [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Non-commercial use only.
- CRT buzz audio by artificiallyinspired.
- The hidden lab photo is the *Steins;Gate* 100% achievement artwork, © MAGES.,
  shown as a reduced 1-bit dot version as a fan tribute.
- The time machine photos and drawings are the images "John Titor" posted
  online in 2000-2001, shown as reduced 1-bit dot versions.
- Fonts: VT323 by Peter Hull and IBM Plex Mono by IBM, both SIL OFL 1.1.

This is a fan project. It is not affiliated with, sponsored by, or endorsed by
IBM, MAGES. or 5pb. IBM and IBM 5100 are trademarks of International Business
Machines Corporation.

## License

Copyright © 2026 AlgoWanderer. **All rights reserved.** You may view the code and
run it privately. You may not publish, host or redistribute this website or a
modified or renamed version of it. See [LICENSE](LICENSE) for the full terms.
Third-party assets keep their own licenses.
