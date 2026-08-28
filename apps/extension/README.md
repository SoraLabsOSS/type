# Sora Type — browser extension

Identify and inspect the fonts used on any web page, without leaving the tab.

Companion to the [Sora Type](https://type.soralabs.studio) web app — shares the same font-parsing/language-detection engine (`@sora-type/font-engine`) and copy (`@sora-type/i18n-content`), so results match exactly.

## Status

Live on the [Microsoft Edge Add-ons store](https://microsoftedge.microsoft.com/addons/detail/ldcjechdgfjlkkcocjncfonnbefllobl). No Chrome Web Store listing yet — in the meantime, load it unpacked (see below) to try it there.

## Features

- **On-page font picker** — press `Alt+Shift+F` (or toggle it from the toolbar popup) to arm the picker, then hover or click any text on the page to see its actually-rendered font, size, weight, line height, and color in a draggable panel. Detection is canvas pixel-diffing (not just reading the CSS `font-family` stack), so it correctly reports which font in a fallback chain the browser actually used — including when a webfont is still loading.
- **Multiple pinned panels** — click several elements to compare fonts side by side (capped at 3 to avoid clutter); re-clicking the same font moves its panel instead of duplicating it.
- **Load the real font file** — for any detected font, fetch its actual font file from the page's stylesheets (same-origin/CORS-permitting) and open it in the full Sora Type inspector for a complete report.
- **Page-wide font scan** — the side panel lists every font used across the whole page (including same-origin iframes), not just what you've clicked.
- **Recent fonts** — the last 20 fonts you've inspected, persisted locally, with a shortcut back into the side panel or the full inspector.

## Development

```bash
bun install
bun run dev              # Chrome/Edge (MV3), loads unpacked via WXT's dev server
bun run dev:firefox      # Firefox (MV2)
```

To load a production build unpacked:

```bash
bun run build             # outputs .output/chrome-mv3
bun run build:firefox     # outputs .output/firefox-mv2
```

Then in `chrome://extensions` (or `about:debugging` on Firefox), enable developer mode and load the `.output/*` directory as an unpacked extension.

## Architecture

Built with [WXT](https://wxt.dev) (MV3 on Chrome/Edge, MV2 on Firefox). Background service worker, content script (on-page picker), popup, and side panel each get their own entrypoint under `entrypoints/`; shared logic lives in `utils/` (frame registry for multi-frame scanning, storage, messaging types). See the root [README](../../README.md) for the monorepo-wide i18n and release process.
