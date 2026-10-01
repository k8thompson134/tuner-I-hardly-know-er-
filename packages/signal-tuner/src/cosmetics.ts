import { EqBand } from "./webampAdapter";

// ---------------------------------------------------------------------------
// The knobs worth turning. Everything cosmetic that isn't tied to gameplay
// logic lives here so it can be changed without reading the rest of the code.
// ---------------------------------------------------------------------------

// Which EQ sliders stay on screen, and where: band -> left edge in px inside
// the 275px-wide EQ window (Winamp's own pitch is 18px; these are spread out
// as NOISE | TUNE | CLARITY). Every band not listed is hidden.
//
// The skin paints the wells, ticks and labels for exactly these positions:
// keep EQ_SLIDER_LEFT in scripts/build_placeholder_skin.py in step.
//
// Valid bands: "preamp", 60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000.
export const EQ_LAYOUT: Partial<Record<EqBand, number>> = {
  170: 60,
  600: 130,
  14000: 200,
};

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
  // Lower, warm analog range (110–320Hz) so hold-to-lock peaks comfortably in the mid-range.
  proximityLow: 110,
  proximityHigh: 320,
};

// Peak gain for game tones, 0–1. Webamp's own volume slider does not affect
// these (they're mixed in past it), so keep it modest.
export const TONE_GAIN = 0.28;
