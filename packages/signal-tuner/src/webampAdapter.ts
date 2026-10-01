import type WebampLazy from "../../webamp/js/webampLazy";
import { loadMediaFile } from "../../webamp/js/actionCreators";
import type { Transmission, UnlockTrack, WordBand } from "./transmissions";
import type {
  CarrierStatus,
  LayerStatus,
  ResonanceState,
} from "./SignalTunerGame";

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
  const text = toMarqueeCharset(message);
  // Re-sending the same text would restart the scroll on every slider tick.
  if (webamp.store.getState().userInput.userMessage === text) return;
  webamp.store.dispatch({ type: "SET_USER_MESSAGE", message: text });
}

// The marquee is drawn from the skin's TEXT.BMP, which only has A-Z, digits
// and some ASCII punctuation; anything else renders as a blank.
function toMarqueeCharset(text: string): string {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[➔→]/g, ">")
    .replace(/✓/g, "OK")
    .replace(/~/g, "")
    .replace(/●/g, "*");
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
    if (ctx instanceof AudioContext && ctx.state === "suspended") {
      ctx.resume().catch((err: unknown) => {
        console.warn("AudioContext resume failed:", err);
      });
    }

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

/**
 * Plays an authentic analog radio Roger Beep when a word is decoded:
 * 1. Physical radio relay contact click (15ms switch snap).
 * 2. Punchy dual-tone radio telemetry burst (1800Hz -> 2475Hz CB/NASA Roger beep).
 * 3. Transmitter squelch gate cutoff click.
 */
export function playWordCompletedSound(
  webamp: WebampLazy,
  _rootFreq = 880
): void {
  const analyser = webamp.media.getAnalyser();
  const ctx = analyser.context;

  if (ctx instanceof AudioContext && ctx.state === "suspended") {
    ctx.resume().catch((err: unknown) => {
      console.warn("AudioContext resume failed:", err);
    });
  }

  const now = ctx.currentTime;

  // 1. Radio relay contact snap / switch click (300Hz -> 50Hz, 15ms)
  const click = ctx.createOscillator();
  const clickGain = ctx.createGain();
  click.type = "triangle";
  click.frequency.setValueAtTime(300, now);
  click.frequency.exponentialRampToValueAtTime(50, now + 0.015);
  clickGain.gain.setValueAtTime(0.2, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

  click.connect(clickGain);
  clickGain.connect(analyser);
  clickGain.connect(ctx.destination);
  click.start(now);
  click.stop(now + 0.02);

  // 2. Dual-tone radio telemetry Roger beep (Motorola/CB: 1050Hz -> 1400Hz)
  // Tone 1: 1050Hz (35ms crisp pip)
  const beep1 = ctx.createOscillator();
  const beep1Gain = ctx.createGain();
  beep1.type = "sine";
  beep1.frequency.setValueAtTime(1050, now + 0.012);
  beep1Gain.gain.setValueAtTime(0, now);
  beep1Gain.gain.setValueAtTime(0.18, now + 0.014);
  beep1Gain.gain.setValueAtTime(0.18, now + 0.045);
  beep1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  beep1.connect(beep1Gain);
  beep1Gain.connect(analyser);
  beep1Gain.connect(ctx.destination);
  beep1.start(now + 0.012);
  beep1.stop(now + 0.055);

  // Tone 2: 1400Hz (65ms sustained radio confirmation beep)
  const beep2 = ctx.createOscillator();
  const beep2Gain = ctx.createGain();
  beep2.type = "sine";
  beep2.frequency.setValueAtTime(1400, now + 0.052);
  beep2Gain.gain.setValueAtTime(0, now);
  beep2Gain.gain.setValueAtTime(0.2, now + 0.054);
  beep2Gain.gain.setValueAtTime(0.2, now + 0.115);
  beep2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.125);

  beep2.connect(beep2Gain);
  beep2Gain.connect(analyser);
  beep2Gain.connect(ctx.destination);
  beep2.start(now + 0.052);
  beep2.stop(now + 0.13);

  // 3. Squelch tail gate close (radio carrier cutoff snap)
  const tail = ctx.createOscillator();
  const tailGain = ctx.createGain();
  tail.type = "triangle";
  tail.frequency.setValueAtTime(150, now + 0.12);
  tail.frequency.exponentialRampToValueAtTime(40, now + 0.135);
  tailGain.gain.setValueAtTime(0, now);
  tailGain.gain.setValueAtTime(0.1, now + 0.12);
  tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

  tail.connect(tailGain);
  tailGain.connect(analyser);
  tailGain.connect(ctx.destination);
  tail.start(now + 0.12);
  tail.stop(now + 0.145);
}

// --- Proximity tone & radio tuner audio -----------------------------------

/**
 * A sustained analog radio tuning audio engine.
 *
 * Provides:
 * 1. Looping atmospheric static hiss that ducks as signals lock in.
 * 2. Heterodyne dual-oscillator "wrrring" tone that slides in pitch and
 *    swells in volume as you close in on an undecoded station.
 * 3. Soft carrier hum when sitting on an already-decoded station.
 *
 * All audio routes into Webamp's analyser, driving the live green oscilloscope!
 */
