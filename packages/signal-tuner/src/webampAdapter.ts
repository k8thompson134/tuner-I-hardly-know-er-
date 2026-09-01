import type WebampLazy from "../../webamp/js/webampLazy";
import type { UnlockTrack } from "./transmissions";

// Thin helpers over Webamp's public surface (webamp.store, webamp.media) so
// the game can read/write the *real* Winamp widgets instead of building
// parallel UI. This keeps the game and Webamp cleanly separated — the game
// doesn't know React/Redux, and the player doesn't know game logic.

export type EqBand =
  | "preamp"
  | 60
  | 170
  | 310
  | 600
  | 1000
  | 3000
  | 6000
  | 12000
  | 14000
  | 16000;

// Every EQ band, in the left-to-right order Winamp draws them.
export const ALL_EQ_BANDS: EqBand[] = [
  "preamp",
  60,
  170,
  310,
  600,
  1000,
  3000,
  6000,
  12000,
  14000,
  16000,
];

// --- State subscription primitive ---------------------------------------

// Watch one derived value and call `cb` only when it actually changes.
// Webamp's store fires on every action, so everything that reacts to player
// input goes through here rather than hand-rolling its own diff.
// Returns an unsubscribe function.
export function onStateSlice<T>(
  webamp: WebampLazy,
  read: (webamp: WebampLazy) => T,
  cb: (value: T, previous: T) => void
): () => void {
  let previous = read(webamp);
  return webamp.__onStateChange(() => {
    const next = read(webamp);
    if (next !== previous) {
      const was = previous;
      previous = next;
      cb(next, was);
    }
  });
}

// --- Title bar / marquee text -----------------------------------------

// Overrides the scrolling title-bar text (normally "Winamp 2.91" or the
// current track). Takes priority over everything else Marquee.tsx would
// otherwise show. Dispatches the raw action directly since, as of this
// writing, there's no actionCreators wrapper for it (same pattern the demo
// app uses for e.g. DISABLE_MARQUEE).
export function setMarqueeMessage(webamp: WebampLazy, message: string): void {
  webamp.store.dispatch({ type: "SET_USER_MESSAGE", message });
}

export function clearMarqueeMessage(webamp: WebampLazy): void {
  webamp.store.dispatch({ type: "UNSET_USER_MESSAGE" });
}

// --- Equalizer sliders as tuner input -----------------------------------

// EQ band state lives at store.getState().equalizer.sliders[band], 0-100.
export function getEqBandValue(webamp: WebampLazy, band: EqBand): number {
  return (webamp.store.getState() as any).equalizer.sliders[band];
}

// Moves an EQ slider programmatically (e.g. to visually confirm a decode).
export function setEqBandValue(
  webamp: WebampLazy,
  band: EqBand,
  value: number
): void {
  webamp.store.dispatch({ type: "SET_BAND_VALUE", band, value });
}

// Calls `cb` whenever the player's EQ slider for `band` moves - including
// when the *player* drags it with their mouse. This is how a real Winamp
// widget becomes a game input: wire the "600" band (or any other) to
// SignalTunerGame.setFrequency and the EQ slider IS the tuning dial.
// Returns an unsubscribe function.
export function onEqBandChange(
  webamp: WebampLazy,
  band: EqBand,
  cb: (value: number) => void
): () => void {
  return onStateSlice(webamp, (w) => getEqBandValue(w, band), cb);
}

// --- Toggle switches as game input --------------------------------------

// Shuffle and Repeat are real, clickable Winamp switches that the game
// doesn't otherwise need - which makes them free inputs. Reading them is
// public API; these wrappers exist so a combo can be *watched* the same way
// an EQ band is, without each caller re-deriving the diff.
export type WinampSwitch = "shuffle" | "repeat";

export function getSwitch(webamp: WebampLazy, which: WinampSwitch): boolean {
  return which === "shuffle"
    ? webamp.isShuffleEnabled()
    : webamp.isRepeatEnabled();
}

export function onSwitchChange(
  webamp: WebampLazy,
  which: WinampSwitch,
  cb: (enabled: boolean) => void
): () => void {
  return onStateSlice(webamp, (w) => getSwitch(w, which), cb);
}

