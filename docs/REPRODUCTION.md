# Reproduction book

How to rebuild **The Virtual Playhouse** from scratch if the source is lost, or
re-verify that a rebuild matches the release. Read
[ARCHITECTURE.md](ARCHITECTURE.md) first for the map.

> **The source is the truth.** `index.html`, `style.css` and `script.js` at HEAD are the
> application. `state/build-state.json` is a historical receipt, not runtime state.
> Rebuild only when the source is unavailable or you deliberately want a variant.

## 1. What is being reproduced

A three-file, browser-native theatre simulator:

- **Stage** — 2.5D proscenium with gilt frame, animated velvet curtains, wooden floor,
  spotlights, footlights, dust motes, vignette and seat-specific foregrounds.
- **Backdrops** — nine procedural sets (Gothic Lab, Tea Garden, Ramparts, Fairy Wood,
  Netherfield Ballroom, Dracula's Castle, Belmont, Venice Court, Poetry Room) plus a
  Grand Hall fallback.
- **Actors** — procedural vector bodies with costumes, walk cycles, facing, gestures,
  kneeling, bows and typewriter-synced mouths.
- **Audio** — synthesized thunder, rain, wind, chimes, creaks, heartbeat, clock, bell,
  sword clash, gasp, applause, laugh, rose, waltz, howl, organ, gavel and coins.
- **Voices** — one system voice per actor with pitch/rate by costume, word-boundary
  typewriter sync, mute, volume, per-actor preview and company test.
- **Nine acts** — eight classic adaptations (seven works, with *The Merchant of Venice*
  split into two acts) and the original *Lantern Society* homage.
- **Audience layer** — sound-on gate, front/balcony/box seats, House Energy,
  applaud/laugh/gasp/rose reactions, particles and crowd audio.
- **Transport** — play/pause, restart, previous/next act, 0.75–1.5× speed, timeline
  seek, fullscreen, mute.
- **Script engine** — JSON validation/normalization, auto-casting, save/load,
  drag-and-drop, Script Lab editor, schema, AI Playwright.
- **Delivery** — static three files + `.nojekyll`, branch-root GitHub Pages.

## 2. Requirements matrix

| # | Requirement | Implementation | Where |
| --- | --- | --- | --- |
| 1 | Nine performable acts | `ACTS` | `script.js:225–786` |
| 2 | 2.5D stage and curtains | `drawTheatreSurround`, `drawProscenium`, `drawCurtains` | `6435–6701` |
| 3 | Procedural backdrops | painters + `backdropCache` | `1388–3346` |
| 4 | Procedural actors and costumes | `buildActor`, `drawActor`, `COSTUME_STYLES` | `4031–5657`, `6983` |
| 5 | Lighting, particles, weather | `drawLighting`, `spawnFx`, `updateParticles` | `5658–6422` |
| 6 | Synthesized sound cues | `AudioEngine` | `789–1168` |
| 7 | Full-cast speech with typewriter sync | `VoiceEngine`, `dialogueTiming` | `1173–1321`, `7303` |
| 8 | Playback, speed, seek, pause | `loadPlay`, `startAction`, `update`, `seekTo` | `6914–7818` |
| 9 | Audience reactions and energy | `react`, `spawnReaction`, HUD | `7800`, `6115` |
| 10 | Seats and camera | `SEAT_PRESETS`, `setSeat`, `applyCamera` | `6960`, `7788`, `6859` |
| 11 | JSON parser and warnings | `normalizeScript` | `7824–7957` |
| 12 | Save/load and drag-and-drop | `downloadJSON`, `readPlayFile`, drop handlers | `104`, `8102`, `8739` |
| 13 | Script Lab and schema | dialogs, editor, `validateEditor` | `index.html:214–352`, `8057` |
| 14 | Optional DeepSeek playwright | `buildAiPrompt`, `callDeepSeek`, `generatePlay` | `8136–8281` |
| 15 | Static branch-root delivery | three files + `.nojekyll` | repo root |

## 3. Build order

1. **Shell** — `index.html` head, top bar, canvas, stage HUD, deck, program strip,
   footer, then dialogs/toasts.
2. **Design system** — `style.css` tokens, velvet/gilt surfaces, stage framing, deck,
   modals, responsive and reduced-motion rules.
3. **Canvas skeleton** — 1600 × 900 canvas, DPR scaling, proscenium arch, theatre
   surround and a single frame loop.
4. **Backdrops** — the nine painters plus Grand Hall, cached offscreen.
5. **Actors** — body parts, costumes, walk cycle, facing, gestures, mouth, shadows.
6. **Lighting/FX** — colour washes, spots, floor pools, flashes, particles, motes, fog.
7. **Audio** — one `AudioContext`, noise buffer, tone/burst helpers, one method per cue.
8. **Voices** — speech support detection, voice pool, cast assignment, speak/pause/
   resume, word-boundary callbacks and duration estimate.
9. **Playback** — action types, durations, start/update/seek/end, curtain, end card.
10. **Acts** — write the nine JSON scripts with cast, blocking, lights, sounds and bows.
11. **Audience UI** — reactions, energy, seats, transport, playbill.
12. **Parser and Script Lab** — normalization, editor, validation, save/load, drag/drop.
13. **AI Playwright** — prompt builder, DeepSeek call, JSON extraction, staging.
14. **Voice Cast/help** — per-actor voices, volume, ambient toggle, shortcuts.
15. **Docs and metadata** — README, build receipt, preview image, this set.

## 4. Acceptance checks

A rebuild is done when all of these pass:

1. `ACTS` has **9** acts with **35** cast slots and non-empty actions; each act starts
   with a caption/backdrop/lighting and includes bows (some close on a final effect).
2. Loading the page shows the sound gate, front-row seats, Act I, `1 / 45`, 32% House
   Energy and a rendered curtain/stage.
3. Entering the theatre closes the gate, opens the curtain and starts the timeline;
   “Watch in Silence” runs without speech or crowd audio.
4. Playbill lists all nine acts and “Take Your Seat” loads the selected act.
5. Play/pause, restart, previous/next, speed, seek and fullscreen respond without
   errors; the timeline and `n / total` line follow.
6. Front/balcony/box seats change the camera and foreground; reactions raise energy,
   spawn particles and play crowd sound.
7. A JSON script in the editor validates, stages, updates the program title and appears
   in the stage; invalid JSON/actions produce readable errors, not a crash.
8. Unknown actors are auto-cast; unknown cues/backdrops/effects produce warnings and
   fallbacks.
9. Save exports `theatre_play.json`; load and drag-and-drop restore a valid play.
10. With voices available, each actor gets a distinct voice and the typewriter follows
    word boundaries; without voices, bubbles and clicks still run.
11. With Web Audio unavailable, the stage runs silently; with speech unavailable, the
    gate explains the fallback.
12. DeepSeek is optional: no key means no request; Generate posts only to
    `api.deepseek.com`; returned JSON is validated and staged; Copy Prompt works without
    a key.
13. At 390 px and 1024 px the stage, deck and modals remain usable; reduced motion
    removes nonessential animation.
14. `main` / root serves the three files with `.nojekyll`; no build or workflow needed.

Record what you ran in [TESTING.md](TESTING.md) rather than assuming.

## 5. Provenance

| Item | Value |
| --- | --- |
| Initial build | `d78671e` “Build The Virtual Playhouse: AI classic theatre & audience simulator” |
| Build receipt + deployment link + mobile polish | `3fb78b2` |
| Final token receipt | `16e0d60` |
| Full-cast voices, sound-on gate, ambient off | `f0df95e` |
| Acts IV–VI (Midsummer, Pride, Dracula) | `429e1b4` |
| Acts VII–IX (Merchant, Lantern Society) | `4182ebe` |
| Release docs | this commit (`AGENTS.md` + `docs/`) |
| Build receipt | revision 4, 2 h 47 m 58 s (`state/build-state.json`) |
| Author | Somphol Boonjing |
| License | MIT (see `LICENSE`) |

There is no tagged release and no committed build artifact. `state/build-state.json`
records the original build; it is not updated by this documentation commit. Do not
invent a version history: `CHANGELOG.md` (added with these docs) is the record.
