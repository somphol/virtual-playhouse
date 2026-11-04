# AGENTS.md — THE VIRTUAL PLAYHOUSE

> Handoff for the next maintainer or agent. Rebuild detail is in
> [docs/REPRODUCTION.md](docs/REPRODUCTION.md); the technical map is
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 1. What this is

A static, browser-native **2.5D classic-theatre simulator**: nine JSON-authored acts
(35 cast slots, 388 actions, 161 dialogue lines), a Canvas proscenium stage with
procedural actors and backdrops, a Web Audio orchestra, browser speech synthesis for
every player, audience reactions, a playbill, a Script Lab and an optional DeepSeek
playwright. It is three files — `index.html`, `style.css`, `script.js` — with no build
step, no framework, no backend and no image or sound assets loaded at runtime.

It is **not** an official VOA/Theatre/DeepSeek product, not a video stream, not a
multiplayer venue, and not an account-based service. Live copy:
<https://somphol.github.io/virtual-playhouse/>.
Local master: `~/Projects/virtual-playhouse`. There is **no tagged release**; the
build receipt records revision 4 (`state/build-state.json`).

**Network dependencies are limited but real:** the page loads Google Fonts from
`fonts.googleapis.com` / `fonts.gstatic.com`, and the optional AI Playwright sends a
request (and the user's API key) directly to `https://api.deepseek.com` only when the
user presses Generate. There is no feed, CDN library or analytics. Without network the
stage, Web Audio, speech synthesis and JSON engine still work; fonts fall back to
system faces.

## 2. Commands

```bash
cd ~/Projects/virtual-playhouse

# run (no install, no build)
python3 -m http.server 8000          # http://localhost:8000/
open index.html                      # works from file:// too

# live check
curl -s -o /dev/null -w '%{http_code}\n' https://somphol.github.io/virtual-playhouse/

# headless render (audio must not be entered; stage renders behind the gate)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --mute-audio \
  --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost" \
  --virtual-time-budget=3000 --timeout=8000 \
  --window-size=1440,1100 --screenshot=/tmp/playhouse.png \
  "http://localhost:8000/"

# DOM dump (the --timeout is needed because the canvas loop never idles)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --mute-audio \
  --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost" \
  --virtual-time-budget=2000 --timeout=5000 \
  --dump-dom "http://localhost:8000/" > /tmp/playhouse-dom.html

# deploy — Pages serves main / root; no workflow
git push origin main
```

There is no test runner, package manager or CI workflow. Evidence is in
[docs/TESTING.md](docs/TESTING.md).

## 3. Architecture

| File | Lines | Role |
| --- | --- | --- |
| `index.html` | 442 | stage canvas, gate, deck, playbill, Script Lab, voice/help dialogs |
| `style.css` | 1,898 | velvet-and-gilt system, stage HUD, modals, responsive layout |
| `script.js` | 8,837 | nine acts, audio, voices, renderer, playback, parser, UI, AI |
| `assets/preview.png` | — | README/social preview only; not loaded by the app |
| `state/build-state.json` | 68 | build receipt, token snapshot, artifact sizes |

Key paths:

- **Acts** — `ACTS` (`script.js:225–786`): nine objects with id, act, title, setting,
  subtitle, backdrop, ambient, duration, `art`, `cast` and ordered `actions`.
- **Audio** — `AudioEngine` (`789–1168`) lazily creates one `AudioContext`, a noise
  buffer, oscillators/filters, and methods for every cue (thunder, rain, chimes,
  applause, etc.). No audio files.
- **Voices** — `VoiceEngine` (`1173–1321`) wraps `speechSynthesis`, filters novelty
  voices, assigns a voice per actor, and exposes `speak`, `pause`, `resume`, `cancel`,
  `preview` and duration estimation.
- **Stage state** — `stage` (`1334–1373`): play, actors `Map`, index, speed, camera,
  curtain, lighting, backdrop, bubble, particles, energy, entry/ended flags.
- **Renderer** — `render()` (`6882–6912`) runs on `requestAnimationFrame`, updates
  playback, draws the theatre, clips to the arch, applies the seat camera, then draws
  backdrop, floor, actors, FX, lighting, motes, bubbles, curtains, seat foreground and
  vignette. DPR is capped at 2 (`resizeCanvas`, `1375`).
- **Backdrops** — nine painters plus Grand Hall (`1414–3346`), cached in
  `backdropCache`; animated details are drawn per frame.
- **Playback** — `loadPlay` (`7680`), `startAction` (`7329`), `update` (`7445`),
  `actionDuration` (`7310`), `seekTo` (`7649`), `endAct`/`showEndCard`
  (`7486`/`7503`). Dialogue duration follows estimated speech when voices are enabled.
- **Parser** — `normalizeScript()` (`7824–7957`) validates JSON, known action types,
  required fields, sound/effect/backdrop warnings, normalizes cast and auto-casts
  unknown actors.
- **UI** — `buildPlaybill` (`7987`), `openScriptLab` (`8013`), `bindUI` (`8541`),
  voice cast (`8392`), reactions (`7800`), seat presets (`6960`).
- **AI** — `buildAiPrompt`/`AI_SYSTEM_PROMPT` (`8136`/`8152`), `callDeepSeek` (`8190`),
  `generatePlay` (`8230`). The key goes only to `api.deepseek.com`; optional
  `localStorage` key is `vp.deepseek.key`.

## 4. Decisions and constraints

- **Three static files, no build.** Do not add a bundler, framework, backend or asset
  pipeline; procedural art and Web Audio are the product.
- **The stage is a fixed 1600 × 900 logical canvas**, CSS-scaled 16:9 with DPR capped
  at 2. Gameplay/layout maths should use logical coordinates, not CSS pixels.
- **JSON is the play format.** `schema: "virtual-playhouse/1"` is the only contract;
  unknown fields are ignored, unknown actors are auto-cast. Keep the parser tolerant
  and the warnings non-fatal.
- **No runtime image/audio files.** Backdrops, actors, costumes, particles and cues are
  generated. `assets/preview.png` is documentation, not an app asset.
- **Google Fonts is an external dependency.** `index.html:12–14` loads Cinzel,
  Cormorant Garamond and Inter. The CSS has system fallbacks; strict offline means
  removing those links.
- **Speech is browser-native.** Voices come from the OS; no audio is recorded or
  uploaded. If no voice exists, typewriter bubbles and Web Audio clicks remain.
- **DeepSeek is optional and direct-from-browser.** Never proxy the key through this
  repo (there is no server). If “Remember” is checked it is stored in plain
  `localStorage`; do not add analytics or logging around it.
- **The ambient drone is off by default.** It can be enabled per session in Voice Cast;
  keep the stage playable without it.
- **Pages is branch-hosted.** `main` / root with `.nojekyll`; there is no build artifact
  or Actions workflow.

## 5. Known issues

- **Not fully offline.** Google Fonts is requested on every load; the README says no
  image/sound assets, which is true, but the document is not strictly self-contained.
  With fonts blocked the layout falls back to system faces.
- **The build receipt is published** at `/state/build-state.json` (and linked in the
  footer). It contains a session id, model/provider and token totals, but no
  credentials or personal data.
- **No automated tests or CI.** Headless checks can render the stage but cannot judge
  animation, audio or voice performance.
- **Playback timing was not verified headlessly.** The canvas loop keeps the page alive,
  and headless Chrome’s virtual time does not advance `requestAnimationFrame` reliably;
  the initial frame, gate, playbill, Script Lab and custom staging were verified.
- **Audio, speech and DeepSeek were not exercised.** There is no API key in the repo and
  no microphone/voice test in this pass. DeepSeek may also refuse browser-origin CORS;
  the Copy Prompt path is the fallback.
- **The README action table omits `SCENE`.** `ACTION_TYPES` accepts `SCENE` (and
  `PAUSE` separately from `WAIT`), and `applyActionStart` handles it; the README and
  schema quick reference do not list it.
- **One custom play slot.** `addCustomPlay()` (`8084`) overwrites the previous custom
  play instead of keeping a library. The playbill lists only the nine built-ins.
- **No size or duration cap on loaded scripts.** `readPlayFile` and the editor accept
  arbitrarily large JSON; a huge script can stall the stage. The AI prompt asks for
  24–40 actions but `normalizeScript` does not enforce it.
- **API key storage is plaintext** when “Remember this key” is checked. It never leaves
  the browser except in the Authorization header to `api.deepseek.com`.
- **TTS voice availability is OS-dependent.** The gate says “default voice” when none
  are exposed; dialogue still typewrites, but the action timeline is shorter.
- **Validation grammar.** The Script Lab reports “1 players” when a script has a single
  cast member. Validation succeeds; only the pluralisation is wrong.
- **Mobile performance is unverified.** The stage paints a 1600 × 900 canvas plus
  backdrops and particles; low-end devices may struggle in Cinematic scenes.

## 6. Continuity

- Live: <https://somphol.github.io/virtual-playhouse/> (HTTP 200 at the time of writing).
- Pages: `main` branch, repository root, `.nojekyll` present, no Actions workflow.
- Repository: <https://github.com/somphol/virtual-playhouse>.
- Local master copy: `~/Projects/virtual-playhouse`.
- First build: commit `d78671e` “Build The Virtual Playhouse…”.
- Latest feature commit: `4182ebe` (Merchant of Venice + Lantern Society).
- Build receipt: revision 4, 2 h 47 m 58 s (`state/build-state.json`).
- Documentation release: the commit adding this file and `docs/`.
- Author: Somphol Boonjing.
- License: MIT (see `LICENSE`).
