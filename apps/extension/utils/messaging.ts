import { defineExtensionMessaging } from "@webext-core/messaging";
import type { LoadFontSummaryResult } from "./load-font-summary";
import type { PageFontSummary } from "./scan-page-fonts";

interface ProtocolMap {
  /** Background-side fetch of a binary file (base64-encoded response) —
   * bypasses CORS via host_permissions when the content script's own
   * fetch is blocked. */
  fetchRemoteBinary(data: { url: string }): string;
  /** Background-side fetch of a text resource (e.g. a cross-origin
   * stylesheet the content script can't read). */
  fetchRemoteText(data: { url: string }): string;
  /** Known frameIds for a tab, as reported via `registerFrame`. */
  getKnownFrames(data: { tabId: number }): number[];
  loadFontSummary(data: { family: string }): LoadFontSummaryResult;
  /** Sent by a frame's content script on load so the background can track
   * which frames exist per tab — see `utils/frame-registry.ts`. */
  registerFrame(): void;
  /** Saves a picked font to recent-fonts storage. Handled in the background
   * (rather than written directly by the content script) so `pageUrl`/
   * `pageTitle`/`frameId` come from the message's `sender.tab`/`sender`
   * info — correct even when the pick happened inside an iframe, where
   * `location.href`/`document.title` would be the iframe's own, not the
   * tab's. */
  saveRecentFont(data: { family: string }): void;
  scanPageFonts(): PageFontSummary[];
}

export const { onMessage, sendMessage } =
  defineExtensionMessaging<ProtocolMap>();
