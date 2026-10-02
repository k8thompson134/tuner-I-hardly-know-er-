// The editable Notepad: whatever the player types is kept in localStorage.
// ghostfreq reads it later (see narrative.ts).

import { load, remove, save } from "../storage";

export const NOTE_KEY = "signal-os-note";

export function loadNote(): string {
  const saved = load<unknown>(NOTE_KEY, "");
  return typeof saved === "string" ? saved : "";
}

export function clearNote(): void {
  remove(NOTE_KEY);
}

export function createNotepad() {
  const box = document.getElementById("note-text") as HTMLTextAreaElement;
  box.value = loadNote();

  let timer: number | undefined;
  const flush = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
      save(NOTE_KEY, box.value);
    }
  };

  box.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      save(NOTE_KEY, box.value);
    }, 300);
  });

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  document.addEventListener("os:open", (e) => {
    if ((e as CustomEvent<string>).detail === "win-note") box.focus();
  });
}
