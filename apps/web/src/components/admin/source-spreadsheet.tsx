import type { ArtVariant, CardSourceResponse, PrintingSourceResponse } from "@openrift/shared";
import {
  ART_VARIANT_ORDER,
  CARD_TYPE_ORDER,
  DOMAIN_ORDER,
  FINISH_ORDER,
  RARITY_ORDER,
  SUPER_TYPE_ORDER,
  comparePrintings,
} from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, EllipsisVerticalIcon } from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DiffSegment } from "@/lib/word-diff";
import { wordDiff } from "@/lib/word-diff";

interface FieldDef {
  key: string;
  label: string;
  readOnly?: boolean;
  type?: "boolean";
  options?: readonly string[];
  /** Show another field's value in parentheses after the main value. */
  suffixKey?: string;
  /** When true, this field is hidden behind a collapsible toggle row. */
  collapsible?: boolean;
}

const CARD_TYPE_OPTIONS = CARD_TYPE_ORDER;
const SUPER_TYPE_OPTIONS = SUPER_TYPE_ORDER;

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
  { key: "extraData", label: "Extra Data", readOnly: true, collapsible: true },
];

export const PRINTING_SOURCE_FIELDS: FieldDef[] = [
  { key: "sourceId", label: "Source ID" },
  { key: "setId", label: "Set", suffixKey: "setName" },
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
  { key: "comment", label: "Comment" },
  { key: "sourceEntityId", label: "Source Entity ID", readOnly: true },
  { key: "extraData", label: "Extra Data", readOnly: true, collapsible: true },
  { key: "imageUrl", label: "Image", readOnly: true, collapsible: true },
];

// ── Printing source grouping ──────────────────────────────────────────────────

export interface PrintingGroup {
  key: string;
  label: string;
  differentiators: {
    setId: string | null;
    collectorNumber: number | null;
    artVariant: string;
    isSigned: boolean;
    isPromo: boolean;
    rarity: string;
    finish: string;
  };
  sources: PrintingSourceResponse[];
}

export function groupPrintingSources(printingSources: PrintingSourceResponse[]): PrintingGroup[] {
  const groups = new Map<string, PrintingSourceResponse[]>();
  for (const ps of printingSources) {
    const variant = ps.artVariant || ("normal" satisfies ArtVariant);
    const key = `${ps.setId ?? ""}|${variant}|${ps.isSigned}|${ps.isPromo}|${ps.rarity}|${ps.finish}`;
    const group = groups.get(key) ?? [];
    group.push(ps);
    groups.set(key, group);
  }

  const result = [...groups.entries()].map(([key, sources]) => {
    const counts = new Map<string, number>();
    for (const s of sources) {
      counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
    }
    const mostCommonId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const ps = sources[0];
    const variant = ps.artVariant || ("normal" satisfies ArtVariant);
    const parts = [mostCommonId, ps.finish];
    if (variant !== ("normal" satisfies ArtVariant)) {
      parts.push(variant);
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
        setId: ps.setId,
        collectorNumber: ps.collectorNumber,
        artVariant: variant,
        isSigned: ps.isSigned,
        isPromo: ps.isPromo,
        rarity: ps.rarity,
        finish: ps.finish,
      },
      sources,
    };
  });

  result.sort((a, b) => comparePrintings(a.differentiators, b.differentiators));

  return result;
}

// ── Spreadsheet component ────────────────────────────────────────────────────

interface SourceSpreadsheetProps {
  fields: FieldDef[];
  activeRow: Record<string, unknown> | null;
  sourceRows: (CardSourceResponse | PrintingSourceResponse)[];
  /** Map from cardSourceId → source name, used to label PrintingSourceResponse columns. */
  sourceLabels?: Record<string, string>;
  /** Source names to sort first (before alphabetical). */
  favoriteSources?: Set<string>;
  /** Field keys that must be selected before the card can be accepted. */
  requiredKeys?: string[];
  onCellClick?: (field: string, value: unknown, sourceId: string) => void;
  /** Called to set or clear a value in the active column. Pass null to clear. */
  onActiveChange?: (field: string, value: unknown | null) => void;
  onCheck?: (sourceId: string) => void;
  /** Render extra action buttons in each source column header. */
  columnActions?: (row: CardSourceResponse | PrintingSourceResponse) => React.ReactNode;
  /** Extra CSS classes for a source column header `<th>`. */
  columnClassName?: (row: CardSourceResponse | PrintingSourceResponse) => string | undefined;
}

