import type {
  CandidateCardResponse,
  CandidatePrintingResponse,
  EnumOrders,
  ProviderSettingResponse,
} from "@openrift/shared";
import { fixTypography } from "@openrift/shared";
import type {
  AcceptCardField,
  AcceptPrintingField,
} from "@openrift/shared/contracts/admin/card-mutations";
import {
  ArrowRightLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { Fragment, cloneElement, useEffect, useRef, useState } from "react";

import { CardTextExpandDialog } from "@/components/admin/card-text-expand-dialog";
import { CardText } from "@/components/cards/card-text";
import type { CardTextVariant } from "@/components/contribute/card-text-input";
import { ChipInput } from "@/components/contribute/form-fields";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EnumLabels } from "@/hooks/use-enums";
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
  /** Options with distinct value/label pairs (e.g. UUID -> human label). Takes precedence over `options`. */
  labeledOptions?: readonly { value: string; label: string }[];
  /** Show another field's value in parentheses after the main value. */
  suffixKey?: string;
  /** When true, this field is hidden behind a collapsible toggle row. */
  collapsible?: boolean;
  /** When true, renders a textarea that supports newlines instead of a single-line input. */
  multiline?: boolean;
  /**
   * When true, the Active cell renders a rich preview and edits go through an
   * expand dialog (token toolbar + live preview + card image) instead of the
   * inline textarea. For rules/effect/flavor text.
   */
  richText?: boolean;
  /** Rich-text editor variant — "rules" (default) or "flavor". */
  richTextVariant?: CardTextVariant;
  /** When true, the value is a string[] -- comma-separated input is split into an array on commit. */
  array?: boolean;
  /** Free-text suggestions shown as a filterable combobox (user can still type a custom value). */
  suggestions?: readonly string[];
  /** Facet-icon category rendered before the value label (e.g. "rarities" shows the rarity badge). */
  iconCategory?: FilterCategory;
}

/**
 * Keys the candidate-card grid can carry: every column the accept-field endpoint
 * writes, plus the two read-only provider columns that are shown but never sent.
 */
export type CandidateCardFieldKey = AcceptCardField | "externalId" | "extraData";

/** Build candidate card fields with enum options populated from the database.
 * @returns The field definitions for candidate cards. */
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
    // Card-only field (no candidate data): deck copy-limit override, 0 = unlimited.
    { key: "maxCopiesOverride", label: "Max Copies Override", type: "number" },
    { key: "comment", label: "Comment" },
    { key: "extraData", label: "Extra Data", readOnly: true, collapsible: true },
  ];
}

/**
 * The provider's rules and effect text. Neither is a column on `cards` — card
 * text lives on the printing (`printedRulesText`) and on the card's errata row —
 * so the accept endpoints reject both keys. They stay out of
 * {@link buildCandidateCardFields} and appear only on the new-card page, where
 * the admin reads the source text while composing the card.
 */
const NEW_CARD_TEXT_FIELDS: FieldDef<"rulesText" | "effectText">[] = [
  { key: "rulesText", label: "Rules Text", multiline: true, richText: true },
  { key: "effectText", label: "Effect Text", multiline: true, richText: true },
];

/** Keys the new-card grid carries: the candidate-card keys plus the two text columns. */
export type NewCardFieldKey = CandidateCardFieldKey | "rulesText" | "effectText";

/** Build the new-card grid's fields: the candidate-card fields with the provider
 * text columns spliced back in after `domains`, where they have always read.
 * @returns The field definitions for the new-card page. */
export function buildNewCardFields(
  orders: EnumOrders,
  labels: EnumLabels,
): FieldDef<NewCardFieldKey>[] {
  const fields: FieldDef<NewCardFieldKey>[] = buildCandidateCardFields(orders, labels);
  const afterDomains = fields.findIndex((field) => field.key === "domains") + 1;
  return fields.toSpliced(afterDomains, 0, ...NEW_CARD_TEXT_FIELDS);
}

/**
 * Keys the candidate-printing grid can carry: every column the accept-printing-field
 * endpoint writes, plus the read-only provider columns that are shown but never sent.
 */
export type CandidatePrintingFieldKey =
  | AcceptPrintingField
  | "externalId"
  | "extraData"
  | "imageUrl";

/** Build candidate printing fields with marker + channel options populated from the database.
 * @returns The field definitions for candidate printings. */
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

export interface PrintingGroup {
  candidates: CandidatePrintingResponse[];
  expectedPrintingId: string;
  /** Server-computed closest accepted printing (same code + language, markers/
   * finish may differ); backs the one-click assign when no exact match exists. */
  suggestedPrintingId: string | null;
}

// -- Spreadsheet component ----------------------------------------------------

