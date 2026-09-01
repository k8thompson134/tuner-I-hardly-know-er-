import { Transmission, WordBand } from "./transmissions";

export interface SignalTunerGameEvents {
  onDecode: (band: WordBand, decodedWords: string[]) => void;
  onComplete: (transmission: Transmission) => void;
}

// Framework-agnostic game logic. Doesn't know about Webamp or the DOM —
// callers feed it a frequency and it reports what changed.
export class SignalTunerGame {
  private transmission: Transmission;
  private events: SignalTunerGameEvents;
  private frequency: number;
  private decodedBandIds: Set<string> = new Set();

  constructor(transmission: Transmission, events: SignalTunerGameEvents) {
    this.transmission = transmission;
    this.events = events;
    this.frequency = transmission.min;
  }

  setFrequency(frequency: number): void {
    this.frequency = Math.min(
      this.transmission.max,
      Math.max(this.transmission.min, frequency)
    );

    const band = this.transmission.bands.find(
      (b) =>
        this.frequency >= b.min &&
        (this.frequency < b.max || b.max === this.transmission.max)
    );
    if (band == null || this.decodedBandIds.has(band.id)) {
      return;
    }

    this.decodedBandIds.add(band.id);
    this.events.onDecode(band, this.getDecodedWords());

    if (this.decodedBandIds.size === this.transmission.bands.length) {
      this.events.onComplete(this.transmission);
    }
  }

  getFrequency(): number {
    return this.frequency;
  }

  getDecodedWords(): string[] {
    return this.transmission.bands
      .filter((b) => this.decodedBandIds.has(b.id))
      .map((b) => b.word);
  }

  isComplete(): boolean {
    return this.decodedBandIds.size === this.transmission.bands.length;
  }

  /**
   * How close the dial is to the nearest word that hasn't been found yet,
   * as 0 (cold) to 1 (dead on). Drives the optional proximity tone; the
   * decode itself doesn't use this.
   *
   * Measured against each band's *centre*, not its edges. That's deliberate:
   * this transmission's bands tile the dial with no gaps, so an
   * edge-distance would be 0 everywhere and the tone would sit pinned at
   * maximum. Centre-distance instead peaks as you home in on each word, the
   * way a real radio dial peaks on a station.
   *
   * The consequence: a word decodes the instant you *enter* its band, which
   * is where proximity reads coldest. To make decoding happen at the peak
   * instead of the edge, transmissions could use sparse bands with dead space
   * between them, so the proximity tone peaks at the exact spot you need to
   * hit. The current transmission doesn't use this pattern.
   *
   * Returns 0 once everything is decoded, so the tone falls silent.
   */
  getProximity(): number {
    const remaining = this.transmission.bands.filter(
      (b) => !this.decodedBandIds.has(b.id)
    );
    if (remaining.length === 0) {
      return 0;
    }

    const distance = Math.min(
      ...remaining.map((b) =>
        Math.abs(this.frequency - (b.min + b.max) / 2)
      )
    );

    // Falls to silence over half a band, so "warm" means genuinely near
    // rather than anywhere in the same stretch of the dial.
    const widest = Math.max(...remaining.map((b) => b.max - b.min));
    const falloff = widest / 2;
    return falloff === 0 ? 0 : Math.max(0, 1 - distance / falloff);
  }
}
