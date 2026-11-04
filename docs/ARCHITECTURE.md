# Architecture

`virtual-playhouse` is a single-page Canvas application in three files. This document
maps the 8,837-line `script.js` so a change can be made without reading all of it.

## 1. File map

| File | Lines | Contents |
| --- | --- | --- |
| `index.html` | 442 | head/Google Fonts (1–20), top bar (21–46), stage/deck (47–170), program strip (172–186), footer (188–194), playbill/Script Lab/help/voice dialogs and toasts (197–438) |
| `style.css` | 1,898 | tokens/body (1–102), top bar (103–189), buttons (190–262), page (263–337), stage HUD (338–497), end card (498–555), sound gate (556–643), deck (644–782), reactions (783–862), program strip (863–950), footer (951–969), modals (970–1068), playbill (1069–1331), tabs/editor/AI/schema/help/voice (1332–1704), toasts/fullscreen (1705–1775), responsive (1776–1890), reduced motion (1891–1898) |
| `script.js` | 8,837 | utilities (1–224), acts (225–786), audio (789–1168), voices (1173–1321), renderer (1326–6912), playback (6914–7818), parser (7820–7957), UI (7959–8135), AI (8136–8281), voice cast/help (8283–8540), events (8541–8814), boot (8816–8837) |
| `assets/preview.png` | — | README preview only; not loaded by the app |
| `state/build-state.json` | 68 | build receipt; not read by the app |

## 2. The script format

Each act is a JSON object normalized to:

```js
{
  schema: 'virtual-playhouse/1',
  title, act, setting, subtitle,
  backdrop, ambient,
  cast: [{ id, name, short, costume, color, position, height }],
  actions: [{ type, ...fields }]
}
```

| Field | Allowed values |
| --- | --- |
| `backdrop` | `gothic_lab`, `tea_garden`, `ramparts`, `fairy_wood`, `ballroom`, `dracula_castle`, `belmont`, `venice_court`, `poetry_room`, `grand_hall` |
| `ambient` | `gothic`, `wonderland`, `tragedy`, `enchanted`, `ballroom`, `horror`, `none` |
| `position` | `far-left`, `left`, `center-left`, `center`, `center-right`, `right`, `far-right`, or a number 0–1 |
| action `type` | `ENTER`, `EXIT`, `MOVE`, `FACE`, `DIALOGUE`, `LIGHTING`, `SOUND`, `BACKDROP`, `EFFECT`, `GESTURE`, `BOW`, `CAPTION`, `WAIT`, `PAUSE`, `CURTAIN`, `AMBIENT`, `SCENE` |
| sound `cue` | `thunder_clap`, `thunder`, `rain`, `wind`, `magic_chime`, `door_creak`, `heartbeat`, `clock_tick`, `bell`, `sword_clash`, `crowd_gasp`, `applause`, `laugh`, `rose`, `waltz`, `wolf_howl`, `organ`, `gavel`, `coins` |
| `effect` | `sparks`, `lightning`, `fog`, `petals`, `confetti`, `embers`, `snow`, `cards`, `fireflies`, `bats`, `coins`, `leaves` |
| `costume` | `scientist`, `creature`, `alice`, `hatter`, `hare`, `queen`, `prince`, `ghost`, `royal`, `gown`, `fairy_queen`, `fairy_king`, `puck`, `donkey`, `regency`, `dandy`, `vampire`, `bride`, `victorian`, `usurer`, `lawyer`, `teacher`, `schoolboy`, `default` |

`ACTS` (`script.js:225–786`) contains **9** acts, **35** cast slots, **388** actions
and **161** dialogue lines. Every act is a complete standalone script.

## 3. Runtime state

`stage` (`1334–1373`) is the renderer/playback model:

```js
stage = {
  play, cast, actions, index, elapsed, duration,
  playing, speed, startDelay, actors: Map,
  seat, camera, cameraTarget,
  curtain, light, backdrop, ambient,
  bubble, caption, flash, shake, bolt,
  energy, fxParticles, reactionParticles, motes, fog,
  ended, endTimer, endShown, awaitingEntry,
  currentAction, lastClickChar, playingCustom
}
```

There is **no saved playback state**: reload returns to Act I behind the sound gate.
The only optional persistence is `vp.deepseek.key` in `localStorage`.

## 4. Audio

`AudioEngine` (`789–1168`) has one lazily created `AudioContext`, a master gain, a
compressor and a 2.4-second noise buffer. All cues are synthesized:

- `tone()` — oscillator + gain envelope;
- `noiseBurst()` — buffer source + biquad filter;
- named methods for thunder, rain, wind, chimes, creaks, heartbeat, clock, bell,
  sword clash, gasp, applause, laugh, rose, waltz, howl, organ, gavel and coins.

`ensure()` returns `false` when the browser has no `AudioContext`; every public cue
then becomes a no-op. `unlock()` resumes a suspended context after the first gesture.
`ambientEnabled` defaults to **false**; the drone is opt-in.

## 5. Voices

`VoiceEngine` (`1173–1321`) wraps `speechSynthesis`:

- `supported` is true only when both `speechSynthesis` and
  `SpeechSynthesisUtterance` exist.
- `loadVoices()` prefers English, removes novelty voices, then sorts local voices first.
- `assignCast()` tries to give each actor a distinct voice, matching inferred gender;
  `buildActor()` supplies `voiceGender`, `voicePitch` and `voiceRate` from the costume.
- `speak()` sets `pitch`, `rate`, `volume`, and forwards `onboundary` events so the
  typewriter can follow speech; `cancel()` invalidates stale callbacks with a token.
