import type {
  AcceptCardField,
  AcceptPrintingField,
} from "@openrift/shared/contracts/admin/card-mutations";
import type { EnumOrders } from "@openrift/shared/types/enums";

import { hasValue } from "@/features/admin/lib/candidate-cell-values";
import type { CardTextVariant } from "@/features/contribute/components/card-text-input";
import type { EnumLabels } from "@/lib/enum-labels";
import type { FilterCategory } from "@/lib/icons";

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

export function hasDropdown(field: FieldDef): boolean {
  return (
    (field.options !== undefined && field.options.length > 0) ||
    (field.labeledOptions !== undefined && field.labeledOptions.length > 0)
  );
}

export function isMultiSelect(field: FieldDef): boolean {
  return field.array === true && hasDropdown(field);
}

export function dropdownOptions(field: FieldDef): { value: string; label: string }[] {
  if (field.labeledOptions) {
    return field.labeledOptions.map((opt) => ({ value: opt.value, label: opt.label }));
  }
  return (field.options ?? []).map((opt) => ({ value: opt, label: opt }));
}

export function resolveLabel(field: FieldDef, value: unknown): string {
  if (!hasValue(value)) {
    return "—";
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

export function isValidOption(field: FieldDef, value: unknown): boolean {
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
