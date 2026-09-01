# Signal Tuner

A signal decoder game built inside a Winamp 2 player. Tune through frequency bands to find hidden messages, each decoded message triggers audio feedback and visual reactions in the player itself.

## Running

```bash
pnpm install
pnpm --filter signal-tuner start
```

Opens at http://localhost:5173 (or next available port).

## Package structure

- `src/cosmetics.ts` — all cosmetic knobs (visible EQ bands, tone frequencies, gain). Start here to tweak look and feel.
- `src/SignalTunerGame.ts` — game logic (frequency input → decode events, no double-decodes, proximity tracking).
- `src/transmissions.ts` — data file defining each transmission (frequency bands and their hidden words).
- `src/webampAdapter.ts` — low-level hooks into the real Winamp widgets (title marquee, EQ sliders, visualizer, track unlock).
- `src/runTransmission.ts` — wires a transmission's progression loop (EQ slider → game → audio/text feedback).
- `src/main.ts` — bootstrap: creates the player, renders it, declutters the UI, starts the active transmission.

## Architecture

Three-layer separation:
- **webampAdapter**: knows Webamp, doesn't know the game
- **SignalTunerGame**: game logic, doesn't know Webamp
- **runTransmission**: glues them together

This keeps the game portable and the player integration minimal.
