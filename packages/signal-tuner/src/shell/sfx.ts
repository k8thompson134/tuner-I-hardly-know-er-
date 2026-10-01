// Synthesized desktop sounds. The shell has its own AudioContext, separate
// from Webamp's, so none of this touches the player's visualizer.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

// Call from a user gesture (e.g. the Connect button).
export function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

// Sounds are skipped, not queued, until the browser has allowed audio:
// scheduling on a suspended context would play them all at once later.
function ready(): AudioContext | null {
  return enabled && ctx != null && ctx.state === "running" ? ctx : null;
}

function tone(
  freqs: number | number[],
  at: number,
  dur: number,
  { type = "sine", gain = 0.08, glideTo }: {
    type?: OscillatorType;
    gain?: number;
    glideTo?: number;
  } = {}
): void {
  const c = ready();
  if (c == null) return;
  const t = c.currentTime + at;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, t + dur);
  g.connect(c.destination);
  for (const f of ([] as number[]).concat(freqs)) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur);
  }
}

function noise(at: number, dur: number, gain: number, band: number): void {
  const c = ready();
  if (c == null) return;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = band;
  filter.Q.value = 0.8;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + at);
}

const DTMF: Record<string, [number, number]> = {
  "0": [941, 1336],
  "1": [697, 1209],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
};

// Dial tones, answer tone, then the handshake screech. About 4 seconds.
export function modem(): void {
  [..."5550314"].forEach((d, i) => tone(DTMF[d], i * 0.13, 0.09, { gain: 0.05 }));
  tone(2100, 1.2, 0.7, { gain: 0.04 });
  for (let i = 0; i < 6; i++) {
    tone(i % 2 ? 1180 : 980, 2 + i * 0.07, 0.07, { type: "square", gain: 0.025 });
  }
  tone(1650, 2.45, 0.35, { type: "sawtooth", gain: 0.02, glideTo: 1100 });
  noise(2.4, 1.6, 0.06, 1800);
  noise(2.8, 1.1, 0.04, 3000);
}

export function doorOpen(): void {
  tone(220, 0, 0.35, { type: "sawtooth", gain: 0.03, glideTo: 520 });
  tone(90, 0.33, 0.12, { type: "triangle", gain: 0.12 });
}

export function doorClose(): void {
  tone(480, 0, 0.3, { type: "sawtooth", gain: 0.03, glideTo: 200 });
  tone(70, 0.28, 0.14, { type: "triangle", gain: 0.14 });
}

export function imBlip(): void {
  tone(988, 0, 0.07, { gain: 0.06 });
  tone(1319, 0.08, 0.1, { gain: 0.06 });
}
