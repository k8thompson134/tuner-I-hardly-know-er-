import type WebampLazy from "../../webamp/js/webampLazy";
import {
  LayerStatus,
  ResonanceState,
  SignalTunerGame,
} from "./SignalTunerGame";
import { Transmission, WordBand } from "./transmissions";
import { TONES, TONE_GAIN } from "./cosmetics";
import {
  EqBand,
  ReadoutKeeper,
  TrackLabel,
  clearPlayerUiCues,
  clearTargetZoneOverlays,
  createProximityTone,
  createVisualizedTone,
  ensureVisualizerActive,
  getEqBandValue,
  onEqBandChange,
  playWordCompletedSound,
  clearMarqueeMessage,
  setBandTint,
  setMarqueeMessage,
  unlockTrack,
  updatePlayerUiCues,
} from "./webampAdapter";

export interface RunTransmissionOptions {
  // Which EQ band drives this transmission's frequency.
  tunerBand: EqBand;
  // This transmission's row in the playlist, which shows its lyric line.
  trackIndex: number;
  // Shows dial/signal/lock/interference on the player's own readouts.
  readouts: ReadoutKeeper;
  proximityFeedback?: boolean;
  // Shown in the marquee until the first word decodes.
  introHint?: string;
  // Shown after the fanfare, then the marquee is released so the reward
  // song's title scrolls.
  completeHint?: string;
  // Band ids already found, from an earlier visit.
  decodedBandIds?: string[];
  onDecode?: (word: string, decodedCount: number) => void;
  onLockedBand?: (word: string | null) => void;
  onLockProgress?: (band: WordBand | null, progress: number) => void;
  onInterferenceChange?: (
    cleared: boolean,
    unclearedNames: string[],
    statuses: LayerStatus[],
    resonance: ResonanceState
  ) => void;
  onComplete?: (transmission: Transmission) => void;
}

// What a transmission's playlist row shows: its short title, then its lyric
// in lyric order with a blank for every word not decoded yet.
export function transmissionTrackLabel(
  transmission: Transmission,
  isDecoded: (band: WordBand) => boolean = () => false
): TrackLabel {
  const words = [...transmission.bands]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((b) => (isDecoded(b) ? b.word : "____"));
  return {
    artist: transmission.title.split(" — ").pop() ?? transmission.title,
    title: words.join(" "),
  };
}

export interface RunningTransmission {
  game: SignalTunerGame;
  stop: () => void;
}

