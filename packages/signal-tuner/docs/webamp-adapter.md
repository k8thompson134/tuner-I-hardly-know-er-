# Driving the real Winamp UI

Goal: the game should read/write the *actual* Winamp widgets (title bar, EQ
sliders, oscilloscope/spectrum) rather than build a parallel HTML panel next
to it. This documents what's reachable through Webamp's public API vs. what
requires reaching into `packages/webamp`'s internals, and where each hook
lives. Low-level helpers live in `src/webampAdapter.ts`; the reusable
"play a transmission" entry point that composes them lives in
`src/runTransmission.ts` (see that section below). This doc is the "why"
and "where to look if it breaks."

Everything here was found by reading `packages/webamp/js/webampLazy.tsx`
(the public class), `js/reducers/*.ts` (state shape + action types), and
`js/selectors.ts` (how components read that state) — not from any published
doc, since Webamp's docs only cover the "give me a music player" use case,
not driving individual widgets programmatically.

## Where to change things

Start here rather than reading top to bottom.

| I want to… | Go to |
| --- | --- |
| Change which EQ sliders are visible | `VISIBLE_BANDS` in `src/cosmetics.ts` |
| Change tone pitches, fanfare, gain | `TONES` / `TONE_GAIN` in `src/cosmetics.ts` |
| Change page background, fonts, panel styling | `css/style.css` |
| Add or edit a transmission's words | `src/transmissions.ts` |
| Change what a decode or completion *does* | `src/runTransmission.ts` |
| Change the decode rule itself | `src/SignalTunerGame.ts` |
| Reach a Winamp widget nothing touches yet | the rest of this doc, then `src/webampAdapter.ts` |

The rule the package tries to hold: `webampAdapter.ts` knows about Webamp
but not the game; `SignalTunerGame.ts` knows about the game but not Webamp;
`runTransmission.ts` is the only place they meet. Anything that needs both
belongs there, not in either side.

## The three surfaces WebampLazy exposes

1. **Documented public methods** — `play()`, `pause()`, `setVolume()`,
   `isShuffleEnabled()` / `toggleShuffle()`, `isRepeatEnabled()` /
   `toggleRepeat()`, `onTrackDidChange()`, etc. (`webampLazy.tsx:226-451`).
   Safe, stable, intended for external use.
2. **`webamp.store`** — the raw Redux store. Marked `// TODO: Make this
   _private` in the source but currently public, and it's how the demo app
   itself reaches in (`webamp.store.dispatch({ type: "DISABLE_MARQUEE" })`
   in `webamp-demo/js/index.tsx`). This is our main hook: dispatch action
   types straight from `js/reducers/*.ts`, read state via
   `webamp.store.getState()`, and use `webamp.__onStateChange(cb)`
   (a thin wrapper around `store.subscribe`) to react to changes —
   including changes the *player* makes by dragging a widget themselves.
3. **`webamp.media`** — the `Media` class wrapping the real Web Audio graph.
   `webamp.media.getAnalyser()` returns the actual `AnalyserNode` the visualizer
   reads from.

Because (2) and (3) are "currently public but not really meant for this,"
treat every hook below as something that could break on a Webamp upgrade —
they're pinned to specific reducer/selector code, referenced by file:line.

### One primitive underneath: `onStateSlice`

The store fires on *every* action, so anything reacting to player input has
to diff the one value it cares about. Rather than hand-roll that per widget,
there's a single primitive:

```ts
onStateSlice(webamp, (w) => getEqBandValue(w, 600), (next, prev) => { ... });
```

`onEqBandChange`, `onSwitchChange` and `onSwitchCombo` are all one-liners
over it. Anything new that watches a widget should be too — that's the
difference between adding a subscriber and adding another bespoke diff.

## Title bar / marquee text

`Marquee.tsx` renders whatever `Selectors.getMarqueeText` returns
(`selectors.ts:633`). That selector checks `state.userInput.userMessage`
*first*, before track title, volume-drag text, EQ-drag text, etc.
(`reducers/userInput.ts:34-37` handles `SET_USER_MESSAGE` /
`UNSET_USER_MESSAGE`). So:

