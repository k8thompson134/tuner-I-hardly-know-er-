// The opening beat: a Win98 "Connect To" dialog. Its Connect button is also
// the user gesture that lets the shell's sounds play.

import { modem, unlockAudio } from "./sfx";

const SEEN_KEY = "signal-os-dialed";
const STEPS: [number, string][] = [
  [0, "Dialing 555-0314..."],
  [1300, "Verifying username and password..."],
  [2700, "Logging on to network..."],
  [3900, "Connected at 56,000 bps"],
];
const CONNECTED_AT = 4700;

function alreadyDialed(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markDialed(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: the dialog just shows again next visit.
  }
}

export function createDialup({
  onConnected,
  showWindow,
  hideWindow,
}: {
  onConnected: () => void;
  showWindow: (id: string) => void;
  hideWindow: (id: string) => void;
}) {
  const form = document.getElementById("connect-form") as HTMLElement;
  const progress = document.getElementById("connect-progress") as HTMLElement;
  const status = document.getElementById("connect-status") as HTMLElement;
  const title = document.getElementById("connect-title") as HTMLElement;
  const tray = document.getElementById("tray-modem") as unknown as SVGElement;
  let timers: number[] = [];
  let connected = false;

  const finish = (withModem: boolean) => {
    timers.forEach(clearTimeout);
    timers = [];
    document.body.classList.remove("busy");
    hideWindow("win-connect");
    markDialed();
    if (withModem && !connected) {
      connected = true;
      tray.removeAttribute("hidden");
      onConnected();
    }
  };

  (document.getElementById("connect-go") as HTMLElement).onclick = () => {
    unlockAudio();
    form.hidden = true;
    progress.hidden = false;
    title.textContent = "Connecting to Signal ISP";
    document.body.classList.add("busy");
    modem();
    STEPS.forEach(([at, text]) =>
      timers.push(window.setTimeout(() => (status.textContent = text), at))
    );
    timers.push(window.setTimeout(() => finish(true), CONNECTED_AT));
  };
  for (const id of ["connect-offline", "connect-cancel", "connect-x"]) {
    (document.getElementById(id) as HTMLElement).onclick = () => finish(false);
  }

  const open = () => {
    form.hidden = false;
    progress.hidden = true;
    title.textContent = "Connect To";
    status.textContent = "Dialing...";
    showWindow("win-connect");
  };

  return {
    // First visit shows the dialog. Later visits skip it and come online
    // quietly (no gesture yet, so no modem sound).
    start() {
      if (alreadyDialed() && !new URLSearchParams(location.search).has("dialup")) {
        connected = true;
        tray.removeAttribute("hidden");
        onConnected();
      } else {
        open();
      }
    },
    redial: open,
  };
}
