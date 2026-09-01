import { EqBand } from "./webampAdapter";

// ---------------------------------------------------------------------------
// The knobs worth turning. Everything cosmetic that isn't tied to gameplay
// logic lives here so it can be changed without reading the rest of the code.
// ---------------------------------------------------------------------------

// Which EQ sliders stay on screen. Every other band is hidden and its
// leftover painted-on label is covered up — both derived from this one list,
// so adding or removing a band here is the whole edit. Order doesn't matter.
//
// Valid: "preamp", 60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000.
export const VISIBLE_BANDS: EqBand[] = [170, 600, 14000];

// Hide the EQ's curve preview and its +12/0/-12dB shortcut buttons. They're
// audio-shaping controls, and the EQ isn't shaping audio here.
export const HIDE_EQ_EXTRAS = true;

// Tones, in Hz. These are fed to `createVisualizedTone`, so they drive the
// real oscilloscope as well as the speakers.
export const TONES = {
  // Fired each time a word is decoded.
  decode: 880,
  // Played in sequence when a transmission completes. C5 / E5 / G5.
  fanfare: [523.25, 659.25, 783.99],
  fanfareStepMs: 120,
  // Range the proximity tone sweeps between as you close in on a word.
  // Only used when `proximityFeedback` is enabled — see runTransmission.ts.
  proximityLow: 180,
  proximityHigh: 720,
};

// Peak gain for game tones, 0–1. Webamp's own volume slider does not affect
// these (they're mixed in past it), so keep it modest.
export const TONE_GAIN = 0.15;
