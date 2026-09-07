import type {
  AcceptCardField,
  AcceptPrintingField,
} from "@openrift/shared/contracts/admin/card-mutations";
import { fixTypography } from "@openrift/shared/fix-typography";
import type { ProviderSettingResponse } from "@openrift/shared/types/api/admin";
import type { EnumOrders } from "@openrift/shared/types/enums";
import { stringifyUnknown } from "@openrift/shared/utils";
import {
  ArrowRightLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  MessageSquareTextIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Fragment, cloneElement, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardTextExpandDialog } from "@/features/admin/components/card-text-expand-dialog";
import type { SourceSubmitter } from "@/features/admin/lib/candidate-submitter";
import { submitterLabel } from "@/features/admin/lib/candidate-submitter";
import { CardText } from "@/features/cards/components/card-text";
import type { CardTextVariant } from "@/features/contribute/components/card-text-input";
import { ChipInput } from "@/features/contribute/components/form-fields";
import type { EnumLabels } from "@/lib/enum-labels";
import { getFilterIconPath } from "@/lib/icons";
import type { FilterCategory } from "@/lib/icons";
import type { DiffSegment } from "@/lib/text-diff";
import { textDiff } from "@/lib/text-diff";
import { cn } from "@/lib/utils";

function toLabeledOptions(
  slugs: readonly string[],
  labels: Record<string, string>,
): { value: string; label: string }[] {
  return slugs.map((slug) => ({ value: slug, label: labels[slug] ?? slug }));
}

export interface FieldDef<TKey extends string = string> {
  key: TKey;
  label: string;
  readOnly?: boolean;
  type?: "boolean" | "number";
  options?: readonly string[];
  labeledOptions?: readonly { value: string; label: string }[];
  suffixKey?: string;
  collapsible?: boolean;
  multiline?: boolean;
  richText?: boolean;
  richTextVariant?: CardTextVariant;
  array?: boolean;
  suggestions?: readonly string[];
  iconCategory?: FilterCategory;
}

/** Every column the accept-field endpoint writes, plus the two read-only provider columns that are shown but never sent. */
export type CandidateCardFieldKey = AcceptCardField | "externalId" | "extraData";

export function buildCandidateCardFields(
  orders: EnumOrders,
  labels: EnumLabels,
): FieldDef<CandidateCardFieldKey>[] {
  return [
    { key: "externalId", label: "External ID", readOnly: true },
    { key: "energy", label: "Energy", type: "number" },
    { key: "power", label: "Power", type: "number" },
    { key: "might", label: "Might", type: "number" },
    {
      key: "superTypes",
      label: "Supertypes",
      labeledOptions: toLabeledOptions(orders.superTypes, labels.superTypes),
      array: true,
    },
    {
      key: "types",
      label: "Types",
      labeledOptions: toLabeledOptions(orders.cardTypes, labels.cardTypes),
      array: true,
    },
    { key: "name", label: "Name" },
    {
      key: "domains",
      label: "Domains",
      labeledOptions: toLabeledOptions(orders.domains, labels.domains),
      array: true,
    },
    { key: "mightBonus", label: "Might Bonus", type: "number" },
    { key: "tags", label: "Tags", array: true },
    { key: "maxCopiesOverride", label: "Max Copies Override", type: "number" },
    { key: "comment", label: "Comment" },
    { key: "extraData", label: "Extra Data", readOnly: true, collapsible: true },
  ];
}

// Not columns on `cards` (text lives on printedRulesText + errata); the accept
// endpoints reject them, so they appear only on the new-card page.
const NEW_CARD_TEXT_FIELDS: FieldDef<"rulesText" | "effectText">[] = [
  { key: "rulesText", label: "Rules Text", multiline: true, richText: true },
  { key: "effectText", label: "Effect Text", multiline: true, richText: true },
];

export type NewCardFieldKey = CandidateCardFieldKey | "rulesText" | "effectText";

/** Splices the provider text columns back in after `domains`, where they have always read. */
export function buildNewCardFields(
  orders: EnumOrders,
  labels: EnumLabels,
): FieldDef<NewCardFieldKey>[] {
  const fields: FieldDef<NewCardFieldKey>[] = buildCandidateCardFields(orders, labels);
  const afterDomains = fields.findIndex((field) => field.key === "domains") + 1;
  return fields.toSpliced(afterDomains, 0, ...NEW_CARD_TEXT_FIELDS);
}

