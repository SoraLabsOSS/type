import { sidePanelInitialTab } from "@/utils/session-storage";

const SORA_TYPE_URL = "https://type.soralabs.studio";

/** Side panel is Chrome/Edge-only for now (see `wxt.config.ts` — Firefox
 * needs its own `sidebar_action` entrypoint). `browser.sidePanel` is
 * undefined on unsupported browsers, so callers must check this before
 * offering side-panel actions in the UI — `openSidePanel` itself silently
 * no-ops via `?.` rather than throwing. */
export function isSidePanelSupported(): boolean {
  return typeof browser.sidePanel?.open === "function";
}

export async function openSidePanel() {
  const win = await browser.windows.getCurrent();
  if (win.id === undefined) {
    return;
  }
  await browser.sidePanel?.open({ windowId: win.id });
}

export async function openSidePanelToRecent(options?: {
  closePopup?: boolean;
}) {
  await sidePanelInitialTab.setValue("recent");
  await openSidePanel();
  if (options?.closePopup) {
    window.close();
  }
}

export function openSoraType() {
  browser.tabs.create({ url: SORA_TYPE_URL });
}
