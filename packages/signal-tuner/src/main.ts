import WebampLazy from "../../webamp/js/webampLazy";
import type { IMetadataApi } from "../../webamp/js/types";
import { TRANSMISSIONS, WordBand } from "./transmissions";
import { HIDE_EQ_EXTRAS, VISIBLE_BANDS } from "./cosmetics";
import {
  applyEqBandVisibility,
  clearMarqueeMessage,
  onStateSlice,
  setMarqueeMessage,
} from "./webampAdapter";
import { RunningTransmission, runTransmission } from "./runTransmission";
import type { LayerStatus, ResonanceState } from "./SignalTunerGame";

// Which EQ slider is the tuning dial. Must be one of VISIBLE_BANDS, or the
// player can't reach it.
const TUNER_BAND = 600;

// Module-level state for cleanup on unload
let runningTx: RunningTransmission | null = null;

async function main() {
  const webampNode = document.getElementById("webamp-mount") as HTMLDivElement;
  const statusReadout = document.getElementById(
    "status-readout"
  ) as HTMLDivElement;
  const layerHud = document.getElementById("layer-hud") as HTMLDivElement;
  const instructions = document.getElementById(
    "instructions"
  ) as HTMLDivElement;

  const webamp = new WebampLazy({
    requireJSZip: () => import("jszip").then((mod) => mod.default),
    requireMusicMetadata: () =>
      import("music-metadata") as unknown as Promise<IMetadataApi>,
  });
  await webamp.renderInto(webampNode);
  applyEqBandVisibility(webamp, webampNode, VISIBLE_BANDS, {
    hideExtras: HIDE_EQ_EXTRAS,
  });
  // @ts-ignore debugging hook
  window.__webamp = webamp;

  // Initialize Webamp's playlist with the 3 transmissions so the player itself
  // is the mission selector.
  const initialTracks = TRANSMISSIONS.map((tx, idx) => ({
    url: tx.unlockTrack?.url ?? "",
    defaultName: `${idx + 1}. Signal Tuner - ${tx.title}`,
    metaData: {
      artist: tx.unlockTrack?.artist ?? "Signal Tuner",
      title: `${tx.title}${tx.unlockTrack ? ` (${tx.unlockTrack.title})` : ""}`,
    },
    duration: idx === 0 ? 178 : idx === 1 ? 141 : 210,
  }));
  webamp.appendTracks(initialTracks);

  const initialPlaylistState = webamp.store.getState();
  if (initialPlaylistState.playlist.trackOrder.length > 0) {
    webamp.store.dispatch({
      type: "BUFFER_TRACK",
      id: initialPlaylistState.playlist.trackOrder[0],
    });
  }

  let currentTxIndex = 0;
  let isUncleared = false;
  let currentUnclearedNames: string[] = [];
  let currentLockedWord: string | null = null;
  let currentLockBand: WordBand | null = null;
  let currentLockProgress: number = 0;
  let currentLayerStatuses: LayerStatus[] = [];
  let currentResonance: ResonanceState = {
    percent: 100,
    isCleared: true,
    hint: "",
  };
  const completedTransmissions = new Set<number>();

  const updateStatusDisplay = () => {
    const tx = TRANSMISSIONS[currentTxIndex];
    if (isUncleared) {
      statusReadout.textContent = `● RESONANCE UNBALANCED (${currentResonance.percent}%) — ${currentUnclearedNames.join(" + ")} INTERFERENCE`;
      statusReadout.className = "interference";
    } else if (
      currentLockBand != null &&
      currentLockProgress > 0 &&
      currentLockProgress < 1
    ) {
      const pct = Math.round(currentLockProgress * 100);
      statusReadout.textContent = `● SYNCHRONIZING "${currentLockBand.word}" — ${pct}%`;
      statusReadout.className = "locking";
    } else if (currentLockedWord != null) {
      statusReadout.textContent = `● STATION "${currentLockedWord}" (LOCKED)`;
      statusReadout.className = "locked";
    } else {
      statusReadout.textContent = tx.title;
      statusReadout.className = "";
    }
  };

  const updateHud = () => {
    const tx = TRANSMISSIONS[currentTxIndex];
    if (!layerHud) return;

    const sections: string[] = [];

    // 1. Resonance Gauge (for transmissions with interference layers)
    if (tx.layers && tx.layers.length > 0) {
      const isCleared = currentResonance.isCleared;
      sections.push(`
        <div class="resonance-gauge ${isCleared ? "cleared" : ""}">
          <div class="res-meta">
            <span class="res-title">FILTER RESONANCE</span>
            <span class="res-pct ${isCleared ? "cleared" : "unbalanced"}">
              ${isCleared ? "100% ✓ STABLE" : `${currentResonance.percent}% UNBALANCED`}
            </span>
          </div>
          <div class="res-track">
            <div class="res-fill ${isCleared ? "cleared" : "unbalanced"}" style="width: ${currentResonance.percent}%"></div>
          </div>
          <div class="res-hint">${currentResonance.hint}</div>
        </div>
      `);
    }

    const chips: string[] = [];

    // 2. Layer status chips (170, 14K, etc.)
    currentLayerStatuses.forEach((st) => {
      const bandLabel =
        st.layer.band === 14000 ? "14K" : String(st.layer.band);
      if (st.isCleared) {
        chips.push(
          `<div class="hud-chip cleared"><span class="chip-name">${st.layer.name} (${bandLabel})</span><span class="chip-guide">✓ OPTIMAL (${st.currentValue}%)</span></div>`
        );
      } else {
        const hintText = st.targetHint ?? "ADJUST";
        chips.push(
          `<div class="hud-chip warning"><span class="chip-name">${st.layer.name} (${bandLabel})</span><span class="chip-guide">${hintText} (${st.currentValue}%)</span></div>`
        );
      }
    });

    // 3. 600 Dial chip
    const decodedCount = runningTx?.game?.getDecodedCount() ?? 0;
    const totalBands = tx.bands.length;
    if (isUncleared) {
      chips.push(
        `<div class="hud-chip disabled"><span class="chip-name">600 DIAL</span><span class="chip-guide">WAITING: BALANCE RESONANCE FIRST</span></div>`
      );
    } else if (
      currentLockBand != null &&
      currentLockProgress > 0 &&
      currentLockProgress < 1
    ) {
      const pct = Math.round(currentLockProgress * 100);
      chips.push(
        `<div class="hud-chip locking"><span class="chip-name">600 DIAL</span><span class="chip-guide">HOLD TO LOCK: "${currentLockBand.word}" <span class="lock-mini-bar"><span class="lock-mini-fill" style="width:${pct}%"></span></span> ${pct}%</span></div>`
      );
    } else if (currentLockedWord != null) {
      chips.push(
        `<div class="hud-chip locked"><span class="chip-name">600 DIAL</span><span class="chip-guide">LOCKED: "${currentLockedWord}" ✓ (${decodedCount}/${totalBands})</span></div>`
      );
    } else {
      chips.push(
        `<div class="hud-chip active"><span class="chip-name">600 DIAL</span><span class="chip-guide">HUNTING SIGNAL (${decodedCount}/${totalBands})</span></div>`
      );
    }

    sections.push(`<div class="hud-chips-row">${chips.join("")}</div>`);
    layerHud.innerHTML = sections.join("");
  };

  const navHint = `<br><span style="color:#6ea270;font-size:11px;">Navigate transmissions using Winamp's <strong>Next (&gt;&gt;|)</strong> / <strong>Prev (|&lt;&lt;)</strong> buttons or the <strong>Playlist window</strong>.</span>`;

  const updateInstructions = () => {
    if (currentTxIndex === 0) {
      instructions.innerHTML = `<strong>Tuning Dial (600) — Hold to Lock</strong>: Drag band <strong>600</strong> to hunt for carrier waves. When you hit a station, <strong>hold steady for ~0.8s</strong> as the whistle drops to zero-beat and the radio squelch chirps to decode! 4 words hidden across the dial.${navHint}`;
    } else if (currentTxIndex === 1) {
      instructions.innerHTML = `<strong>Tuning Dial (600) + NOISE Filter (170)</strong>: Each station on dial 600 operates on a different carrier! As you move across the dial, trim <strong>170</strong> to match each station's frequency, then hold steady on <strong>600</strong> to lock.${navHint}`;
    } else {
      instructions.innerHTML = `<strong>Carrier Preselectors (170 + 600 + 14K)</strong>: Every station requires active preselector tracking across the whole board! Align <strong>14K</strong> (HF tracking) and <strong>170</strong> (LF coupled null) for each station you visit on dial <strong>600</strong>.${navHint}`;
    }
  };

  const startTx = (index: number) => {
    runningTx?.stop();
    currentTxIndex = index;
    const transmission = TRANSMISSIONS[index];
    currentLockedWord = null;
    currentLockBand = null;
    currentLockProgress = 0;
    isUncleared = false;
    currentUnclearedNames = [];
    currentLayerStatuses = [];
    currentResonance = { percent: 100, isCleared: true, hint: "" };

    // Stop playback if switching to a transmission that isn't yet completed
    if (!completedTransmissions.has(index)) {
      webamp.stop();
    }

    updateInstructions();
    updateStatusDisplay();
    updateHud();

    runningTx = runTransmission(webamp, transmission, {
      tunerBand: TUNER_BAND,
      proximityFeedback: true,
      onLockedBand: (word) => {
        currentLockedWord = word;
        updateStatusDisplay();
        updateHud();
      },
      onLockProgress: (band, progress) => {
        currentLockBand = band;
        currentLockProgress = progress;
        updateStatusDisplay();
        updateHud();
      },
      onInterferenceChange: (cleared, unclearedNames, statuses, resonance) => {
        isUncleared = !cleared;
        currentUnclearedNames = unclearedNames;
        currentLayerStatuses = statuses;
        currentResonance = resonance;
        updateStatusDisplay();
        updateHud();
      },
      onComplete: () => {
        completedTransmissions.add(index);
        updateHud();
      },
    });

    // Initialize layer values to center (50) so getLayerValue doesn't default
    if (transmission.layers) {
      transmission.layers.forEach((layer) => {
        runningTx!.game.setLayerValue(layer.band, 50);
      });
    }
  };

  // Wire player controls (>>|, |<<, double click) to switch transmissions
  onStateSlice(
    webamp,
    (w) => {
      const s = w.store.getState();
      return s.playlist.currentTrack == null
        ? -1
        : s.playlist.trackOrder.indexOf(s.playlist.currentTrack);
    },
    (newIdx) => {
      if (
        newIdx >= 0 &&
        newIdx < TRANSMISSIONS.length &&
        newIdx !== currentTxIndex
      ) {
        startTx(newIdx);
      }
    }
  );

  // Wire playlist single-click selection to switch transmissions and buffer track
  onStateSlice(
    webamp,
    (w) => w.store.getState().playlist.lastSelectedIndex,
    (newIdx) => {
      if (newIdx != null && newIdx >= 0 && newIdx < TRANSMISSIONS.length) {
        const s = webamp.store.getState();
        const trackId = s.playlist.trackOrder[newIdx];
        if (trackId != null && s.playlist.currentTrack !== trackId) {
          webamp.store.dispatch({ type: "BUFFER_TRACK", id: trackId });
        }
        if (newIdx !== currentTxIndex) {
          startTx(newIdx);
        }
      }
    }
  );

  // Guard against playing undecoded transmissions before completion
  onStateSlice(
    webamp,
    (w) => w.store.getState().media.status,
    (status) => {
      if (status === "PLAYING" && !completedTransmissions.has(currentTxIndex)) {
        webamp.stop();
        setMarqueeMessage(
          webamp,
          `TRANSMISSION ${currentTxIndex + 1} ENCRYPTED - TUNE TO DECODE`
        );
      }
    }
  );

  // Start with Transmission 1 (Tutorial)
  startTx(0);

  initScaleControls();

  const resumeAudio = () => {
    const ctx = webamp.media.getAnalyser().context;
    if (ctx instanceof AudioContext && ctx.state === "suspended") {
      ctx.resume().catch((err: unknown) => {
        console.warn("AudioContext resume failed:", err);
      });
    }
  };
  window.addEventListener("pointerdown", resumeAudio, { once: true });

  window.addEventListener("beforeunload", () => {
    runningTx?.stop();
    clearMarqueeMessage(webamp);
  });
}

function initScaleControls(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".scale-btn");
  if (!buttons.length) return;

  const setScale = (scale: string) => {
    document.documentElement.style.setProperty("--scale", scale);
    localStorage.setItem("signal-tuner-scale", scale);
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.scale === scale);
    });
  };

  const saved = localStorage.getItem("signal-tuner-scale");
  if (saved) {
    setScale(saved);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.scale) {
        setScale(btn.dataset.scale);
      }
    });
  });

  // Clean up audio and tones on page unload
  window.addEventListener("beforeunload", () => {
    runningTx?.stop();
  });
}

main();
