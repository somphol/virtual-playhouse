# Testing

## Status of this release

| Evidence | When | Result |
| --- | --- | --- |
| Act-data audit (Node) | 2026-11-03 | **9 acts, 35 cast slots, 388 actions, 161 dialogue lines** |
| Live Pages probe (`curl`) | 2026-11-03 | **200** |
| Live root vs local `index.html` (SHA-1) | 2026-11-03 | **match** (`d2842f5b…`) |
| Google Fonts stylesheet probe | 2026-11-03 | **200** (external dependency confirmed) |
| Headless initial DOM | 2026-11-03 | **29,471 bytes**, gate visible, `1 / 45`, 9 playbill acts |
| Headless initial screenshot (1440 × 1100) | 2026-11-03 | **883,303-byte PNG** |
| Interactive harness (gate → Script Lab → custom play) | 2026-11-03 | **gate closed, 9 acts, valid 4-action script staged** |
| Custom-play screenshot (1440 × 1100) | 2026-11-03 | **1,052,401-byte PNG**, “Test Play” on stage |
| Playback advance / audio / voices | — | **Not verified** in headless |
| DeepSeek generation | — | **Not verified** (no key; optional) |
| Safari / Firefox / mobile / screen reader | — | **Not verified** |
| CI | — | **None exists** in this repository |

The documentation commit changed Markdown only; the three application files are
untouched. Headless Chrome can render the first frame and exercise the DOM, but its
virtual clock did not advance the `requestAnimationFrame` playback loop reliably, so
timing, audio and voice performance remain manual checks.

## 1. Commands

```bash
cd ~/Projects/virtual-playhouse

# run
python3 -m http.server 8000          # http://localhost:8000/
open index.html                      # works from file:// too

# live and font probes
curl -s -o /dev/null -w '%{http_code}\n' https://somphol.github.io/virtual-playhouse/
curl -s -o /dev/null -w '%{http_code}\n' -m 20 "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@400;500;600;700&display=swap"

# headless initial frame (do not enter the theatre)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --mute-audio \
  --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost" \
  --virtual-time-budget=3000 --timeout=8000 \
  --window-size=1440,1100 --screenshot=/tmp/playhouse.png \
  "http://localhost:8000/"

# DOM dump — the --timeout is required because the canvas loop never idles
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --mute-audio \
  --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost" \
  --virtual-time-budget=2000 --timeout=5000 \
  --dump-dom "http://localhost:8000/" > /tmp/playhouse-dom.html

# act audit (extract the ACTS array without running the browser code)
node - <<'JS'
const fs = require('fs');
const s = fs.readFileSync('script.js', 'utf8');
const a = s.indexOf('const ACTS = ['), b = s.indexOf('\n];', a) + 3;
const acts = Function(s.slice(a, b).replace('const ACTS = ', 'return '))();
console.log(acts.length, acts.reduce((n, x) => n + x.cast.length, 0),
  acts.reduce((n, x) => n + x.actions.length, 0),
  acts.reduce((n, x) => n + x.actions.filter(y => y.type === 'DIALOGUE').length, 0));
JS
```

## 2. Static results (2026-11-03)

- Act audit: **9** acts, **35** cast slots, **388** actions, **161** dialogue lines.
  Per act: 45, 43, 48, 42, 39, 48, 33, 41, 49 actions.
- Live site: HTTP `200`; `last-modified` Mon, 02 Nov 2026 02:54:24 GMT;
  `cache-control: max-age=600`; ETag `"6ae7fb60-5f41"`.
- Live `index.html` SHA-1 `d2842f5bd7b7ad346fea50b4c6ac24e80ad1e367`, identical to the
  local file.
- Google Fonts CSS returns `200 text/css`; the page is not fully self-contained.
- No runtime image/audio assets are requested; `assets/preview.png` is README-only.

### Initial DOM

- **29,471 bytes**; `#soundGate` visible; `#actBadge` “Act I”;
  `#programTitle` “Frankenstein's Awakening”; `#lineCount` “1 / 45”;
  House Energy “32%”; **9** `[data-act]` playbill buttons.
- Gate note in headless: “Your browser will use its default voice.” (no system voices
  exposed).
- Screenshot 1440 × 1100: **883,303 bytes**; curtain, gilt frame, deck and gate visible.

## 3. Interactive harness

A throwaway copy in `/tmp` had a small script appended and `AudioContext` /
`speechSynthesis` stubbed only so headless Chrome could exit. The repository and app
logic were not modified.

The harness clicked:

1. `Watch in Silence` (enter the theatre)
2. `Applaud`
3. `Playbill`
4. `Script Lab`
5. pasted a valid 4-action test script, clicked `Validate`, then `Raise the Curtain`

