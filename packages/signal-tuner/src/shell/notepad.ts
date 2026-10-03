// The editable Notepad: whatever the player types is kept in localStorage.
// ghostfreq reads it later (see narrative.ts).

import { load, remove, save } from "../storage";
import { osAlert, osConfirm } from "./dialog";

export const NOTE_KEY = "signal-os-note";

export function loadNote(): string {
  const saved = load<unknown>(NOTE_KEY, "");
  return typeof saved === "string" ? saved : "";
}

export function clearNote(): void {
  remove(NOTE_KEY);
}

export interface NotepadDesktop {
  close(id: string): void;
}

export function createNotepad(desktop?: NotepadDesktop) {
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

  // --- Dropdown menus for all Notepads (win-note, win-letter, win-credits) ---
  const menuRoots = document.querySelectorAll<HTMLElement>(".menu-root");

  const closeAllMenus = () => {
    menuRoots.forEach((root) => {
      root.classList.remove("open");
      const popup = root.querySelector<HTMLElement>(".menu-popup");
      if (popup) popup.hidden = true;
    });
  };

  menuRoots.forEach((root) => {
    const label = root.querySelector<HTMLElement>(".menu-label");
    const popup = root.querySelector<HTMLElement>(".menu-popup");
    if (!label || !popup) return;

    label.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = root.classList.contains("open");
      closeAllMenus();
      if (!isOpen) {
        root.classList.add("open");
        popup.hidden = false;
      }
    });

    label.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        closeAllMenus();
        root.classList.add("open");
        popup.hidden = false;
        popup.querySelector<HTMLButtonElement>("button")?.focus();
      }
    });
  });

  document.addEventListener("pointerdown", (e) => {
    if (!(e.target as Element)?.closest(".menu-root")) {
      closeAllMenus();
    }
  });

  // Wire up action handlers on all notepad menu buttons
  document.querySelectorAll<HTMLElement>("[data-note-act]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeAllMenus();
      const act = btn.dataset.noteAct;
      const win = btn.closest<HTMLElement>(".os-window");
      const winId = win?.id;

      if (act === "new") {
        if (box.value.trim() !== "") {
          const proceed = await osConfirm(
            "The text in this note will be lost. Create a new document?",
            "Notepad",
            "warn"
          );
          if (!proceed) return;
        }
        box.value = "";
        clearNote();
        box.focus();
      } else if (act === "selectall") {
        box.focus();
        box.select();
      } else if (act === "exit") {
        if (winId && desktop) {
          desktop.close(winId);
        } else if (win) {
          win.hidden = true;
        }
      } else if (act === "about") {
        await osAlert(
          "Notepad v3.14\nSignal OS Desktop Edition\n\n(C) 1998-2001 Signal Corp.",
          "About Notepad",
          "info"
        );
      }
    });
  });
}
