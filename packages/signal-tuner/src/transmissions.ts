import type { EqBand } from "./webampAdapter";

export interface WordBand {
  id: string;
  word: string;
  min: number;
  max: number;
}

export interface UnlockTrack {
  url: string;
  // How the song is shown in-game (the pun title and fake artist).
  title: string;
  artist: string;
  lengthSeconds: number;
  // The real recording, for the credits window.
  original: { title: string; composer: string; licence?: string };
}

// A filter slider that has to be brought into a fixed target range before
// words decode. It is independent of the dial: clear it once and scan freely.
// The player is guided by the marquee warning, the groove colour and the
// audio cues, not a drawn zone.
export interface InterferenceLayer {
  band: EqBand;
  name: "NOISE" | "CLARITY";
  hint: string;
  // Target range, 0-100. Keep it clear of 50, where the slider starts.
  zone: { min: number; max: number };
}

export interface Transmission {
  id: string;
  title: string;
  subtitle?: string;
  min: number;
  max: number;
  bands: WordBand[];
  layers?: InterferenceLayer[];
  // Loaded onto the player once every band's been decoded.
  // The reward for completing a transmission is hearing the song the lyric came from.
  unlockTrack?: UnlockTrack;
}

const MACLEOD = (title: string) => ({
  title,
  composer: "Kevin MacLeod (incompetech.com)",
  licence: "CC BY 4.0",
});

