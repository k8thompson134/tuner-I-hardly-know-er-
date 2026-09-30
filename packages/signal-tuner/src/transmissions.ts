export interface WordBand {
  id: string;
  word: string;
  min: number;
  max: number;
}

export interface UnlockTrack {
  url: string;
  title: string;
  artist: string;
}

export interface Transmission {
  id: string;
  title: string;
  min: number;
  max: number;
  bands: WordBand[];
  // Loaded onto the player once every band's been decoded.
  // Part of the game design: the reward for completing a transmission is hearing the song the lyric came from.
  unlockTrack?: UnlockTrack;
}

// Word-band encoding: the message is split into words, each living in its
// own frequency range. Tuning into a range reveals that word.
export const TRANSMISSIONS: Transmission[] = [
  {
    id: "transmission-1",
    title: "Transmission 1 — Tuned Out",
    min: 0,
    max: 800,
    bands: [
      { id: "t1-0", word: "STATIC", min: 0, max: 100 },
      { id: "t1-1", word: "HELD", min: 100, max: 200 },
      { id: "t1-2", word: "MY", min: 200, max: 300 },
      { id: "t1-3", word: "HEART", min: 300, max: 400 },
      { id: "t1-4", word: "UNTIL", min: 400, max: 500 },
      { id: "t1-5", word: "YOU", min: 500, max: 600 },
      { id: "t1-6", word: "TUNED", min: 600, max: 700 },
      { id: "t1-7", word: "OUT", min: 700, max: 800 },
    ],
    unlockTrack: {
      url: "/audio/aug_26_jazz.mp3",
      title: "Bye Bye Bandwidth",
      artist: "Backstreet Bots",
    },
  },
];