Observed:

| Field | Value |
| --- | --- |
| Sound gate hidden | `true` |
| Play button label | `Play` (auto-start delay still pending at capture) |
| Line count | `1 / 45` |
| Caption | “The house lights dim. The curtain rises…” |
| House Energy | `32%` → `45%` after Applaud |
| Playbill | open, **9** acts |
| Script Lab | open, editor preloaded with **5,214** characters |
| Validation | “✓ Valid — 4 actions, 1 players.” |
| Staged title | `Test Play` |
| Act badge | `Special Engagement` |
| Script Lab after staging | closed |

A separate screenshot of the same flow without stubs showed the custom play on stage,
three toasts (“Watching in silence”, “Script is stage-ready · 4 actions, 1 players”,
“Curtain up · ‘Test Play’ is now playing”) and **1,052,401 bytes**.

The “1 players” wording is a grammar rough edge, not a parser failure.

## 4. Manual matrix

Run in a desktop browser with audio enabled.

| # | Check | Expected |
| --- | --- | --- |
| 1 | Load | sound gate, Act I, 1/45, 32% energy, curtain drawn |
| 2 | “Enter the Theatre · Voices On” | gate closes, curtain opens, playback starts after ~1.5 s |
| 3 | “Watch in Silence” | stage runs muted; no voices/crowd; M restores sound |
| 4 | Play/pause, restart | timeline and captions stop/resume/reset |
| 5 | Seek by clicking/dragging timeline; arrow keys | action index jumps; caption/light/backdrop match |
| 6 | Speed 0.75/1/1.25/1.5 | playback and voice rate change |
| 7 | Previous/next act | Act I↔IX loads with correct cast and backdrop |
| 8 | Front/balcony/box | camera and foreground change |
| 9 | Applaud/laugh/gasp/rose (buttons and 1–4) | particles, crowd audio, energy rises |
| 10 | Playbill | nine cards; “Take Your Seat” loads the act |
| 11 | Script Lab → Validate valid JSON | “Valid — N actions, N players” |
| 12 | Script Lab → invalid JSON/action | readable error; stage unchanged |
| 13 | Raise the Curtain | custom play stages; program title/act update |
| 14 | Save Play / Load Play / drag-drop JSON | downloads/restores `theatre_play.json` |
| 15 | Voice Cast: hear one actor / test company | audible distinct voices; volume works |
| 16 | Mute / Sound Check | mute silences; sound check plays thunder/applause |
| 17 | AI Playwright with a key | JSON generated and staged; errors readable |
| 18 | Copy Prompt without a key | prompt copied; no API request |
| 19 | Fullscreen and keyboard shortcuts | F toggles; shortcuts ignored while typing/modal open |
| 20 | 1024 px and 390 px | stage/deck/modals usable; reduced motion respected |

## 5. Failure triage

- **Blank stage** — JavaScript error before the first `render()`, or Canvas 2D
  unavailable; check the console.
- **Gate will not close** — the click handler did not run, or an audio context error
  escaped; `enterTheatre()` should still hide the gate.
- **No sound** — no `AudioContext`, muted, or the first gesture did not unlock it.
- **No voices** — `speechSynthesis` unavailable, no OS voices, or browser autoplay
  policy; the gate explains the fallback.
- **Script rejected** — inspect `normalizeScript()` errors (JSON, actions array, action
  type, missing actor/text). Unknown cues/backdrops only warn.
- **Custom play missing from Playbill** — expected; the playbill lists only `ACTS`.
  Reloading returns to Act I and loses the custom play.
- **AI 401/403/CORS** — key, model, quota or browser-origin policy; use Copy Prompt.
- **Timeline jumps oddly** — `seekTo()` applies actions immediately; lighting/curtain
  state may look different from a fresh playthrough.
- **Performance drops** — particles/backdrop repaint; try fewer effects or a smaller
  window; DPR is capped at 2.

## 6. Not verified

- Playback timing, seek, speed and end-card flow in a real browser; headless rAF did not
  advance reliably.
- Web Audio cue quality, speech voice assignment/pronunciation and typewriter-word sync.
- DeepSeek generation, CORS behaviour, timeout and error copy (no API key used).
- Save/load file contents and drag-and-drop.
- All nine acts end-to-end; only Act I’s first frame and a 4-action custom play were
  exercised.
- Safari, Firefox, Edge, real iOS/Android, touch, HiDPI and screen-reader output.
- Mobile performance and long-session memory use (backdrop cache + particles).
- The exact byte/line counts in `state/build-state.json` were checked for the three
  source files and match; the receipt itself is not regenerated by the docs commit.
