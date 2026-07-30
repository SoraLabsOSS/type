import { fetchTextCorsAware } from "./remote-fetch";

export interface FontFaceSource {
  url: string;
}

const URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/i;
// Bounds worst-case walk time when discovering open shadow roots, mirroring
// the same safety cap in scan-page-fonts.ts.
const MAX_ELEMENTS_WALKED = 20_000;

const CSS_COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
// @font-face bodies never contain nested braces, so [^}]* is safe even when
// the block sits inside @media/@supports.
const FONT_FACE_BLOCK_PATTERN = /@font-face\s*\{([^}]*)\}/gi;
const FONT_FAMILY_DECL_PATTERN = /font-family\s*:\s*([^;]+)/i;
const SRC_DECL_PATTERN = /src\s*:\s*([^;]+)/i;
const IMPORT_PATTERN =
  /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)/gi;
// Caps network work when chasing unreadable sheets and their @imports.
const MAX_FETCHED_SHEETS = 10;
const MAX_IMPORT_DEPTH = 2;

function normalizeFamilyName(name: string): string {
  return name
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
}

function resolveUrl(
  rawUrl: string,
  sheet: CSSStyleSheet | null
): string | null {
  try {
    return new URL(rawUrl, sheet?.href ?? document.baseURI).href;
  } catch {
    return null;
  }
}

/** Recursively collects `@font-face` rules, descending into `@media`/
 * `@supports` blocks and `@import`ed stylesheets — none of which appear as
 * top-level entries in `sheet.cssRules`. */
function collectFontFaceRules(
  rules: CSSRuleList,
  out: CSSFontFaceRule[]
): void {
  for (const rule of rules) {
    if (rule instanceof CSSFontFaceRule) {
      out.push(rule);
    } else if (rule instanceof CSSImportRule) {
      try {
        if (rule.styleSheet) {
          collectFontFaceRules(rule.styleSheet.cssRules, out);
        }
      } catch {
        // Cross-origin @import without CORS headers on the imported sheet.
        // Handled later by the fetch-and-parse fallback via IMPORT_PATTERN.
      }
    } else if (rule instanceof CSSGroupingRule) {
      // Covers @media, @supports, @layer, @container — @font-face can be
      // nested inside any of them.
      collectFontFaceRules(rule.cssRules, out);
    }
  }
}

function findInSheet(
  sheet: CSSStyleSheet,
  family: string
): FontFaceSource | "unreadable" | null {
  let rules: CSSRuleList;
  try {
    // Throws SecurityError for cross-origin stylesheets without CORS
    // headers on the stylesheet itself (independent of the font file's
    // own CORS status).
    rules = sheet.cssRules;
  } catch {
    return "unreadable";
  }

  const fontFaceRules: CSSFontFaceRule[] = [];
  collectFontFaceRules(rules, fontFaceRules);

  for (const rule of fontFaceRules) {
    const ruleFamily = rule.style.getPropertyValue("font-family");
    if (normalizeFamilyName(ruleFamily) !== family) {
      continue;
    }
    const src = rule.style.getPropertyValue("src");
    const match = src.match(URL_PATTERN);
    if (!match) {
      continue;
    }
    const url = resolveUrl(match[2], rule.parentStyleSheet ?? sheet);
    if (url) {
      return { url };
    }
  }

  return null;
}

/** Scans raw CSS text for an `@font-face` matching `family`, resolving its
 * `src` URL against the stylesheet's own URL. Used for stylesheets whose
 * CSSOM is cross-origin-blocked, where the text has to be re-fetched. */