// Word-band encoding: the message is split into words, each living in its
// own frequency range on the 600 dial. Tuning into a range reveals that word.
// A transmission may also have filter layers (170 NOISE, 14000 CLARITY) that
// must be brought into their target range before the dial can decode words.
//
// Difficulty ramps one thing at a time:
//   1  4 words, wide bands, no filter
//   2  + a NOISE target (low, 21 wide)
//   3  5 words, narrower bands, NOISE target on the other side
//   4  NOISE target gets narrower (15 wide)
//   5  6 words, narrower bands, narrower NOISE target (12 wide)
//   6  6 narrow bands, NOISE + a CLARITY target
// Targets stay clear of the neutral 50 the sliders start on, so no station is
// solved before a filter is touched.
export const TRANSMISSIONS: Transmission[] = [
  {
    id: "transmission-1",
    title: "Transmission 1 — First Contact",
    subtitle: "Dial: 600 (Single Slider)",
    min: 0,
    max: 800,
    bands: [
      // 4 bands with ~180-unit dead zones between them
      { id: "t1-2", word: "HELLO",      min:  80, max: 120 },  // center 100
      { id: "t1-0", word: "HELLO",      min: 300, max: 340 },  // center 320, gap 180
      { id: "t1-3", word: "YOU",        min: 520, max: 560 },  // center 540, gap 180
      { id: "t1-1", word: "WORLD",      min: 700, max: 740 },  // center 720, gap 140
    ],
    unlockTrack: {
      url: "/audio/aug_26_jazz.mp3",
      title: "Hello World (Radio Edit)",
      artist: "Backstreet Bots",
      lengthSeconds: 178,
      original: { title: "Mask: C# Harmonic Minor", composer: "Alex McCulloch" },
    },
  },
  {
    id: "transmission-2",
    title: "Transmission 2 — Handshake",
    subtitle: "Dial: 600 + NOISE: 170 (fixed filter)",
    min: 0,
    max: 800,
    layers: [
      {
        band: 170,
        name: "NOISE",
        hint: "Bring NOISE into range",
        zone: { min: 18, max: 38 },
      },
    ],
    bands: [
      { id: "t2-1", word: "YOUR",       min:  70, max: 110 },  // center  90
      { id: "t2-5", word: "BEAUTIFULLY", min: 290, max: 330 },  // center 310, gap 180
      { id: "t2-4", word: "SINGS",      min: 520, max: 560 },  // center 540, gap 190
      { id: "t2-2", word: "MODEM",      min: 710, max: 750 },  // center 730, gap 150
    ],
    unlockTrack: {
      url: "/audio/aerosol_of_my_love.mp3",
      title: "Handshake Serenade",
      artist: "Dial-Up Divas",
      lengthSeconds: 142,
      original: MACLEOD("Aerosol of my Love"),
    },
  },
  {
    id: "transmission-3",
    title: "Transmission 3 — Cram Session",
    subtitle: "Dial: 600 + NOISE: 170 (fixed filter, other side)",
    min: 0,
    max: 800,
    layers: [
      {
        band: 170,
        name: "NOISE",
        hint: "Bring NOISE into range",
        zone: { min: 64, max: 84 },
      },
    ],
    bands: [
      // "I STUDIED YOUR LOVE SONGS": 5 bands, 36 wide
      { id: "t3-2", word: "YOUR",       min:  72, max: 108 },  // center  90
      { id: "t3-3", word: "LOVE",       min: 242, max: 278 },  // center 260
      { id: "t3-4", word: "SONGS",      min: 402, max: 438 },  // center 420
      { id: "t3-0", word: "I",          min: 572, max: 608 },  // center 590
      { id: "t3-1", word: "STUDIED",    min: 717, max: 753 },  // center 735
    ],
    unlockTrack: {
      url: "/audio/thinking_music.mp3",
      title: "Crush Course",
      artist: "NSYNC/ACK",
      lengthSeconds: 196,
      original: MACLEOD("Thinking Music"),
    },
  },
  {
    id: "transmission-4",
    title: "Transmission 4 — Over and Out",
    subtitle: "Dial: 600 + NOISE: 170 (narrower target)",
    min: 0,
    max: 800,
    // CLARITY (14K) joins in transmission 6.
    layers: [
      {
        band: 170,
        name: "NOISE",
        hint: "Bring NOISE into range",
        zone: { min: 74, max: 89 },
      },
    ],
    bands: [
      { id: "t4-2", word: "TOO",        min:  60, max: 100 },  // center  80
      { id: "t4-0", word: "IS",         min: 230, max: 270 },  // center 250
      { id: "t4-6", word: "OVER",       min: 420, max: 460 },  // center 440
      { id: "t4-1", word: "THIS",       min: 590, max: 630 },  // center 610
      { id: "t4-5", word: "MUCH",       min: 720, max: 760 },  // center 740
    ],
    unlockTrack: {
      url: "/audio/pixelland.mp3",
      title: "Over and Out (and Over)",
      artist: "98 Kilohertz",
      lengthSeconds: 234,
      original: MACLEOD("Pixelland"),
    },
  },
  {
    id: "transmission-5",
    title: "Transmission 5 — Not From Around Here",
    subtitle: "Dial: 600 + NOISE: 170 (narrow target, 6 words)",
    min: 0,
    max: 800,
    layers: [
      {
        band: 170,
        name: "NOISE",
        hint: "Bring NOISE into range",
        zone: { min: 12, max: 24 },
      },
    ],
    bands: [
      // "I AM NOT FROM AROUND HERE": 6 bands, 34 wide
      { id: "t5-4", word: "AROUND",     min:  43, max:  77 },  // center  60
      { id: "t5-2", word: "NOT",        min: 173, max: 207 },  // center 190
      { id: "t5-0", word: "I",          min: 313, max: 347 },  // center 330
      { id: "t5-5", word: "HERE",       min: 453, max: 487 },  // center 470
      { id: "t5-1", word: "AM",         min: 583, max: 617 },  // center 600
      { id: "t5-3", word: "FROM",       min: 723, max: 757 },  // center 740
    ],
    unlockTrack: {
      url: "/audio/bummin_on_tremelo.mp3",
      title: "Out of This World Wide Web",
      artist: "Destiny's Channel",
      lengthSeconds: 192,
      original: MACLEOD("Bummin on Tremelo"),
    },
  },
  {
    id: "transmission-6",
    title: "Transmission 6 — Close Encounter",
    subtitle: "Dial: 600 + NOISE: 170 + CLARITY: 14K",
    min: 0,
    max: 800,
    layers: [
      {
        band: 170,
        name: "NOISE",
        hint: "Bring NOISE into range",
        zone: { min: 68, max: 80 },
      },
      {
        band: 14000,
        name: "CLARITY",
        hint: "Bring CLARITY into range",
        zone: { min: 22, max: 36 },
      },
    ],
    bands: [
      // "WILL YOU COME OUTSIDE LOOK UP": 6 bands, 30 wide
      { id: "t6-2", word: "COME",       min:  35, max:  65 },  // center  50
      { id: "t6-5", word: "UP",         min: 165, max: 195 },  // center 180
      { id: "t6-0", word: "WILL",       min: 295, max: 325 },  // center 310
      { id: "t6-3", word: "OUTSIDE",    min: 425, max: 455 },  // center 440
      { id: "t6-1", word: "YOU",        min: 565, max: 595 },  // center 580
      { id: "t6-4", word: "LOOK",       min: 715, max: 745 },  // center 730
    ],
    unlockTrack: {
      url: "/audio/merry_go_distressed.mp3",
      title: "Close Encounters of the Heart Kind",
      artist: "Backstreet Bots",
      lengthSeconds: 120,
      original: MACLEOD("Merry Go - Distressed"),
    },
  },
];
