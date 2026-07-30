import { Buffer } from "buffer";
import type { Font } from "fontkit";
import { create as createFont } from "fontkit";
import { fetchArrayBufferCorsAware } from "./remote-fetch";

const FONT_URL_PATTERN = /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i;
// Bounds download/parse work on pages that load many font files.
const MAX_CANDIDATE_FONTS = 12;
// Stack aliases like "Mona Sans VF" / "Inter var" refer to the variable
// build of a family whose name table just says "Mona Sans" / "Inter".
const VARIABLE_SUFFIX_PATTERN = /\s+(?:vf|var|variable)$/;

export interface LoadedFontMatch {
  font: Font;
  url: string;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function fontNames(font: Font): string[] {
  return [font.familyName, font.fullName, font.postscriptName]
    .filter((name): name is string => Boolean(name))
    .map(normalizeName);
}

// Per-page cache so inspecting several families doesn't refetch/reparse the
// same font files.
const parseCache = new Map<string, Promise<Font | null>>();

function parseFontUrl(url: string): Promise<Font | null> {
  const cached = parseCache.get(url);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    try {
      const buffer = await fetchArrayBufferCorsAware(url);
      const font = createFont(Buffer.from(buffer));
      // Collections (.ttc/.dfont) aren't matchable to a single family here.
      return "fonts" in font ? null : font;
    } catch {
      return null;
    }
  })();
  parseCache.set(url, promise);
  return promise;
}

function listLoadedFontUrls(): string[] {
  const urls = new Set<string>();
  for (const entry of performance.getEntriesByType("resource")) {
    if (FONT_URL_PATTERN.test(entry.name)) {
      urls.add(entry.name);
    }
  }
  return [...urls].slice(0, MAX_CANDIDATE_FONTS);
}

/**
 * Last-resort lookup for fonts with no discoverable `@font-face` rule
 * (loaded via the JS `FontFace` API, or via CSS injected after our scan,
 * e.g. GitHub's dynamically-loaded chunks): lists font files the page has
 * already downloaded (Resource Timing), parses each, and matches the name
 * table against `family` — tolerating "VF"/"var"/"variable" stack aliases.
 */
export async function findLoadedFontByName(
  family: string
): Promise<LoadedFontMatch | null> {
  const target = normalizeName(family);
  const targets = new Set([
    target,
    target.replace(VARIABLE_SUFFIX_PATTERN, ""),
  ]);

  for (const url of listLoadedFontUrls()) {
    const font = await parseFontUrl(url);
    if (!font) {
      continue;
    }
    const matches = fontNames(font).some(
      (name) =>
        targets.has(name) ||
        targets.has(name.replace(VARIABLE_SUFFIX_PATTERN, ""))
    );
    if (matches) {
      return { font, url };
    }
  }

  return null;
}
