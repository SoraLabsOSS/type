# Sora Type

A font inspector that runs entirely in your browser. Drop in an OTF, TTF, WOFF, or WOFF2 file and see its metadata, glyph coverage, language support, and OpenType layout features — or load two fonts side by side to compare them. Everything runs client-side in WebAssembly (fontkit + harfbuzzjs); your font files never leave your device.

**Live:** [type.soralabs.studio](https://type.soralabs.studio) · **Extension:** on-page font picker, on the [Microsoft Edge Add-ons store](https://microsoftedge.microsoft.com/addons/detail/ldcjechdgfjlkkcocjncfonnbefllobl) — see [`apps/extension`](apps/extension)

## Features

- **Inspector** — full metadata and a glyph grid groupable by Unicode category; language-support checking that verifies real HarfBuzz shaping/mark-positioning, not just character coverage; a variable-font tester with live axis sliders, named-instance presets, and one-click `font-variation-settings` CSS; OpenType layout-feature toggling on real text plus COLR/CPAL color palette inspection; a raw-table browser that decodes every OpenType table field by field; and CSS/subsetting tools plus full PDF report export.
- **Compare** — two fonts side by side: matched-size text and waterfall reading, independent variable-axis sliders per font, a full glyph/OpenType-feature diff, a glyph-outline overlay with baseline/x-height/cap-height guides, and pairing diagnostics that explain x-height/weight/width/slant/serif-style differences in plain language.
- **Browser extension** — identify the actually-rendered font on any web page via an on-page picker (canvas pixel-diffing, not just reading the CSS stack), scan a whole page's fonts across frames, and jump straight into the full inspector. See [`apps/extension/README.md`](apps/extension/README.md).

## Roadmap

- **Saved/shareable comparisons** — save a Compare session and share it via a short link, so a comparison (e.g. "Font A vs Font B at 14px") can be sent to someone else without both sides re-uploading the same font files. This needs a backend (storage for the font files + session metadata, and a short-link resolver) since the app is currently 100% client-side.

## Tech stack

| Purpose | Library / tool |
|---------|----------------|
| Framework | [Next.js](https://nextjs.org), [React](https://react.dev) |
| UI primitives | [Astryx](https://ui.soralabs.io.vn/) (shell/data UI), [Sora UI](https://ui.soralabs.io.vn/) (animation-only primitives) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Font parsing | [fontkit](https://github.com/foliojs/fontkit) |
| Text shaping | [harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) — official WASM build of HarfBuzz |
| Language support data | [Hyperglot](https://github.com/rosettatype/hyperglot) (CLDR-based) |
| Browser extension | [WXT](https://wxt.dev) |
| Lint / format | [Ultracite](https://github.com/haydenbleasel/ultracite) (Biome) |
| Git hooks | [Lefthook](https://github.com/evilmartians/lefthook) |

## Language detection

Language support detection ports [Hyperglot](https://github.com/rosettatype/hyperglot)'s checking approach (the same database FontDrop's own "Language Report" cites) to JS, using `harfbuzzjs` instead of Python's `uharfbuzz` — both bind the same HarfBuzz C library, so shaping results are equivalent, not reimplemented.

Hyperglot is Apache License 2.0. `packages/font-engine/src/data/languages.json` is a generated derivative of its per-language YAML database (see `packages/font-engine/scripts/build-language-db.ts`), not hand-authored — the checking *logic* below is a from-scratch reimplementation, but the *data* is theirs, compiled to JSON.

Three tiers, checked in order (see `packages/font-engine/src/font-language-detection.ts`):

1. **Coverage** — every character's codepoint(s) present in the font (`fontkit`'s `characterSet`).
2. **Decomposed fallback** — a missing precomposed character (e.g. `ế`) can still count if the font has the base letter + combining marks separately (`String.prototype.normalize('NFD')`).
3. **Shaping** — for anything relying on tier 2, or already an unencoded base+mark sequence in the source data, confirm HarfBuzz's GPOS actually positions the marks (`packages/font-engine/src/font-shaping.ts`), not just that the glyphs exist.

**Not ported:** Hyperglot's Brahmi conjunct/half-form checks and Arabic joining-form checks (script-specific tests beyond generic mark attachment). Results should not be presented as 1:1 Hyperglot parity — only as FontDrop-equivalent-and-better (real GPOS shaping instead of cmap-only) for scripts that rely on generic base+mark attachment (Latin, Cyrillic, Greek, Vietnamese diacritics, etc.).

The database itself (`packages/font-engine/src/data/languages.json`) is generated, not hand-maintained:

```bash
bun run build:languages
```

This downloads Hyperglot's data fresh from GitHub, extracts it to a temp dir, and rebuilds the JSON — run it whenever Hyperglot's upstream data should be refreshed.

## Internationalization (i18n)

UI copy is authored once, centrally, and consumed by both apps:

- **`packages/i18n-content`** holds the source strings — `src/locales/{en,vi}/*.json`, one file per feature area (`common`, `about`, `privacy`, `compare`, `inspector`, `extension`). Ships as raw TS/JSON (no build step), same pattern as `font-engine`.
- **`apps/web`** consumes it directly via `next-intl` (`getMessages()` from the package). Routing: `/` = English (default, unprefixed), `/vi` = Vietnamese (`localePrefix: "as-needed"`).
- **`apps/extension`** consumes the `extension` namespace via `@wxt-dev/i18n`, but WXT reads locale files from disk at build time (`apps/extension/locales/{en,vi}.json`), not at runtime import — so those two files are **generated**, not hand-edited, and are committed to the repo (same convention as `packages/font-engine/src/data/languages.json`).

To edit extension copy: change `packages/i18n-content/src/locales/{en,vi}/extension.json`, then regenerate:

```bash
bun run i18n:sync-extension
```

Web copy (`common`/`about`/`privacy`/`compare`/`inspector`) needs no regeneration step — edit the JSON and it's picked up on next dev/build.

The extension itself has no in-app locale switcher; Chrome/Edge selects `en` or `vi` automatically based on the browser's own UI language setting, falling back to `en` (the extension's `default_locale`) if the browser is set to anything else.

## Environment variables

`apps/web` needs Upstash Redis credentials to rate-limit `POST /api/export-pdf` (see `apps/web/.env.example`):

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Copy `apps/web/.env.example` to `apps/web/.env` and fill in values from your [Upstash](https://upstash.com) Redis database's REST API tab. Without these, rate-limit checks will fail (the endpoint fails closed).

## Releasing the extension

`apps/extension` publishes to Microsoft Edge Add-ons via `.github/workflows/publish-extension.yml`, triggered by pushing a tag — pushing to `main` does **not** publish.

1. Bump `version` in `apps/extension/package.json`.
2. Tag the release commit and push the tag:
   ```bash
   git tag extension-vX.Y.Z
   git push origin extension-vX.Y.Z
   ```
3. The workflow builds and zips the extension with `bun run zip` (`apps/extension/.output/*-chrome.zip`) and publishes it via the [`wdzeng/edge-addon`](https://github.com/wdzeng/edge-addon) action.

This only *updates* an existing Edge Add-ons listing — the first submission must be done once, manually, through [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) to obtain a Product ID. The workflow needs three repo secrets: `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`.

The extension is live on the [Microsoft Edge Add-ons store](https://microsoftedge.microsoft.com/addons/detail/ldcjechdgfjlkkcocjncfonnbefllobl). No Chrome Web Store or Firefox Add-ons listing yet — in the meantime, use `bun run build` / `bun run build:firefox` in `apps/extension` and load `.output/*` unpacked — see [`apps/extension/README.md`](apps/extension/README.md).

## Credits

- **OpenType feature defaults and native CSS mappings** (`packages/font-engine/src/opentype-feature-classification.ts`, `packages/font-engine/src/opentype-feature-variants.ts`) — the fixed/on/off feature-state table and the `font-variant-*` equivalents table are ported from [Wakamai Fondue](https://github.com/Wakamai-Fondue/wakamai-fondue-engine)'s `layout-features.js` (Google LLC, Apache License 2.0), trimmed to tag-only lookups.
- **Generated stylesheet architecture** (`packages/font-engine/src/font-stylesheet.ts`) — the "combine feature/instance classes freely via CSS custom properties" approach follows the same design [Wakamai Fondue uses](https://pixelambacht.nl/2019/fixing-variable-font-inheritance/), reimplemented independently against this project's own extracted font data rather than vendoring theirs.
- **Language database** (`packages/font-engine/src/data/languages.json`) — generated from [Hyperglot](https://github.com/rosettatype/hyperglot)'s per-language YAML data (Apache License 2.0) via `packages/font-engine/scripts/build-language-db.ts`; see [Language detection](#language-detection) above for what's ported vs. reimplemented.

## Getting started

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start dev server |
| `bun run build` | Production build |
| `bun run start` | Run production build |
| `bun run check` | Lint and format check |
| `bun run fix` | Auto-fix lint and format |
| `bun run build:languages` | Rebuild `packages/font-engine/src/data/languages.json` from Hyperglot's upstream data |
| `bun run i18n:sync-extension` | Regenerate `apps/extension/locales/{en,vi}.json` from `packages/i18n-content` after editing extension copy |
