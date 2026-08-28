import { X } from "lucide-react";
import { motion, useDragControls } from "motion/react";
import type { RefObject } from "react";
import { useState } from "react";
import { i18n } from "#i18n";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FontDetectionResult } from "@/utils/font-detect";
import { loadFontSummary } from "@/utils/load-font-summary";
import { clampToViewport } from "@/utils/viewport";

const SORA_TYPE_URL = "https://type.soralabs.studio";

type FileState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      fields: { label: string; value: string }[];
      fontUrl: string;
    };

function FontFileSection({ family }: { family: string }) {
  const [state, setState] = useState<FileState>({ status: "idle" });

  async function load() {
    setState({ status: "loading" });
    const result = await loadFontSummary(family);
    setState(result);
  }

  if (state.status === "idle") {
    return (
      <Button
        className="h-auto self-start px-0 text-[#8ab4ff] hover:text-[#8ab4ff]/80"
        onClick={load}
        size="xs"
        type="button"
        variant="link"
      >
        {i18n.t("panel.loadFontFile")}
      </Button>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 text-white/50">
        <Spinner className="size-3 text-white/50" />
        {i18n.t("panel.loading")}
      </div>
    );
  }

  if (state.status === "not-found") {
    return <p className="text-white/50">{i18n.t("panel.notFound")}</p>;
  }

  if (state.status === "error") {
    return <p className="text-white/50">{state.message}</p>;
  }

  return (
    <div className="flex flex-col gap-1 border-white/10 border-t pt-2">
      {state.fields.map((field) => (
        <div className="flex justify-between gap-2" key={field.label}>
          <span className="text-white/50">{field.label}</span>
          <span className="truncate text-right text-white">{field.value}</span>
        </div>
      ))}
      <a
        className="mt-1 text-[#8ab4ff] hover:underline"
        href={`${SORA_TYPE_URL}/?inspectUrl=${encodeURIComponent(state.fontUrl)}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {i18n.t("panel.openInSoraType")}
      </a>
    </div>
  );
}

function normalizeFamilyName(name: string): string {
  return name
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
}

function FontStack({ family, stack }: { family: string; stack: string[] }) {
  const active = normalizeFamilyName(family);
  const entries = [...new Set(stack)];

  return (
    <p className="whitespace-normal break-words text-white/50">
      {entries.map((entry, index) => (
        <span key={entry}>
          <span
            className={
              normalizeFamilyName(entry) === active
                ? "font-semibold text-white"
                : undefined
            }
          >
            {entry}
          </span>
          {index < entries.length - 1 ? ", " : ""}
        </span>
      ))}
    </p>
  );
}

const OFFSET_PX = 12;
// Content is a bounded set of fields (not user-length-variable), so a
// static estimate is fine — no need to measure after mount.
const PANEL_WIDTH = 256; // matches w-64
const PANEL_HEIGHT_ESTIMATE = 190;

export function Panel({
  constraintsRef,
  onClose,
  result,
  x,
  y,
}: {
  constraintsRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  result: FontDetectionResult;
  x: number;
  y: number;
}) {
  const dragControls = useDragControls();
  const position = clampToViewport(
    x + OFFSET_PX,
    y + OFFSET_PX,
    PANEL_WIDTH,
    PANEL_HEIGHT_ESTIMATE
  );

  return (
    <motion.div
      className="pointer-events-auto fixed z-[2147483647] flex w-64 flex-col gap-2 rounded-lg bg-black/90 p-3 font-sans text-white text-xs shadow-lg"
      drag
      dragConstraints={constraintsRef}
      dragControls={dragControls}
      dragElastic={0}
      dragListener={false}
      dragMomentum={false}
      style={{ top: position.y, left: position.x }}
    >
      <div
        className="flex cursor-move items-start justify-between gap-2"
        onPointerDown={(event) => dragControls.start(event)}
      >
        <p className="font-semibold text-sm">{result.family}</p>
        <Button
          aria-label={i18n.t("panel.close")}
          className="text-white/60 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-white/70">
        <dt>{i18n.t("panel.variant")}</dt>
        <dd className="text-right text-white">{result.variant}</dd>
        <dt>{i18n.t("panel.size")}</dt>
        <dd className="text-right text-white">{result.size}</dd>
        <dt>{i18n.t("panel.lineHeight")}</dt>
        <dd className="text-right text-white">{result.lineHeight}</dd>
        <dt>{i18n.t("panel.color")}</dt>
        <dd className="flex items-center justify-end gap-1 text-white">
          <span
            className="inline-block h-3 w-3 rounded-full border border-white/30"
            style={{ backgroundColor: result.color }}
          />
          {result.color}
        </dd>
      </dl>
      <FontStack family={result.family} stack={result.stack} />
      <FontFileSection family={result.family} />
    </motion.div>
  );
}
