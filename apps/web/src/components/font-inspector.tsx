"use client";

import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Heading, Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import type { OtToHtmlLangEntry } from "@sora-type/font-engine/data/ot-to-html-lang";
import type { AccuracyComparisonResult } from "@sora-type/font-engine/font-benchmark";
import { compareAccuracy } from "@sora-type/font-engine/font-benchmark";
import { isColorFont } from "@sora-type/font-engine/font-color-palettes";
import {
  clearFontFace,
  decodeFontFace,
  registerFontFace,
  toCssFontFamily,
} from "@sora-type/font-engine/font-face";
import type { LanguageSupportResult } from "@sora-type/font-engine/font-language-detection";
import { reportAllLanguages } from "@sora-type/font-engine/font-language-detection";
import {
  extractFontMetadata,
  type FontMetadata,
  getFontSampleText,
} from "@sora-type/font-engine/font-metadata";
import { summarizeSupport } from "@sora-type/font-engine/font-report";
import { getLanguageSystems } from "@sora-type/font-engine/opentype-language-systems";
import { create as createFont, type Font as FontkitFont } from "fontkit";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontInspectorColor } from "@/components/font-inspector-color";
import { FontInspectorLayoutFeatures } from "@/components/font-inspector-layout-features";
import { InspectorLocalFontPicker } from "@/components/font-inspector-local-font-picker";
import {
  DEFAULT_FONT_SIZE,
  FontInspectorPreview,
} from "@/components/font-inspector-preview";
import { FontInspectorRawTables } from "@/components/font-inspector-raw-tables";
import { FontInspectorSidebar } from "@/components/font-inspector-sidebar";
import { FontInspectorStylesheet } from "@/components/font-inspector-stylesheet";
import { FontInspectorSubsetting } from "@/components/font-inspector-subsetting";
import { FontInspectorSummaryPanel } from "@/components/font-inspector-summary-panel";
import { FontInspectorTester } from "@/components/font-inspector-tester";
import {
  INSPECTOR_FONT_ACCEPT,
  InspectorFontUpload,
} from "@/components/font-inspector-upload";
import GlyphGrid, {
  getEncodedCodePointCount,
  MAX_GLYPHS,
} from "@/components/glyph-grid";
import { useLatestAsync } from "@/hooks/use-latest-async";
import { fetchFontViaExtension } from "@/lib/extension-bridge";

const FILE_EXTENSION = /\.[^./]+$/;
const INSPECTOR_FONT_SLOT = "inspector";
const GLYPH_CELL_MIN_WIDTH = 64;
const COLUMN_SCROLL_CLASS =
  "scrollbar-hidden min-h-0 lg:h-full lg:overflow-y-auto lg:overscroll-y-contain";

const INSPECTOR_SECTION_CLASS = [
  "flex min-h-0 flex-1 flex-col h-full max-lg:flex-none max-lg:overflow-visible lg:overflow-hidden",
  "[&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col",
].join(" ");

const INSPECTOR_GRID_CLASS =
  "grid grid-cols-1 gap-4 max-lg:min-h-min max-lg:flex-none lg:min-h-0 lg:flex-1 lg:h-full lg:grid-cols-[280px_minmax(0,1fr)_minmax(240px,280px)] lg:overflow-hidden";

export type InspectorView =
  | "color"
  | "css"
  | "layout-features"
  | "overview"
  | "raw-tables"
  | "subsetting"
  | "tester";

/**
 * Some language codes have multiple orthographies sharing one script (e.g.
 * "deu" has two Latin orthographies), so `code-script` alone can collide as
 * a React key — disambiguate with an occurrence index.
 */
function withRowKeys(
  results: LanguageSupportResult[]
): (LanguageSupportResult & { rowKey: string })[] {
  const occurrences = new Map<string, number>();
  return results.map((result) => {
    const base = `${result.code}-${result.script}`;
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    return { ...result, rowKey: count === 0 ? base : `${base}-${count}` };
  });
}

interface LoadedFont {
  familyName: string;
  fileName: string;
  fileSizeBytes: number;
  fullName: string;
  numGlyphs: number;
  style: string;
}

function openFont(buffer: ArrayBuffer): FontkitFont {
  const opened = createFont(Buffer.from(buffer));
  return "fonts" in opened ? opened.fonts[0] : opened;
}

