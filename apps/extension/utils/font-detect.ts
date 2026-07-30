/**
 * Detects which font in a computed `font-family` stack actually rendered.
 *
 * `getComputedStyle(el).fontFamily` only returns the declared CSS stack
 * (e.g. `"CustomFont, Helvetica, sans-serif"`) — it does NOT tell you which
 * entry the browser actually used. A webfont can fail to load, be blocked,
 * or not be installed, and the browser silently falls back to the next
 * entry in the stack without any signal in computed style.
 *
 * The only reliable way to find the real one (short of parsing the font
 * file itself) is to render text with each candidate font on a <canvas>
 * and compare pixels against known-different controls: if
 * `"CandidateFont, serif"` and `"CandidateFont, sans-serif"` render
 * differently, `CandidateFont` doesn't exist and each control fell back to
 * a different generic — so we skip it. A candidate whose two controls
 * render *identically* exists; the first such candidate that also matches
 * the full original stack's render is the one actually in use. Technique
 * adapted from WhatFont's canvas pixel-diffing (no jQuery).
 */

const SAMPLE_TEXT = "abcdefghijklmnopqrstuvwxyz";
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 50;
const CANVAS_FONT_SIZE = "40px";
const FONT_STACK_SEPARATOR_PATTERN = /,\s*/;

export interface FontDetectionResult {
  color: string;
  /** The font actually rendering (best guess if none in the stack matched exactly). */
  family: string;
  lineHeight: string;
  size: string;
  /** The full declared font-family stack, as written in CSS. */
  stack: string[];
  style: string;
  /** "regular" | style | weight | "weight style" — mirrors WhatFont's variant label. */
  variant: string;
  weight: string;
}

function roundToPx(value: string): string {
  const number = Math.round(Number.parseFloat(value));
  return Number.isNaN(number) ? "(unknown)" : `${number}px`;
}

function getVariant(weight: string, style: string): string {
  if (weight === "normal" && style === "normal") {
    return "regular";
  }
  if (weight === "normal") {
    return style;
  }
  if (style === "normal") {
    return weight;
  }
  return `${weight} ${style}`;
}

function renderToCanvas(fontFamily: string, style: string, weight: string) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.fillStyle = "rgb(0,0,0)";
  ctx.textBaseline = "top";
  ctx.font = `${style} ${weight} ${CANVAS_FONT_SIZE} ${fontFamily}`;
  ctx.fillText(SAMPLE_TEXT, 0, 0);

  return ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
}

function pixelsEqual(
  a: Uint8ClampedArray | null,
  b: Uint8ClampedArray | null
): boolean {
  if (!(a && b)) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** Finds which single font family in `stack` actually rendered `style`/`weight` text. */
function findRenderedFont(
  stack: string[],
  style: string,
  weight: string
): string {
  const actual = renderToCanvas(stack.join(", "), style, weight);

  for (const candidate of stack) {
    const withSerif = renderToCanvas(`${candidate}, serif`, style, weight);
    const withSansSerif = renderToCanvas(
      `${candidate}, sans-serif`,
      style,
      weight
    );

    // If the candidate doesn't exist, each control falls back to a
    // different generic family (serif vs sans-serif) and the two renders
    // differ — skip it. If it exists, both render the candidate itself and
    // are identical.
    if (!pixelsEqual(withSerif, withSansSerif)) {
      continue;
    }

    // The candidate exists; confirm it's the one actually used by the full
    // original stack, not just present-but-overridden by an earlier entry.
    if (pixelsEqual(actual, withSerif)) {
      return candidate;
    }
  }

  // Nothing in the stack matched — browser fell back to its default
  // serif/sans-serif choice, or the font is subsetted (glyphs differ from
  // our sample text). Best guess: first entry in the stack.
  return stack[0] ?? "(unknown)";
}

export function detectRenderedFont(element: Element): FontDetectionResult {
  const computed = getComputedStyle(element);
  const stack = computed.fontFamily
    .split(FONT_STACK_SEPARATOR_PATTERN)
    .map((f) => f.trim());
  const weight = computed.fontWeight;
  const style = computed.fontStyle;

  return {
    family: findRenderedFont(stack, style, weight),
    stack,
    variant: getVariant(weight, style),
    weight,
    style,
    size: roundToPx(computed.fontSize),
    lineHeight: roundToPx(computed.lineHeight),
    color: computed.color,
  };
}
