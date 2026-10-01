// Display Properties: wallpaper, desktop colour scheme, title bars, CRT and
// sound. Choices apply live, OK saves them and Cancel puts them back.

import { setSoundEnabled } from "./sfx";

const KEY = "signal-os-display";

interface Prefs {
  wallpaper: string;
  scheme: string;
  titlebar: string;
  font: string;
  crt: boolean;
  dawn: boolean;
  sound: boolean;
}

const DEFAULTS: Prefs = {
  wallpaper: "nebula",
  scheme: "standard",
  titlebar: "flat",
  font: "pixel",
  crt: false,
  dawn: true,
  sound: true,
};

function load(): Prefs {
  const prefs = { ...DEFAULTS };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    // Unreadable storage: use the defaults.
  }
  // ?wallpaper=chrome&scheme=lilac&titlebar=y2k&crt=1 for linkable variants.
  for (const [k, v] of new URLSearchParams(location.search)) {
    if (k in prefs) {
      const key = k as keyof Prefs;
      (prefs as Record<string, string | boolean>)[key] =
        typeof prefs[key] === "boolean" ? v === "1" : v;
    }
  }
  return prefs;
}

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export function createDisplayProperties({ close }: { close: (id: string) => void }) {
  const root = document.documentElement;
  const desktop = byId("desktop");
  const prefs = load();
  let saved = { ...prefs };

  function apply() {
    desktop.dataset.wallpaper = prefs.wallpaper;
    byId("monitor-screen").dataset.wallpaper = prefs.wallpaper;
    root.dataset.scheme = prefs.scheme;
    root.dataset.titlebar = prefs.titlebar;
    root.dataset.font = prefs.font;
    root.dataset.crt = prefs.crt ? "on" : "off";
    root.dataset.dawn = prefs.dawn ? "on" : "off";
    setSoundEnabled(prefs.sound);

    document
      .querySelectorAll<HTMLElement>("#wp-list [data-wp]")
      .forEach((d) => d.classList.toggle("sel", d.dataset.wp === prefs.wallpaper));
    byId<HTMLSelectElement>("opt-scheme").value = prefs.scheme;
    byId<HTMLSelectElement>("opt-titlebar").value = prefs.titlebar;
    byId<HTMLSelectElement>("opt-font").value = prefs.font;
    byId<HTMLInputElement>("opt-crt").checked = prefs.crt;
    byId<HTMLInputElement>("opt-dawn").checked = prefs.dawn;
    byId<HTMLInputElement>("opt-sound").checked = prefs.sound;
  }

  document.querySelectorAll<HTMLElement>("#wp-list [data-wp]").forEach((d) => {
    d.onclick = () => {
      prefs.wallpaper = d.dataset.wp ?? DEFAULTS.wallpaper;
      apply();
      document.dispatchEvent(new CustomEvent("os:wallpaper", { detail: prefs.wallpaper }));
    };
  });
  for (const [id, key] of [
    ["opt-scheme", "scheme"],
    ["opt-titlebar", "titlebar"],
    ["opt-font", "font"],
  ] as const) {
    byId<HTMLSelectElement>(id).onchange = (e) => {
      prefs[key] = (e.target as HTMLSelectElement).value;
      apply();
    };
  }
  for (const [id, key] of [
    ["opt-crt", "crt"],
    ["opt-dawn", "dawn"],
    ["opt-sound", "sound"],
  ] as const) {
    byId<HTMLInputElement>(id).onchange = (e) => {
      prefs[key] = (e.target as HTMLInputElement).checked;
      apply();
    };
  }

  document.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll<HTMLElement>(".tab").forEach((t) => {
        t.setAttribute("aria-selected", String(t === tab));
        byId(t.dataset.tab ?? "").hidden = t !== tab;
      });
    };
  });

  byId("disp-ok").onclick = () => {
    saved = { ...prefs };
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Private mode: the choice lasts until the page closes.
    }
    close("win-display");
  };
  const cancel = () => {
    Object.assign(prefs, saved);
    apply();
    close("win-display");
  };
  byId("disp-cancel").onclick = cancel;
  byId("disp-x").onclick = cancel;

  apply();
}
