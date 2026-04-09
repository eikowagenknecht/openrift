import type {
  CandidateCardResponse,
  CandidatePrintingResponse,
  EnumOrders,
  ProviderSettingResponse,
} from "@openrift/shared";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import type { EnumLabels } from "@/hooks/use-enums";
import { cn } from "@/lib/utils";
import type { DiffSegment } from "@/lib/word-diff";
import { wordDiff } from "@/lib/word-diff";

function toLabeledOptions(
  slugs: readonly string[],
  labels: Record<string, string>,
): { value: string; label: string }[] {
  return slugs.map((slug) => ({ value: slug, label: labels[slug] ?? slug }));
}

export interface FieldDef {
  key: string;
  label: string;
  readOnly?: boolean;
  type?: "boolean";
  options?: readonly string[];
  /** Options with distinct value/label pairs (e.g. UUID -> human label). Takes precedence over `options`. */
  labeledOptions?: readonly { value: string; label: string }[];
  /** Show another field's value in parentheses after the main value. */
  suffixKey?: string;
  /** When true, this field is hidden behind a collapsible toggle row. */
  collapsible?: boolean;
  /** When true, renders a textarea that supports newlines instead of a single-line input. */
  multiline?: boolean;
  /** When true, the value is a string[] -- comma-separated input is split into an array on commit. */
  array?: boolean;
  /** Free-text suggestions shown as a filterable combobox (user can still type a custom value). */
  suggestions?: readonly string[];
}

/** Build candidate card fields with enum options populated from the database.
 * @returns The field definitions for candidate cards. */
export function buildCandidateCardFields(orders: EnumOrders, labels: EnumLabels): FieldDef[] {
  return [
    { key: "externalId", label: "External ID", readOnly: true },
    { key: "shortCode", label: "Short Code", readOnly: true },
    { key: "energy", label: "Energy" },
    { key: "power", label: "Power" },
    { key: "might", label: "Might" },
    {
      key: "superTypes",
      label: "Super Types",
      labeledOptions: toLabeledOptions(orders.superTypes, labels.superTypes),
      array: true,
    },
    {
      key: "type",
      label: "Type",
      labeledOptions: toLabeledOptions(orders.cardTypes, labels.cardTypes),
    },
    { key: "name", label: "Name" },
    {
      key: "domains",
      label: "Domains",
      labeledOptions: toLabeledOptions(orders.domains, labels.domains),
      array: true,
    },
    { key: "rulesText", label: "Rules Text", multiline: true },
    { key: "effectText", label: "Effect Text", multiline: true },
    { key: "mightBonus", label: "Might Bonus" },
    { key: "tags", label: "Tags", array: true },
    { key: "comment", label: "Comment" },
    { key: "extraData", label: "Extra Data", readOnly: true, collapsible: true },
  ];
}

/** Build candidate printing fields with promo type options populated from the database.
 * @returns The field definitions for candidate printings. */
export function buildCandidatePrintingFields(
  orders: EnumOrders,
  labels: EnumLabels,
  promoTypes: readonly { value: string; label: string }[],
  artistSuggestions?: readonly string[],
  languages?: readonly { value: string; label: string }[],
): FieldDef[] {
  return [
    { key: "externalId", label: "External ID", readOnly: true },
    { key: "setId", label: "Set", suffixKey: "setName" },
    { key: "shortCode", label: "Short Code" },
    { key: "publicCode", label: "Public Code" },

    {
      key: "rarity",
      label: "Rarity",
      labeledOptions: toLabeledOptions(orders.rarities, labels.rarities),
    },
    {
      key: "finish",
      label: "Finish",
      labeledOptions: toLabeledOptions(orders.finishes, labels.finishes),
    },
    {
      key: "artVariant",
      label: "Art Variant",
      labeledOptions: toLabeledOptions(orders.artVariants, labels.artVariants),
    },
    { key: "isSigned", label: "Signed", type: "boolean" },
    {
      key: "promoTypeId",
      label: "Promo Type",
      labeledOptions: promoTypes.length > 0 ? promoTypes : undefined,
    },
    {
      key: "artist",
      label: "Artist",
      suggestions: artistSuggestions?.length ? artistSuggestions : undefined,
    },
    {
      key: "language",
      label: "Language",
      labeledOptions: languages && languages.length > 0 ? languages : undefined,
    },
    { key: "printedName", label: "Printed Name" },
    { key: "printedRulesText", label: "Printed Rules", multiline: true },
    { key: "printedEffectText", label: "Printed Effect", multiline: true },
    { key: "flavorText", label: "Flavor Text", multiline: true },
    { key: "comment", label: "Comment" },
    { key: "extraData", label: "Extra Data", readOnly: true, collapsible: true },
    { key: "imageUrl", label: "Image", readOnly: true, collapsible: true },
  ];
}