// The tone stays silent until the player first grabs an EQ slider, so the
// page doesn't hum on load. Capture phase runs before Webamp's own handler,
// so the slider's first value change already finds the tone armed.
let eqTouched = false;
let eqTouchListening = false;

function armOnFirstEqTouch(): void {
  if (eqTouched || eqTouchListening) {
    return;
  }
  eqTouchListening = true;
  const onPointerDown = (e: PointerEvent) => {
    if (!(e.target instanceof Element)) {
      return;
    }
    if (e.target.closest("#equalizer-window .band") == null) {
      return;
    }
    eqTouched = true;
    document.removeEventListener("pointerdown", onPointerDown, true);
  };
  document.addEventListener("pointerdown", onPointerDown, true);
}

export function createProximityTone(
  webamp: WebampLazy,
  opts: { low: number; high: number; maxGain: number }
) {
  const analyser = webamp.media.getAnalyser();
  const ctx = analyser.context;

  let osc1: OscillatorNode | null = null;
  let osc2: OscillatorNode | null = null;
  let toneGain: GainNode | null = null;

  let noiseSource: AudioBufferSourceNode | null = null;
  let noiseFilter: BiquadFilterNode | null = null;
  let noiseGain: GainNode | null = null;

  armOnFirstEqTouch();

  function ensureStarted() {
    if (!eqTouched) {
      return;
    }
    if (ctx instanceof AudioContext && ctx.state === "suspended") {
      ctx.resume().catch((err: unknown) => {
        console.warn("AudioContext resume failed:", err);
      });
    }

    if (osc1 != null) {
      return;
    }

    // 1. Proximity heterodyne whistle (dual oscillators create the classic analog radio whirr)
    osc1 = ctx.createOscillator();
    osc2 = ctx.createOscillator();
    toneGain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "triangle";
    osc1.frequency.value = opts.low;
    osc2.frequency.value = opts.low + 4; // 4Hz beat creates genuine radio tuning texture

    toneGain.gain.value = 0;

    osc1.connect(toneGain);
    osc2.connect(toneGain);
    toneGain.connect(analyser);
    toneGain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    // 2. Radio atmospheric static (bandpassed noise floor)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.05;
    }

    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1300;
    noiseFilter.Q.value = 1.1;

    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.035;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(analyser);
    noiseGain.connect(ctx.destination);
    noiseSource.start();

    // 3. NOISE layer rumble (low hum for uncleared 170 slider)
    noiseLayerOsc = ctx.createOscillator();
    noiseLayerGain = ctx.createGain();
    noiseLayerOsc.type = "sawtooth";
    noiseLayerOsc.frequency.value = 85;
    noiseLayerGain.gain.value = 0;

    const noiseLayerFilter = ctx.createBiquadFilter();
    noiseLayerFilter.type = "lowpass";
    noiseLayerFilter.frequency.value = 200;

    noiseLayerOsc.connect(noiseLayerFilter);
    noiseLayerFilter.connect(noiseLayerGain);
    noiseLayerGain.connect(analyser);
    noiseLayerGain.connect(ctx.destination);
    noiseLayerOsc.start();

    // 4. CLARITY layer hiss (sharp high-frequency hiss for uncleared 14K slider)
    clarityLayerFilter = ctx.createBiquadFilter();
    clarityLayerFilter.type = "highpass";
    clarityLayerFilter.frequency.value = 4500;
    clarityLayerGain = ctx.createGain();
    clarityLayerGain.gain.value = 0;

    noiseSource.connect(clarityLayerFilter);
    clarityLayerFilter.connect(clarityLayerGain);
    clarityLayerGain.connect(analyser);
    clarityLayerGain.connect(ctx.destination);

    // 5. Crackle: sparse impulses that read as pops and tears in the line.
    const crackleBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleData.length; i++) {
      crackleData[i] = Math.random() < 0.004 ? Math.random() * 2 - 1 : 0;
    }
    crackleSource = ctx.createBufferSource();
    crackleSource.buffer = crackleBuffer;
    crackleSource.loop = true;
    crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = "highpass";
    crackleFilter.frequency.value = 1200;
    crackleGain = ctx.createGain();
    crackleGain.gain.value = 0;
    crackleSource.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(analyser);
    crackleGain.connect(ctx.destination);
    crackleSource.start();

    // 6. Filter-lock tone: a bright pure tone that rises and swells as a
    // filter slider closes in on its target, the way the tuning whistle does
    // for the dial.
    filterOsc = ctx.createOscillator();
    filterOsc.type = "sine";
    filterOsc.frequency.value = 420;
    filterGain = ctx.createGain();
    filterGain.gain.value = 0;
    filterOsc.connect(filterGain);
    filterGain.connect(analyser);
    filterGain.connect(ctx.destination);
    filterOsc.start();
  }

  let noiseLayerOsc: OscillatorNode | null = null;
  let noiseLayerGain: GainNode | null = null;
  let clarityLayerFilter: BiquadFilterNode | null = null;
  let clarityLayerGain: GainNode | null = null;
  let crackleSource: AudioBufferSourceNode | null = null;
  let crackleFilter: BiquadFilterNode | null = null;
  let crackleGain: GainNode | null = null;
  let filterOsc: OscillatorNode | null = null;
  let filterGain: GainNode | null = null;
  let currentResonanceState: ResonanceState = {
    percent: 100,
    isCleared: true,
    hint: "",
  };
  let currentTuningPitch: number = opts.low;
  let lockStartPitch: number | null = null;
  let lastLockedPitch: number = 880;
  let currentLockingBandId: string | null = null;

  return {
    /**
     * Retrieves the resolved octave root frequency of the most recent lock.
     */
    getLastLockedPitch(): number {
      return lastLockedPitch;
    },

    /**
     * Update interference layer audio using continuous resonance coupling.
     * When resonance hits 100%, interference drops to dead silence!
     */
    setResonance(resonance: ResonanceState): void {
      ensureStarted();
      currentResonanceState = resonance;
    },

    /**
     * Interference audio, driven by how far each filter slider is from its
     * target. Static (rumble, hiss, crackle) is loud while a filter is out
     * of range and cuts to silence the moment it's cleared. A rising tone
     * also swells as the nearest filter closes in, so it can be set by ear.
     */
    setLayers(statuses: LayerStatus[]): void {
      ensureStarted();
      const t = ctx.currentTime + 0.04;
      const live = statuses.filter((s) => !s.isCleared);
      const level = (name: string) => {
        const s = live.find((l) => l.layer.name === name);
        return s == null ? 0 : 0.4 + 0.6 * Math.min(1, s.distance / 30);
      };
      const noise = level("NOISE");
      const clarity = level("CLARITY");

      noiseLayerGain?.gain.linearRampToValueAtTime(0.2 * noise, t);
      clarityLayerGain?.gain.linearRampToValueAtTime(0.17 * clarity, t);
      crackleGain?.gain.linearRampToValueAtTime(0.35 * Math.max(noise, clarity), t);

      const nearest = [...live].sort((a, b) => a.distance - b.distance)[0];
      if (nearest != null) {
        const closeness = 1 - Math.min(1, nearest.distance / 30);
        filterOsc?.frequency.linearRampToValueAtTime(420 + closeness * 560, t);
        filterGain?.gain.linearRampToValueAtTime(
          opts.maxGain * 1.2 * Math.pow(closeness, 1.4),
          t
        );
      } else {
        filterGain?.gain.linearRampToValueAtTime(0, t);
      }
    },

    /**
     * Audio cues during Hold-to-Lock:
     * Modulates UP smoothly from the arrival tuning pitch directly into the exact octave (2x)
     * while the heterodyne warble collapses into pure zero-beat unison!
     */
    setLockProgress(progress: number, band: WordBand | null): void {
      ensureStarted();
      if (!osc1 || !osc2 || !toneGain) return;
      const t = ctx.currentTime + 0.03;

      if (band != null && progress > 0) {
        // Latch onto the exact arrival tuning pitch that was playing
        if (currentLockingBandId !== band.id || lockStartPitch == null) {
          currentLockingBandId = band.id;
          lockStartPitch = Math.max(opts.low + 30, currentTuningPitch);
        }

        // Modulate UP smoothly from arrival pitch to exact octave (2x)
        const targetFreq =
          lockStartPitch * (1 + Math.pow(progress, 0.85));
        lastLockedPitch = lockStartPitch * 2;
        // Warble beat collapses from residual down to 0Hz (pure zero-beat lock)
        const beat = 10 * Math.max(0, 1 - progress);

        osc1.frequency.linearRampToValueAtTime(targetFreq, t);
        osc2.frequency.linearRampToValueAtTime(targetFreq + beat, t);

        // Volume builds solid presence as the carrier locks
        const toneVol = opts.maxGain * (0.85 + progress * 0.4);
        toneGain.gain.linearRampToValueAtTime(toneVol, t);

        // Background static ducks out completely into clean carrier silence
        const staticVol = 0.032 * Math.max(0, 1 - progress * 1.35);
        noiseGain?.gain.linearRampToValueAtTime(staticVol, t);
      } else {
        lockStartPitch = null;
        currentLockingBandId = null;
      }
    },

    /**
     * Update tuning audio based on analog RF carrier status (or raw proximity number).
     *
     * Option 1: True Analog Heterodyne & Continuous Zero-Beat:
     * - Approaching a station: heterodyne whistle glides DOWN toward the station carrier pitch.
     * - Approaching a station: difference flutter slows from 12Hz DOWN to 0Hz (pure zero-beat).
     * - Atmospheric static ducks organically as carrier signal rises.
     * - Inside decoded band: soft 140Hz station beacon.
     */
    setProximity(
      param: CarrierStatus | number,
      isDecodedOverride?: boolean
    ): void {
      ensureStarted();
      const isStatusObj = typeof param === "object" && param !== null;
      const proximity = isStatusObj ? param.proximity : param;
      const isDecoded = isStatusObj
        ? param.isDecodedStation || Boolean(isDecodedOverride)
        : Boolean(isDecodedOverride);
      const distance = isStatusObj
        ? param.distance
        : (1 - Math.min(1, Math.max(0, proximity))) * 45;
      const centerFreq = isStatusObj ? param.centerFreq : 400;
      const maxFreq = isStatusObj ? param.maxFreq || 800 : 800;

      const clamped = Math.min(1, Math.max(0, proximity));
      const t = ctx.currentTime + 0.035;

      if (isDecoded) {
        // Inside an already decoded station: soft, stable resonant carrier beacon
        currentTuningPitch = 140;
        osc1?.frequency.linearRampToValueAtTime(140, t);
        osc2?.frequency.linearRampToValueAtTime(140, t);
        toneGain?.gain.linearRampToValueAtTime(0.02, t);
        noiseGain?.gain.linearRampToValueAtTime(0.008, t);
        return;
      }

      if (clamped < 0.015) {
        // Outside station reception area: quiet ambient static floor, no carrier whistle
        currentTuningPitch = opts.low;
        toneGain?.gain.linearRampToValueAtTime(0, t);
        noiseGain?.gain.linearRampToValueAtTime(0.032, t);
        return;
      }

      // --- Option 1: True Analog Heterodyne & Continuous Zero-Beat ---
      // 1. Station base carrier frequency:
      // Unique root frequency for each station based on dial position (150Hz .. 260Hz).
      const stationCarrier = 150 + (centerFreq / maxFreq) * 110;

      // 2. Heterodyne Approach Whistle:
      // As you approach the station (distance -> 0), the whistle glides smoothly DOWN
      // directly into the station carrier pitch!
      const whistleOffset = Math.min(130, distance * 2.5);
      const whistleFreq = stationCarrier + whistleOffset;
      currentTuningPitch = stationCarrier; // Base pitch when lock begins

      // 3. Zero-Beat Flutter:
      // Heterodyne difference flutter on osc2 slows from 12Hz down to 0Hz (pure zero-beat unison)!
      const beat = Math.min(12, distance * 0.3);

      if (currentLockingBandId == null) {
        osc1?.frequency.linearRampToValueAtTime(whistleFreq, t);
        osc2?.frequency.linearRampToValueAtTime(whistleFreq + beat, t);
      }

      // 4. Tone Volume: linear ramp (pow 1.0) so distant signals aren't crushed.
      // The Gaussian field already handles the natural dropoff at distance —
      // the exponent was compounding that and making cues inaudible until too close.
      const resFactor = currentResonanceState.isCleared
        ? 1.0
        : 0.5 + 0.5 * (currentResonanceState.percent / 100);
      const toneVol = opts.maxGain * clamped * resFactor;
      toneGain?.gain.linearRampToValueAtTime(toneVol, t);

      // 5. Static Ducking:
      // As carrier locks in, atmospheric static drops down to near silence.
      const staticVol = 0.032 * (1 - clamped * 0.85);
      noiseGain?.gain.linearRampToValueAtTime(staticVol, t);
    },
    stop(): void {
      lockStartPitch = null;
      currentLockingBandId = null;
      if (osc1 != null) {
        osc1.stop();
        osc1.disconnect();
        osc1 = null;
      }
      if (osc2 != null) {
        osc2.stop();
        osc2.disconnect();
        osc2 = null;
      }
      if (toneGain != null) {
        toneGain.disconnect();
        toneGain = null;
      }
      if (noiseSource != null) {
        noiseSource.stop();
        noiseSource.disconnect();
        noiseSource = null;
      }
      if (noiseFilter != null) {
        noiseFilter.disconnect();
        noiseFilter = null;
      }
      if (noiseGain != null) {
        noiseGain.disconnect();
        noiseGain = null;
      }
      if (noiseLayerOsc != null) {
        noiseLayerOsc.stop();
        noiseLayerOsc.disconnect();
        noiseLayerOsc = null;
      }
      if (noiseLayerGain != null) {
        noiseLayerGain.disconnect();
        noiseLayerGain = null;
      }
      if (clarityLayerFilter != null) {
        clarityLayerFilter.disconnect();
        clarityLayerFilter = null;
      }
      if (clarityLayerGain != null) {
        clarityLayerGain.disconnect();
        clarityLayerGain = null;
      }
      if (crackleSource != null) {
        crackleSource.stop();
        crackleSource.disconnect();
        crackleSource = null;
      }
      if (crackleFilter != null) {
        crackleFilter.disconnect();
        crackleFilter = null;
      }
      if (crackleGain != null) {
        crackleGain.disconnect();
        crackleGain = null;
      }
      if (filterOsc != null) {
        filterOsc.stop();
        filterOsc.disconnect();
        filterOsc = null;
      }
      if (filterGain != null) {
        filterGain.disconnect();
        filterGain = null;
      }
    },
  };
}

