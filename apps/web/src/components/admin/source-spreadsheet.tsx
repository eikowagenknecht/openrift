import type { CardSource, PrintingSource } from "@openrift/shared";
import { ART_VARIANT_ORDER, DOMAIN_ORDER, FINISH_ORDER, RARITY_ORDER } from "@openrift/shared";
import { CheckIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

interface FieldDef {
  key: string;
  label: string;
  readOnly?: boolean;
  type?: "boolean";
  options?: readonly string[];
}

const CARD_TYPE_OPTIONS = ["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"] as const;
const SUPER_TYPE_OPTIONS = ["Basic", "Champion", "Signature", "Token"] as const;

export const CARD_SOURCE_FIELDS: FieldDef[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type", options: CARD_TYPE_OPTIONS },
  { key: "superTypes", label: "Super Types", options: SUPER_TYPE_OPTIONS },
  { key: "domains", label: "Domains", options: DOMAIN_ORDER },
  { key: "might", label: "Might" },
  { key: "energy", label: "Energy" },
  { key: "power", label: "Power" },
  { key: "mightBonus", label: "Might Bonus" },
  { key: "keywords", label: "Keywords", readOnly: true },
  { key: "rulesText", label: "Rules Text" },
  { key: "effectText", label: "Effect Text" },
  { key: "tags", label: "Tags" },
  { key: "sourceId", label: "Source ID", readOnly: true },
  { key: "sourceEntityId", label: "Source Entity ID", readOnly: true },
  { key: "extraData", label: "Extra Data", readOnly: true },
];

export const PRINTING_SOURCE_FIELDS: FieldDef[] = [
  { key: "sourceId", label: "Source ID" },
  { key: "setId", label: "Set" },
  { key: "setName", label: "Set Name", readOnly: true },
  { key: "collectorNumber", label: "Collector #" },
  { key: "rarity", label: "Rarity", options: RARITY_ORDER },
  { key: "artVariant", label: "Art Variant", options: ART_VARIANT_ORDER },
  { key: "isSigned", label: "Signed", type: "boolean" },
  { key: "isPromo", label: "Promo", type: "boolean" },
  { key: "finish", label: "Finish", options: FINISH_ORDER },
  { key: "artist", label: "Artist" },
  { key: "publicCode", label: "Public Code" },
  { key: "printedRulesText", label: "Printed Rules" },
  { key: "printedEffectText", label: "Printed Effect" },
  { key: "flavorText", label: "Flavor Text" },
  { key: "extraData", label: "Extra Data", readOnly: true },
  { key: "imageUrl", label: "Image", readOnly: true },
];

// ── Printing source grouping ──────────────────────────────────────────────────

export interface PrintingGroup {
  key: string;
  label: string;
  differentiators: { artVariant: string; isSigned: boolean; isPromo: boolean; finish: string };
  sources: PrintingSource[];
}

export function groupPrintingSources(printingSources: PrintingSource[]): PrintingGroup[] {
  const groups = new Map<string, PrintingSource[]>();
  for (const ps of printingSources) {
    const key = `${ps.setId ?? ""}|${ps.artVariant}|${ps.isSigned}|${ps.isPromo}|${ps.finish}`;
    const group = groups.get(key) ?? [];
    group.push(ps);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, sources]) => {
    const counts = new Map<string, number>();
    for (const s of sources) {
      counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
    }
    const mostCommonId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const ps = sources[0];
    const parts = [mostCommonId, ps.finish];
    if (ps.artVariant && ps.artVariant !== "normal") {
      parts.push(ps.artVariant);
    }
    if (ps.isSigned) {
      parts.push("signed");
    }
    if (ps.isPromo) {
      parts.push("promo");
    }
    return {
      key,
      label: parts.join(" · "),
      differentiators: {
        artVariant: ps.artVariant,
        isSigned: ps.isSigned,
        isPromo: ps.isPromo,
        finish: ps.finish,
      },
      sources,
    };
  });
}

// ── Spreadsheet component ────────────────────────────────────────────────────

