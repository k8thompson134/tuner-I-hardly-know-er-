// Hidden tricks on the desktop. Each one is small and says something once.
// Knows the desktop and the narrative, not Webamp or the game.

export interface EggsDesktop {
  open(id: string): void;
}

export interface EggsNarrative {
  remark(key: string, delay?: number): void;
  emptyBin(): void;
}

import { osConfirm } from "./dialog";

export interface EggsPrograms {
  runDos(command: string): void;
}

const KONAMI = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
];

const typingInField = (e: Event) =>
  e.target instanceof Element &&
  e.target.closest("input, textarea, select, [role='slider'], [contenteditable]") != null;

export function createEggs(
  desktop: EggsDesktop,
  narrative: EggsNarrative,
  programs: EggsPrograms
) {
  const root = document.getElementById("desktop") as HTMLElement;

  // --- The Konami code, and a few words typed on the desktop ----------------

  const keys: string[] = [];
  let typed = "";
  let typedTimer: number | undefined;

  const glitch = () => {
    root.classList.remove("glitch");
    // Reflow so the animation restarts if it's triggered twice.
    void root.offsetWidth;
    root.classList.add("glitch");
    window.setTimeout(() => root.classList.remove("glitch"), 700);
  };

  window.addEventListener("keydown", (e) => {
    if (typingInField(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();

    keys.push(key);
    if (keys.length > KONAMI.length) keys.shift();
    if (keys.join() === KONAMI.join()) {
      glitch();
      narrative.remark("konami", 900);
    }

    if (key.length === 1) {
      typed = (typed + key).slice(-8);
      window.clearTimeout(typedTimer);
      typedTimer = window.setTimeout(() => (typed = ""), 2000);
      if (typed.endsWith("1420")) {
        typed = "";
        // The prompt takes focus; keep this last digit out of it.
        e.preventDefault();
        programs.runDos("1420");
      } else if (typed.endsWith("brb")) {
        typed = "";
        narrative.remark("brb", 600);
      }
    }
  });

  // --- Five clicks on the clock ---------------------------------------------

  const clock = document.getElementById("clock") as HTMLElement;
  let clicks: number[] = [];
  clock.addEventListener("click", () => {
    const now = performance.now();
    clicks = [...clicks.filter((t) => now - t < 3000), now];
    if (clicks.length < 5) return;
    clicks = [];
    const was = clock.textContent;
    clock.textContent = "4:00 AM";
    narrative.remark("clock", 700);
    window.setTimeout(() => {
      if (clock.textContent === "4:00 AM") clock.textContent = was;
    }, 2500);
  });

  // --- Right-click the Recycle Bin ------------------------------------------

  const binIcon = document.querySelector<HTMLElement>('.icon[data-open="win-trash"]');
  const menu = document.getElementById("ctx-bin") as HTMLElement;
  const hideMenu = () => (menu.hidden = true);

  const confirmAndEmpty = async () => {
    const ok = await osConfirm(
      "Are you sure you want to permanently delete these items?",
      "Recycle Bin",
      "warn"
    );
    if (ok) {
      narrative.emptyBin();
    }
  };

  const binEmptyBtn = document.getElementById("bin-empty-btn");
  binEmptyBtn?.addEventListener("click", confirmAndEmpty);
  binEmptyBtn?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      confirmAndEmpty();
    }
  });

  binIcon?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    menu.hidden = false;
    menu.style.left = Math.min(e.clientX, innerWidth - menu.offsetWidth - 4) + "px";
    menu.style.top = Math.min(e.clientY, innerHeight - menu.offsetHeight - 34) + "px";
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menu.contains(e.target as Node)) hideMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideMenu();
  });
  menu.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (!act) return;
    hideMenu();
    if (act === "open") desktop.open("win-trash");
    if (act === "empty") confirmAndEmpty();
  });
}
