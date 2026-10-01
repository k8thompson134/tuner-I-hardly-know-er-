// Reacts to game events with story: buddy IMs and Recycle Bin letters. Knows
// the desktop and the story copy, not Webamp or the game.

import { BUDDY, LETTERS } from "./story";
import { doorClose, doorOpen, imBlip } from "./sfx";
import { load, save } from "../storage";

export const STORY_KEY = "signal-os-story";
const MAX_LOG = 200;

interface LogLine {
  cls: string;
  who: string;
  text: string;
}

interface SavedStory {
  said: string[];
  log: LogLine[];
  bins: number;
  signedOff: boolean;
}

export interface NarrativeDesktop {
  notify(id: string): void;
}

export type GameEvent =
  | { type: "decode"; transmission: number; count: number; total: number }
  | { type: "interference" }
  | { type: "complete"; transmission: number; last: boolean };

const IDLE_MS = 60_000;

export function createNarrative(desktop: NarrativeDesktop) {
  const log = document.getElementById("im-log") as HTMLElement;
  const form = document.getElementById("im-form") as HTMLFormElement;
  const input = document.getElementById("im-input") as HTMLInputElement;
  const binList = document.getElementById("bin-list") as HTMLElement;
  const binStatus = document.getElementById("bin-status") as HTMLElement;
  const letterTitle = document.getElementById("letter-title") as HTMLElement;
  const letterText = document.getElementById("letter-text") as HTMLElement;

  const saved = load<Partial<SavedStory> | null>(STORY_KEY, null) ?? {};
  const savedLog = (Array.isArray(saved.log) ? saved.log : []).filter(
    (l) => typeof l?.text === "string" && typeof l?.who === "string" && typeof l?.cls === "string"
  );

  let online = false;
  let signedOff = saved.signedOff === true;
  let lastProgressAt = 0;
  // `said` also holds lines still waiting to appear; only `delivered` is saved,
  // so a reload while one is pending doesn't lose it.
  const said = new Set<string>(Array.isArray(saved.said) ? saved.said : []);
  const delivered = new Set<string>(said);
  let binCount = 0;
  const logLines: LogLine[] = savedLog.slice(-MAX_LOG);

  const persist = () =>
    save(STORY_KEY, { said: [...delivered], log: logLines, bins: binCount, signedOff });

  // --- Instant messages ------------------------------------------------------

  function render(cls: string, who: string, text: string) {
    const row = document.createElement("div");
    if (who) {
      const name = document.createElement("span");
      name.className = cls;
      name.textContent = `${who}:`;
      row.append(name, ` ${text}`);
    } else {
      row.className = "sys";
      row.textContent = text;
    }
    log.append(row);
    log.scrollTop = log.scrollHeight;
  }

  function append(cls: string, who: string, text: string) {
    render(cls, who, text);
    logLines.push({ cls, who, text });
    if (logLines.length > MAX_LOG) logLines.shift();
    persist();
  }

  logLines.forEach((l) => render(l.cls, l.who, l.text));

  function say(text: string, delay = 0, key?: string) {
    setTimeout(() => {
      if (signedOff) return;
      if (log.children.length === 0) doorOpen();
      else imBlip();
      if (key != null) delivered.add(key);
      append("them", BUDDY.name, text);
      desktop.notify("win-im");
    }, delay);
  }

  const sayOnce = (key: string, text: string, delay = 0) => {
    if (said.has(key)) return;
    said.add(key);
    say(text, delay, key);
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text === "") return;
    append("me", "sk8rgrl_3am", text);
    input.value = "";
    if (online && !signedOff) {
      const reply = BUDDY.replies[Math.floor(Math.random() * BUDDY.replies.length)];
      say(reply, 1200 + Math.random() * 1500);
    }
  });

  setInterval(() => {
    if (!online || signedOff) return;
    if (performance.now() - lastProgressAt > IDLE_MS) {
      lastProgressAt = performance.now();
      say(BUDDY.idle);
    }
  }, 5000);

  // --- Recycle Bin -------------------------------------------------------------

  function renderBin() {
    binList.replaceChildren(
      ...LETTERS.slice(0, binCount).map((letter, i) => {
        const row = document.createElement("div");
        row.className = "list-row";
        row.dataset.openRow = "win-letter";
        row.dataset.letter = String(i);
        row.innerHTML =
          '<svg><use href="#i-file" /></svg><div><span></span><small></small></div>';
        (row.querySelector("span") as HTMLElement).textContent = letter.file;
        (row.querySelector("small") as HTMLElement).textContent =
          `${Math.max(1, Math.round(letter.text.length / 100))} KB`;
        return row;
      })
    );
    binStatus.textContent = `${binCount} object(s)`;
  }

  document.addEventListener("os:row-open", (e) => {
    const row = (e as CustomEvent<HTMLElement>).detail;
    const letter = LETTERS[Number(row.dataset.letter)];
    if (letter == null) return;
    letterTitle.textContent = `${letter.file} - Notepad`;
    letterText.textContent = letter.text;
  });

  function addLetter() {
    if (binCount < LETTERS.length) {
      binCount++;
      persist();
      renderBin();
      desktop.notify("win-trash");
    }
  }

  binCount =
    typeof saved.bins === "number" && saved.bins >= 1 && saved.bins <= LETTERS.length
      ? Math.floor(saved.bins)
      : 1;
  renderBin();

  // --- Public ------------------------------------------------------------------

  return {
    // The player has connected: the buddy comes online.
    connect() {
      if (online) return;
      online = true;
      lastProgressAt = performance.now();
      BUDDY.onConnect.forEach((m, i) => sayOnce(`hello${i}`, m.say, m.after));
    },

    onGameEvent(event: GameEvent) {
      lastProgressAt = performance.now();
      if (!online) {
        if (event.type === "complete") addLetter();
        return;
      }
      if (event.type === "interference") {
        sayOnce("noise", BUDDY.firstInterference, 600);
      } else if (event.type === "decode") {
        sayOnce("first", BUDDY.firstDecode, 700);
        if (event.count === Math.ceil(event.total / 2) && event.count < event.total) {
          const lines = BUDDY.halfway;
          sayOnce(`half${event.transmission}`, lines[event.transmission % lines.length], 900);
        }
      } else {
        addLetter();
        const lines = BUDDY.complete;
        sayOnce(`done${event.transmission}`, lines[Math.min(event.transmission, lines.length - 1)], 1400);
        if (event.last) {
          setTimeout(() => {
            if (signedOff) return;
            doorClose();
            append("sys", "", BUDDY.signOff);
            signedOff = true;
            persist();
          }, 6000);
        }
      }
    },
  };
}
