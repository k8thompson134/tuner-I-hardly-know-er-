// The night's story, told through the desktop: a buddy who IMs as you find
// words, and unsent letters that land in the Recycle Bin. All copy is here so
// it can be rewritten without touching any logic.

export interface Letter {
  file: string;
  text: string;
}

// Index 0 is in the bin from the start; each completed transmission adds the
// next one.
export const LETTERS: Letter[] = [
  {
    file: "unsent_letter_3am.txt",
    text: "i kept the dial where you left it\nbut you never signed back on.\n\ndead air where you used to be.",
  },
  {
    file: "re_static.txt",
    text: "you said you'd call when the signal got better.\nit's been better for weeks.\n\ni checked the line. i checked the line.\nnothing on the other end but me.",
  },
  {
    file: "re_noise.txt",
    text: "i caught your voice through all that noise\nand i didn't say a word.\n\nsome things you only hear\nafter you stop trying to answer.",
  },
  {
    file: "range.txt",
    text: "i stayed in range the whole time.\nnot waiting. just not leaving.\n\nthere's a difference,\nand i'd like you to know i know it.",
  },
  {
    file: "feedback.txt",
    text: "if you can hear this, i'm not mad anymore.\n\ni just wanted to say it somewhere,\neven if the only one listening\nis a modem at 3am.",
  },
  {
    file: "dead_air.txt",
    text: "dead air isn't empty, it turns out.\n\nit's everything we didn't say,\nholding its breath.",
  },
  {
    file: "signed_off.txt",
    text: "you signed off.\ni stayed on, just in case.\n\nit's quiet now, and i think\ni finally know what the line was for.",
  },
];

export const BUDDY = {
  name: "ghostfreq_01",
  onConnect: [
    { say: "u up?", after: 3000 },
    { say: "there's something on 600 again. same as last night", after: 5500 },
  ],
  firstDecode: "wait. did u hear that",
  halfway: [
    "hold still when it gets loud. it's shy",
    "it's clearer when the noise sits right",
    "same noise. other side. weird",
    "tighter this time. take it slow",
    "i keep losing it between the words",
    "two filters now. ok. almost there",
  ],
  firstInterference: "too much static. move the NOISE slider till the EQ button lights",
  complete: [
    "...i know that song. press >>| for the next one",
    "it's like someone's talking through the static. to u",
    "u stayed in range. so did they",
    "can u hear me through the feedback. yeah. i can",
    "dead air isn't empty. it's just waiting",
    "ok. i think that's everything they wanted to say",
  ],
  idle: "still there?",
  signOff: "ghostfreq_01 has signed off.",
  replies: [
    "lol",
    "...",
    "yeah",
    "same",
    "u still on 600?",
    "don't stop now",
    "i miss when the radio was enough",
    "hold still. it's shy",
  ],
};