/**
 * Activates Webamp's oscilloscope visualizer during tuning so that
 * radio signals, static, and tones draw live waveforms in the display.
 */
export function ensureVisualizerActive(webamp: WebampLazy): void {
  const state = webamp.store.getState() as any;
  if (state.display?.visualizerStyle === 0) {
    webamp.store.dispatch({ type: "TOGGLE_VISUALIZER_STYLE" });
  }
  if (state.media?.status !== "PLAYING") {
    webamp.store.dispatch({ type: "IS_PLAYING" });
  }
}

// --- Wheel and touch tuning -------------------------------------------------

// Moves the EQ sliders without having to grab a handle. One slider is
// "selected" at a time (outlined via data-selected; `defaultBand` until the
// player picks another).
// - Wheel / trackpad: over a slider it moves that one, elsewhere over the
//   equalizer it moves the selected one. One notch moves a filter 2 units and
//   the dial 1 (8 dial frequencies); Shift makes steps 4x bigger.
// - Touch: a finger on a slider's column selects it and a swipe up or down
//   moves it, relative to where the swipe began (no jump to the finger). A
//   swipe on empty equalizer space moves the selected slider; tapping empty
//   space selects the nearest one. css/style.css turns off Webamp's own
//   handling of the sliders under html.touch so the two don't fight.
export function enableManualTuning(
  webamp: WebampLazy,
  bands: EqBand[],
  defaultBand: EqBand,
  { dialBand }: { dialBand: EqBand }
): () => void {
  let selected: EqBand = defaultBand;

  const select = (band: EqBand) => {
    selected = band;
    for (const b of bands) {
      const el = bandElement(b);
      if (el == null) continue;
      if (b === band) el.dataset.selected = "on";
      else delete el.dataset.selected;
    }
  };
  select(defaultBand);

  const bandAt = (target: EventTarget | null): EqBand | null => {
    const el = target instanceof Element ? target.closest(".band") : null;
    return bands.find((band) => bandElement(band) === el) ?? null;
  };

  const onPointerDown = (e: PointerEvent) => {
    const band = bandAt(e.target);
    if (band != null) select(band);
  };
  document.addEventListener("pointerdown", onPointerDown, true);

  const onWheel = (e: WheelEvent) => {
    if (!(e.target instanceof Element) || e.target.closest("#equalizer-window") == null) {
      return;
    }
    e.preventDefault();
    const band = bandAt(e.target) ?? selected;
    select(band);
    // Scroll up raises the slider. deltaY is ~100 per mouse notch and much
    // smaller per trackpad event, so scale it instead of counting events.
    const perNotch = band === dialBand ? 1 : 2;
    const delta = (-e.deltaY / 100) * perNotch * (e.shiftKey ? 4 : 1);
    const value = getEqBandValue(webamp, band) + delta;
    setEqBandValue(webamp, band, Math.max(0, Math.min(100, value)));
    // Counts as touching a slider, so the tuning audio can start.
    eqTouched = true;
  };
  document.addEventListener("wheel", onWheel, { passive: false });

  // Finger travel for a slider's full range, in CSS px. The dial is longer so
  // a word's narrow band takes a deliberate move to cross.
  const swipeSpan = (band: EqBand) => (band === dialBand ? 220 : 150);
  const tapSlop = 8;
  // A finger this close to a slider's column counts as being on it.
  const columnPad = 16;

  type Swipe = {
    id: number;
    band: EqBand;
    tapBand: EqBand | null;
    startY: number;
    startValue: number;
    moved: boolean;
  };
  let swipe: Swipe | null = null;

  const onTouchDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || swipe != null) return;
    if (!(e.target instanceof Element)) return;
    const eq = e.target.closest("#equalizer-window");
    if (eq == null || e.target.closest(".title-bar") != null) return;
    // The nearest element with an id is a button, the graph, a slider...
    // unless it is the window itself.
    const control = e.target.closest("[id]");
    if (control != null && control !== eq && eq.contains(control)) return;

    let nearest: { band: EqBand; dx: number; half: number } | null = null;
    for (const band of bands) {
      const el = bandElement(band);
      if (el == null) continue;
      const r = el.getBoundingClientRect();
      const dx = Math.abs(e.clientX - (r.left + r.width / 2));
      if (nearest == null || dx < nearest.dx) {
        nearest = { band, dx, half: r.width / 2 };
      }
    }
    if (nearest == null) return;

    const direct = nearest.dx <= nearest.half + columnPad;
    const band = direct ? nearest.band : selected;
    if (direct) select(band);
    eqTouched = true;
    swipe = {
      id: e.pointerId,
      band,
      tapBand: direct ? null : nearest.band,
      startY: e.clientY,
      startValue: getEqBandValue(webamp, band),
      moved: false,
    };
  };

  const onTouchMove = (e: PointerEvent) => {
    if (swipe == null || e.pointerId !== swipe.id) return;
    if (!swipe.moved) {
      if (Math.abs(e.clientY - swipe.startY) < tapSlop) return;
      swipe.moved = true;
      // Start counting from here so crossing the slop doesn't jump the value.
      swipe.startY = e.clientY;
    }
    const value =
      swipe.startValue - ((e.clientY - swipe.startY) / swipeSpan(swipe.band)) * 100;
    setEqBandValue(webamp, swipe.band, Math.max(0, Math.min(100, value)));
  };

  const onTouchEnd = (e: PointerEvent) => {
    if (swipe == null || e.pointerId !== swipe.id) return;
    if (!swipe.moved && swipe.tapBand != null) select(swipe.tapBand);
    swipe = null;
  };

  document.addEventListener("pointerdown", onTouchDown);
  document.addEventListener("pointermove", onTouchMove);
  document.addEventListener("pointerup", onTouchEnd);
  document.addEventListener("pointercancel", onTouchEnd);

  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("pointerdown", onTouchDown);
    document.removeEventListener("pointermove", onTouchMove);
    document.removeEventListener("pointerup", onTouchEnd);
    document.removeEventListener("pointercancel", onTouchEnd);
  };
}

