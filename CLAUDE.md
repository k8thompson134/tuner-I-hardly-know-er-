# Signal Tuner Game

Retro Winamp 2-styled signal decoder game for k8thompson.dev, built on a fork of [Webamp](https://github.com/captbaritone/webamp) (open-source Winamp 2 reimplementation). Status: **Phase 0 (MVP) done and playable**; Phase 1 (custom skin) not started.

## Vision

Players decode hidden messages by tuning a radio dial through frequency space inside a Winamp 2 UI. Frequency bands contain hidden messages (words, letters, or musical notes); as the player approaches a target frequency, audio/visual feedback increases (noise clears, signal strengthens), and hitting the target reveals a word/letter/note with an audio cue. Collecting all targets in a transmission completes it. No fail state, no timer — meditative, explorative gameplay (Katamari/Stardew-adjacent design taste).

Serves as both a portfolio easter egg and a showcase of web audio synthesis, game architecture, and design skills. Aesthetic: Y2K retrowave + vintage digital cameras + command-center vibes.

## Status

- **Phase 0 — MVP: done.** Game logic wired into stock Webamp UI (no custom skin), living in `packages/signal-tuner`. `SignalTunerGame` class manages frequency state and word-band decode logic; the Winamp equalizer's real "600" band slider drives frequency (see `packages/signal-tuner/docs/webamp-adapter.md`); decoded words appear in the real title-bar marquee; beep/fanfare tones route through Webamp's actual `AnalyserNode` so the built-in oscilloscope/spectrum reacts to them; the equalizer is decluttered to 3 visible bands (170/600/14000, only 600 wired up); completing the transmission unlocks and plays a reward track via `webamp.setTracksToPlay()` — a feature added mid-build, ahead of where it sat in the original plan. Two things dropped from the original Phase 0 checklist as unnecessary rather than left undone: showing decoded words in the playlist window specifically (the marquee already covers "show what was decoded" — no need for every display surface to carry the same info) and deploying to Vercel/Netlify (not happening for a while; not tracked as a blocker on anything below).
- **Phase 1 — First custom skin: not started.** `.wsz` skin authored in Affinity Designer (main window background, Y2K palette, beveled 3D edges) replacing the default skin. Webamp still owns all UI elements — this phase only reskins the housing. (The EQ-decluttering CSS from Phase 0 is a preview of "customize the housing," but it's not skin-file work — the actual `.wsz` hasn't been touched.)
- **Phase 2+ — Iteration:** superseded by `packages/signal-tuner/docs/game-flows.md`, which fleshes out the original "more transmissions / richer audio / visual polish" bullet into an actual design (3-slider zone-based mechanic, per-difficulty transmission patterns, a full audio/visual feedback language, mission menu, secret-transmission trigger, localStorage score schema). That doc's "Relationship to the current build" section is the live gap-analysis and priority order — check there before starting Phase 2 work rather than re-deriving priorities here. Current order: (1) proximity audio feedback on the existing single-slider flow — cheapest, biggest feel win; (2) secret transmission triggered by a Shuffle+Repeat combo; (3) slider zone glow (grey/orange/yellow/green) — Phase-1-adjacent, needs skin/patch work; (4) multi-transmission menu + localStorage scores — blocked on deciding the zone-based vs. word-band encoding first.

Transmissions are defined in a `transmissions.ts` data file so new ones can be added without touching game logic.

### Decisions (locked in for Phase 0)
- Message encoding: **word bands**
- MVP transmissions: **1**
- Audio feedback: **beeps only** (beep on successful decode)
- Leaderboard/high scores: **deferred to Phase 2+** (no localStorage scoring in MVP)
- Equalizer: not used for audio shaping — its "600" band slider is repurposed as the actual tuning-dial input (see below), which supersedes the earlier "decorative" plan
- Narrative/content theme: the repo name is a "tuner, I hardly know her" pun — transmissions are **song lyrics**, unlocking different songs over time, themed around **love songs / breakup songs**. MVP transmission is standalone but should be written so it reads as the first entry in that series. Actual lyric content must be original (evoking the vibe, not quoting real copyrighted lyrics) since real song lyrics can't be reproduced verbatim.
- The "unlock a song" payoff is implemented: completing a transmission loads that transmission's `unlockTrack` onto the real player via `webamp.setTracksToPlay()` and starts playing it (see `transmissions.ts` / `main.ts`). Transmission 1 unlocks a user-supplied royalty-free jazz mp3 (`public/audio/aug_26_jazz.mp3`) with placeholder metadata (title "Aug 26 — Jazz Transmission", artist "Unknown Signal") — real title/artist/art still TBD.

## Running the dev server

This is a pnpm workspace pinned to `pnpm@9.12.0` (`package.json` `packageManager` field) and requires Node ≥22.

```bash
npm install -g pnpm@9.12.0   # if pnpm isn't already on PATH
pnpm install
```

Two workspace packages ship pre-built and must be compiled before the demo app will resolve them (their `package.json` `main` points at build output that isn't checked in):

```bash
pnpm --filter ani-cursor build     # -> packages/ani-cursor/dist
pnpm --filter winamp-eqf build     # -> packages/winamp-eqf/built
```

Then run the demo app (the actual playable Webamp UI):

```bash
pnpm --filter webamp-demo start    # vite dev server, http://localhost:5173 (or next free port)
```

Other useful scripts (see `package.json` at root): `pnpm test` (turbo test across packages), `pnpm lint`, `pnpm type-check`, `pnpm format`.

Then run the game itself:

```bash
pnpm --filter signal-tuner start   # vite dev server, http://localhost:5173
```

## Game package: `packages/signal-tuner`

Adapter-pattern layer on top of Webamp, kept as its own package rather than forking `packages/webamp` or `packages/webamp-demo` — Webamp is a dependency, not something we edit directly, so the fork's upstream diff stays minimal.

Layering rule the package holds to: `webampAdapter.ts` knows Webamp but not the game; `SignalTunerGame.ts` knows the game but not Webamp; `runTransmission.ts` is the only place the two meet. Anything needing both belongs there.

- `src/cosmetics.ts` — **the knobs worth turning.** Which EQ bands are visible, tone pitches, fanfare, gain. Start here for look-and-feel changes; `VISIBLE_BANDS` drives both slider hiding and label patching, so it's a one-line edit.
- `src/SignalTunerGame.ts` — framework-agnostic game logic (frequency → word-band lookup, decode/complete events, no double-decodes, proximity reporting).
- `src/transmissions.ts` — word-band data for each transmission.
- `src/webampAdapter.ts` — low-level helpers for driving the *real* Winamp widgets (title-bar marquee, EQ sliders, the live oscilloscope/spectrum, unlocking a track onto the playlist) instead of building parallel UI. **Read `docs/webamp-adapter.md` before touching this file or adding a new widget hook** — it documents which parts of Webamp's API are safe to use, which are undocumented-but-public, and one dead end (`SET_DUMMY_VIZ_DATA`) that looks like the right hook but isn't wired to anything.
- `src/runTransmission.ts` — the reusable "play a transmission" entry point: wires one `Transmission`'s EQ band → `SignalTunerGame` → marquee/tones/`unlockTrack()` progression loop in one call. **Adding transmission 2+ means calling this again, not rewriting the wiring** — see the "Reusable progression flow" section of `docs/webamp-adapter.md`. Accepts `proximityFeedback: true` to enable the rising "getting warmer" tone (built, off by default — it's a game-feel call).
- `src/main.ts` — thin bootstrap: builds the `webamp` instance, renders it, declutters the EQ, then calls `runTransmission()` for the active transmission.
- `src/audio.ts` — standalone beep/fanfare helpers (independent `AudioContext`, not routed through Webamp) — currently unused by `main.ts` in favor of the visualizer-connected tones in `webampAdapter.ts`, but kept as a simpler fallback if the widget-integration approach needs to be swapped out.

Docs:
- `docs/webamp-adapter.md` — how to drive the real Winamp widgets (the "how it's built" doc).
- `docs/game-flows.md` — the fuller design vision (states, missions, feedback language) this package is progressing toward; not all of it is built yet (the "where it's headed" doc).

Known trap (documented in full in `docs/webamp-adapter.md`): `webamp.renderWhenReady(node)` ignores `node` and always mounts to `document.body`. Use `webamp.renderInto(node)` (with `node` given a non-`static` CSS position) to actually embed Webamp inside a container.
