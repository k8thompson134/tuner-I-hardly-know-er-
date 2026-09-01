import type WebampLazy from "../../webamp/js/webampLazy";
import { SignalTunerGame } from "./SignalTunerGame";
import { Transmission } from "./transmissions";
import { TONES, TONE_GAIN } from "./cosmetics";
import {
  EqBand,
  createProximityTone,
  createVisualizedTone,
  getEqBandValue,
  onEqBandChange,
  setMarqueeMessage,
  unlockTrack,
} from "./webampAdapter";

export interface RunTransmissionOptions {
  // Which EQ band drives this transmission's frequency. The EQ slider is
  // used instead of the seek bar because real-time slider changes feed the
  // game directly; seek-bar changes don't fire game callbacks the same way.
  tunerBand: EqBand;
  // Hold a tone that rises in pitch and volume as the dial nears an
  // undecoded word — like tuning a physical radio where the signal gets
  // stronger as you close in. Off by default: it's a game-feel preference.
  proximityFeedback?: boolean;
  onComplete?: (transmission: Transmission) => void;
}

export interface RunningTransmission {
  game: SignalTunerGame;
  // Unsubscribes from EQ band changes and silences any proximity tone. Call
  // this before starting a different transmission on the same band, or the
  // old game instance will keep reacting to slider moves alongside the new.
  stop: () => void;
}

// The single reusable entry point for "play a transmission": wires one
// Transmission's full progression loop onto a live Webamp instance -
//   EQ band value  --------->  SignalTunerGame.setFrequency
//   decode event   --------->  tone (through the real visualizer) + marquee text
//   complete event --------->  fanfare + marquee text + unlockTrack()
// Call it once per transmission. To add transmission 2, add it to
// transmissions.ts and call runTransmission() again (typically from the
// first one's onComplete, or from whatever triggers progression) - nothing
// here is hardcoded to a single transmission.
export function runTransmission(
  webamp: WebampLazy,
  transmission: Transmission,
  { tunerBand, proximityFeedback = false, onComplete }: RunTransmissionOptions
): RunningTransmission {
  const playTone = createVisualizedTone(webamp);
  const proximityTone = proximityFeedback
    ? createProximityTone(webamp, {
        low: TONES.proximityLow,
        high: TONES.proximityHigh,
        maxGain: TONE_GAIN,
      })
    : null;

  const bandValueToFrequency = (bandValue: number): number =>
    (bandValue / 100) * transmission.max;

  const game = new SignalTunerGame(transmission, {
    onDecode: (_band, decodedWords) => {
      playTone(TONES.decode, 0.2);
      setMarqueeMessage(webamp, decodedWords.join(" "));
    },
    onComplete: () => {
      TONES.fanfare.forEach((freq, i) =>
        setTimeout(() => playTone(freq, 0.3), i * TONES.fanfareStepMs)
      );
      setMarqueeMessage(webamp, `${transmission.title} — complete`);
      proximityTone?.stop();

      if (transmission.unlockTrack != null) {
        unlockTrack(webamp, transmission.unlockTrack);
      }

      onComplete?.(transmission);
    },
  });

  // Seed the game with wherever the EQ slider already happens to be, then
  // react to the player physically dragging it.
  game.setFrequency(bandValueToFrequency(getEqBandValue(webamp, tunerBand)));
  const unsubscribe = onEqBandChange(webamp, tunerBand, (value) => {
    game.setFrequency(bandValueToFrequency(value));
    // After setFrequency, so a decode this tick already counts as found.
    proximityTone?.setProximity(game.getProximity());
  });

  return {
    game,
    stop: () => {
      unsubscribe();
      proximityTone?.stop();
    },
  };
}