// Winamp's windows are normally draggable by their title bars and plain
// backgrounds. On a touch screen a stray swipe would pull the player apart, so
// finger drags on them are ignored; the game positions the windows itself.
// Same test as Webamp's WindowManager: the touched element is itself marked
// "draggable". Mouse drags still work, so a laptop keeps its windows movable.
export function lockWindowDragOnTouch(): void {
  let lastTouchAt = -Infinity;
  const isDragHandle = (e: Event) =>
    e.target instanceof Element && e.target.classList.contains("draggable");
  document.addEventListener(
    "touchstart",
    (e) => {
      lastTouchAt = e.timeStamp;
      if (isDragHandle(e)) e.stopPropagation();
    },
    { capture: true, passive: true }
  );
  // A touch is followed by an emulated mousedown.
  document.addEventListener(
    "mousedown",
    (e) => {
      if (e.timeStamp - lastTouchAt < 1000 && isDragHandle(e)) e.stopPropagation();
    },
    true
  );
}

// --- Equalizer layout ------------------------------------------------------

// Each band is its own absolutely positioned element (its groove sprite
// belongs to the element, not the EQ background), so bands can be hidden and
// moved freely. Labels, dB marks and tick marks are part of the skin's
// EQMAIN.BMP, so the skin has to be drawn for the same layout.