```ts
webamp.store.dispatch({ type: "SET_USER_MESSAGE", message: "STATIC HELD" });
// ...
webamp.store.dispatch({ type: "UNSET_USER_MESSAGE" });
```

overrides the title bar completely until unset. No actionCreator wraps this
today (grepped for `SET_USER_MESSAGE` across the codebase — only the
reducer and the type union reference it), so we dispatch the raw action.
Wrapped as `setMarqueeMessage()` / `clearMarqueeMessage()` in the adapter.

**Gotcha:** this message wins over *everything* else the marquee would
normally show (e.g. drag feedback for volume/balance/position). Fine for a
game where those controls aren't otherwise in play; clear it if you ever
also want the player scrubbing volume while playing.

## Wave / spectrum visualizer

Tempting shortcut: `reducers/display.ts:153` handles a `SET_DUMMY_VIZ_DATA`
action into `state.display.dummyVizData`, and `webamp-demo/js/index.tsx`
dispatches it for screenshot mode. **Don't use this** — grepping the whole
`webamp` package, `Selectors.getDummyVizData` (`selectors.ts:802`) has no
callers. `Vis.tsx` (the actual oscilloscope/spectrum component) takes a raw
`AnalyserNode` as a prop and reads live FFT data from it directly
(`components/Vis.tsx:53-56`); it never touches `dummyVizData`. This is
either dead code or wired for a build we don't have — either way it doesn't
draw anything today.

What actually works: get the real `AnalyserNode` and feed it your own tone.

```ts
const analyser = webamp.media.getAnalyser(); // public method, media/index.ts:79
const ctx = analyser.context;                // same AudioContext Webamp uses

const oscillator = ctx.createOscillator();
const gain = ctx.createGain();
oscillator.connect(gain);
gain.connect(analyser);          // <- this is what makes the visualizer react
gain.connect(ctx.destination);   // <- this is what makes it audible
oscillator.start();
oscillator.stop(ctx.currentTime + 0.2);
```

`analyser` is a passive tap in Webamp's own audio graph (`media/index.ts`
around line 174-234: `this._balance.connect(this._analyser)`), so connecting
our own oscillator into it doesn't disturb Webamp's playback path — it's
just audio-graph fan-in. The one hard constraint is that our oscillator
**must** be created on `analyser.context`, not a separate `new
AudioContext()` — Web Audio nodes can't cross contexts. Wrapped as
`createVisualizedTone()` in the adapter.

## EQ sliders as a tuning input

`reducers/equalizer.ts` keeps slider values 0-100 keyed by band:
`preamp, 60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000`
(`equalizer.ts:11-23`). Dragging a slider in the UI dispatches
`SET_BAND_VALUE` (`equalizer.ts:32`, wired up from
`components/EqualizerWindow/Band.tsx` via `Actions.setEqBand`). This is a
real widget, already frequency-labeled, and — unlike the main seek bar —
doesn't require a loaded track to be interactive.

```ts
webamp.store.getState().equalizer.sliders[600];       // read
webamp.store.dispatch({ type: "SET_BAND_VALUE", band: 600, value: 42 }); // write
```

To react to the *player* dragging it, diff the value inside
`webamp.__onStateChange`:

```ts
let previous = getEqBandValue(webamp, 600);
webamp.__onStateChange(() => {
  const next = getEqBandValue(webamp, 600);
  if (next !== previous) {
    previous = next;
    /* ... */
  }
});
```

Wrapped as `getEqBandValue()` / `setEqBandValue()` / `onEqBandChange()` in
the adapter. `main.ts` currently wires the `600` band directly to
`SignalTunerGame.setFrequency()`, scaled from its 0-100 range to the
transmission's frequency range.