/** Every column the accept-printing-field endpoint writes, plus the read-only provider columns that are shown but never sent. */
export type CandidatePrintingFieldKey =
  | AcceptPrintingField
  | "externalId"
  | "extraData"
  | "imageUrl";

export function buildCandidatePrintingFields(
  orders: EnumOrders,
  labels: EnumLabels,
  markers: readonly { value: string; label: string }[],
  distributionChannels: readonly { value: string; label: string }[],
  artistSuggestions?: readonly string[],
  languages?: readonly { value: string; label: string }[],
): FieldDef<CandidatePrintingFieldKey>[] {
  return [
    { key: "externalId", label: "External ID", readOnly: true },
    { key: "setId", label: "Set", suffixKey: "setName" },
    { key: "shortCode", label: "Short Code" },
    { key: "publicCode", label: "Public Code" },

    {
      key: "rarity",
      label: "Rarity",
      labeledOptions: toLabeledOptions(orders.rarities, labels.rarities),
      iconCategory: "rarities",
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
    {
      key: "size",
      label: "Size",
      labeledOptions: toLabeledOptions(orders.cardSizes, labels.cardSizes),
    },
    { key: "isSigned", label: "Signed", type: "boolean" },
    { key: "isOvernumbered", label: "Overnumbered", type: "boolean" },
    {
      key: "markerSlugs",
      label: "Markers",
      labeledOptions: markers.length > 0 ? markers : undefined,
      array: true,
    },
    {
      key: "distributionChannelSlugs",
      label: "Distribution",
      labeledOptions: distributionChannels.length > 0 ? distributionChannels : undefined,
      array: true,
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
    { key: "printedYear", label: "Printed Year", type: "number" },
    { key: "printedRulesText", label: "Printed Rules", multiline: true, richText: true },
    { key: "printedEffectText", label: "Printed Effect", multiline: true, richText: true },
    {
      key: "flavorText",
      label: "Flavor Text",
      multiline: true,
      richText: true,
      richTextVariant: "flavor",
    },
    { key: "comment", label: "Comment" },
    { key: "extraData", label: "Extra Data", readOnly: true, collapsible: true },
    { key: "imageUrl", label: "Image", readOnly: true, collapsible: true },
  ];
}

/** A candidate row read generically by field key; provider/candidateCardId are optional and fall back to a label derived from the row id. */
export interface CandidateSpreadsheetRow {
  id: string;
  checkedAt: string | null;
  provider?: string;
  candidateCardId?: string;
}

interface CandidateSpreadsheetProps<
  TKey extends string = string,
  TRow extends CandidateSpreadsheetRow = CandidateSpreadsheetRow,
> {
  fields: FieldDef<TKey>[];
  activeRow: Record<string, unknown> | null;
  candidateRows: TRow[];
  providerLabels?: Record<string, string>;
  providerNames?: Record<string, string>;
  submitters?: Record<string, SourceSubmitter>;
  providerSettings?: ProviderSettingResponse[];
  requiredKeys?: string[];
  onCellClick?: (field: TKey, value: unknown, candidateId: string) => void;
  onActiveChange?: (field: TKey, value: unknown | null) => void;
  onCheck?: (candidateId: string) => void;
  onUncheck?: (candidateId: string) => void;
  columnActions?: React.ReactElement<{ row?: NoInfer<TRow> }>;
  columnClassName?: (row: NoInfer<TRow>) => string | undefined;
  cellWarning?: (fieldKey: string, candidateValue: unknown) => string | null;
  normalizeCandidate?: (fieldKey: string, value: unknown) => unknown;
  activeImageUrl?: string | null;
  costKeywords?: readonly string[];
  activeColumnBadge?: React.ReactNode;
}

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
    if (Array.isArray(value)) {
      return value
        .map((v) => field.labeledOptions?.find((o) => o.value === String(v))?.label ?? String(v))
        .join(", ");
    }
    const match = field.labeledOptions.find((o) => o.value === String(value));
    if (match) {
      return match.label;
    }
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function renderLabeledValue(field: FieldDef, value: unknown): React.ReactNode {
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
    text = stringifyUnknown(value);
  }
  if (suffix !== null && suffix !== undefined && suffix !== "") {
    text += ` (${stringifyUnknown(suffix)})`;
  }
  return text;
}

function getProviderLabel(
  row: CandidateSpreadsheetRow,
  providerLabels?: Record<string, string>,
): string {
  if (row.provider !== undefined) {
    return row.provider;
  }
  const parentCardId = row.candidateCardId;
  const inherited = parentCardId === undefined ? undefined : providerLabels?.[parentCardId];
  return inherited ?? `provider-${row.id.slice(0, 8)}`;
}

function isChecked(row: CandidateSpreadsheetRow): boolean {
  return row.checkedAt !== null;
}

function isFavoriteProvider(
  row: CandidateSpreadsheetRow,
  providerLabels: Record<string, string> | undefined,
  favoriteProviders: Set<string>,
): boolean {
  return favoriteProviders.has(getProviderLabel(row, providerLabels));
}

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
      className="border-primary rounded-md border"
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

function TagChipCell({
  value,
  placeholder,
  onChange,
  onDone,
}: {
  value: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
  onDone: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapRef.current?.querySelector("input")?.focus();
  }, []);
  return (
    <div
      ref={wrapRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDone();
        }
      }}
    >
      <ChipInput value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

