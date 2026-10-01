# Signal Tuner

A signal decoder game played inside a Winamp 2 player, on a fake Windows 98 desktop at 3 AM. Tune the dial through the static, clear the interference, and decode lyrics from love songs and breakup songs nobody was meant to hear. Finishing a transmission unlocks the song it came from.

There is no timer and no fail state, just a quiet night, a radio, and a buddy who messages you when something is on the line.

## How it plays

- **Tune** the dial with the **TUNE** slider (drag it, or click it and use the mouse wheel). As you near a station a whistle rises and the **kHz** readout climbs. Hold steady on a station to lock it and decode its word.
- **Clear the static.** From the second transmission on, a **NOISE** filter slider has to sit inside a target range before any word will lock, and the last transmission adds **CLARITY**. The marquee says which slider and which way (`[WARN] NOISE: RAISE ++`), the slider's groove shifts from violet to green as you close in, the static drops away, and a chime plays when it clears.
- **Read the player.** The game reports through Winamp's own widgets: the playlist rows are the transmission list and the lyric so far, the marquee shows the decoded line, kbps shows the dial, kHz the signal strength, the stereo light means you're locked, the time digits are the night clock (3:14 AM creeping toward 4:00), and EQ **ON** means the static is clear.
- **Move on** with the next-track button once a transmission is done. Six transmissions ramp up one change at a time.

The desktop around the player holds the story: a dial-up connection on the first visit, instant messages from a buddy who reacts as you decode, unsent letters that land in the Recycle Bin, and Display Properties for wallpapers, colour schemes and a CRT effect.

## Running

Requires Node 22 or newer and pnpm 9.12.

```bash
pnpm install
pnpm --filter ani-cursor build
pnpm --filter winamp-eqf build
pnpm --filter signal-tuner start
```

Opens at http://localhost:5173 (or the next free port). `pnpm --filter signal-tuner type-check` runs the type-checker.

The placeholder skin is generated, and a built copy is checked in. To regenerate it after changing the palette or layout (needs Python 3 and Pillow):

```bash
python3 packages/signal-tuner/scripts/build_placeholder_skin.py
```

## Package structure

- `src/cosmetics.ts` — the knobs worth turning: where the three EQ sliders sit, tone pitches, gain.
- `src/transmissions.ts` — the levels: each transmission's words, dial bands, filter target ranges and unlock song.
- `src/SignalTunerGame.ts` — game logic: frequency to decode events, hold-to-lock, filter state, proximity.
- `src/webampAdapter.ts` — hooks into the real Winamp widgets: marquee, EQ sliders, readouts, playlist rows, visualizer tones.
- `src/runTransmission.ts` — plays one transmission: wires the sliders to the game and the game to the marquee, readouts, sound and the unlock.
- `src/main.ts` — bootstrap: builds the player and the desktop, then runs the active transmission.
- `src/shell/` — the Signal OS desktop: windows, taskbar, Start menu, dial-up opener, buddy messages and letters (`story.ts` holds all the copy), Display Properties, synthesized sounds.
- `scripts/build_placeholder_skin.py` — generates the player skin in `public/skins/`.

## Architecture

Layers, each knowing only what it needs:

- **webampAdapter** knows Webamp but not the game.
- **SignalTunerGame** knows the game but not Webamp.
- **runTransmission** is the only place the two meet.
- **shell** knows neither; `main.ts` hands it a few Winamp hooks and the game's events.

## Adding a transmission

Add an entry to `TRANSMISSIONS`, then one buddy line and one letter in `src/shell/story.ts` and an intro hint in `src/main.ts`. Wiring, sound and readouts are shared.

## Music

The unlockable songs are by Kevin MacLeod ([incompetech.com](https://incompetech.com), CC BY 4.0) and Alex McCulloch. The in-game titles and bands are fictional; the real titles and composers are listed in the game under **Start → Music Credits**.