// Dims a slider that has no job in the current transmission (data-idle).
export function setBandIdle(band: EqBand, idle: boolean): void {
  const el = bandElement(band);
  if (el == null) return;
  if (idle) el.dataset.idle = "on";
  else delete el.dataset.idle;
}

// Recolours a slider's groove by closeness, 0 (far) to 1 (on target), or
// null for Webamp's normal by-value colour. The groove stays on its green
// frame and css/style.css rotates its hue by --groove-hue, so it shifts
// continuously from violet (far) through blue and cyan to green (on target).
export function setBandTint(band: EqBand, closeness: number | null): void {
  const el = bandElement(band);
  if (el == null) return;
  if (closeness == null) {
    el.style.removeProperty("--groove-hue");
    delete el.dataset.tint;
    return;
  }
  const far = 1 - Math.min(1, Math.max(0, closeness));
  el.style.setProperty("--groove-hue", `${Math.round(far * 170)}deg`);
  el.dataset.tint = "on";
}

function bandElement(band: EqBand): HTMLElement | null {
  const id = band === "preamp" ? "preamp" : `band-${band}`;
  return document.getElementById(id);
}

/**
 * Shows only the bands in `layout`, moved to the given left offsets (px in
 * the 1x EQ window), and hides every other band.
 *
 * Must run *after* `webamp.renderInto()` resolves.
 */