**Why not the main seek bar (`Position.tsx`)?** It requires
`Selectors.getDuration()` to be non-null (`Position.tsx:6-13`), i.e. an
actual track loaded with a real duration, and its seek action
(`SEEK_TO_PERCENT_COMPLETE`) is tangled up with real playback state
(play/pause, autoplay policies). Doable as a Phase 2+ idea — load a silent
looping track whose duration maps 1:1 to the frequency range, seek it to
represent tuning position — but it's meaningfully more moving parts than
the EQ slider for the same result. Worth revisiting if the EQ sliders turn
out to feel wrong in practice (10 discrete widgets vs. one continuous dial).

## Buttons / toggle switches

Reading and setting these is plain public API, no store access needed:

- `webamp.isShuffleEnabled()` / `webamp.toggleShuffle()`
- `webamp.isRepeatEnabled()` / `webamp.toggleRepeat()`
- `webamp.play()` / `webamp.pause()` / `webamp.stop()`

What the API *doesn't* give you is a way to notice the player flipping one,
which is what turns a switch into a game input. `onSwitchChange` and
`onSwitchCombo` add that over `onStateSlice`:

```ts
onSwitchCombo(webamp, () => startSecretTransmission());
```

`onSwitchCombo` fires once when Shuffle and Repeat are both on, and re-arms
when either goes off — the secret-transmission trigger from
`game-flows.md`. **Nothing calls it yet**; the trigger is built, the secret
transmission it should start isn't.

Shuffle and Repeat are good candidates precisely because the game has no
playlist to shuffle, so borrowing them costs nothing.

## Unlocking tracks on complete

The playlist is fundamentally a list of *playable tracks*, so it isn't used
to show decoded words (the marquee covers that) — but it's exactly right for
the game's payoff: decode a transmission, unlock a song. Two public methods
matter here (`webampLazy.tsx:329-345`):

- `webamp.appendTracks(tracks)` — adds to the end of the current playlist,
  doesn't touch what's playing.
- `webamp.setTracksToPlay(tracks)` — **replaces** the playlist and starts
  playing the first track immediately.

```ts
webamp.setTracksToPlay([
  { url: "/audio/aug_26_jazz.mp3", metaData: { artist: "Backstreet Bots", title: "Bye Bye Bandwidth" } },
]);
```

`url` is fetched relative to the page, so the file needs to live somewhere
Vite serves statically — this project puts unlockable tracks in
`public/audio/`, which Vite serves at `/audio/...` unchanged. `metaData` is
optional (Webamp will otherwise try to read ID3 tags via the injected
`requireMusicMetadata`), but supplying it directly is simpler and instant.

**Gotcha:** `setTracksToPlay` calls `play()` internally, and browsers block
`AudioContext`/media autoplay outside a user-gesture call stack. This is
safe as long as `unlockTrack()` (below) is called synchronously from
whatever handler completed the transmission — in practice, from inside
`webamp.__onStateChange`, itself firing off the EQ-drag that just happened,
which still counts as gesture-initiated. If you ever trigger completion from
something *not* gesture-adjacent (a timer, a WebSocket event), the track
will load but autoplay may silently fail — call `webamp.play()` again from
a real click if that happens.

Wrapped as `unlockTrack(webamp, track: UnlockTrack)` in the adapter, where
`UnlockTrack` (`transmissions.ts`) is `{ url, title, artist }`. Each
`Transmission` has an optional `unlockTrack` field — `runTransmission()`
(below) calls this automatically when a transmission completes.

## Decluttering the equalizer

Hiding a slider leaves its label behind: the "60 170 310 600 1K ..." row is
baked into the skin's single `EQ_WINDOW_BACKGROUND` bitmap
(`skinSprites.ts:424-429`), not separate DOM nodes — there's no selector for
"just band 60's label." So hiding bands and covering labels have to happen
together, which is why they're one function:

```ts
applyEqBandVisibility(webamp, webampNode, VISIBLE_BANDS, { hideExtras: true });
```