interface SourceSpreadsheetProps {
  fields: FieldDef[];
  activeRow: Record<string, unknown> | null;
  sourceRows: (CardSource | PrintingSource)[];
  /** Map from cardSourceId → source name, used to label PrintingSource columns. */
  sourceLabels?: Record<string, string>;
  /** Field keys that must be selected before the card can be accepted. */
  requiredKeys?: string[];
  onCellClick?: (field: string, value: unknown, sourceId: string) => void;
  /** Called to set or clear a value in the active column. Pass null to clear. */
  onActiveChange?: (field: string, value: unknown | null) => void;
  onCheck?: (sourceId: string) => void;
  /** Render extra action buttons in each source column header. */
  columnActions?: (row: CardSource | PrintingSource) => React.ReactNode;
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "\u2014";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "\u2014" : value.join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function getSourceLabel(
  row: CardSource | PrintingSource,
  sourceLabels?: Record<string, string>,
): string {
  if ("source" in row) {
    return row.source;
  }
  return sourceLabels?.[row.cardSourceId] ?? `source-${row.id.slice(0, 8)}`;
}

function isChecked(row: CardSource | PrintingSource): boolean {
  return row.checkedAt !== null;
}

function isGalleryPS(
  row: CardSource | PrintingSource,
  sourceLabels?: Record<string, string>,
): boolean {
  if ("source" in row) {
    return row.source === "gallery";
  }
  return sourceLabels?.[row.cardSourceId] === "gallery";
}

export function SourceSpreadsheet({
  fields,
  activeRow,
  sourceRows,
  sourceLabels,
  requiredKeys,
  onCellClick,
  onActiveChange,
  onCheck,
  columnActions,
}: SourceSpreadsheetProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function commitEdit(field: string, raw: string) {
    setEditingField(null);
    if (!onActiveChange) {
      return;
    }
    const trimmed = raw.trim();
    onActiveChange(field, trimmed || null);
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table
        className="break-all text-sm"
        style={{
          tableLayout: "fixed",
          width: `${150 + 200 * (1 + sourceRows.length)}px`,
        }}
      >
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="sticky left-0 z-10 w-[150px] bg-muted/50 px-3 py-2 text-left font-medium">
              Field
            </th>
            <th className="w-[200px] border-l px-3 py-2 text-left font-medium">Active</th>
            {sourceRows.map((row) => (
              <th
                key={row.id}
                className={cn(
                  "w-[200px] border-l px-3 py-2 text-left font-medium",
                  isGalleryPS(row, sourceLabels) && "bg-blue-50 dark:bg-blue-950/30",
                  isChecked(row) && "opacity-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate">{getSourceLabel(row, sourceLabels)}</span>
                  {onCheck && !isChecked(row) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => onCheck(row.id)}
                    >
                      <CheckIcon className="size-3.5" />
                    </Button>
                  )}
                  {isChecked(row) && (
                    <CheckIcon className="size-3.5 text-green-600 dark:text-green-400" />
                  )}
                  {columnActions?.(row)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const activeValue = activeRow ? (activeRow[field.key] as unknown) : null;
            const isRequired = requiredKeys?.includes(field.key);
            const isMissing = isRequired && !hasValue(activeValue);

            return (
              <tr key={field.key} className="border-b last:border-b-0">
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium">
                  {field.label}
                  {isRequired && <span className="ml-0.5 text-red-500">*</span>}
                </td>
                <td
                  className={cn(
                    "border-l px-3 py-1.5",
                    field.readOnly && "bg-muted/30",
                    isMissing && "bg-red-50 dark:bg-red-950/20",
                    onActiveChange &&
                      !field.readOnly &&
                      (field.type === "boolean" || field.options
                        ? "cursor-pointer hover:bg-muted/30"
                        : "cursor-text hover:bg-muted/30"),
                  )}
                  onClick={() => {
                    if (!onActiveChange || field.readOnly || editingField === field.key) {
                      return;
                    }
                    if (field.type === "boolean") {
                      onActiveChange(field.key, activeValue !== true);
                      return;
                    }
                    if (field.options) {
                      setEditingField(field.key);
                      return;
                    }
                    setEditingField(field.key);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                >
                  {editingField === field.key && field.options ? (
                    <select
                      className="w-full border-b border-primary bg-transparent text-sm outline-none"
                      // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
                      autoFocus
                      defaultValue={hasValue(activeValue) ? String(activeValue) : ""}
                      onChange={(e) => {
                        setEditingField(null);
                        onActiveChange?.(field.key, e.target.value || null);
                      }}
                      onBlur={() => setEditingField(null)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">— clear —</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : editingField === field.key ? (
                    <input
                      ref={inputRef}
                      type="text"
                      defaultValue={hasValue(activeValue) ? String(activeValue) : ""}
                      className="w-full border-b border-primary bg-transparent text-sm outline-none"
                      // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
                      autoFocus
                      onBlur={(e) => commitEdit(field.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          commitEdit(field.key, e.currentTarget.value);
                        } else if (e.key === "Escape") {
                          setEditingField(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className={cn(isMissing ? "text-red-400" : "text-muted-foreground")}>
                      {activeRow ? formatValue(activeValue) : isMissing ? "required" : "\u2014"}
                    </span>
                  )}
                </td>
                {sourceRows.map((row) => {
                  const sourceValue = (row as unknown as Record<string, unknown>)[field.key];
                  const isClickable =
                    !field.readOnly &&
                    hasValue(sourceValue) &&
                    (activeRow === null ||
                      JSON.stringify(sourceValue) !== JSON.stringify(activeValue));
                  const isDifferent = isClickable && activeRow !== null;

                  return (
                    <td
                      key={row.id}
                      className={cn(
                        "border-l px-3 py-1.5",
                        isGalleryPS(row, sourceLabels) && "bg-blue-50 dark:bg-blue-950/30",
                        isChecked(row) && "opacity-50",
                        isDifferent && "bg-yellow-50 dark:bg-yellow-950/30",
                        isClickable &&
                          onCellClick &&
                          "cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/40",
                      )}
                      onClick={
                        isClickable && onCellClick
                          ? () => onCellClick(field.key, sourceValue, row.id)
                          : undefined
                      }
                    >
                      {field.key === "imageUrl" && typeof sourceValue === "string" ? (
                        <HoverCard>
                          <HoverCardTrigger
                            href={sourceValue}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            title={sourceValue}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            {sourceValue}
                          </HoverCardTrigger>
                          <HoverCardContent side="right" className="w-auto p-1">
                            <img
                              src={sourceValue}
                              alt="Source"
                              className="max-h-[80vh] max-w-[40vw] rounded object-contain"
                            />
                          </HoverCardContent>
                        </HoverCard>
                      ) : (
                        formatValue(sourceValue)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