export function layoutEqBands(
  layout: Partial<Record<EqBand, number>>,
  { hideExtras = true }: { hideExtras?: boolean } = {}
): void {
  for (const band of ALL_EQ_BANDS) {
    const el = bandElement(band);
    if (el == null) continue;
    const left = layout[band];
    if (left == null) {
      el.style.display = "none";
    } else {
      el.style.left = `${left}px`;
    }
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

// --- Unlocking tracks -----------------------------------------------------

// Loads a transmission's reward track onto the real player and starts it
// playing - the "decode a transmission, unlock a song" payoff.
// Swaps the transmission's playlist row for the real song and plays it,
// leaving every other row where it is. (`setTracksToPlay` would replace the
// whole playlist, and the playlist doubles as the transmission list.)
// `play` must happen inside a user-gesture call stack - in practice the
// EQ drag that completed the transmission - or autoplay policy blocks it.
export function unlockTrack(
  webamp: WebampLazy,
  index: number,
  track: UnlockTrack
): void {
  const state = webamp.store.getState();
  const oldId = state.playlist.trackOrder[index];
  if (oldId != null && state.tracks[oldId]?.url === track.url) {
    webamp.store.dispatch({ type: "PLAY_TRACK", id: oldId });
    return;
  }
  if (oldId != null) {
    webamp.store.dispatch({ type: "REMOVE_TRACKS", ids: [oldId] });
  }
  webamp.store.dispatch(
    loadMediaFile(
      { url: track.url, metaData: { artist: track.artist, title: track.title } },
      "PLAY",
      index
    )
  );
}

// Puts an already-earned song on its row at page load. Unlike unlockTrack it
// doesn't play or fetch the file; that waits until the row is played.
export function restoreUnlockedTrack(
  webamp: WebampLazy,
  index: number,
  track: UnlockTrack
): void {
  const oldId = webamp.store.getState().playlist.trackOrder[index];
  if (oldId != null) {
    webamp.store.dispatch({ type: "REMOVE_TRACKS", ids: [oldId] });
  }
  webamp.store.dispatch(
    loadMediaFile(
      {
        url: track.url,
        duration: track.lengthSeconds,
        metaData: { artist: track.artist, title: track.title },
      },
      "NONE",
      index
    )
  );
}

// A tiny silent WAV, used as the url for rows that aren't unlocked yet so
// Webamp never fetches (or plays) the real song before it's earned.
let silentUrl: string | null = null;
export function silentTrackUrl(): string {
  if (silentUrl != null) {
    return silentUrl;
  }
  const samples = 800;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  silentUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  return silentUrl;
}

// --- Window placement ----------------------------------------------------

export type WebampWindowId = "main" | "equalizer" | "playlist";

// `renderInto` centres Webamp in its container; this moves the windows to
// absolute positions inside it afterwards.
export function placeWindows(
  webamp: WebampLazy,
  positions: Partial<Record<WebampWindowId, { x: number; y: number }>>
): void {
  webamp.store.dispatch({
    type: "UPDATE_WINDOW_POSITIONS",
    positions,
    absolute: true,
  });
}

export function isDoubleSize(webamp: WebampLazy): boolean {
  return webamp.store.getState().display.doubled;
}

export function setDoubleSize(webamp: WebampLazy, doubled: boolean): void {
  if (isDoubleSize(webamp) !== doubled) {
    webamp.store.dispatch({ type: "TOGGLE_DOUBLESIZE_MODE" });
  }
}

// The playlist doesn't double with the other windows; it resizes in steps of
// 25px wide and 29px tall. `wide` stretches it to a double-size main window's
// width; each `heightSteps` adds about two rows (the default shows four, and
// the game has one row per transmission).
export function sizePlaylist(
  webamp: WebampLazy,
  wide: boolean,
  heightSteps: number
): void {
  webamp.store.dispatch({
    type: "WINDOW_SIZE_CHANGED",
    windowId: "playlist",
    size: [wide ? 11 : 0, heightSteps],
  });
}

// Winamp's skin CSS draws the mono/stereo lights unlit while stopped. The
// game is always stopped and uses stereo as its LOCK light, so this copies
// the skin's lit sprites into a rule that also applies when stopped. The
// sprites live in Webamp's injected stylesheets (the default skin's aren't in
// the store), so it reads them from there, again after every skin change.
export function keepChannelLightsLit(webamp: WebampLazy): () => void {
  const style = document.createElement("style");
  document.head.appendChild(style);

  const litSprite = (id: string): string | null => {
    let found: string | null = null;
    for (const sheet of [...document.styleSheets]) {
      if (sheet.ownerNode === style) continue;
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet (e.g. the web font)
      }
      for (const rule of [...rules]) {
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText === `#webamp .media-info #${id}.selected` &&
          rule.style.backgroundImage
        ) {
          found = rule.style.backgroundImage;
        }
      }
    }
    return found;
  };

  const render = () => {
    style.textContent = ["stereo", "mono"]
      .map((id) => {
        const sprite = litSprite(id);
        return sprite == null
          ? ""
          : `#webamp .stop .media-info #${id}.selected.selected { background-image: ${sprite}; }`;
      })
      .join("\n");
  };

  render();
  // Webamp injects the new skin's CSS after the state change, so read on the
  // next tick.
  const unsubscribe = onStateSlice(
    webamp,
    (w) => w.store.getState().display.skinImages,
    () => setTimeout(render, 0)
  );
  return () => {
    unsubscribe();
    style.remove();
  };
}

