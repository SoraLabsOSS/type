import { THEME_STORAGE_KEY } from "@/lib/theme/constants";

// JSON.stringify alone doesn't escape `</script>` or U+2028/U+2029, which
// would let a string value break out of the inline <script> tag this is
// injected into via dangerouslySetInnerHTML.
const BACKSLASH = String.fromCharCode(0x5c);
const UNSAFE_JS_STRING_CHARS: Record<string, string> = {
  "<": `${BACKSLASH}u003C`,
  ">": `${BACKSLASH}u003E`,
  "\u2028": `${BACKSLASH}u2028`,
  "\u2029": `${BACKSLASH}u2029`,
};

const UNSAFE_JS_STRING_CHARS_RE = /[<>\u2028\u2029]/g;

function jsStringLiteral(value: string): string {
  return JSON.stringify(value).replace(
    UNSAFE_JS_STRING_CHARS_RE,
    (char) => UNSAFE_JS_STRING_CHARS[char] ?? char
  );
}

/**
 * Blocking script for the root layout `<head>`. Runs before first paint so
 * `light-dark()` tokens and `color-scheme` match stored / system preference
 * before React hydrates. Must stay in sync with MatchaThemeProvider.
 */
export const themeInitScript = `(function(){try{var k=${jsStringLiteral(THEME_STORAGE_KEY)};var m=localStorage.getItem(k);var r="light";if(m==="dark"){r="dark";}else if(m!=="light"){r=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",r);}catch(e){}})();`;

export function readDomResolvedTheme(): "dark" | "light" {
  if (typeof document === "undefined") {
    return "light";
  }

  const fromDom = document.documentElement.getAttribute("data-theme");
  if (fromDom === "dark" || fromDom === "light") {
    return fromDom;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