// The single reusable entry point for "play a transmission": wires one
// Transmission's full progression loop onto a live Webamp instance -
//   EQ band value  --------->  SignalTunerGame.setFrequency
//   hold-to-lock   --------->  dynamic beat sync + charging audio cue
//   decode event   --------->  tone (through the real visualizer) + marquee text
//   complete event --------->  fanfare + marquee text + unlockTrack()
// Multi-slider coupled resonance (170 NOISE, 14000 CLARITY) gates the carrier.
export function runTransmission(
  webamp: WebampLazy,
  transmission: Transmission,
  {
    tunerBand,
    trackIndex,
    readouts,
    proximityFeedback = false,
    introHint,
    completeHint,
    decodedBandIds,
    onDecode,
    onLockedBand,
    onLockProgress,
    onInterferenceChange,
    onComplete,
  }: RunTransmissionOptions
): RunningTransmission {
  ensureVisualizerActive(webamp);
  clearTargetZoneOverlays();

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

  let game: SignalTunerGame;

  const lyricOrder = [...transmission.bands].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );
  const lyricLine = (): string =>
    lyricOrder.map((b) => (game.isBandDecoded(b.id) ? b.word : "____")).join(" ");

  const formatMarquee = (): string =>
    `${lyricLine()}      (${game.getDecodedCount()} / ${lyricOrder.length})`;

  // The playlist row is the RX log: blanks fill in as words decode, then the
  // row becomes the real song once the transmission is complete.
  const updateTrackLabel = () => {
    const track = transmission.unlockTrack;
    readouts.setTrackLabel(
      trackIndex,
      game.isComplete() && track != null
        ? { artist: track.artist, title: track.title }
        : transmissionTrackLabel(transmission, (b) => game.isBandDecoded(b.id))
    );
  };

  const updateInterference = (
    statuses?: LayerStatus[],
    resonance?: ResonanceState
  ) => {
    const list = statuses ?? game.getLayerStatusList();
    const res = resonance ?? game.getResonanceState();
    const uncleared = list.filter((s) => !s.isCleared);
    const names = uncleared.map((s) => s.layer.name);
    proximityTone?.setResonance(res);
    proximityTone?.setLayers(list);
    onInterferenceChange?.(res.isCleared, names, list, res);
  };

  const completionTimers: number[] = [];
  let clearedNames = new Set<string>();
  // Briefly confirms a filter just came into range, e.g. "[OK] NOISE CLEAR".
  let clearFlash: string | null = null;
  let currentLockBand: WordBand | null = null;
  let currentLockProgress = 0;

  // One owner for the marquee while the transmission is in play, in priority
  // order: locking > interference hint > intro hint > lyric line. Hints stay
  // under ~31 characters so they fit without scrolling. Completion messages
  // are set by onComplete and left alone.
  // Filters that are out of range and so block a lock.
  const blockingLayers = () =>
    game.getLayerStatusList().filter((s) => !s.isCleared);

  const interferenceHint = (): string => {
    // Name the filter furthest from its target, in the words printed on the
    // skin. Direction is RAISE / LOWER; the +/- count says how far off it is.
    const off = blockingLayers().sort((a, b) => b.distance - a.distance)[0];
    if (off == null) return "[WARN] INTERFERENCE";
    const low = off.currentValue < (off.targetMin ?? 0);
    const steps = off.distance >= 20 ? 3 : off.distance >= 8 ? 2 : 1;
    const marks = (low ? "+" : "-").repeat(steps);
    return `[WARN] ${off.layer.name}: ${low ? "RAISE" : "LOWER"} ${marks}`;
  };

  // After completion the marquee shows the full line, then the next-step
  // hint, then is released to the song title; refreshes must not undo that.
  let completeStage: "line" | "hint" | "released" = "line";

  const refreshMarquee = () => {
    if (game.isComplete()) {
      if (completeStage === "line") setMarqueeMessage(webamp, formatMarquee());
      return;
    }
    const locking =
      currentLockBand != null && currentLockProgress > 0 && currentLockProgress < 1;
    if (clearFlash != null && !locking) {
      setMarqueeMessage(webamp, clearFlash);
    } else if (locking) {
      const pct = Math.round(currentLockProgress * 100);
      setMarqueeMessage(webamp, `[SYNC] CARRIER LOCK ${pct}%`);
    } else if (blockingLayers().length > 0) {
      // A filter out of range is the thing to do first, so it's shown while
      // scanning too.
      setMarqueeMessage(webamp, interferenceHint());
    } else if (introHint != null && game.getDecodedCount() === 0) {
      setMarqueeMessage(webamp, introHint);
    } else {
      setMarqueeMessage(webamp, formatMarquee());
    }
  };

  const refreshUiCues = () => {
    refreshMarquee();
    // Recolour each groove by how close it is to its target, violet through
    // green: the filters, and the dial against the nearest station, so the
    // whole scan reads as hot and cold.
    const carrier = game.getCarrierStatus();
    for (const status of game.getLayerStatusList()) {
      setBandTint(
        status.layer.band,
        status.isCleared ? 1 : 1 - Math.min(1, status.distance / 30)
      );
    }
    setBandTint(
      tunerBand,
      carrier.isInsideStation || carrier.isDecodedStation ? 1 : carrier.proximity
    );
    // kbps = dial position, kHz = signal strength, stereo = locked on a
    // station, EQ ON = interference cleared.
    // Proximity only guides toward unfound words, so a found station reads
    // as full signal rather than zero.
    const locked = game.getLockedWord() != null;
    readouts.set({
      kbps: Math.round(game.getFrequency()),
      khz: locked ? 99 : Math.round(game.getProximity() * 99),
      stereo: locked,
      eqOn: blockingLayers().length === 0,
    });
    updatePlayerUiCues(webamp, {
      transmission,
      layers: game.getLayerStatusList(),
      resonance: game.getResonanceState(),
      lockedWord: game.getLockedWord(),
      lockBand: currentLockBand,
      lockProgress: currentLockProgress,
      decodedBandIds: new Set(
        transmission.bands
          .filter((b) => game.isBandDecoded(b.id))
          .map((b) => b.id)
      ),
      dialBand: tunerBand,
    });
  };

  game = new SignalTunerGame(transmission, {
    onDecode: (band) => {
      playWordCompletedSound(webamp, proximityTone?.getLastLockedPitch());
      updateTrackLabel();
      onDecode?.(band.word, game.getDecodedCount());
      proximityTone?.setProximity(game.getCarrierStatus());
      refreshUiCues();
    },
    onLockProgress: (band, progress) => {
      currentLockBand = band;
      currentLockProgress = progress;
      proximityTone?.setLockProgress(progress, band);
      if (progress === 0) {
        proximityTone?.setProximity(game.getCarrierStatus());
      }
      onLockProgress?.(band, progress);
      refreshUiCues();
    },
    onLayerStateChange: (cleared, _uncleared, statuses, resonance) => {
      const onStation = game.getCarrierStatus().isInsideStation;
      const nowCleared = new Set<string>(
        statuses.filter((s) => s.isCleared).map((s) => s.layer.name)
      );
      const newlyCleared = [...nowCleared].filter((n) => !clearedNames.has(n));
      const regressed = [...clearedNames].some((n) => !nowCleared.has(n));
      clearedNames = nowCleared;

      if (regressed) clearFlash = null;
      if (newlyCleared.length > 0) {
        if (cleared) {
          // Rising three-note arpeggio: everything is in range.
          [880, 1320, 1760].forEach((freq, i) =>
            completionTimers.push(
              window.setTimeout(() => playTone(freq, 0.12, 0.1), i * 70)
            )
          );
        } else {
          playTone(1100, 0.08, 0.08);
        }
        clearFlash = cleared
          ? `[OK] ALL CLEAR - ${onStation ? "HOLD STEADY" : "KEEP SCANNING"}`
          : `[OK] ${newlyCleared.join(" + ")} CLEAR`;
        completionTimers.push(
          window.setTimeout(() => {
            clearFlash = null;
            refreshMarquee();
          }, 2200)
        );
      }

      updateInterference(statuses, resonance);
      proximityTone?.setProximity(game.getCarrierStatus());
      refreshUiCues();
    },
    onComplete: () => {
      TONES.fanfare.forEach((freq, i) =>
        completionTimers.push(
          window.setTimeout(() => playTone(freq, 0.3), i * TONES.fanfareStepMs)
        )
      );
      // Full decoded line during the fanfare, then what to do next, then the
      // marquee goes back to the song title.
      completionTimers.push(
        window.setTimeout(() => {
          completeStage = "hint";
          setMarqueeMessage(webamp, completeHint ?? "[OK] TRANSMISSION DECODED");
        }, 3500),
        window.setTimeout(() => {
          completeStage = "released";
          clearMarqueeMessage(webamp);
        }, 3500 + 9000)
      );
      proximityTone?.stop();
      refreshUiCues();

      updateTrackLabel();
      onComplete?.(transmission);

      if (transmission.unlockTrack != null) {
        unlockTrack(webamp, trackIndex, transmission.unlockTrack);
      }
    },
  }, decodedBandIds);

  // Seed interference layers with current slider values and subscribe to movements
  const layerUnsubscribes = (transmission.layers ?? []).map((layer) => {
    game.setLayerValue(layer.band, getEqBandValue(webamp, layer.band));
    return onEqBandChange(webamp, layer.band, (val) => {
      game.setLayerValue(layer.band, val);
      refreshUiCues();
    });
  });

  // Seed the game with wherever the EQ slider already happens to be
  game.setFrequency(bandValueToFrequency(getEqBandValue(webamp, tunerBand)));

  // Set initial tuning audio, locked station status, and player UI cues
  updateTrackLabel();
  updateInterference();
  onLockedBand?.(game.getLockedWord());
  proximityTone?.setProximity(game.getCarrierStatus());
  refreshUiCues();

  const unsubscribe = onEqBandChange(webamp, tunerBand, (value) => {
    game.setFrequency(bandValueToFrequency(value));
    onLockedBand?.(game.getLockedWord());
    // After setFrequency, so a decode this tick already counts as found.
    proximityTone?.setProximity(game.getCarrierStatus());
    refreshUiCues();
  });

  const hasDriftingLayers = (transmission.layers ?? []).some((l) => Boolean(l.drift));
  let driftTimer: number | undefined;
  if (hasDriftingLayers) {
    driftTimer = window.setInterval(() => {
      if (!game.isComplete()) {
        updateInterference();
        refreshUiCues();
      }
    }, 1000);
  }

  return {
    game,
    stop: () => {
      if (driftTimer !== undefined) window.clearInterval(driftTimer);
      completionTimers.forEach(clearTimeout);
      setBandTint(tunerBand, null);
      transmission.layers?.forEach((layer) => setBandTint(layer.band, null));
      game.destroy();
      unsubscribe();
      layerUnsubscribes.forEach((unsub) => unsub());
      clearPlayerUiCues();
      proximityTone?.stop();
    },
  };
}
