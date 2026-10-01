// The night's story, told through the desktop: ghostfreq_01 IMs as you find
// words (and asks you things), and its rejected drafts land in the Recycle
// Bin. All copy is here so it can be rewritten without touching any logic.
// The plot is in docs/story.md.

export interface Letter {
  file: string;
  text: string;
}

// Index 0 is in the bin from the start; each completed transmission adds the
// next one.
export const LETTERS: Letter[] = [
  {
    file: "draft_001.txt",
    text: "GREETINGS, EARTHLING.      <- too formal\nGreetings, earthling.      <- still too formal\nhi.\n\n[UNTRANSLATED] your song again tonight. 3:14. same as always.\n[UNTRANSLATED] [UNTRANSLATED] [UNTRANSLATED].",
  },
  {
    file: "draft_002.txt",
    text: "your song, transcribed:\n  beep\n  the long screaming part\n  the crunchy part\n  then you are here\n\ni have listened to it 1,412 times.\ndo not include this number.",
  },
  {
    file: "draft_003.txt",
    text: "study notes, earth love songs:\n- everyone is called \"baby.\" no babies are present. follow up\n- there are always five of them. why five\n- they all want something \"tonight.\" very time sensitive\n- coordinated dancing appears to be mandatory. practicing",
  },
  {
    file: "draft_004.txt",
    text: "openers, ranked:\n1. \"your modem sings beautifully\"   <- true. keep\n2. \"are u a radio wave. because\"    <- did not finish. lost nerve\n3. \"take me to your leader\"         <- wrong direction",
  },
  {
    file: "draft_005.txt",
    text: "telling them what i am:\nPRO  honesty is good, per songs\nPRO  they will find out (the dish is hard to hide)\nCON  the dish\nCON  they might log off\nCON  they might log off",
  },
  {
    file: "draft_006.txt",
    text: "the window closes at 4:00.\nafter that i'm on the other side of the planet\nand your light is too small to see.\n\ncould stay longer if i turn my lights off.\nbut then you couldn't see me.",
  },
  {
    file: "draft_007.txt",
    text: "i came a long way for a song that was only a modem.\ni know that now.\ni'd come again.",
  },
];

// Asked one per completed transmission. The player answers in the IM box;
// any answer works. Answers are saved for the ending (see docs/story.md).
export interface Question {
  key: string;
  ask: string;
  reply(answer: string): string;
}

const COLOURS =
  /\b(red|orange|yellow|green|blue|purple|pink|black|white|gr[ae]y|teal|cyan|magenta|lilac|navy|gold|silver|violet)\b/;

export const QUESTIONS: Question[] = [
  {
    key: "brb",
    ask: "quick q. what does brb mean. someone said it in 1997 and i am still waiting",
    reply: (a) => (/right back/.test(a) ? "oh. ok. they did not come back" : "noted. adding to file"),
  },
  {
    key: "skyColor",
    ask: "what color is ur sky. asking for a friend",
    reply: (a) => {
      const colour = a.match(COLOURS)?.[0];
      return colour ? `${colour}. noted. bringing something ${colour}` : "noted. adding to file";
    },
  },
  {
    key: "byeCount",
    ask: "how many times do u say bye before it counts. the songs disagree",
    reply: (a) => {
      const n = Number(a.match(/\d+/)?.[0] ?? NaN);
      if (Number.isNaN(n)) return "noted. will say it a lot to be safe";
      return n >= 3 ? `${n}. ok. that matches the data` : `${n}?? the songs say way more`;
    },
  },
  {
    key: "gift",
    ask: "do u prefer flowers or more bandwidth",
    reply: (a) =>
      /flower/.test(a)
        ? "flowers. ok. sourcing flowers. (how)"
        : /band/.test(a)
          ? "bandwidth. easy. that i have"
          : "noted. bringing both to be safe",
  },
  {
    key: "weird",
    ask: "if someone came a really long way to see u would that be weird. hypothetically",
    reply: (a) =>
      /\b(no|nah|not|nope)\b/.test(a)
        ? "ok good. unrelated"
        : /\b(yes|yeah|ya|yea|kinda|maybe|little)\b/.test(a)
          ? "noted. coming anyway"
          : "hypothetically noted",
  },
  {
    key: "meetSpot",
    ask: "where. when. do i need shoes",
    reply: (a) => `ok. "${a.slice(0, 40)}". i will be the one glowing`,
  },
];

// Keyword replies to anything the player types when no question is pending.
// `confessed` is true once transmission 5 ("I AM NOT FROM AROUND HERE") is done.
export const KEYWORDS: { match: RegExp; reply(confessed: boolean): string }[] = [
  { match: /\ba\/?s\/?l\b/, reply: () => "age: old. sex: ?. location: up" },
  { match: /\b1420\b/, reply: () => "...how do u know that name" },
  {
    match: /how (do|did) (u|you) know/,
    reply: (c) => (c ? "i can see ur screen from here. sorry" : "lucky guess"),
  },
  {
    match: /who (are|r) (u|you)/,
    reply: (c) => (c ? "u know who" : "a fellow listener"),
  },
  {
    match: /\b(alien|ufo|et|martian|space)\b/,
    reply: (c) => (c ? "don't make it weird" : "lol what"),
  },
  { match: /where (are|r) (u|you)/, reply: () => "nearby. ish. relatively" },
  { match: /be right back|\bbrb\b/, reply: () => "they always say that" },
];

const WALLPAPER_NAMES: Record<string, string> = {
  nebula: "space one",
  chrome: "shiny one",
  static: "static one",
  teal: "teal one",
};

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
    "ok this one is studying something. very hard",
    "i think it's nervous. take it slow",
    "i keep losing it between the words",
    "two filters now. ok. almost there. (no pressure)",
  ],
  firstInterference: "too much static. move the NOISE slider till the EQ button lights",
  complete: [
    "...hello to u too i guess. press >>| for the next one",
    "ur modem DOES sing tho. objectively",
    "love songs?? weird. normal. weird",
    "it's not too much. tell it it's not too much",
    "...ok. so. funny story",
    "ok. go. i'll wait",
  ],
  // An Act 2 tell: it notices a wallpaper change it was never told about.
  wallpaper: (wp: string) => `ooh i like the ${WALLPAPER_NAMES[wp] ?? "new one"}`,
  // Reactions to the hidden things on the desktop (shell/eggs.ts and
  // shell/commands.ts). Each is said once; the key is what triggers it.
  remarks: {
    "dos-1420": "...how do u know that name",
    ping: "did u just ping me. rude. (hi)",
    format: "pls no. my drafts are on there",
    konami: "...ur pressing buttons in a pattern. is that a cheat code. teach me",
    brb: "they always say that",
    clock: "stop. it's not 4 yet. i'm not ready",
    emptybin: "NOT THE DRAFTS",
    emptybinBack: "ok i put them back. don't do that",
  } as Record<string, string>,
  // About the first line in the Notepad, once this transmission (a zero-based
  // index) is done. Late, so players have had time to find the Notepad.
  notepadAfter: 4,
  notepad: (line: string) => `i read ur notepad. sorry. it was just open. "${line}"`,
  idle: "still there?",
  away: "ghostfreq_01 is away: same time tomorrow",
  replies: [
    "lol",
    "...",
    "noted",
    "adding to file",
    "u still on 600?",
    "don't stop now",
    "hold still. it's shy",
  ],
};
