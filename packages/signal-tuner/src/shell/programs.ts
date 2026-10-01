// The MS-DOS Prompt and Start > Run windows. Knows the desktop and the command
// copy, not Webamp or the game.

import {
  DOS_BANNER,
  DOS_PROMPT,
  resolveRun,
  runDos,
} from "./commands";

export interface ProgramsDesktop {
  open(id: string): void;
  close(id: string): void;
}

export interface ProgramsNarrative {
  remark(key: string, delay?: number): void;
}

const MAX_LINES = 300;

export function createPrograms(desktop: ProgramsDesktop, narrative: ProgramsNarrative) {
  const out = document.getElementById("dos-out") as HTMLElement;
  const dosScreen = document.getElementById("dos-screen") as HTMLElement;
  const dosInput = document.getElementById("dos-input") as HTMLInputElement;
  const runForm = document.getElementById("run-form") as HTMLFormElement;
  const runInput = document.getElementById("run-input") as HTMLInputElement;
  const runMsg = document.getElementById("run-msg") as HTMLElement;
  const runWin = document.getElementById("win-run") as HTMLElement;
  const clockEl = document.getElementById("clock") as HTMLElement;

  // --- MS-DOS Prompt ---------------------------------------------------------

  const history: string[] = [];
  let historyAt = 0;

  const print = (lines: string[]) => {
    for (const text of lines) {
      const row = document.createElement("div");
      row.textContent = text === "" ? " " : text;
      out.append(row);
    }
    while (out.children.length > MAX_LINES) out.firstElementChild?.remove();
    dosScreen.scrollTop = dosScreen.scrollHeight;
  };

  print(DOS_BANNER);

  const runCommand = (input: string) => {
    print([DOS_PROMPT + input]);
    if (input.trim() !== "") {
      history.push(input);
      historyAt = history.length;
    }
    const result = runDos(input, clockEl.textContent ?? "");
    if (result.clear) out.replaceChildren();
    print(result.lines);
    if (result.remark != null) {
      narrative.remark(result.remark, 1500);
    }
    if (result.open != null) desktop.open(result.open);
    if (result.exit) desktop.close("win-dos");
  };

  dosInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      runCommand(dosInput.value);
      dosInput.value = "";
    } else if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      historyAt = Math.max(0, historyAt - 1);
      dosInput.value = history[historyAt];
    } else if (e.key === "ArrowDown" && history.length > 0) {
      e.preventDefault();
      historyAt = Math.min(history.length, historyAt + 1);
      dosInput.value = history[historyAt] ?? "";
    }
  });
  // Clicking anywhere in the window types into the prompt, unless the player
  // is selecting text.
  dosScreen.addEventListener("click", () => {
    if (window.getSelection()?.toString() === "") dosInput.focus();
  });

  // --- Run ---------------------------------------------------------------------

  const showRunMessage = (text: string | null) => {
    runMsg.hidden = text == null;
    runMsg.textContent = text ?? "";
  };

  runForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const result = resolveRun(runInput.value);
    if (result.message != null) {
      showRunMessage(result.message);
      return;
    }
    if (result.open == null) return;
    showRunMessage(null);
    desktop.close("win-run");
    desktop.open(result.open);
    if (result.dos != null) runCommand(result.dos);
  });
  runInput.addEventListener("input", () => showRunMessage(null));
  runWin.addEventListener("keydown", (e) => {
    if (e.key === "Escape") desktop.close("win-run");
  });

  // Focus the field when a window is opened from the Start menu or an icon.
  document.addEventListener("os:open", (e) => {
    const id = (e as CustomEvent<string>).detail;
    if (id === "win-dos") dosInput.focus();
    if (id === "win-run") {
      showRunMessage(null);
      runInput.focus();
      runInput.select();
    }
  });

  return {
    // Opens the prompt and runs a command in it, as if it had been typed.
    runDos(command: string) {
      desktop.open("win-dos");
      runCommand(command);
    },
  };
}
