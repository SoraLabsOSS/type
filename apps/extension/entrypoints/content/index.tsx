import { createRoot, type Root } from "react-dom/client";
import { setupAppBridge } from "@/utils/app-bridge";
import { loadFontSummary } from "@/utils/load-font-summary";
import { onMessage, sendMessage } from "@/utils/messaging";
import { scanPageFonts } from "@/utils/scan-page-fonts";
import { pickerEnabled } from "@/utils/storage";
import { PickerRoot } from "./picker-root";
import "./style.css";

const Z_INDEX_MAX = 2_147_483_647;

export default defineContentScript({
  matches: ["*://*/*"],
  allFrames: true,
  cssInjectionMode: "ui",
  async main(ctx) {
    // As early as possible so the background's frame registry (used to
    // target scans/loads at this exact frame) is populated before anything
    // else in this frame runs.
    sendMessage("registerFrame").catch(() => {
      // Best-effort — background may not be awake yet, or the extension
      // context was invalidated (reload/update). Not worth surfacing.
    });

    // Independent of the picker toggle — scanning/loading are passive (just
    // read computed styles/fetch a file, inject no UI) so they work whether
    // or not the picker itself is armed.
    const unregisterScan = onMessage("scanPageFonts", () => scanPageFonts());
    const unregisterLoad = onMessage("loadFontSummary", ({ data }) =>
      loadFontSummary(data.family)
    );
    ctx.onInvalidated(unregisterScan);
    ctx.onInvalidated(unregisterLoad);

    // No-op outside the Sora Type app's own origin.
    setupAppBridge();

    const ui = await createShadowRootUi(ctx, {
      alignment: "top-left",
      anchor: "body",
      name: "sora-type-picker",
      position: "overlay",
      zIndex: Z_INDEX_MAX,
      onMount: (uiContainer, _shadow, shadowHost) => {
        const root = createRoot(uiContainer);
        root.render(<PickerRoot shadowHost={shadowHost} />);
        return root;
      },
      onRemove: (root?: Root) => {
        root?.unmount();
      },
    });

    const applyEnabled = (enabled: boolean) => {
      if (enabled) {
        ui.mount();
      } else {
        ui.remove();
      }
    };

    applyEnabled(await pickerEnabled.getValue());
    const unwatch = pickerEnabled.watch(applyEnabled);

    ctx.onInvalidated(() => {
      unwatch();
      ui.remove();
    });
  },
});