// Fires once each time both switches become enabled together, and re-arms
// when either is switched back off. Intended for optional secret features
// that activate when the player hits a specific button combo.
export function onSwitchCombo(
  webamp: WebampLazy,
  cb: () => void
): () => void {
  return onStateSlice(
    webamp,
    (w) => getSwitch(w, "shuffle") && getSwitch(w, "repeat"),
    (bothOn) => {
      if (bothOn) {
        cb();
      }
    }
  );
}

// --- Wave / spectrum visualizer -----------------------------------------

// The built-in oscilloscope/spectrum (Vis.tsx) reads live FFT data from
// webamp.media.getAnalyser() - it is NOT driven by Redux state (the
// SET_DUMMY_VIZ_DATA action exists but nothing in the current UI reads it).
// To make the real wave display react to our game's tones, we have to
// generate them on the *same* AudioContext as that analyser and fan our
// signal into it alongside the audible output.
//
// Call this once; it returns a function you can call repeatedly to play a
// short tone that the visualizer will actually draw.
export function createVisualizedTone(webamp: WebampLazy) {
  const analyser = webamp.media.getAnalyser();
  const ctx = analyser.context;

  return function playTone(
    frequency: number,
    durationSeconds = 0.2,
    peakGain = 0.15
  ): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(peakGain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + durationSeconds
    );

    oscillator.connect(gain);
    gain.connect(analyser); // feeds the visualizer
    gain.connect(ctx.destination); // makes it audible

    oscillator.start();
    oscillator.stop(ctx.currentTime + durationSeconds);
  };
}

// --- Proximity tone -------------------------------------------------------

/**
 * A sustained "you're getting warmer" tone, as if tuning a physical radio.
 *
 * Unlike `createVisualizedTone`'s one-shot beeps this holds a single
 * oscillator open and slides it, so tuning sounds continuous instead of
 * chattering. Feed `setProximity` a 0–1 closeness (1 = dead on target);
 * pitch rises and it gets louder as you close in. Call `stop()` when the
 * transmission ends.
 *
 * Routed into Webamp's analyser like every other game tone, so the real
 * oscilloscope reacts to it.
 */
export function createProximityTone(
  webamp: WebampLazy,
  opts: { low: number; high: number; maxGain: number }
) {
  const analyser = webamp.media.getAnalyser();
  const ctx = analyser.context;

  let oscillator: OscillatorNode | null = null;
  let gain: GainNode | null = null;

  function ensureStarted() {
    if (oscillator != null) {
      return;
    }
    oscillator = ctx.createOscillator();
    gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = opts.low;
    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(analyser);
    gain.connect(ctx.destination);
    oscillator.start();
  }

  return {
    /** `proximity` is 0 (far) to 1 (on target). */
    setProximity(proximity: number): void {
      ensureStarted();
      const clamped = Math.min(1, Math.max(0, proximity));
      // Short ramps rather than instant jumps, so dragging doesn't click.
      const t = ctx.currentTime + 0.02;
      oscillator!.frequency.linearRampToValueAtTime(
        opts.low + (opts.high - opts.low) * clamped,
        t
      );
      // Silent when far away; the tone fades in as a reward for getting warm.
      gain!.gain.linearRampToValueAtTime(opts.maxGain * clamped * clamped, t);
    },
    stop(): void {
      if (oscillator == null) {
        return;
      }
      oscillator.stop();
      oscillator.disconnect();
      gain?.disconnect();
      oscillator = null;
      gain = null;
    },
  };
}

// --- Decluttering the equalizer -----------------------------------------

// Hiding a band leaves its label behind: the "60 170 310 600 1K ..." row is
// baked into the skin's single EQ_WINDOW_BACKGROUND bitmap
// (skinSprites.ts:424), not separate DOM nodes, so there's no selector for
// one band's label alone. We cover the orphaned ones with rectangles painted
// in the skin's own window-background color.
//
// Positions are *derived* from each band's live layout rather than
// hardcoded, so changing which bands are visible needs no re-measuring. Only
// the row's vertical placement and two label-width quirks are constants.
const LABEL_ROW_TOP = 220; // px from the container top, for the 2.91 skin
const LABEL_ROW_HEIGHT = 9;
const LABEL_INSET = 2; // labels start ~2px left of their slider
const LABEL_WIDTH = 18; // one band's horizontal pitch