/** Field keys where word-level diff highlighting is applied. */
const DIFF_FIELDS = new Set([
  "rulesText",
  "effectText",
  "printedRulesText",
  "printedEffectText",
  "flavorText",
]);

function DiffText({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "removed") {
          return null;
        }
        if (seg.type === "added") {
          return (
            <mark key={i} className="bg-yellow-200 text-inherit dark:bg-yellow-700/60">
              {seg.text}
            </mark>
          );
        }
        return seg.text;
      })}
    </>
  );
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

function formatValue(value: unknown, suffix?: unknown): string {
  let text: string;
  if (value === null || value === undefined) {
    text = "\u2014";
  } else if (Array.isArray(value)) {
    text = value.length === 0 ? "\u2014" : value.join(", ");
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else if (typeof value === "boolean") {
    text = value ? "Yes" : "No";
  } else {
    text = String(value);
  }
  if (suffix !== null && suffix !== undefined && suffix !== "") {
    text += ` (${String(suffix)})`;
  }
  return text;
}

function getSourceLabel(
  row: CardSourceResponse | PrintingSourceResponse,
  sourceLabels?: Record<string, string>,
): string {
  if ("source" in row) {
    return row.source;
  }
  return sourceLabels?.[row.cardSourceId] ?? `source-${row.id.slice(0, 8)}`;
}

function isChecked(row: CardSourceResponse | PrintingSourceResponse): boolean {
  return row.checkedAt !== null;
}

function isGallery(
  row: CardSourceResponse | PrintingSourceResponse,
  sourceLabels?: Record<string, string>,
): boolean {
  return getSourceLabel(row, sourceLabels) === "gallery";
}

export function SourceSpreadsheet({
  fields,
  activeRow,
  sourceRows,
  sourceLabels,
  favoriteSources,
  requiredKeys,
  onCellClick,
  onActiveChange,
  onCheck,
  columnActions,
  columnClassName,
}: SourceSpreadsheetProps) {
  const sortedRows = [...sourceRows].sort((a, b) => {
    const aLabel = getSourceLabel(a, sourceLabels);
    const bLabel = getSourceLabel(b, sourceLabels);
    const aFav = favoriteSources?.has(aLabel) ?? false;
    const bFav = favoriteSources?.has(bLabel) ?? false;
    if (aFav !== bFav) {
      return aFav ? -1 : 1;
    }
    return aLabel.localeCompare(bLabel);
  });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasCollapsible = fields.some((f) => f.collapsible);

  function commitEdit(field: string, raw: string) {
    setEditingField(null);
    if (!onActiveChange) {
      return;
    }
    const trimmed = raw.trim();
    onActiveChange(field, trimmed || null);
  }

  return (
    <div className="w-fit max-w-full overflow-x-auto rounded-md border">
      <table className="table-fixed text-sm" style={{ width: 150 + 300 * (1 + sortedRows.length) }}>
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="sticky left-0 z-10 w-[150px] bg-muted/50 px-3 py-2 text-left font-medium">
              Field
            </th>
            <th className="w-[300px] border-l px-3 py-2 text-left font-medium">Active</th>
            {sortedRows.map((row) => (
              <th
                key={row.id}
                className={cn(
                  "w-[300px] border-l px-3 py-2 text-left font-medium",
                  isGallery(row, sourceLabels) && "bg-blue-50 dark:bg-blue-950/30",
                  isChecked(row) && "opacity-50",
                  columnClassName?.(row),
                )}
              >
                <div className="flex items-center gap-1">
                  <span className="min-w-0 break-words">{getSourceLabel(row, sourceLabels)}</span>
                  {isChecked(row) && (
                    <CheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" className="ml-auto size-6 shrink-0" />
                      }
                    >
                      <EllipsisVerticalIcon className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-max">
                      {onCheck && !isChecked(row) && (
                        <DropdownMenuItem onClick={() => onCheck(row.id)}>
                          <CheckIcon className="mr-2 size-3.5" />
                          Mark as checked
                        </DropdownMenuItem>
                      )}
                      {columnActions?.(row)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field, fieldIndex) => {
            if (field.collapsible && collapsed) {
              return null;
            }

            const activeValue = activeRow ? (activeRow[field.key] as unknown) : null;
            const isRequired = requiredKeys?.includes(field.key);
            const isMissing = isRequired && !hasValue(activeValue);

            const isFirstCollapsible =
              hasCollapsible && !field.collapsible && fields[fieldIndex + 1]?.collapsible;

            const fieldRow = (
              <tr key={field.key} className="border-b last:border-b-0">
                <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium">
                  {field.label}
                  {isRequired && <span className="ml-0.5 text-red-500">*</span>}
                </td>
                <td
                  className={cn(
                    "break-words border-l px-3 py-1.5",
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
                    <Select
                      value={hasValue(activeValue) ? String(activeValue) : ""}
                      onValueChange={(v) => {
                        setEditingField(null);
                        onActiveChange?.(field.key, v || null);
                      }}
                      defaultOpen
                      onOpenChange={(open) => {
                        if (!open) {
                          setEditingField(null);
                        }
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-6 w-full gap-1 rounded border-none px-1 text-sm shadow-none"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <SelectValue placeholder="— select —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— clear —</SelectItem>
                        {field.options.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  ) : field.key === "imageUrl" && typeof activeValue === "string" ? (
                    <HoverCard>
                      <HoverCardTrigger
                        href={activeValue}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title={activeValue}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        {activeValue}
                      </HoverCardTrigger>
                      <HoverCardContent side="right" className="w-auto p-1">
                        <img
                          src={activeValue}
                          alt="Active"
                          className="max-h-[80vh] max-w-[40vw] rounded object-contain"
                        />
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <span className={cn(isMissing ? "text-red-400" : "text-muted-foreground")}>
                      {activeRow
                        ? formatValue(
                            activeValue,
                            field.suffixKey ? activeRow[field.suffixKey] : undefined,
                          )
                        : isMissing
                          ? "required"
                          : "\u2014"}
                    </span>
                  )}
                </td>
                {sortedRows.map((row) => {
                  const sourceValue = (row as unknown as Record<string, unknown>)[field.key];
                  const invalidOption =
                    field.options &&
                    hasValue(sourceValue) &&
                    (Array.isArray(sourceValue)
                      ? sourceValue.some((v) => !field.options?.includes(String(v)))
                      : !field.options.includes(String(sourceValue)));
                  const isClickable =
                    !field.readOnly &&
                    !invalidOption &&
                    hasValue(sourceValue) &&
                    (activeRow === null ||
                      JSON.stringify(sourceValue) !== JSON.stringify(activeValue));
                  const isDifferent = isClickable && activeRow !== null;

                  return (
                    <td
                      key={row.id}
                      title={
                        invalidOption
                          ? `"${String(sourceValue)}" is not a valid ${field.label.toLowerCase()}`
                          : undefined
                      }
                      className={cn(
                        "break-words border-l px-3 py-1.5",
                        isGallery(row, sourceLabels) && "bg-blue-50 dark:bg-blue-950/30",
                        isChecked(row) && "opacity-50",
                        invalidOption && "bg-red-50 line-through dark:bg-red-950/30",
                        isDifferent && "bg-yellow-100 dark:bg-yellow-900/40",
                        isClickable &&
                          onCellClick &&
                          "cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-800/50",
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
                      ) : isDifferent &&
                        DIFF_FIELDS.has(field.key) &&
                        typeof sourceValue === "string" &&
                        typeof activeValue === "string" ? (
                        <DiffText segments={wordDiff(activeValue, String(sourceValue))} />
                      ) : (
                        formatValue(
                          sourceValue,
                          field.suffixKey
                            ? (row as unknown as Record<string, unknown>)[field.suffixKey]
                            : undefined,
                        )
                      )}
                    </td>
                  );
                })}
              </tr>
            );

            if (!isFirstCollapsible) {
              return fieldRow;
            }

            const collapsibleCount = fields.filter((f) => f.collapsible).length;
            return (
              <Fragment key={`${field.key}+toggle`}>
                {fieldRow}
                <tr
                  className="cursor-pointer border-b bg-muted/30 hover:bg-muted/50"
                  onClick={() => setCollapsed((c) => !c)}
                >
                  <td
                    className="sticky left-0 z-10 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground"
                    colSpan={2 + sortedRows.length}
                  >
                    <span className="inline-flex items-center gap-1">
                      {collapsed ? (
                        <ChevronRightIcon className="size-3" />
                      ) : (
                        <ChevronDownIcon className="size-3" />
                      )}
                      {collapsed
                        ? `${collapsibleCount} more field${collapsibleCount > 1 ? "s" : ""}`
                        : "Hide"}
                    </span>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