function dropdownOptions(field: FieldDef): { value: string; label: string }[] {
  if (field.labeledOptions) {
    return field.labeledOptions.map((opt) => ({ value: opt.value, label: opt.label }));
  }
  return (field.options ?? []).map((opt) => ({ value: opt, label: opt }));
}

function MultiSelectCell({
  label,
  options,
  value,
  onCommit,
  onClose,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onCommit: (next: string[] | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(value);
  const items = options.map((opt) => opt.value);
  const labelFor = (item: string) => options.find((opt) => opt.value === item)?.label ?? item;
  const summary = draft.length > 0 ? draft.map((item) => labelFor(item)).join(", ") : "— select —";
  return (
    <Combobox<string, true>
      multiple
      open
      items={items}
      value={draft}
      onValueChange={(next: string[]) => setDraft(next)}
      itemToStringLabel={labelFor}
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        const original = new Set(value);
        const changed = draft.length !== value.length || draft.some((item) => !original.has(item));
        if (changed) {
          onCommit(draft.length > 0 ? draft : null);
        }
        onClose();
      }}
    >
      <ComboboxTrigger
        render={
          // oxlint-disable-next-line react/forbid-elements -- cell inline-edit trigger; needs full-width chrome-free layout Button can't provide
          <button
            type="button"
            aria-label={`Edit ${label}`}
            className="flex w-full items-center gap-1 rounded-md text-left text-sm"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
          />
        }
      >
        <span
          className={cn("min-w-0 flex-1 truncate", draft.length === 0 && "text-muted-foreground")}
          title={draft.length > 0 ? summary : undefined}
        >
          {summary}
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="w-max max-w-[90vw] min-w-56">
        <ComboboxInput placeholder={`Search ${label.toLowerCase()}…`} showTrigger={false} />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {labelFor(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function SubmitterLine({ submitter }: { submitter: SourceSubmitter }) {
  const label = submitterLabel(submitter);
  return (
    <div className="text-muted-foreground flex items-center gap-1 font-normal">
      <span className="min-w-0 truncate" title={label}>
        by {label}
      </span>
      {submitter.note !== null && (
        <Popover>
          <PopoverTrigger
            render={<Button variant="ghost" size="icon" className="size-5 shrink-0" />}
            aria-label="Show submission note"
          >
            <MessageSquareTextIcon className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <p className="text-muted-foreground mb-1 font-medium">Submission note</p>
            <p className="whitespace-pre-wrap">{submitter.note}</p>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function CandidateSpreadsheet<
  TKey extends string = string,
  TRow extends CandidateSpreadsheetRow = CandidateSpreadsheetRow,
>({
  fields,
  activeRow,
  candidateRows,
  providerLabels,
  providerNames,
  submitters,
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
  activeImageUrl,
  costKeywords = [],
  activeColumnBadge,
}: CandidateSpreadsheetProps<TKey, TRow>) {
  const settingsMap = new Map(providerSettings?.map((s) => [s.provider, s]));
  const favoriteProviders = new Set(
    providerSettings?.filter((s) => s.isFavorite).map((s) => s.provider),
  );
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

  function commitEdit(fieldKey: TKey, raw: string) {
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
    if (fieldDef?.type === "number") {
      if (!trimmed) {
        onActiveChange(fieldKey, null);
        return;
      }
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a pasted cell; Number() would yield NaN on trailing text
      const parsed = Number.parseInt(trimmed, 10);
      onActiveChange(fieldKey, Number.isFinite(parsed) ? parsed : null);
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
            <th className="w-[300px] border-l px-3 py-2 text-left font-medium">
              <span className="inline-flex items-center gap-1.5">
                Active
                {activeColumnBadge}
              </span>
            </th>
            {sortedRows.map((row) => {
              // A printing row inherits attribution from its parent candidate card.
              const parentCardId = row.candidateCardId;
              const submitter = submitters?.[parentCardId ?? row.id];
              return (
                <th
                  key={row.id}
                  className={cn(
                    "w-[300px] border-l px-3 py-2 text-left font-medium",
                    isFavoriteProvider(row, providerLabels, favoriteProviders) && "bg-info-soft",
                    isChecked(row) && "opacity-50",
                    columnClassName?.(row),
                  )}
                >
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 break-words">
                      {getProviderLabel(row, providerLabels)}
                      {parentCardId !== undefined && providerNames?.[parentCardId] && (
                        <span className="text-muted-foreground ml-1">
                          ({providerNames[parentCardId]})
                        </span>
                      )}
                    </span>
                    {isChecked(row) && <CheckIcon className="text-success size-3.5 shrink-0" />}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" className="ml-auto shrink-0" />}
                      >
                        <EllipsisVerticalIcon className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
                        {columnActions ? cloneElement(columnActions, { row }) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {submitter && <SubmitterLine submitter={submitter} />}
                </th>
              );
            })}
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
            const canReverseActive =
              field.array === true && Array.isArray(activeValue) && activeValue.length > 1;

            const isFirstCollapsible =
              hasCollapsible && !field.collapsible && fields[fieldIndex + 1]?.collapsible;

            const fieldRow = (
              <tr key={field.key} className="border-b last:border-b-0">
                <td className="bg-background sticky left-0 z-10 px-3 py-1.5 font-medium">
                  {field.label}
                  {isRequired && <span className="text-destructive ml-0.5">*</span>}
                </td>
                <td
                  className={cn(
                    "group/active relative border-l px-3 py-1.5 break-words",
                    field.multiline && "whitespace-pre-wrap",
                    field.readOnly && "bg-muted/30",
                    isMissing && "bg-destructive-soft",
                    onActiveChange &&
                      !field.readOnly &&
                      (field.type === "boolean" || hasDropdown(field)
                        ? "hover:bg-muted/50 cursor-pointer"
                        : "hover:bg-muted/50 cursor-text"),
                  )}
                  onClick={() => {
                    if (
                      !onActiveChange ||
                      field.readOnly ||
                      field.richText ||
                      editingField === field.key
                    ) {
                      return;
                    }
                    if (field.type === "boolean") {
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
                  {field.richText ? (
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1 break-words whitespace-normal">
                        {hasValue(activeValue) ? (
                          field.richTextVariant === "flavor" ? (
                            // Flavor is a plain span, not CardText; whitespace-pre-line keeps its line breaks.
                            <span className="text-muted-foreground/80 whitespace-pre-line italic">
                              {String(activeValue)}
                            </span>
                          ) : (
                            <CardText text={String(activeValue)} interactive={false} />
                          )
                        ) : (
                          <span
                            className={isMissing ? "text-destructive" : "text-muted-foreground"}
                          >
                            {isMissing ? "required" : "—"}
                          </span>
                        )}
                      </div>
                      {onActiveChange && !field.readOnly && (
                        <CardTextExpandDialog
                          label={field.label}
                          value={hasValue(activeValue) ? String(activeValue) : ""}
                          imageUrl={activeImageUrl}
                          variant={field.richTextVariant}
                          reformat={(value) =>
                            field.richTextVariant === "flavor"
                              ? fixTypography(value, { italicParens: false, keywordGlyphs: false })
                              : fixTypography(value, { costKeywords })
                          }
                          onSave={(next) => onActiveChange(field.key, next.trim() || null)}
                          triggerClassName="text-muted-foreground shrink-0"
                        />
                      )}
                    </div>
                  ) : editingField === field.key && isMultiSelect(field) ? (
                    <MultiSelectCell
                      label={field.label}
                      options={dropdownOptions(field)}
                      value={Array.isArray(activeValue) ? (activeValue as string[]) : []}
                      onCommit={(next) => onActiveChange?.(field.key, next)}
                      onClose={() => setEditingField(null)}
                    />
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
                        className="w-full gap-1 rounded-md border-none px-1 text-sm shadow-none"
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
                      aria-label={field.label}
                      defaultValue={hasValue(activeValue) ? String(activeValue) : ""}
                      rows={4}
                      className="border-primary w-full resize-y rounded-md border bg-transparent p-1 text-sm outline-none"
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
                  ) : editingField === field.key && field.array && !hasDropdown(field) ? (
                    <TagChipCell
                      value={Array.isArray(activeValue) ? (activeValue as string[]) : []}
                      placeholder={`Add ${field.label.toLowerCase()}`}
                      onChange={(next) =>
                        onActiveChange?.(field.key, next.length > 0 ? next : null)
                      }
                      onDone={() => setEditingField(null)}
                    />
                  ) : editingField === field.key ? (
                    <input
                      ref={inputRef}
                      type="text"
                      aria-label={field.label}
                      inputMode={field.type === "number" ? "numeric" : undefined}
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
                        className="text-info hover:text-info/80 block truncate underline"
                        title={activeValue}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        {activeValue}
                      </HoverCardTrigger>
                      <HoverCardContent side="right" className="w-auto p-1">
                        <img
                          src={activeValue}
                          alt="Active"
                          className="max-h-[80vh] max-w-[40vw] rounded-md object-contain"
                        />
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <span
                      className={cn(
                        isMissing ? "text-destructive" : "text-muted-foreground",
                        (hasDropdown(field) || field.array) && "block truncate",
                      )}
                      title={
                        (hasDropdown(field) || field.array) && activeRow && hasValue(activeValue)
                          ? resolveLabel(field, activeValue)
                          : undefined
                      }
                    >
                      {activeRow
                        ? field.labeledOptions
                          ? renderLabeledValue(field, activeValue)
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
                    !field.richText &&
                    editingField !== field.key &&
                    (canReverseActive || (!isRequired && hasValue(activeValue))) && (
                      <div className="absolute top-1 right-1 flex gap-0.5 md:hidden md:group-hover/active:flex">
                        {canReverseActive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Reverse ${field.label} order`}
                            title="Reverse order"
                            className="text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              onActiveChange(field.key, (activeValue as unknown[]).toReversed());
                            }}
                          >
                            <ArrowRightLeftIcon className="size-3" />
                          </Button>
                        )}
                        {!isRequired && hasValue(activeValue) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Clear ${field.label}`}
                            className="text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              onActiveChange(field.key, null);
                            }}
                          >
                            <XIcon className="size-3" />
                          </Button>
                        )}
                      </div>
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
                        isFavoriteProvider(row, providerLabels, favoriteProviders) &&
                          "bg-info-soft",
                        isChecked(row) && "opacity-50",
                        invalidOption && "bg-destructive-soft line-through",
                        isDifferent && "bg-warning-soft",
                        isClickable && onCellClick && "hover:bg-warning/20 cursor-pointer",
                      )}
                      onClick={
                        isClickable && onCellClick
                          ? () => onCellClick(field.key, normalizedCandidate, row.id)
                          : undefined
                      }
                    >
                      {warningText && (
                        <span
                          title={warningText}
                          className="text-warning mr-1 inline-flex align-middle"
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
                            className="text-info hover:text-info/80 block truncate underline"
                            title={candidateValue}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            {candidateValue}
                          </HoverCardTrigger>
                          <HoverCardContent side="right" className="w-auto p-1">
                            <img
                              src={candidateValue}
                              alt="Candidate"
                              className="max-h-[80vh] max-w-[40vw] rounded-md object-contain"
                            />
                          </HoverCardContent>
                        </HoverCard>
                      ) : isDifferent &&
                        DIFF_FIELDS.has(field.key) &&
                        typeof normalizedCandidate === "string" &&
                        typeof activeValue === "string" ? (
                        <DiffText segments={textDiff(activeValue, normalizedCandidate)} />
                      ) : field.labeledOptions ? (
                        renderLabeledValue(field, candidateValue)
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
                {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- label lives in the <td> inside; rule doesn't see across children */}
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
