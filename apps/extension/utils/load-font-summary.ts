import {
  buildFontSummaryFields,
  extractFontMetadata,
  type FontDetailField,
} from "@sora-type/font-engine/font-metadata";
import { Buffer } from "buffer";
import type { Font } from "fontkit";
import { create as createFont } from "fontkit";
import { findFontFaceSource } from "./find-font-face-source";
import { findLoadedFontByName } from "./find-loaded-font";
import { fetchArrayBufferCorsAware } from "./remote-fetch";

export type LoadFontSummaryResult =
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "loaded"; fields: FontDetailField[]; fontUrl: string };

function fileNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url);
  } catch {
    return url;
  }
}

function summarize(font: Font, url: string): LoadFontSummaryResult {
  const metadata = extractFontMetadata(font, fileNameFromUrl(url));
  return {
    status: "loaded",
    fields: buildFontSummaryFields(metadata),
    fontUrl: url,
  };
}

/**
 * Locates a font's `@font-face` source, fetches it, and extracts a
 * panel-sized metadata summary. When no `@font-face` rule is discoverable
 * (JS-loaded fonts, dynamically injected CSS), falls back to matching the
 * font files the page already downloaded (see `findLoadedFontByName`).
 * Must run in a context with access to the page's DOM (a content script) —
 * `findFontFaceSource` reads `document.styleSheets` and Resource Timing,
 * which aren't available from the popup/side panel.
 */
export async function loadFontSummary(
  family: string
): Promise<LoadFontSummaryResult> {
  const source = await findFontFaceSource(family);
  if (source) {
    try {
      const buffer = await fetchArrayBufferCorsAware(source.url);
      const font = createFont(Buffer.from(buffer));
      if ("fonts" in font) {
        // Font collection (.ttc/.dfont) — inspecting a single face isn't
        // supported here yet.
        return {
          status: "error",
          message: "Font collections aren't supported yet.",
        };
      }
      return summarize(font, source.url);
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error ? error.message : "Couldn't load this font.",
      };
    }
  }

  const match = await findLoadedFontByName(family);
  if (match) {
    return summarize(match.font, match.url);
  }

  return { status: "not-found" };
}