export interface PrintingGroup {
  candidates: CandidatePrintingResponse[];
  expectedPrintingId: string;
}

// -- Spreadsheet component ----------------------------------------------------

interface CandidateSpreadsheetProps {
  fields: FieldDef[];
  activeRow: Record<string, unknown> | null;
  candidateRows: (CandidateCardResponse | CandidatePrintingResponse)[];
  /** Map from candidateCardId -> provider name (e.g. "gallery"), used to label columns. */
  providerLabels?: Record<string, string>;
  /** Map from candidateCardId -> candidate card name (e.g. "Yone - Blademaster (Overnumbered)"). */
  providerNames?: Record<string, string>;
  /** Provider settings for sort order and visibility. Hidden providers are excluded. */
  providerSettings?: ProviderSettingResponse[];
  /** Field keys that must be selected before the card can be accepted. */
  requiredKeys?: string[];
  onCellClick?: (field: string, value: unknown, candidateId: string) => void;
  /** Called to set or clear a value in the active column. Pass null to clear. */
  onActiveChange?: (field: string, value: unknown | null) => void;
  onCheck?: (candidateId: string) => void;
  onUncheck?: (candidateId: string) => void;
  /** Render extra action buttons in each candidate column header. */
  columnActions?: (row: CandidateCardResponse | CandidatePrintingResponse) => React.ReactNode;
  /** Extra CSS classes for a candidate column header `<th>`. */
  columnClassName?: (row: CandidateCardResponse | CandidatePrintingResponse) => string | undefined;
  /** Return a warning tooltip for a candidate cell; shown as a small icon. */
  cellWarning?: (fieldKey: string, candidateValue: unknown) => string | null;
  /** Normalize a candidate value before comparing it to the active value.
   * Used to account for server-side transformations (e.g. typography fixes)
   * so that accepted-but-reformatted values no longer highlight as different. */
  normalizeCandidate?: (fieldKey: string, value: unknown) => unknown;
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

function hasDropdown(field: FieldDef): boolean {
  return (
    (field.options !== undefined && field.options.length > 0) ||
    (field.labeledOptions !== undefined && field.labeledOptions.length > 0)
  );
}

function isMultiSelect(field: FieldDef): boolean {
  return field.array === true && hasDropdown(field);
}

function resolveLabel(field: FieldDef, value: unknown): string {
  if (!hasValue(value)) {
    return "\u2014";
  }
  if (field.labeledOptions) {
    const match = field.labeledOptions.find((o) => o.value === String(value));
    if (match) {
      return match.label;
    }
  }
  return String(value);
}

function isValidOption(field: FieldDef, value: unknown): boolean {
  if (field.labeledOptions) {
    return Array.isArray(value)
      ? value.every((v) => field.labeledOptions?.some((o) => o.value === String(v)))
      : field.labeledOptions.some((o) => o.value === String(value));
  }
  if (field.options) {
    return Array.isArray(value)
      ? value.every((v) => field.options?.includes(String(v)))
      : field.options.includes(String(value));
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

function getProviderLabel(
  row: CandidateCardResponse | CandidatePrintingResponse,
  providerLabels?: Record<string, string>,
): string {
  if ("provider" in row) {
    return row.provider;
  }
  return providerLabels?.[row.candidateCardId] ?? `provider-${row.id.slice(0, 8)}`;
}

function isChecked(row: CandidateCardResponse | CandidatePrintingResponse): boolean {
  return row.checkedAt !== null;
}

function isTopProvider(
  row: CandidateCardResponse | CandidatePrintingResponse,
  providerLabels?: Record<string, string>,
  topProvider?: string,
): boolean {
  return topProvider !== undefined && getProviderLabel(row, providerLabels) === topProvider;
}

/** Inline combobox: type to filter suggestions, pick one, or press Enter to use custom text.
 * @returns A Command-based combobox element. */
function SuggestionCombobox({
  suggestions,
  defaultValue,
  onCommit,
  onCancel,
}: {
  suggestions: readonly string[];
  defaultValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [inputValue, setInputValue] = useState(defaultValue);

  return (
    <Command
      shouldFilter
      className="border-primary rounded border"
      onClick={(event: React.MouseEvent) => event.stopPropagation()}
    >
      <CommandInput
        value={inputValue}
        onValueChange={setInputValue}
        placeholder="Type or select…"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(inputValue);
          } else if (event.key === "Escape") {
            onCancel();
          }
        }}
      />
      <CommandList>
        <CommandEmpty className="px-2 py-1.5">No matches</CommandEmpty>
        {suggestions.map((suggestion) => (
          <CommandItem key={suggestion} value={suggestion} onSelect={(value) => onCommit(value)}>
            {suggestion}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function CandidateSpreadsheet({
  fields,
  activeRow,
  candidateRows,
  providerLabels,
  providerNames,
  providerSettings,
  requiredKeys,
  onCellClick,
  onActiveChange,
  onCheck,
  onUncheck,
  columnActions,
  columnClassName,
  cellWarning,
  normalizeCandidate,
}: CandidateSpreadsheetProps) {
  const settingsMap = new Map(providerSettings?.map((s) => [s.provider, s]));
  const topProvider = providerSettings?.toSorted((a, b) => a.sortOrder - b.sortOrder)[0]?.provider;
  const sortedRows = candidateRows.toSorted((a, b) => {
    const aLabel = getProviderLabel(a, providerLabels);
    const bLabel = getProviderLabel(b, providerLabels);
    const aOrder = settingsMap.get(aLabel)?.sortOrder ?? 0;
    const bOrder = settingsMap.get(bLabel)?.sortOrder ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return aLabel.localeCompare(bLabel);
  });

  const [editingField, setEditingField] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasCollapsible = fields.some((f) => f.collapsible);

  function commitEdit(fieldKey: string, raw: string) {
    setEditingField(null);
    if (!onActiveChange) {
      return;
    }
    const trimmed = raw.trim();
    const fieldDef = fields.find((f) => f.key === fieldKey);
    if (fieldDef?.array) {
      const items = trimmed
        ? trimmed
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      onActiveChange(fieldKey, items.length > 0 ? items : null);
      return;
    }
    onActiveChange(fieldKey, trimmed || null);
  }

  return (
    <div className="w-fit max-w-full overflow-x-auto rounded-md border">
      <table className="table-fixed text-sm" style={{ width: 150 + 300 * (1 + sortedRows.length) }}>
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="bg-muted/50 sticky left-0 z-10 w-[150px] px-3 py-2 text-left font-medium">
              Field
            </th>
            <th className="w-[300px] border-l px-3 py-2 text-left font-medium">Active</th>
            {sortedRows.map((row) => (
              <th
                key={row.id}
                className={cn(
                  "w-[300px] border-l px-3 py-2 text-left font-medium",
                  isTopProvider(row, providerLabels, topProvider) &&
                    "bg-blue-50 dark:bg-blue-950/30",
                  isChecked(row) && "opacity-50",
                  columnClassName?.(row),
                )}
              >
                <div className="flex items-center gap-1">
                  <span className="min-w-0 break-words">
                    {getProviderLabel(row, providerLabels)}
                    {"candidateCardId" in row && providerNames?.[row.candidateCardId] && (
                      <span className="text-muted-foreground ml-1">
                        ({providerNames[row.candidateCardId]})
                      </span>
                    )}
                  </span>
                  {isChecked(row) && (
                    <CheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" className="ml-auto shrink-0" />}
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
                      {onUncheck && isChecked(row) && (
                        <DropdownMenuItem onClick={() => onUncheck(row.id)}>
                          <XIcon className="mr-2 size-3.5" />
                          Mark as unchecked
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
                <td className="bg-background sticky left-0 z-10 px-3 py-1.5 font-medium">
                  {field.label}
                  {isRequired && <span className="ml-0.5 text-red-500">*</span>}
                </td>
                <td
                  className={cn(
                    "group/active relative border-l px-3 py-1.5 break-words",
                    field.multiline && "whitespace-pre-wrap",
                    field.readOnly && "bg-muted/30",
                    isMissing && "bg-red-50 dark:bg-red-950/20",
                    onActiveChange &&
                      !field.readOnly &&
                      (field.type === "boolean" || hasDropdown(field)
                        ? "hover:bg-muted/30 cursor-pointer"
                        : "hover:bg-muted/30 cursor-text"),
                  )}
                  onClick={() => {
                    if (!onActiveChange || field.readOnly || editingField === field.key) {
                      return;
                    }
                    if (field.type === "boolean") {
                      // null -> false (No) -> true (Yes) -> false cycle
                      onActiveChange(field.key, activeValue === null ? false : !activeValue);
                      return;
                    }
                    if (hasDropdown(field)) {
                      setEditingField(field.key);
                      return;
                    }
                    setEditingField(field.key);
                    requestAnimationFrame(() => {
                      if (field.multiline) {
                        textareaRef.current?.focus();
                      } else {
                        inputRef.current?.focus();
                      }
                    });
                  }}
                >
                  {editingField === field.key && isMultiSelect(field) ? (
                    <DropdownMenu
                      open
                      onOpenChange={(open) => {
                        if (!open) {
                          setEditingField(null);
                        }
                      }}
                    >
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            className="flex w-full items-center gap-1 rounded px-1 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        {hasValue(activeValue) ? formatValue(activeValue) : "— select —"}
                        <ChevronDownIcon className="ml-auto size-3.5 opacity-50" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {(field.labeledOptions
                          ? field.labeledOptions.map((lo) => ({ value: lo.value, label: lo.label }))
                          : (field.options ?? []).map((opt) => ({ value: opt, label: opt }))
                        ).map(({ value, label }) => {
                          const selected =
                            Array.isArray(activeValue) && activeValue.includes(value);
                          return (
                            <DropdownMenuCheckboxItem
                              key={value}
                              checked={selected}
                              onSelect={(e) => e.preventDefault()}
                              onCheckedChange={() => {
                                const current = Array.isArray(activeValue)
                                  ? (activeValue as string[])
                                  : [];
                                const next = selected
                                  ? current.filter((v) => v !== value)
                                  : [...current, value];
                                onActiveChange?.(field.key, next.length > 0 ? next : null);
                              }}
                            >
                              {label}
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : editingField === field.key && hasDropdown(field) ? (
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
                      items={{
                        "": "— clear —",
                        ...Object.fromEntries(
                          field.labeledOptions
                            ? field.labeledOptions.map((opt) => [opt.value, opt.label])
                            : (field.options?.map((opt) => [opt, opt]) ?? []),
                        ),
                      }}
                    >
                      <SelectTrigger
                        className="w-full gap-1 rounded border-none px-1 text-sm shadow-none"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <SelectValue placeholder="— select —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— clear —</SelectItem>
                        {field.labeledOptions
                          ? field.labeledOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))
                          : field.options?.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  ) : editingField === field.key && field.suggestions ? (
                    <SuggestionCombobox
                      suggestions={field.suggestions}
                      defaultValue={hasValue(activeValue) ? String(activeValue) : ""}
                      onCommit={(value) => commitEdit(field.key, value)}
                      onCancel={() => setEditingField(null)}
                    />
                  ) : editingField === field.key && field.multiline ? (
                    <textarea
                      ref={textareaRef}
                      defaultValue={hasValue(activeValue) ? String(activeValue) : ""}
                      rows={4}
                      className="border-primary w-full resize-y rounded border bg-transparent p-1 text-sm outline-none"
                      // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
                      autoFocus
                      onBlur={(e) => commitEdit(field.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditingField(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : editingField === field.key ? (
                    <input
                      ref={inputRef}
                      type="text"
                      defaultValue={
                        hasValue(activeValue)
                          ? Array.isArray(activeValue)
                            ? activeValue.join(", ")
                            : String(activeValue)
                          : ""
                      }
                      className="border-primary w-full border-b bg-transparent text-sm outline-none"
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
                        rel="noreferrer"
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
                        ? field.labeledOptions
                          ? resolveLabel(field, activeValue)
                          : formatValue(
                              activeValue,
                              field.suffixKey ? activeRow[field.suffixKey] : undefined,
                            )
                        : isMissing
                          ? "required"
                          : "\u2014"}
                    </span>
                  )}
                  {onActiveChange &&
                    !field.readOnly &&
                    !isRequired &&
                    hasValue(activeValue) &&
                    editingField !== field.key && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1 right-1 hidden rounded p-0.5 group-hover/active:inline-flex"
                        onClick={(e) => {
                          e.stopPropagation();
                          onActiveChange(field.key, null);
                        }}
                      >
                        <XIcon className="size-3" />
                      </button>
                    )}
                </td>
                {sortedRows.map((row) => {
                  const candidateValue = (row as unknown as Record<string, unknown>)[field.key];
                  const normalizedCandidate = normalizeCandidate
                    ? normalizeCandidate(field.key, candidateValue)
                    : candidateValue;
                  const invalidOption =
                    hasDropdown(field) &&
                    hasValue(candidateValue) &&
                    !isValidOption(field, candidateValue);
                  const isClickable =
                    !field.readOnly &&
                    !invalidOption &&
                    hasValue(candidateValue) &&
                    (activeRow === null ||
                      JSON.stringify(normalizedCandidate) !== JSON.stringify(activeValue));
                  const isDifferent = isClickable && activeRow !== null;
                  const warningText =
                    cellWarning && hasValue(candidateValue)
                      ? cellWarning(field.key, candidateValue)
                      : null;

                  return (
                    <td
                      key={row.id}
                      title={
                        invalidOption
                          ? `"${String(candidateValue)}" is not a valid ${field.label.toLowerCase()}`
                          : undefined
                      }
                      className={cn(
                        "border-l px-3 py-1.5 break-words",
                        field.multiline && "whitespace-pre-wrap",
                        isTopProvider(row, providerLabels, topProvider) &&
                          "bg-blue-50 dark:bg-blue-950/30",
                        isChecked(row) && "opacity-50",
                        invalidOption && "bg-red-50 line-through dark:bg-red-950/30",
                        isDifferent && "bg-yellow-100 dark:bg-yellow-900/40",
                        isClickable &&
                          onCellClick &&
                          "cursor-pointer hover:bg-yellow-200 dark:hover:bg-yellow-800/50",
                      )}
                      onClick={
                        isClickable && onCellClick
                          ? () => onCellClick(field.key, candidateValue, row.id)
                          : undefined
                      }
                    >
                      {warningText && (
                        <span
                          title={warningText}
                          className="mr-1 inline-flex align-middle text-orange-500"
                        >
                          <TriangleAlertIcon className="size-3.5" />
                        </span>
                      )}
                      {field.key === "imageUrl" && typeof candidateValue === "string" ? (
                        <HoverCard>
                          <HoverCardTrigger
                            href={candidateValue}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            title={candidateValue}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            {candidateValue}
                          </HoverCardTrigger>
                          <HoverCardContent side="right" className="w-auto p-1">
                            <img
                              src={candidateValue}
                              alt="Candidate"
                              className="max-h-[80vh] max-w-[40vw] rounded object-contain"
                            />
                          </HoverCardContent>
                        </HoverCard>
                      ) : isDifferent &&
                        DIFF_FIELDS.has(field.key) &&
                        typeof normalizedCandidate === "string" &&
                        typeof activeValue === "string" ? (
                        <DiffText segments={wordDiff(activeValue, normalizedCandidate)} />
                      ) : field.labeledOptions ? (
                        resolveLabel(field, candidateValue)
                      ) : (
                        formatValue(
                          candidateValue,
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
                  className="bg-muted/30 hover:bg-muted/50 cursor-pointer border-b"
                  onClick={() => setCollapsed((c) => !c)}
                >
                  <td
                    className="bg-muted/30 text-muted-foreground sticky left-0 z-10 px-3 py-1 font-medium"
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