// --- Readouts: kbps / kHz / mono-stereo / time / EQ ON ---------------------

// Webamp owns these displays for real playback, and overwrites them whenever
// a track loads, stops or reads its tags. The keeper holds what the game
// wants shown and quietly puts it back after each of those, except while a
// track is actually playing (then the readouts belong to the music).
export interface PlayerReadouts {
  kbps: number; // 0-999
  khz: number; // 0-99
  stereo: boolean;
  timeSeconds: number;
  eqOn: boolean;
}

export interface TrackLabel {
  artist: string;
  title: string;
}

export interface ReadoutKeeper {
  set(readouts: Partial<PlayerReadouts>): void;
  setTrackLabel(index: number, label: TrackLabel): void;
  stop(): void;
}

// Same formatting Webamp's tracks reducer applies, so the keeper can tell
// whether the display already shows what it wants without looping.
function formatKbps(bitrate: number): string {
  const n = Math.round(bitrate / 1000);
  let out = String(n);
  if (n <= 100) out = String(n).padStart(3, " ");
  if (n >= 1000) out = `${String(n).slice(0, 2)}H`;
  if (n >= 10000) out = `${String(n).slice(0, 1).padStart(2, " ")}C`;
  return out;
}

function formatKhz(sampleRate: number): string {
  const n = Math.round(sampleRate / 1000);
  let out = String(n);
  if (n <= 10) out = String(n).slice(0, 1).padStart(2, " ");
  if (n >= 100) out = String(n).slice(1, 3);
  return out;
}