It hides every band not listed, paints over each orphaned label in the
skin's own `skinGenExColors.windowBackground` (read live off the store, so
it still matches if the skin changes), and optionally hides the EQ curve
graph and the ±12dB buttons.

**Patch positions are derived, not hardcoded.** Each patch is placed from
its band's live `offsetLeft`, so changing which bands are visible needs no
re-measuring. Only three constants remain: the label row's vertical position
(`LABEL_ROW_TOP`, hand-measured for the 2.91 skin) and width overrides for
"PREAMP" and "16K", whose labels aren't one slider wide. Measurement happens
*before* `display:none` is applied — `offsetLeft` reads 0 on a hidden
element.

The single source of truth for which bands show is `VISIBLE_BANDS` in
`src/cosmetics.ts`. It used to be spelled out twice — a CSS hide-list and a
hand-measured pixel array — which could silently disagree.

**Gotcha, same root cause as the `renderInto` one below:** this must run
*after* `webamp.renderInto()` resolves, and patches must be appended rather
than written as static HTML — `_render()` calls `ReactDOM.createRoot(node)`
on that exact node, wiping any children already there. Appending afterwards
survives, because React only reconciles nodes it created itself.

## Proximity tone

`createVisualizedTone` fires one-shot beeps. `createProximityTone` holds a
single oscillator open and slides it, so tuning sounds continuous instead of
chattering:

```ts
const tone = createProximityTone(webamp, { low: 180, high: 720, maxGain: 0.15 });
tone.setProximity(game.getProximity()); // 0 = cold, 1 = dead on
tone.stop();
```

Pitch rises and volume fades in as you close on a word (gain is squared, so
"far" is genuinely silent rather than quietly annoying). It's routed into
the analyser like every other game tone, so the oscilloscope reacts to it.

Enable it per-transmission with `runTransmission(..., { proximityFeedback:
true })`. **Off by default** — it changes how the game feels, which is a
taste call, not a default worth assuming.

One wrinkle worth knowing before turning it on, documented at length on
`SignalTunerGame.getProximity()`: transmission 1's bands tile the dial with
no gaps, so proximity is measured to each band's *centre* rather than its
edges — otherwise it would read "on target" everywhere and the tone would
sit pinned at maximum. The side effect is that a word decodes the moment you
*enter* its band, which is exactly where the tone reads coldest. Sparse
bands with dead air between them — the zone mechanic in `game-flows.md` —
would line the two up.

## "Screens": windows and visualizer modes

Reachable, deliberately **not wrapped** — nothing calls them yet, and a
wrapper with no caller is a guess about an API you haven't needed. Enumerated
here so picking one up later is a lookup, not a re-investigation.

**Window open / shade state** — `reducers/windows.ts` keeps `{ open, shade }`
per window, keyed by the `WINDOWS` constants (`constants.ts:15`):
`"main" | "playlist" | "equalizer" | "milkdrop"`. Relevant actions
(`reducers/windows.ts:120-151`, types at `types.ts:379-391`):

```ts
webamp.store.dispatch({ type: "TOGGLE_WINDOW", windowId: "playlist" });
webamp.store.dispatch({ type: "TOGGLE_WINDOW_SHADE_MODE", windowId: "equalizer" });
webamp.store.dispatch({ type: "CLOSE_WINDOW", windowId: "milkdrop" });
webamp.store.dispatch({ type: "SET_FOCUSED_WINDOW", window: "main" });
```

"Shade mode" is Winamp's collapsed title-bar-only view — the closest thing
to a genuinely different *screen*, and the likely building block if
transmissions ever want distinct layouts.

**Visualizer mode** — cycles bar → oscilloscope → none
(`VISUALIZER_ORDER`, `constants.ts:57`), advanced with
`{ type: "TOGGLE_VISUALIZER_STYLE" }` (`reducers/display.ts`). Worth knowing
that "none" exists: a transmission could deliberately blind the visualizer
and make the player go by ear.