function findInCssText(
  cssText: string,
  family: string,
  baseUrl: string
): string | null {
  for (const block of cssText.matchAll(FONT_FACE_BLOCK_PATTERN)) {
    const body = block[1];
    const familyMatch = body.match(FONT_FAMILY_DECL_PATTERN);
    if (!familyMatch || normalizeFamilyName(familyMatch[1]) !== family) {
      continue;
    }
    const srcMatch = body.match(SRC_DECL_PATTERN);
    const urlMatch = srcMatch?.[1].match(URL_PATTERN);
    if (!urlMatch) {
      continue;
    }
    try {
      return new URL(urlMatch[2], baseUrl).href;
    } catch {
      // Malformed URL — keep scanning remaining blocks.
    }
  }
  return null;
}

/** Fetches a stylesheet the CSSOM couldn't read (content-script fetch with
 * background CORS fallback) and searches its text, following `@import`s up
 * to MAX_IMPORT_DEPTH / MAX_FETCHED_SHEETS. */
async function findInFetchedSheet(
  url: string,
  family: string,
  depth: number,
  visited: Set<string>
): Promise<string | null> {
  if (
    depth > MAX_IMPORT_DEPTH ||
    visited.size >= MAX_FETCHED_SHEETS ||
    visited.has(url)
  ) {
    return null;
  }
  visited.add(url);

  let cssText: string;
  try {
    cssText = await fetchTextCorsAware(url);
  } catch {
    return null;
  }
  cssText = cssText.replace(CSS_COMMENT_PATTERN, "");

  const found = findInCssText(cssText, family, url);
  if (found) {
    return found;
  }

  for (const match of cssText.matchAll(IMPORT_PATTERN)) {
    const rawImportUrl = match[2] ?? match[4];
    let importUrl: string;
    try {
      importUrl = new URL(rawImportUrl, url).href;
    } catch {
      continue;
    }
    const nested = await findInFetchedSheet(
      importUrl,
      family,
      depth + 1,
      visited
    );
    if (nested) {
      return nested;
    }
  }

  return null;
}

/**
 * Collects every stylesheet reachable from the page: document-level
 * `<link>`/`<style>` sheets and adopted (constructable) stylesheets, plus
 * the same for every open shadow root (Web Component styles are commonly
 * applied via `shadowRoot.adoptedStyleSheets` rather than a `<style>` tag,
 * e.g. Lit's `static styles`) — neither of which appears in
 * `document.styleSheets`.
 */
function collectAllStyleSheets(): CSSStyleSheet[] {
  const sheets: CSSStyleSheet[] = [
    ...document.styleSheets,
    ...document.adoptedStyleSheets,
  ];
  let walked = 0;

  function visitShadowRoots(root: Node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node && walked < MAX_ELEMENTS_WALKED) {
      walked++;
      const shadowRoot = (node as Element).shadowRoot;
      if (shadowRoot) {
        sheets.push(
          ...shadowRoot.styleSheets,
          ...shadowRoot.adoptedStyleSheets
        );
        visitShadowRoots(shadowRoot);
      }
      node = walker.nextNode();
    }
  }

  visitShadowRoots(document);
  return sheets;
}

/**
 * Finds the `@font-face` rule matching `family` (as returned by
 * `detectRenderedFont`) and resolves its `src: url(...)` to an absolute
 * URL. Readable sheets are searched synchronously via the CSSOM; sheets
 * whose `cssRules` are cross-origin-blocked (e.g. Google Fonts CSS) are
 * re-fetched as text and parsed. Returns `null` for system fonts or fonts
 * loaded purely via the JS `FontFace` API (no stylesheet to read).
 */
export async function findFontFaceSource(
  family: string
): Promise<FontFaceSource | null> {
  const normalized = normalizeFamilyName(family);
  const unreadableUrls: string[] = [];

  for (const sheet of collectAllStyleSheets()) {
    const found = findInSheet(sheet, normalized);
    if (found === "unreadable") {
      if (sheet.href) {
        unreadableUrls.push(sheet.href);
      }
      continue;
    }
    if (found) {
      return found;
    }
  }

  const visited = new Set<string>();
  for (const url of unreadableUrls) {
    const found = await findInFetchedSheet(url, normalized, 0, visited);
    if (found) {
      return { url: found };
    }
  }

  return null;
}