interface CandidateSpreadsheetProps<TKey extends string = string> {
  fields: FieldDef<TKey>[];
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
  onCellClick?: (field: TKey, value: unknown, candidateId: string) => void;
  /** Called to set or clear a value in the active column. Pass null to clear. */
  onActiveChange?: (field: TKey, value: unknown | null) => void;
  onCheck?: (candidateId: string) => void;
  onUncheck?: (candidateId: string) => void;
  /**
   * Extra action items rendered in each candidate column header's dropdown
   * menu. The candidate `row` is injected via cloneElement, so the wrapper
   * component should declare it as an optional prop.
   */
  columnActions?: React.ReactElement<{
    row?: CandidateCardResponse | CandidatePrintingResponse;
  }>;
  /** Extra CSS classes for a candidate column header `<th>`. */
  columnClassName?: (row: CandidateCardResponse | CandidatePrintingResponse) => string | undefined;
  /** Return a warning tooltip for a candidate cell; shown as a small icon. */
  cellWarning?: (fieldKey: string, candidateValue: unknown) => string | null;
  /** Normalize a candidate value before comparing it to the active value.
   * Used to account for server-side transformations (e.g. typography fixes)
   * so that accepted-but-reformatted values no longer highlight as different. */
  normalizeCandidate?: (fieldKey: string, value: unknown) => unknown;
  /** Active printing image, shown beside the editor in richText field expand dialogs. */
  activeImageUrl?: string | null;
  /** Cost keywords, so the richText "Fix" button reformats rules/effect correctly. */
  costKeywords?: readonly string[];
  /** Small marker rendered next to the "Active" column header, e.g. a "Pre-filled"
   * badge signalling the Active values are suggestions that aren't saved yet. */
  activeColumnBadge?: React.ReactNode;
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

/** Render a labeled value, prefixing a facet icon (e.g. the rarity badge) when
 * the field declares an `iconCategory`. Falls back to the plain label otherwise.
 * @returns The label text, or an icon + label node for icon-backed fields. */
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

function isFavoriteProvider(
  row: CandidateCardResponse | CandidatePrintingResponse,
  providerLabels: Record<string, string> | undefined,
  favoriteProviders: Set<string>,
): boolean {
  return favoriteProviders.has(getProviderLabel(row, providerLabels));
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

/** Inline editor for free-text array fields (e.g. Tags) in the active cell.
 * Reuses the shared contribute/designer `ChipInput` (type + Enter/comma to add,
 * × to remove), autofocuses on open, and leaves edit mode when focus moves
 * outside the chips widget.
 * @returns The chip-input editor wrapped for the spreadsheet cell. */
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
    // Match the other inline editors, which grab focus immediately.
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

/** The `{ value, label }` pairs a dropdown-backed field offers, whether it carries
 * labeled options or plain string options.
 * @returns The field's options in a single shape. */
function dropdownOptions(field: FieldDef): { value: string; label: string }[] {
  if (field.labeledOptions) {
    return field.labeledOptions.map((opt) => ({ value: opt.value, label: opt.label }));
  }
  return (field.options ?? []).map((opt) => ({ value: opt, label: opt }));
}

/**
 * Inline editor for option-backed array fields (Markers, Distribution, Domains, …)
 * in the active cell. A searchable combobox, so long option lists (markers,
 * distribution channels) can be typed down instead of scrolled. Toggles are
 * batched into a local draft and committed once, when the popup closes.
 *
 * @returns The multi-select editor for the active cell.
 */
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
  /** Called only when the draft differs from `value`; null clears the field. */
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
            className="flex w-full items-center gap-1 rounded text-left text-sm"
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
      {/* Grow to the widest option (cell columns are narrow) instead of the
          default anchor width, capped so it stays inside the viewport. */}
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

export function CandidateSpreadsheet<TKey extends string = string>({
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
  activeImageUrl,
  costKeywords = [],
  activeColumnBadge,
}: CandidateSpreadsheetProps<TKey>) {
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
            {sortedRows.map((row) => (
              <th
                key={row.id}
                className={cn(
                  "w-[300px] border-l px-3 py-2 text-left font-medium",
                  isFavoriteProvider(row, providerLabels, favoriteProviders) &&
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
            // Array order matters for some fields (e.g. tags), so offer a
            // one-click reverse when there are at least two values to swap.
            const canReverseActive =
              field.array === true && Array.isArray(activeValue) && activeValue.length > 1;

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
                    if (
                      !onActiveChange ||
                      field.readOnly ||
                      field.richText ||
                      editingField === field.key
                    ) {
                      // richText fields edit through the expand dialog, not inline.
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
                  {field.richText ? (
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1 break-words whitespace-normal">
                        {hasValue(activeValue) ? (
                          field.richTextVariant === "flavor" ? (
                            // whitespace-pre-line keeps the flavor line breaks (e.g. the
                            // attribution on its own line); the container is whitespace-normal
                            // and, unlike rules/effect, flavor is a plain span not CardText.
                            <span className="text-muted-foreground/80 whitespace-pre-line italic">
                              {String(activeValue)}
                            </span>
                          ) : (
                            <CardText text={String(activeValue)} interactive={false} />
                          )
                        ) : (
                          <span className={isMissing ? "text-red-400" : "text-muted-foreground"}>
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
                      aria-label={field.label}
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
                    <span
                      className={cn(
                        isMissing ? "text-red-400" : "text-muted-foreground",
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
                      // Shown on touch (no hover); hover-revealed only at md+.
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
                          ? // Copy the normalized (typography-fixed) value shown in the
                            // cell, not the raw candidate — otherwise a draft-only Active
                            // column (new-printing groups, new cards) keeps the unfixed
                            // value while the cell displays the fixed one. Falls back to
                            // the raw value when no normalizer is passed.
                            () => onCellClick(field.key, normalizedCandidate, row.id)
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