const PLACEHOLDER_FONT_URL = "/fonts/8894d4fc112b8f24-s.p.woff2";
const PLACEHOLDER_FONT_NAME = "8894d4fc112b8f24-s.p.woff2";

/**
 * Only http(s) is allowed for `?inspectUrl=` — this value flows straight into
 * `fetch()`, so a `data:`/`javascript:` (or other) scheme from an untrusted
 * query param must never reach it.
 */
function parseInspectUrl(raw: string | null): URL | null {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).at(-1);
  return last && last.length > 0 ? last : "font";
}

/** Direct fetch first; when the host sends no Access-Control-Allow-Origin,
 * fall back to the Sora Type extension (if installed), whose background
 * fetch isn't subject to this page's CORS. */
async function fetchInspectFontBuffer(url: URL): Promise<ArrayBuffer> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Could not fetch font (${response.status})`);
    }
    return await response.arrayBuffer();
  } catch {
    return await fetchFontViaExtension(url.href);
  }
}

function RawTablesViewContent({ font }: { font: FontkitFont | null }) {
  const t = useTranslations("inspector.main");
  if (!font) {
    return (
      <Text color="secondary" type="supporting">
        {t("loadToInspectRawTables")}
      </Text>
    );
  }
  return <FontInspectorRawTables font={font} />;
}

function ColorViewContent({ font }: { font: FontkitFont | null }) {
  const t = useTranslations("inspector.main");
  if (!font) {
    return (
      <Text color="secondary" type="supporting">
        {t("loadToInspectColor")}
      </Text>
    );
  }
  return <FontInspectorColor font={font} />;
}

function buildGlyphsCaption(
  encodedCodePointCount: number,
  t: (key: string, params?: Record<string, string | number | Date>) => string
): string {
  if (encodedCodePointCount > MAX_GLYPHS) {
    return t("captionLimited", {
      max: MAX_GLYPHS,
      total: encodedCodePointCount,
    });
  }
  return t("captionAll");
}

export default function FontInspector() {
  const t = useTranslations("inspector.main");
  const searchParams = useSearchParams();
  const inspectUrlParam = searchParams.get("inspectUrl");
  const inspectUrl = useMemo(
    () => parseInspectUrl(inspectUrlParam),
    [inspectUrlParam]
  );
  const [file, setFile] = useState<File | null>(null);
  const [loadedFont, setLoadedFont] = useState<LoadedFont | null>(null);
  const [font, setFont] = useState<FontkitFont | null>(null);
  const [fontBuffer, setFontBuffer] = useState<ArrayBuffer | null>(null);
  const [fontMetadata, setFontMetadata] = useState<FontMetadata | null>(null);
  const [cssFontFamily, setCssFontFamily] = useState<string | null>(null);
  const [languages, setLanguages] = useState<LanguageSupportResult[]>([]);
  const [accuracyDiscrepancies, setAccuracyDiscrepancies] = useState<
    AccuracyComparisonResult[]
  >([]);
  const [languageSystems, setLanguageSystems] = useState<OtToHtmlLangEntry[]>(
    []
  );
  const [previewFontSize, setPreviewFontSize] = useState(DEFAULT_FONT_SIZE);
  const [previewText, setPreviewText] = useState("");
  // Tracks whether the current previewText was auto-filled from the font's
  // own nameID 19 ("Sample text"), so swapping fonts refreshes it but typing
  // a custom preview sticks across font swaps.
  const autoFilledPreviewTextRef = useRef<string | null>(null);
  // Structurally guards every load entry point (file drop, local-font pick,
  // URL fetch, placeholder fetch) against a slower rival resolving later and
  // overwriting state with a stale result — see use-latest-async.ts.
  const { isLoading, run, runSync } = useLatestAsync();
  const [isExporting, setIsExporting] = useState(false);
  const [isPlaceholder, setIsPlaceholder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<InspectorView>("overview");
  const [groupGlyphsByCategory, setGroupGlyphsByCategory] = useState(false);
  // Bumped whenever a font is loaded from somewhere other than the local-font
  // picker, so its Typeahead selection (and displayed font name) resets
  // instead of showing a stale pick once a different font is active.
  const [localFontPickerKey, setLocalFontPickerKey] = useState(0);

  const loadFontFromBuffer = useCallback(
    (fileName: string, buffer: ArrayBuffer) => {
      const openedFont = openFont(buffer);
      // Built from `metadata` (not straight off `openedFont`) so it shares
      // the same missing/garbled-name-table fallback — some web-optimized
      // fonts ship a blank or single-placeholder-character name here while
      // every other field stays intact, and reading `openedFont.fullName`
      // directly would bypass that fallback and show the raw garbage.
      const metadata = extractFontMetadata(openedFont, fileName);
      setLoadedFont({
        fileName,
        fileSizeBytes: buffer.byteLength,
        fullName: metadata.fullName,
        familyName: metadata.familyName,
        style: metadata.style,
        numGlyphs: openedFont.numGlyphs,
      });
      setFont(openedFont);
      setFontBuffer(buffer);
      setFontMetadata(metadata);
      setLanguages(reportAllLanguages(openedFont, buffer));
      setAccuracyDiscrepancies(
        compareAccuracy(openedFont, buffer).filter((r) => r.discrepancy)
      );
      setLanguageSystems(getLanguageSystems(openedFont));

      const sampleText = getFontSampleText(openedFont) ?? "";
      setPreviewText((current) =>
        current === "" || current === autoFilledPreviewTextRef.current
          ? sampleText
          : current
      );
      autoFilledPreviewTextRef.current = sampleText;
    },
    []
  );

  const loadPlaceholder = useCallback(
    () =>
      run(async (isCurrent) => {
        try {
          const response = await fetch(PLACEHOLDER_FONT_URL);
          const buffer = await response.arrayBuffer();
          if (!isCurrent()) {
            return;
          }
          loadFontFromBuffer(PLACEHOLDER_FONT_NAME, buffer);
          setIsPlaceholder(true);
        } catch {
          if (!isCurrent()) {
            return;
          }
          setLoadedFont(null);
          setFont(null);
          setFontBuffer(null);
          setFontMetadata(null);
          setLanguages([]);
          setAccuracyDiscrepancies([]);
          setLanguageSystems([]);
          setCssFontFamily(null);
          setIsPlaceholder(false);
        }
      }),
    [loadFontFromBuffer, run]
  );

  const loadFromUrl = useCallback(
    (url: URL) =>
      run(async (isCurrent) => {
        setIsPlaceholder(false);
        setError(null);
        try {
          const buffer = await fetchInspectFontBuffer(url);
          if (!isCurrent()) {
            return;
          }
          loadFontFromBuffer(fileNameFromUrl(url), buffer);
        } catch {
          if (!isCurrent()) {
            return;
          }
          setLoadedFont(null);
          setFont(null);
          setFontBuffer(null);
          setFontMetadata(null);
          setLanguages([]);
          setAccuracyDiscrepancies([]);
          setLanguageSystems([]);
          setCssFontFamily(null);
          setError(t("urlLoadError"));
        }
      }),
    [loadFontFromBuffer, run, t]
  );

  useEffect(() => {
    if (inspectUrl) {
      loadFromUrl(inspectUrl);
      return;
    }
    loadPlaceholder();
  }, [inspectUrl, loadFromUrl, loadPlaceholder]);

  useEffect(() => {
    if (!(fontBuffer && loadedFont)) {
      setCssFontFamily(null);
      return;
    }

    let cancelled = false;
    const family = toCssFontFamily(INSPECTOR_FONT_SLOT, loadedFont.fileName);

    decodeFontFace(family, fontBuffer)
      .then((fontFace) => {
        if (cancelled) {
          // Superseded before decoding finished — discard without ever
          // registering it, so a cancelled run can't evict the FontFace a
          // newer run just registered.
          return;
        }
        registerFontFace(INSPECTOR_FONT_SLOT, fontFace);
        setCssFontFamily(family);
      })
      .catch(() => {
        if (!cancelled) {
          setCssFontFamily(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fontBuffer, loadedFont]);

  useEffect(() => () => clearFontFace(INSPECTOR_FONT_SLOT), []);

  const handleFile = useCallback(
    async (selected: File | File[] | null) => {
      const next = Array.isArray(selected) ? selected[0] : selected;
      setFile(next ?? null);
      setError(null);
      setLocalFontPickerKey((key) => key + 1);

      if (!next) {
        await loadPlaceholder();
        return;
      }

      await run(async (isCurrent) => {
        setIsPlaceholder(false);
        try {
          const buffer = await next.arrayBuffer();
          if (!isCurrent()) {
            return;
          }
          loadFontFromBuffer(next.name, buffer);
        } catch (err) {
          if (!isCurrent()) {
            return;
          }
          setLoadedFont(null);
          setFont(null);
          setFontBuffer(null);
          setFontMetadata(null);
          setLanguages([]);
          setAccuracyDiscrepancies([]);
          setLanguageSystems([]);
          setCssFontFamily(null);
          setError(err instanceof Error ? err.message : t("parseError"));
        }
      });
    },
    [loadFontFromBuffer, loadPlaceholder, run, t]
  );

  const handleLocalFont = useCallback(
    (fileName: string, buffer: ArrayBuffer) => {
      runSync(() => {
        setFile(null);
        setError(null);
        setIsPlaceholder(false);
        try {
          loadFontFromBuffer(fileName, buffer);
        } catch (err) {
          setLoadedFont(null);
          setFont(null);
          setFontBuffer(null);
          setFontMetadata(null);
          setLanguages([]);
          setAccuracyDiscrepancies([]);
          setLanguageSystems([]);
          setCssFontFamily(null);
          setError(err instanceof Error ? err.message : t("parseError"));
        }
      });
    },
    [loadFontFromBuffer, runSync, t]
  );

  async function handleExportPdf() {
    if (!(fontBuffer && loadedFont)) {
      return;
    }
    // Always build the export File from fontBuffer/loadedFont rather than
    // preferring the dropped-file `file` state — `file` is only ever set by
    // handleFile and can go stale relative to the currently-loaded font
    // (e.g. drop a file, then load a different font via the local-font
    // picker, a new `?inspectUrl=`, or the placeholder — none of those
    // paths touch `file`), which would silently export the wrong font's
    // bytes. fontBuffer/loadedFont are always updated together by every
    // load path, so reconstructing from them can't desync.
    const exportFile = new File([fontBuffer], loadedFont.fileName);
    setIsExporting(true);
    try {
      const formData = new FormData();
      formData.append("font", exportFile);
      const response = await fetch("/api/export-pdf", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? t("exportFailed"));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${exportFile.name.replace(FILE_EXTENSION, "")}-report.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  const summary = languages.length > 0 ? summarizeSupport(languages) : null;
  const keyedLanguages = withRowKeys(languages);
  const detected = keyedLanguages.filter(
    (language) =>
      language.support === "full" || language.support === "decomposed"
  );
  const positioningIssues = keyedLanguages.filter(
    (language) => language.support === "positioning-failed"
  );
  const hasColor = Boolean(font && isColorFont(font));

  return (
    <Section className={INSPECTOR_SECTION_CLASS} padding={4}>
      <div className={INSPECTOR_GRID_CLASS}>
        <aside className={`flex flex-col ${COLUMN_SCROLL_CLASS}`}>
          <FontInspectorSidebar
            detected={detected}
            fontMetadata={fontMetadata}
            hasColor={hasColor}
            isExporting={isExporting}
            isPlaceholder={isPlaceholder}
            loadedFont={loadedFont}
            onExportPdf={handleExportPdf}
            onViewChange={setView}
            view={view}
          />
        </aside>

        {view === "raw-tables" && (
          <div
            className={`flex min-h-0 flex-col lg:col-span-2 lg:min-h-0 ${COLUMN_SCROLL_CLASS}`}
          >
            <RawTablesViewContent font={font} />
          </div>
        )}

        {view === "color" && (
          <div
            className={`flex min-h-0 flex-col lg:col-span-2 lg:h-full lg:overflow-hidden ${COLUMN_SCROLL_CLASS}`}
          >
            <ColorViewContent font={font} />
          </div>
        )}

        {view === "tester" && (
          <div
            className={`flex min-h-0 flex-col lg:col-span-2 lg:h-full lg:overflow-hidden ${COLUMN_SCROLL_CLASS}`}
          >
            {font && fontMetadata ? (
              <FontInspectorTester
                cssFontFamily={cssFontFamily}
                font={font}
                key={`${fontMetadata.fileName}-${fontMetadata.postscriptName}`}
                languageSystems={languageSystems}
                languages={detected}
                metadata={fontMetadata}
              />
            ) : (
              <Text color="secondary" type="supporting">
                {t("loadToTest")}
              </Text>
            )}
          </div>
        )}

        {view === "layout-features" && (
          <div
            className={`flex min-h-0 flex-col lg:col-span-2 lg:h-full lg:overflow-hidden ${COLUMN_SCROLL_CLASS}`}
          >
            {font && fontMetadata ? (
              <FontInspectorLayoutFeatures
                cssFontFamily={cssFontFamily}
                font={font}
                metadata={fontMetadata}
              />
            ) : (
              <Text color="secondary" type="supporting">
                {t("loadToInspectLayoutFeatures")}
              </Text>
            )}
          </div>
        )}

        {view === "css" && (
          <div
            className={`flex min-h-0 flex-col lg:col-span-2 lg:h-full lg:overflow-hidden ${COLUMN_SCROLL_CLASS}`}
          >
            {font && fontMetadata && loadedFont ? (
              <FontInspectorStylesheet
                fileName={loadedFont.fileName}
                font={font}
                metadata={fontMetadata}
              />
            ) : (
              <Text color="secondary" type="supporting">
                {t("loadToGenerateStylesheet")}
              </Text>
            )}
          </div>
        )}

        {view === "subsetting" && (
          <div
            className={`flex min-h-0 flex-col lg:col-span-2 lg:h-full lg:overflow-hidden ${COLUMN_SCROLL_CLASS}`}
          >
            {font && fontMetadata && loadedFont ? (
              <FontInspectorSubsetting
                fileName={loadedFont.fileName}
                font={font}
              />
            ) : (
              <Text color="secondary" type="supporting">
                {t("loadToSeeSubsetting")}
              </Text>
            )}
          </div>
        )}

        {view === "overview" && (
          <>
            <div className={`flex flex-col gap-4 ${COLUMN_SCROLL_CLASS}`}>
              <InspectorFontUpload
                accept={INSPECTOR_FONT_ACCEPT}
                isLoading={isLoading()}
                onChange={handleFile}
                status={error ? { type: "error", message: error } : undefined}
                value={file}
              />

              <InspectorLocalFontPicker
                isDisabled={isLoading()}
                key={localFontPickerKey}
                onClear={loadPlaceholder}
                onSelect={handleLocalFont}
              />

              <div>
                <FontInspectorPreview
                  cssFontFamily={cssFontFamily}
                  fontSize={previewFontSize}
                  onFontSizeChange={setPreviewFontSize}
                  onPreviewTextChange={setPreviewText}
                  previewText={previewText}
                  weightLabel={fontMetadata?.weightLabel}
                />
              </div>

              <Card className="min-w-0 bg-surface" padding={4}>
                <VStack className="min-h-0" gap={3}>
                  {loadedFont && font ? (
                    <VStack gap={2}>
                      <HStack align="center" gap={2} justify="between">
                        <Heading className="font-sans" level={3}>
                          {t("glyphsHeading", {
                            count: getEncodedCodePointCount(font),
                          })}
                        </Heading>
                        <ToggleButton
                          isPressed={groupGlyphsByCategory}
                          label={t("groupByCategory")}
                          onPressedChange={setGroupGlyphsByCategory}
                          size="sm"
                        />
                      </HStack>
                      <Text color="secondary" type="supporting">
                        {buildGlyphsCaption(getEncodedCodePointCount(font), t)}
                      </Text>
                      <GlyphGrid
                        cellMinWidth={GLYPH_CELL_MIN_WIDTH}
                        font={font}
                        groupByCategory={groupGlyphsByCategory}
                      />
                    </VStack>
                  ) : null}
                </VStack>
              </Card>
            </div>

            <aside className={`flex flex-col ${COLUMN_SCROLL_CLASS}`}>
              <FontInspectorSummaryPanel
                accuracyDiscrepancies={accuracyDiscrepancies}
                detected={detected}
                fontMetadata={fontMetadata}
                languageSystems={languageSystems}
                positioningIssues={positioningIssues}
                summary={summary}
              />
            </aside>
          </>
        )}
      </div>
    </Section>
  );
}