- `estimateDuration()` drives `actionDuration()` for dialogue; without a voice, the
  typewriter length sets the duration.

## 6. Renderer

The Canvas is a fixed **1600 × 900** logical space, CSS-scaled 16:9, with DPR capped at 2
(`resizeCanvas`, `1375`). `render()` (`6882`) runs every frame:

1. `update(dt)` — playback, curtain, light, camera, backdrop, particles, motes,
   flash/shake, end state.
2. Clear and paint the theatre surround.
3. Clip to the proscenium arch and apply the seat camera (`applyCamera`, `6859`).
4. `drawScene()` (`6831`) — cross-faded backdrop, animated backdrop FX, floor, actors,
   particles, lighting, dust, speech bubble.
5. Paint curtains, proscenium, seat foreground, reaction particles and vignette.
6. Update the HUD at ~11 Hz and request the next frame.

Backdrops are painted once into offscreen canvases and cached (`getBackdrop`, `1388`).
Actors are procedural vector figures (`drawActor`, `4031`) with walk cycles, facing,
gestures, costumes, mouths and shadows. Lighting (`drawLighting`, `5658`) blends colour,
intensity, spotlights, floor pools and flashes. Bubbles (`drawBubble`, `5736`) typewriter
text, wrap, tail, name-tag and follow voice boundaries.

Seat presets (`6960`) change zoom/translation/skew and the foreground overlay:
`front` (1×), `balcony` (0.9×, higher) and `box` (1.035×, side angle).

## 7. Playback

- `loadPlay()` (`7680`) normalizes, resets actors/FX/light/curtain, sets the first
  lighting state, updates the program and editor, and optionally starts after a delay.
- `startAction()` (`7329`)/`applyActionStart()` (`7116`) apply the current action and
  compute its duration (`actionDuration`, `7310`).
- `update()` (`7445`) advances elapsed time by `dt × speed`, advances the bubble and
  actors, decays energy, and starts the next action when the duration expires.
- Dialogue duration is `1.0 + typeDur + hold`; `typeDur`/`hold` come from speech
  estimation when voices are on, otherwise from text length.
- `seekTo()` (`7649`) applies actions up to a target index immediately; `restartAct()`
  reloads the current play; `nextAct()`/`prevAct()` wrap the play list.
- `endAct()` (`7486`) closes the curtain, applauds, spawns confetti and shows the end
  card after ~2 seconds.

## 8. Parser and validation

`normalizeScript()` (`7824`) accepts an object or JSON string and:

- rejects non-objects, missing/empty `actions`;
- uppercases action types and rejects unknown ones;
- requires actor for movement/gesture/bow and text for dialogue/caption;
- warns (does not fail) on unknown sound cues, backdrops, effects and lighting colours;
- normalizes the cast (ids, short names, costume, colour, position, height) and
  auto-adds any actor named in an action;
- falls back to `grand_hall` / `none` for unknown backdrop/ambient;
- returns `{ok, errors, warnings, script}`.

The editor (`validateEditor`, `8069`) validates without staging; “Raise the Curtain”
(`stageItBtn`) adds the play and loads it. Drag/drop and file input use the same
normalizer.

## 9. UI and AI

- **Playbill** — `buildPlaybill()` (`7987`) renders the nine built-in acts; custom plays
  are not listed.
- **Script Lab** — three tabs (Editor, AI Playwright, Schema), JSON editor with
  Beautify/Validate/Save/Load/Stage, and a schema reference.
- **Voice Cast** — volume, voice enable, ambient toggle, per-actor preview and company
  test (`8392`).
- **Reactions** — `react()` (`7800`) adds energy, spawns particles and plays crowd
  audio; keyboard `1`–`4`.
- **AI Playwright** — `buildAiPrompt()` + `AI_SYSTEM_PROMPT` (`8136`/`8152`) produce a
  strict JSON brief; `callDeepSeek()` (`8190`) posts to
  `https://api.deepseek.com/chat/completions` with `Authorization: Bearer <key>`;
  `generatePlay()` (`8230`) validates the response, strips code fences, stages it and
  closes the lab. A 75-second timeout and a 400-response retry without
  `response_format` are built in.

## 10. Change guide

| To change… | Touch | Watch out for |
| --- | --- | --- |
| Add or rewrite an act | `ACTS` (`225–786`) | every action type/actor/cue must validate; ids are used by the parser |
| Add a backdrop | `BACKDROP_LABELS`, painter, `BACKDROP_PAINTERS` | cache is keyed by name; add a label |
| Add a costume | `COSTUME_STYLES`, `COSTUME_SKINS`, pitch/rate maps | `guessCostume()` and `COSTUME_LABEL` may need updates |
| Add a sound cue | `SOUND_CUES` + `AudioEngine` method | parser only warns on unknown cues |
| Add an effect | `EFFECTS` + `spawnFx`/`drawFxParticles` | old saves just ignore unknown effects |
| Change playback timing | `actionDuration`, `dialogueTiming`, `update` | voices and no-voice mode must both work |
| Change the stage layout | `OPENING`, `FLOOR_Y`, `STAGE_LEFT/RIGHT`, camera | all painters assume 1600 × 900 |
| Change the parser contract | `normalizeScript` | keep unknown fields tolerated and warnings non-fatal |
| Change the deploy | none in-app | Pages is branch-root; no build |

Keep the runtime asset-free: backdrops, actors and audio are generated. Adding a
framework, server or required network call is a product change.
