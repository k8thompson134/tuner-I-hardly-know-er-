// The editable Notepad: whatever the player types is kept in localStorage.
// ghostfreq reads it later (see narrative.ts).

import { load, save } from "../storage";

const KEY = "signal-os-note";

export function loadNote(): string {
  const saved = load<unknown>(KEY, "");
  return typeof saved === "string" ? saved : "";
}

export function createNotepad() {
  const box = document.getElementById("note-text") as HTMLTextAreaElement;
  box.value = loadNote();

  let timer: number | undefined;
  box.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => save(KEY, box.value), 300);
  });

  document.addEventListener("os:open", (e) => {
    if ((e as CustomEvent<string>).detail === "win-note") box.focus();
  });
}
