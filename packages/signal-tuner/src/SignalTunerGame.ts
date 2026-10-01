import { InterferenceLayer, Transmission, WordBand } from "./transmissions";
import type { EqBand } from "./webampAdapter";

export interface LayerStatus {
  layer: InterferenceLayer;
  currentValue: number;
  isCleared: boolean;
  distance: number;
  targetHint?: string;
  targetMin?: number;
  targetMax?: number;
}

export interface ResonanceState {
  percent: number; // 0 to 100
  isCleared: boolean;
  hint: string;
}

export interface CarrierStatus {
  proximity: number;
  distance: number;
  closestBand: WordBand | null;
  centerFreq: number;
  maxFreq: number;
  isInsideStation: boolean;
  isDecodedStation: boolean;
}

export interface SignalTunerGameEvents {
  onDecode: (band: WordBand, decodedWords: string[]) => void;
  onComplete: (transmission: Transmission) => void;
  onLayerStateChange?: (
    cleared: boolean,
    uncleared: InterferenceLayer[],
    allStatuses: LayerStatus[],
    resonance: ResonanceState
  ) => void;
  onLockProgress?: (band: WordBand | null, progress: number) => void;
}

// Framework-agnostic game logic. Doesn't know about Webamp or the DOM —
// callers feed it frequency and layer values and it reports what changed.
export class SignalTunerGame {
  private transmission: Transmission;
  private events: SignalTunerGameEvents;
  private frequency: number;
  private decodedBandIds: Set<string> = new Set();
  private layerValues: Map<EqBand, number> = new Map();

  // Hold-to-Lock synchronization state
  private lockTargetBand: WordBand | null = null;
  private lockStartTime: number = 0;
  private readonly lockDurationMs: number = 750;
  private readonly lockExitHysteresis: number = 5; // Units to move outside band to cancel lock
  private lockTimerId: ReturnType<typeof setTimeout> | null = null;
  private lockAnimId: number | null = null;

  constructor(transmission: Transmission, events: SignalTunerGameEvents) {
    this.transmission = transmission;
    this.events = events;
    this.frequency = transmission.min;
  }

  setLayerValue(band: EqBand, value: number): void {
    this.layerValues.set(band, value);
    if (typeof band === "number") {
      this.layerValues.set(String(band) as EqBand, value);
    } else {
      const num = Number(band);
      if (!isNaN(num)) {
        this.layerValues.set(num as EqBand, value);
      }
    }

    const resonance = this.getResonanceState();
    const statuses = this.getLayerStatusList();
    const uncleared = statuses.filter((s) => !s.isCleared).map((s) => s.layer);

    this.events.onLayerStateChange?.(
      resonance.isCleared,
      uncleared,
      statuses,
      resonance
    );

    if (!resonance.isCleared) {
      this.cancelLock();
    } else {
      // If clearing the layers made the current dial position valid, re-evaluate lock
      this.setFrequency(this.frequency);
    }
  }

  getLayerValue(band: EqBand): number {
    return (
      this.layerValues.get(band) ??
      this.layerValues.get(Number(band) as EqBand) ??
      this.layerValues.get(String(band) as EqBand) ??
      50
    );
  }

  getLayerStatusList(): LayerStatus[] {
    return (this.transmission.layers ?? []).map((layer) => {
      const { min, max } = layer.zone;
      const value = this.getLayerValue(layer.band);
      const distance = value < min ? min - value : value > max ? value - max : 0;
      return {
        layer,
        currentValue: Math.round(value),
        isCleared: distance === 0,
        distance,
        targetMin: min,
        targetMax: max,
        targetHint: distance === 0 ? "IN RANGE" : value < min ? "RAISE" : "LOWER",
      };
    });
  }

