import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { FieldDef } from "@/features/admin/components/candidate-field-defs";
import { resolveLabel } from "@/features/admin/components/candidate-field-defs";
import { hasValue } from "@/features/admin/lib/candidate-cell-values";
import { getFilterIconPath } from "@/lib/icons";
import type { DiffSegment } from "@/lib/text-diff";

export const DIFF_FIELDS = new Set([
  "rulesText",
  "effectText",
  "printedRulesText",
  "printedEffectText",
  "flavorText",
]);

export function DiffText({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "removed") {
          return null;
        }
        if (seg.type === "added") {
          return (
            <mark key={i} className="bg-warning-soft text-inherit">
              {seg.text}
            </mark>
          );
        }
        return seg.text;
      })}
    </>
  );
}

export function renderLabeledValue(field: FieldDef, value: unknown): React.ReactNode {
  const label = resolveLabel(field, value);
  const iconCategory = field.iconCategory;
  if (!iconCategory || !hasValue(value)) {
    return label;
  }
  const values = Array.isArray(value) ? value.map(String) : [String(value)];
  return (
    <span className="inline-flex items-center gap-1">
      {values.map((v) => {
        const icon = getFilterIconPath(iconCategory, v);
        return icon ? (
          <img key={v} src={icon} alt="" width={28} height={28} className="size-4 shrink-0" />
        ) : null;
      })}
      {label}
    </span>
  );
}

export function ImageUrlCell({ url, alt }: { url: string; alt: string }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-info hover:text-info/80 block truncate underline"
        title={url}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {url}
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-auto p-1">
        <img src={url} alt={alt} className="max-h-[80vh] max-w-[40vw] rounded-md object-contain" />
      </HoverCardContent>
    </HoverCard>
  );
}
