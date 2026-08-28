import type { FontDetailField } from "@sora-type/font-engine/font-metadata";
import { i18n } from "#i18n";

const SORA_TYPE_URL = "https://type.soralabs.studio";

export function FontSummaryFields({
  fields,
  fontUrl,
}: {
  fields: FontDetailField[];
  fontUrl: string;
}) {
  return (
    // `min-w-0` is required so long license/designer strings shrink inside
    // the side panel's ScrollArea instead of expanding the card past the
    // viewport (right-aligned short values like Version then vanish off-screen).
    <div className="flex w-full min-w-0 flex-col gap-1 border-border border-t pt-2">
      {fields.map((field) => (
        <div
          className="flex w-full min-w-0 items-baseline gap-2 text-xs"
          key={field.label}
        >
          <span className="shrink-0 text-muted-foreground">{field.label}</span>
          <span
            className="min-w-0 flex-1 truncate text-right"
            title={field.value}
          >
            {field.value}
          </span>
        </div>
      ))}
      <a
        className="mt-1 text-primary text-xs hover:underline"
        href={`${SORA_TYPE_URL}/?inspectUrl=${encodeURIComponent(fontUrl)}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {i18n.t("recentFontRow.openInSoraType")}
      </a>
    </div>
  );
}