  getResonanceState(): ResonanceState {
    const statuses = this.getLayerStatusList();
    if (statuses.length === 0) {
      return {
        percent: 100,
        isCleared: true,
        hint: "CARRIER CLEAR — TUNE 600 DIAL",
      };
    }
    const isCleared = statuses.every((s) => s.isCleared);
    const penalty = statuses.reduce((sum, s) => sum + s.distance * 2.2, 0);
    return {
      percent: isCleared ? 100 : Math.max(0, Math.min(99, Math.round(100 - penalty))),
      isCleared,
      hint: isCleared
        ? "ALL FILTERS IN RANGE"
        : `ADJUST ${statuses.filter((s) => !s.isCleared).map((s) => s.layer.name).join(" + ")}`,
    };
  }

  isLayerCleared(layer: InterferenceLayer): boolean {
    const statuses = this.getLayerStatusList();
    const st = statuses.find((s) => s.layer.band === layer.band);
    return st?.isCleared ?? false;
  }

  areLayersCleared(): boolean {
    return this.getResonanceState().isCleared;
  }

  getUnclearedLayers(): InterferenceLayer[] {
    const statuses = this.getLayerStatusList();
    return statuses.filter((s) => !s.isCleared).map((s) => s.layer);
  }

  setFrequency(frequency: number): void {
    this.frequency = Math.min(
      this.transmission.max,
      Math.max(this.transmission.min, frequency)
    );

    // Notify listeners of resonance status for current carrier frequency
    const resonance = this.getResonanceState();
    const statuses = this.getLayerStatusList();
    const uncleared = statuses.filter((s) => !s.isCleared).map((s) => s.layer);

    this.events.onLayerStateChange?.(
      resonance.isCleared,
      uncleared,
      statuses,
      resonance
    );

    // If interference layers are uncleared, words cannot decode
    if (!resonance.isCleared) {
      this.cancelLock();
      return;
    }

    const band = this.transmission.bands.find(
      (b) => this.frequency >= b.min && this.frequency <= b.max
    );

    // Check if we should cancel an active lock (with hysteresis to prevent thrashing)
    if (this.lockTargetBand != null) {
      if (band?.id === this.lockTargetBand.id) {
        // Still inside the lock target band, keep going
        return;
      }
      // Outside the lock target band. Check hysteresis: only cancel if we've moved
      // far enough away (> band width / 2 + hysteresis) to prevent edge jitter
      const dist =
        this.frequency < this.lockTargetBand.min
          ? this.lockTargetBand.min - this.frequency
          : this.frequency - this.lockTargetBand.max;
      if (dist < this.lockExitHysteresis) {
        // Still within hysteresis zone, don't cancel yet
        return;
      }
      // Far enough away, cancel the lock
      this.cancelLock();
    }

    if (band == null || this.decodedBandIds.has(band.id)) {
      return;
    }

    // Inside an undecoded band! Start a new lock

    // Start locking new band
    this.startLock(band);
  }

  private startLock(band: WordBand): void {
    this.cancelLock();
    this.lockTargetBand = band;
    this.lockStartTime = performance.now();
    this.events.onLockProgress?.(band, 0);

    const tick = () => {
      if (!this.lockTargetBand || this.lockTargetBand.id !== band.id) {
        return;
      }
      const elapsed = performance.now() - this.lockStartTime;
      const progress = Math.min(1, elapsed / this.lockDurationMs);
      this.events.onLockProgress?.(this.lockTargetBand, progress);

      if (progress >= 1) {
        this.decodedBandIds.add(band.id);
        const decoded = this.lockTargetBand;
        this.lockTargetBand = null;
        this.events.onLockProgress?.(null, 0);
        this.events.onDecode(decoded, this.getDecodedWords());

        if (this.decodedBandIds.size === this.transmission.bands.length) {
          this.events.onComplete(this.transmission);
        }
      } else {
        if (typeof requestAnimationFrame !== "undefined") {
          this.lockAnimId = requestAnimationFrame(tick);
        } else {
          this.lockTimerId = setTimeout(tick, 16);
        }
      }
    };

    if (typeof requestAnimationFrame !== "undefined") {
      this.lockAnimId = requestAnimationFrame(tick);
    } else {
      this.lockTimerId = setTimeout(tick, 16);
    }
  }