// Labels that aren't the standard width: "PREAMP" is a word at the far left,
// "16K" overhangs its slider.
const LABEL_OVERRIDES: Partial<Record<string, { left: number; width: number }>> =
  {
    preamp: { left: 0, width: 48 },
    "16000": { width: 22 } as { left: number; width: number },
  };

function bandElement(band: EqBand): HTMLElement | null {
  const id = band === "preamp" ? "preamp" : `band-${band}`;
  return document.getElementById(id);
}

/**
 * Show only `visibleBands` in the equalizer, hiding every other slider and
 * covering its leftover label.
 *
 * `container` must be the node passed to `webamp.renderInto()`, and this must
 * run *after* that promise resolves: `_render` calls
 * `ReactDOM.createRoot(node)` on that node, wiping any children already
 * there. Appending afterwards survives, because React only reconciles nodes
 * it created itself.
 */
export function applyEqBandVisibility(
  webamp: WebampLazy,
  container: HTMLElement,
  visibleBands: EqBand[],
  { hideExtras = true }: { hideExtras?: boolean } = {}
): void {
  const state = webamp.store.getState() as any;
  const background: string =
    state.display.skinGenExColors?.windowBackground ?? "rgb(56, 55, 87)";

  const visible = new Set<EqBand>(visibleBands);

  for (const band of ALL_EQ_BANDS) {
    const el = bandElement(band);
    if (el == null || visible.has(band)) {
      continue;
    }

    // Measure before hiding — offsetLeft is 0 once display:none applies.
    const override = LABEL_OVERRIDES[String(band)];
    const left = override?.left ?? el.offsetLeft - LABEL_INSET;
    const width = override?.width ?? LABEL_WIDTH;

    el.style.display = "none";
    container.appendChild(
      labelPatch({ left, width, top: LABEL_ROW_TOP, background })
    );
  }

  if (hideExtras) {
    for (const id of ["eqGraph", "plus12db", "zerodb", "minus12db"]) {
      const el = document.getElementById(id);
      if (el != null) {
        el.style.display = "none";
      }
    }
  }
}

function labelPatch(opts: {
  left: number;
  width: number;
  top: number;
  background: string;
}): HTMLElement {
  const patch = document.createElement("div");
  patch.className = "eq-label-patch";
  patch.style.position = "absolute";
  patch.style.top = `${opts.top}px`;
  patch.style.height = `${LABEL_ROW_HEIGHT}px`;
  patch.style.left = `${opts.left}px`;
  patch.style.width = `${opts.width}px`;
  patch.style.background = opts.background;
  patch.style.zIndex = "10";
  patch.style.pointerEvents = "none";
  return patch;
}

// --- Unlocking tracks -----------------------------------------------------

// Loads a transmission's reward track onto the real player and starts it
// playing - the "decode a transmission, unlock a song" payoff.
// `setTracksToPlay` (public API) replaces the playlist and autoplays the
// first track; that's a real `play()` call, so this must be invoked
// synchronously inside a user-gesture call stack (e.g. from the EQ-drag
// handler that completed the transmission) or the browser's autoplay
// policy will block it.
export function unlockTrack(webamp: WebampLazy, track: UnlockTrack): void {
  webamp.setTracksToPlay([
    { url: track.url, metaData: { artist: track.artist, title: track.title } },
  ]);
}

// --- Toggle "switches" ---------------------------------------------------

// Shuffle/Repeat are already exposed as boolean toggles on the public
// WebampLazy API (no need to touch the store directly):
//   webamp.isShuffleEnabled() / webamp.toggleShuffle()
//   webamp.isRepeatEnabled() / webamp.toggleRepeat()
// These are documented here rather than wrapped, since which switch means
// what in the game (e.g. a "hint mode" toggle) is a design decision, not an
// adapter concern.