export function createReadoutKeeper(webamp: WebampLazy): ReadoutKeeper {
  let desired: PlayerReadouts | null = null;
  const labels = new Map<number, TrackLabel>();
  let applying = false;

  const apply = () => {
    if (applying) {
      return;
    }
    applying = true;
    try {
      const { dispatch } = webamp.store;
      const state = webamp.store.getState();

      labels.forEach((label, index) => {
        const id = state.playlist.trackOrder[index];
        const track = id == null ? null : state.tracks[id];
        if (
          id != null &&
          track != null &&
          (track.title !== label.title || track.artist !== label.artist)
        ) {
          dispatch({ type: "SET_MEDIA_TAGS", id, ...label, album: track.album });
        }
      });

      const playing = state.media.status === "PLAYING";
      if (playing) {
        // The game's slider positions would colour the music.
        if (state.equalizer.on) {
          dispatch({ type: "SET_EQ_OFF" });
        }
        return;
      }
      if (desired == null) {
        return;
      }

      const id = state.playlist.currentTrack;
      const track = id == null ? null : state.tracks[id];
      const bitrate = desired.kbps * 1000;
      const sampleRate = desired.khz * 1000;
      const channels = desired.stereo ? 2 : 1;
      if (
        id != null &&
        track != null &&
        (track.kbps !== formatKbps(bitrate) ||
          track.khz !== formatKhz(sampleRate) ||
          track.channels !== channels)
      ) {
        dispatch({
          type: "SET_MEDIA_TAGS",
          id,
          title: track.title ?? "",
          artist: track.artist ?? "",
          album: track.album ?? undefined,
          bitrate,
          sampleRate,
          numberOfChannels: channels,
        });
      }
      if (state.media.timeElapsed !== desired.timeSeconds) {
        dispatch({ type: "UPDATE_TIME_ELAPSED", elapsed: desired.timeSeconds });
      }
      if (state.equalizer.on !== desired.eqOn) {
        dispatch({ type: desired.eqOn ? "SET_EQ_ON" : "SET_EQ_OFF" });
      }
    } finally {
      applying = false;
    }
  };

  const unsubscribe = webamp.__onStateChange(apply);

  return {
    set(readouts) {
      desired = {
        kbps: 0,
        khz: 0,
        stereo: false,
        timeSeconds: 0,
        eqOn: false,
        ...desired,
        ...readouts,
      };
      apply();
    },
    setTrackLabel(index, label) {
      labels.set(index, label);
      apply();
    },
    stop: unsubscribe,
  };
}

// --- Toggle "switches" ---------------------------------------------------

// Shuffle/Repeat are already exposed as boolean toggles on the public
// WebampLazy API (no need to touch the store directly):
//   webamp.isShuffleEnabled() / webamp.toggleShuffle()
//   webamp.isRepeatEnabled() / webamp.toggleRepeat()
// These are documented here rather than wrapped, since which switch means
// what in the game (e.g. a "hint mode" toggle) is a design decision, not an
// adapter concern.

// --- Player UI visual cues ------------------------------------------------

export interface PlayerUiCueState {
  transmission: Transmission;
  layers: LayerStatus[];
  resonance: ResonanceState;
  lockedWord: string | null;
  lockBand: WordBand | null;
  lockProgress: number;
  decodedBandIds: Set<string>;
  dialBand?: EqBand;
}

export function updatePlayerUiCues(
  _webamp: WebampLazy,
  _state: PlayerUiCueState
): void {
  // Keep the Webamp player completely clean without foreign DOM overlays.
  // Feedback is driven natively through the live oscilloscope waveform and marquee display.
  clearPlayerUiCues();
}

export function clearPlayerUiCues(): void {
  const eqWindow = document.getElementById("equalizer-window");
  if (!eqWindow) return;
  eqWindow
    .querySelectorAll(
      ".eq-ui-cue, #eq-player-hud, .eq-target-bracket, .eq-order-badge, .eq-slider-backdrop, #eq-station-pips, .eq-target-zone"
    )
    .forEach((el) => el.remove());

  const dialBandEl = document.getElementById("band-600");
  const handle = dialBandEl?.querySelector(".slider-handle");
  if (handle) {
    handle.classList.remove("is-locking");
  }
}

// Backward-compatible alias
export const clearTargetZoneOverlays = clearPlayerUiCues;
