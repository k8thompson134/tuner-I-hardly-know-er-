// Win98 system dialogs (Alert, Confirm) styled as native .os-window dialogs.
// Replaces browser-native window.alert() and window.confirm().

export interface DialogOptions {
  title?: string;
  message: string;
  icon?: "warn" | "error" | "info";
  buttons?: "ok" | "okcancel" | "yesno";
}

let activeResolve: ((value: boolean) => void) | null = null;

export function showDialog(options: DialogOptions): Promise<boolean> {
  const dlg = document.getElementById("win-dialog") as HTMLElement;
  const titleEl = document.getElementById("dialog-title") as HTMLElement;
  const msgEl = document.getElementById("dialog-msg") as HTMLElement;
  const iconUse = document.getElementById("dialog-icon-use") as SVGElement | null;
  const btnRow = document.getElementById("dialog-buttons") as HTMLElement;

  if (!dlg) {
    // Fallback if DOM not present
    return Promise.resolve(window.confirm(options.message));
  }

  // Cancel any existing active dialog
  if (activeResolve) {
    activeResolve(false);
    activeResolve = null;
  }

  const title = options.title ?? (options.buttons === "ok" ? "Message" : "Confirm");
  titleEl.textContent = title;
  msgEl.textContent = options.message;

  const iconType = options.icon ?? (options.buttons === "ok" ? "info" : "warn");
  const iconId =
    iconType === "error"
      ? "#i-dlg-error"
      : iconType === "info"
      ? "#i-dlg-info"
      : "#i-dlg-warn";
  iconUse?.setAttribute("href", iconId);

  btnRow.replaceChildren();

  return new Promise<boolean>((resolve) => {
    activeResolve = resolve;

    const closeWith = (val: boolean) => {
      dlg.hidden = true;
      if (activeResolve === resolve) {
        activeResolve = null;
        resolve(val);
      }
    };

    const makeBtn = (label: string, val: boolean, isDefault = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.textContent = label;
      b.onclick = () => closeWith(val);
      if (isDefault) setTimeout(() => b.focus(), 10);
      return b;
    };

    const buttons = options.buttons ?? "okcancel";
    if (buttons === "ok") {
      btnRow.append(makeBtn("OK", true, true));
    } else if (buttons === "yesno") {
      btnRow.append(makeBtn("Yes", true, true), makeBtn("No", false));
    } else {
      btnRow.append(makeBtn("OK", true, true), makeBtn("Cancel", false));
    }

    const closeBtn = dlg.querySelector<HTMLElement>("[data-close]");
    if (closeBtn) closeBtn.onclick = () => closeWith(false);

    dlg.hidden = false;
    dlg.style.zIndex = "13000";
  });
}

export function osAlert(message: string, title?: string, icon: "warn" | "error" | "info" = "info"): Promise<void> {
  return showDialog({ message, title, icon, buttons: "ok" }).then(() => {});
}

export function osConfirm(message: string, title?: string, icon: "warn" | "error" | "info" = "warn"): Promise<boolean> {
  return showDialog({ message, title, icon, buttons: "okcancel" });
}
