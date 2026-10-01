// Signal OS: the Win98 desktop around the player. Knows neither Webamp nor
// the game; main.ts hands it the few Winamp hooks the taskbar needs.

export interface WinampHooks {
  // Full-desktop layer Webamp renders into.
  mount: HTMLElement;
  onMinimize: (cb: () => void) => void;
  // Fires when Winamp's X is pressed. The shell hides Winamp rather than
  // letting it unmount, so the game (and its EQ cleanup) survive.
  onClose: (cb: () => void) => void;
}

type WinampState = "open" | "minimized" | "closed";

const phone = matchMedia("(max-width: 767px)");
const coarse = matchMedia("(pointer: coarse)");
const tapOpens = () => phone.matches || coarse.matches;

export function createDesktop({ winamp }: { winamp: WinampHooks }) {
  const desktop = document.getElementById("desktop") as HTMLElement;
  const tabs = document.getElementById("tabs") as HTMLElement;
  const windows = [...desktop.querySelectorAll<HTMLElement>(".os-window")];
  let topZ = 10;
  let winampState: WinampState = "open";
  let winampActive = true;
  const flashing = new Set<HTMLElement>();

  // --- Focus + z-order -----------------------------------------------------

  function activate(win: HTMLElement | "winamp") {
    windows.forEach((w) => w.classList.remove("active"));
    winampActive = win === "winamp";
    if (win === "winamp") {
      winamp.mount.style.zIndex = String(++topZ);
    } else {
      win.classList.add("active");
      win.style.zIndex = String(++topZ);
      flashing.delete(win);
    }
    syncTabs();
  }

  // Brings a window up without stealing focus and flashes its taskbar button
  // (a new IM arriving).
  function notify(id: string) {
    const win = document.getElementById(id);
    if (win == null) return;
    if (win.hidden) {
      win.hidden = false;
      win.dataset.min = "";
      win.style.zIndex = String(++topZ);
    }
    if (!win.classList.contains("active")) flashing.add(win);
    syncTabs();
  }

  function openWin(id: string) {
    if (id === "winamp") {
      showWinamp();
      return;
    }
    const win = document.getElementById(id);
    if (win == null) return;
    win.hidden = false;
    win.dataset.min = "";
    activate(win);
    if (phone.matches) win.scrollIntoView({ block: "start" });
  }

  function closeWin(win: HTMLElement) {
    win.hidden = true;
    win.dataset.min = "";
    syncTabs();
  }

  function minimizeWin(win: HTMLElement) {
    win.hidden = true;
    win.dataset.min = "1";
    win.classList.remove("active");
    syncTabs();
  }

  // --- Winamp as a taskbar app ---------------------------------------------

  function showWinamp() {
    winampState = "open";
    winamp.mount.style.visibility = "";
    activate("winamp");
  }

  winamp.onMinimize(() => {
    winampState = "minimized";
    winampActive = false;
    // visibility, not display: Webamp measures this container on resize.
    winamp.mount.style.visibility = "hidden";
    syncTabs();
  });
  winamp.onClose(() => {
    winampState = "closed";
    winampActive = false;
    winamp.mount.style.visibility = "hidden";
    syncTabs();
  });
  winamp.mount.addEventListener("pointerdown", () => {
    if (!winampActive) activate("winamp");
  });

  // --- Taskbar --------------------------------------------------------------

  function tabButton(
    icon: string,
    title: string,
    pressed: boolean,
    onClick: () => void,
    flash = false
  ) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn" + (pressed ? " pressed" : "") + (flash ? " flash" : "");
    b.innerHTML = `<svg><use href="#${icon}"/></svg><span></span>`;
    (b.querySelector("span") as HTMLElement).textContent = title;
    b.title = title;
    b.onclick = onClick;
    return b;
  }

  function syncTabs() {
    const buttons: HTMLButtonElement[] = [];
    if (winampState !== "closed") {
      buttons.push(
        tabButton("i-radio", "Signal Tuner", winampActive, () => {
          if (winampState === "minimized") showWinamp();
          else if (winampActive) {
            winampState = "minimized";
            winampActive = false;
            winamp.mount.style.visibility = "hidden";
            syncTabs();
          } else activate("winamp");
        })
      );
    }
    windows
      .filter((w) => !w.hidden || w.dataset.min)
      .forEach((w) => {
        const active = w.classList.contains("active") && !w.hidden;
        buttons.push(
          tabButton(
            w.dataset.icon ?? "",
            w.dataset.title ?? "",
            active,
            () => {
              if (w.hidden) openWin(w.id);
              else if (active) minimizeWin(w);
              else activate(w);
            },
            flashing.has(w)
          )
        );
      });
    tabs.replaceChildren(...buttons);
  }

  // --- Shell windows: buttons + dragging ------------------------------------

  windows.forEach((win) => {
    win.addEventListener("pointerdown", () => {
      if (!win.classList.contains("active")) activate(win);
    });
    win
      .querySelectorAll<HTMLElement>("[data-close]")
      .forEach((b) => (b.onclick = () => closeWin(win)));
    win
      .querySelectorAll<HTMLElement>("[data-min]")
      .forEach((b) => (b.onclick = () => minimizeWin(win)));
    win.querySelectorAll<HTMLElement>("[data-drag]").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        if (phone.matches || (e.target as Element).closest("button")) return;
        const bounds = desktop.getBoundingClientRect();
        const dx = e.clientX - win.offsetLeft;
        const dy = e.clientY - win.offsetTop;
        handle.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          const x = Math.min(bounds.width - 60, ev.clientX - dx);
          const y = Math.min(bounds.height - 20, ev.clientY - dy);
          win.style.left = Math.max(60 - win.offsetWidth, x) + "px";
          win.style.top = Math.max(0, y) + "px";
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener(
          "pointerup",
          () => handle.removeEventListener("pointermove", move),
          { once: true }
        );
      });
    });
  });

  // --- Desktop icons --------------------------------------------------------

  const icons = document.getElementById("icons") as HTMLElement;
  const clearIconSelection = () =>
    icons
      .querySelectorAll(".icon")
      .forEach((i) => i.classList.remove("selected"));

  icons.querySelectorAll<HTMLElement>(".icon").forEach((icon) => {
    const open = () => openWin(icon.dataset.open ?? "");
    icon.addEventListener("click", () => {
      clearIconSelection();
      icon.classList.add("selected");
      if (tapOpens()) open();
    });
    icon.addEventListener("dblclick", open);
    icon.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
  });

  // Rows inside shell windows that open another window (a file in the Recycle
  // Bin). Delegated, since rows can be added later; the "os:row-open" event
  // lets whoever owns the row fill the target window first.
  const openRow = (row: HTMLElement) => {
    document.dispatchEvent(new CustomEvent("os:row-open", { detail: row }));
    openWin(row.dataset.openRow ?? "");
  };
  desktop.addEventListener("click", (e) => {
    const row = (e.target as Element).closest<HTMLElement>("[data-open-row]");
    if (row == null) return;
    row.parentElement
      ?.querySelectorAll(".selected")
      .forEach((r) => r.classList.remove("selected"));
    row.classList.add("selected");
    if (tapOpens()) openRow(row);
  });
  desktop.addEventListener("dblclick", (e) => {
    const row = (e.target as Element).closest<HTMLElement>("[data-open-row]");
    if (row != null) openRow(row);
  });

  // --- Start menu ------------------------------------------------------------

  const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
  const startMenu = document.getElementById("start-menu") as HTMLElement;
  const setStart = (open: boolean) => {
    startMenu.hidden = !open;
    startBtn.classList.toggle("pressed", open);
    startBtn.setAttribute("aria-expanded", String(open));
  };
  startBtn.onclick = (e) => {
    e.stopPropagation();
    setStart(startMenu.hidden);
  };
  startMenu.querySelectorAll<HTMLElement>("[data-open]").forEach((b) => {
    b.onclick = () => {
      openWin(b.dataset.open ?? "");
      setStart(false);
    };
  });

  const shutdown = document.getElementById("shutdown") as HTMLElement;
  (document.getElementById("shutdown-item") as HTMLElement).onclick = () => {
    setStart(false);
    shutdown.hidden = false;
  };
  shutdown.onclick = () => (shutdown.hidden = true);

  // --- Right-click menu --------------------------------------------------------

  const ctx = document.getElementById("ctx") as HTMLElement;
  desktop.addEventListener("contextmenu", (e) => {
    if (e.target !== desktop && e.target !== winamp.mount) return;
    e.preventDefault();
    ctx.hidden = false;
    ctx.style.left =
      Math.min(e.clientX, innerWidth - ctx.offsetWidth - 4) + "px";
    ctx.style.top =
      Math.min(e.clientY, innerHeight - ctx.offsetHeight - 34) + "px";
  });
  ctx.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (!act) return;
    ctx.hidden = true;
    if (act === "arrange") {
      [...icons.children]
        .sort((a, b) => (a.textContent ?? "").localeCompare(b.textContent ?? ""))
        .forEach((i) => icons.append(i));
    }
    if (act === "props") openWin("win-display");
    if (act === "refresh") {
      icons.style.visibility = "hidden";
      setTimeout(() => (icons.style.visibility = ""), 120);
    }
  });

  // --- Global dismissals ---------------------------------------------------------

  document.addEventListener("pointerdown", (e) => {
    const target = e.target as Node;
    if (
      !startMenu.hidden &&
      !startMenu.contains(target) &&
      !startBtn.contains(target)
    ) {
      setStart(false);
    }
    if (!ctx.contains(target)) ctx.hidden = true;
    if (target === desktop || target === winamp.mount) clearIconSelection();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setStart(false);
      ctx.hidden = true;
    }
  });

  // --- Initial layout ---------------------------------------------------------

  const placeShellWindows = () => {
    if (phone.matches) return;
    const w = desktop.clientWidth;
    const place = (id: string, left: number, top: number) => {
      const el = document.getElementById(id);
      if (el) Object.assign(el.style, { left: `${left}px`, top: `${top}px` });
    };
    place("win-trash", w - 300, 40);
    place("win-display", 160, 60);
    place("win-credits", 200, 90);
    place("win-letter", w - 340, 130);
    place("win-im", Math.max(700, w - 330), Math.max(60, desktop.clientHeight - 330));
  };
  placeShellWindows();
  // Crossing the phone breakpoint (rotating, resizing) must place windows
  // too, or they'd all sit at the top-left once the stacked layout ends.
  phone.addEventListener("change", placeShellWindows);
  activate("winamp");

  return {
    open: openWin,
    close(id: string) {
      const win = document.getElementById(id);
      if (win != null) closeWin(win);
    },
    closeStart: () => setStart(false),
    notify,
    sync: syncTabs,
    setClock(text: string) {
      (document.getElementById("clock") as HTMLElement).textContent = text;
      (document.getElementById("date-stamp") as HTMLElement).textContent =
        `'01 ${text}`.replace(":", " ");
    },
  };
}