Both read back through `webamp.store.getState()` and can be watched with
`onStateSlice` like anything else.

## Reusable progression flow: `runTransmission()`

Everything above is a low-level hook onto one widget. `src/runTransmission.ts`
composes all of them into the one thing that actually matters for adding
content: *play a transmission*. This is the reusable entry point — don't
re-wire `SignalTunerGame` + EQ band + marquee + tones by hand for a new
transmission, call this instead:

```ts
runTransmission(webamp, transmission, { tunerBand: 600 });
```

It wires, end to end:

| Source                          | →   | Sink                                          |
| -------------------------------- | --- | ---------------------------------------------- |
| EQ band value (0-100)            | →   | `SignalTunerGame.setFrequency()`               |
| game's `onDecode` event          | →   | decode tone (via `createVisualizedTone`) + marquee text |
| game's `onComplete` event        | →   | fanfare tones + marquee text + `unlockTrack()` (if the transmission has one) |

`main.ts` is now just: build the `webamp` instance, render it, declutter the
EQ, then one `runTransmission()` call. **To add transmission 2**: add an
entry to the `TRANSMISSIONS` array in `transmissions.ts` (with its own
`bands` and optional `unlockTrack`), then call `runTransmission()` for it —
either from `main.ts` directly (e.g. on a second EQ band, so both
transmissions are live at once) or from transmission 1's `onComplete`
callback (`runTransmission`'s `options.onComplete` fires after the built-in
fanfare/unlock, so that's the hook for "then start the next one").

`runTransmission()` returns `{ game, stop }` — call `stop()` before starting
a *different* transmission on the *same* EQ band, or both game instances
will react to that band's drags at once.

## Adapter function reference

All of `src/webampAdapter.ts`'s exports, for quick scanning — see the
sections above for the "why" behind each:

| Function | What it does |
| --- | --- |
| `onStateSlice(webamp, read, cb)` | Watch one derived value; fires only on change. Everything below that reacts to input is built on this |
| `setMarqueeMessage(webamp, text)` | Overrides the title-bar marquee |
| `clearMarqueeMessage(webamp)` | Un-overrides it |
| `getEqBandValue(webamp, band)` | Reads an EQ slider's 0-100 value |
| `setEqBandValue(webamp, band, value)` | Moves an EQ slider programmatically |
| `onEqBandChange(webamp, band, cb)` | Fires `cb` when that slider moves (player-driven or programmatic) |
| `getSwitch(webamp, "shuffle" \| "repeat")` | Reads a toggle switch |
| `onSwitchChange(webamp, which, cb)` | Fires when that switch is flipped |
| `onSwitchCombo(webamp, cb)` | Fires once when Shuffle **and** Repeat are both on; re-arms when either goes off |
| `createVisualizedTone(webamp)` | Returns `playTone(freq, duration, gain)` — one-shot beeps that animate the real visualizer |
| `createProximityTone(webamp, opts)` | Sustained tone that slides with `setProximity(0..1)`; also feeds the visualizer |
| `applyEqBandVisibility(webamp, container, bands, opts)` | Shows only the listed EQ bands, covering leftover labels at derived positions |
| `unlockTrack(webamp, track)` | Loads + plays a track (the transmission-complete reward) |

`ALL_EQ_BANDS` is also exported — every band in left-to-right draw order.

And `src/runTransmission.ts`'s `runTransmission(webamp, transmission, opts)`
sits a level above these — see the previous section.

## Known trap: `renderWhenReady` vs `renderInto`

Not visualizer/widget-specific, but bit us once already: `renderWhenReady(node)`
always mounts Webamp's windows to `document.body` (floating, centered on the
viewport) regardless of what `node` you pass — see `webampLazy.tsx:485-487`
vs. `506-538` (`parentDomNode={contained ? node : document.body}`). To embed
Webamp inside a specific container, use `renderInto(node)` instead, and give
`node` a non-`static` CSS `position` (it throws otherwise —
`webampLazy.tsx:497-502`).