  private cancelLock(): void {
    if (this.lockAnimId != null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.lockAnimId);
      this.lockAnimId = null;
    }
    if (this.lockTimerId != null) {
      clearTimeout(this.lockTimerId);
      this.lockTimerId = null;
    }
    if (this.lockTargetBand != null) {
      this.lockTargetBand = null;
      this.events.onLockProgress?.(null, 0);
    }
  }

  getLockProgress(): { band: WordBand | null; progress: number } {
    if (!this.lockTargetBand) return { band: null, progress: 0 };
    const elapsed = performance.now() - this.lockStartTime;
    return {
      band: this.lockTargetBand,
      progress: Math.min(1, elapsed / this.lockDurationMs),
    };
  }

  destroy(): void {
    this.cancelLock();
  }

  getFrequency(): number {
    return this.frequency;
  }

  getDecodedWords(): string[] {
    return this.transmission.bands
      .filter((b) => this.decodedBandIds.has(b.id))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      .map((b) => b.word);
  }

  isBandDecoded(bandId: string): boolean {
    return this.decodedBandIds.has(bandId);
  }

  getDecodedCount(): number {
    return this.decodedBandIds.size;
  }

  getLockedWord(): string | null {
    const band = this.transmission.bands.find(
      (b) =>
        this.decodedBandIds.has(b.id) &&
        this.frequency >= b.min &&
        this.frequency <= b.max
    );
    return band ? band.word : null;
  }

  isInsideDecodedBand(): boolean {
    return this.getLockedWord() != null;
  }

  isComplete(): boolean {
    return this.decodedBandIds.size === this.transmission.bands.length;
  }

  /**
   * Continuous RF carrier status.
   * Uses a continuous Gaussian RF field around each undecoded station:
   * eliminates harsh artificial step-function cliffs while keeping empty spaces
   * quiet with atmospheric static.
   */
  getCarrierStatus(): CarrierStatus {
    const isDecodedStation = this.isInsideDecodedBand();
    const maxFreq = this.transmission.max || 800;

    const remaining = this.transmission.bands.filter(
      (b) => !this.decodedBandIds.has(b.id)
    );
    if (remaining.length === 0) {
      return {
        proximity: 0,
        distance: Infinity,
        closestBand: null,
        centerFreq: (this.transmission.min + maxFreq) / 2,
        maxFreq,
        isInsideStation: false,
        isDecodedStation,
      };
    }

    // Find closest undecoded band and exact distance to its station sweet spot
    let closestBand: WordBand = remaining[0];
    let minDistance = Infinity;

    for (const b of remaining) {
      let d = 0;
      if (this.frequency < b.min) {
        d = b.min - this.frequency;
      } else if (this.frequency > b.max) {
        d = this.frequency - b.max;
      }
      if (d < minDistance) {
        minDistance = d;
        closestBand = b;
      }
    }

    const centerFreq = (closestBand.min + closestBand.max) / 2;
    const isInsideStation = minDistance === 0;

    // Dynamic sigma: reception field EXPANDS as fewer targets remain.
    // sigma=40: wide enough that cues emerge ~60+ units from station
    // sigma=85: on the last target, the entire dial whispers the station in
    const totalBands = this.transmission.bands.length;
    const decodedFraction =
      totalBands > 1
        ? this.decodedBandIds.size / (totalBands - 1)
        : this.decodedBandIds.size;
    const sigma = 40 + decodedFraction * 45; // 40 → 85

    const proximity = isDecodedStation
      ? 0
      : Math.exp(-(minDistance * minDistance) / (2 * sigma * sigma));

    return {
      proximity,
      distance: minDistance,
      closestBand,
      centerFreq,
      maxFreq,
      isInsideStation,
      isDecodedStation,
    };
  }

  getProximity(): number {
    return this.getCarrierStatus().proximity;
  }
}
