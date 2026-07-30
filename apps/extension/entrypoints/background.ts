import { setupFrameRegistry } from "@/utils/frame-registry";
import { setupRecentFontsStore } from "@/utils/recent-fonts-store";
import { setupRemoteFetch } from "@/utils/remote-fetch";
import { createSerialQueue } from "@/utils/serial-queue";
import { pickerEnabled } from "@/utils/storage";

// Must match the command name registered in wxt.config.ts's manifest.commands.
const TOGGLE_PICKER_COMMAND = "toggle-picker";

export default defineBackground(() => {
  setupFrameRegistry();
  setupRecentFontsStore();
  setupRemoteFetch();

  // Serialized so two fast command firings (repeat keypress) can't both read
  // the same `enabled` value before either write lands, which would collapse
  // two intended toggles into one — same race class as recent-fonts-store.
  const toggleQueue = createSerialQueue();

  browser.commands.onCommand.addListener((command) => {
    if (command === TOGGLE_PICKER_COMMAND) {
      toggleQueue
        .run(async () => {
          const enabled = await pickerEnabled.getValue();
          await pickerEnabled.setValue(!enabled);
        })
        .catch(() => {
          // Best-effort — storage quota or "Extension context invalidated"
          // during MV3 service-worker suspend. Nothing to recover from here.
        });
    }
  });
});
