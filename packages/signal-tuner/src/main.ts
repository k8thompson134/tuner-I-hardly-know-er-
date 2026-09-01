import WebampLazy from "../../webamp/js/webampLazy";
import type { IMetadataApi } from "../../webamp/js/types";
import { TRANSMISSIONS } from "./transmissions";
import { HIDE_EQ_EXTRAS, VISIBLE_BANDS } from "./cosmetics";
import { applyEqBandVisibility, clearMarqueeMessage } from "./webampAdapter";
import { runTransmission } from "./runTransmission";

// Which EQ slider is the tuning dial. Must be one of VISIBLE_BANDS, or the
// player can't reach it.
const TUNER_BAND = 600;

async function main() {
  const webampNode = document.getElementById("webamp") as HTMLDivElement;
  const statusReadout = document.getElementById(
    "status-readout"
  ) as HTMLDivElement;

  const webamp = new WebampLazy({
    requireJSZip: () => import("jszip").then((mod) => mod.default),
    // Webamp only calls this to read ID3 tags off tracks that arrive
    // without metadata. Every track we load supplies its own (see
    // `unlockTrack`), so this path is effectively unused. The cast is
    // because two music-metadata majors coexist in the workspace
    // (webamp pulls 3.x via music-metadata-browser, we resolve 11.x) and
    // their `IOptions` types disagree; we never touch the parsed result.
    requireMusicMetadata: () =>
      import("music-metadata") as unknown as Promise<IMetadataApi>,
  });
  await webamp.renderInto(webampNode);
  applyEqBandVisibility(webamp, webampNode, VISIBLE_BANDS, {
    hideExtras: HIDE_EQ_EXTRAS,
  });
  // @ts-ignore debugging hook
  window.__webamp = webamp;

  const transmission = TRANSMISSIONS[0];
  statusReadout.textContent = transmission.title;

  runTransmission(webamp, transmission, { tunerBand: TUNER_BAND });

  window.addEventListener("beforeunload", () => clearMarqueeMessage(webamp));
}

main();
