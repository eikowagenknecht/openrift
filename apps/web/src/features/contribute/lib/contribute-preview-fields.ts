import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";
import type {
  ContributeFormPrinting,
  ContributeFormState,
} from "@/features/contribute/lib/contribute-json";

const PRINTING_ERROR_PATH = /^printings\[(?<index>\d+)\]\.(?<key>.+)$/u;

const ERROR_LABELS: Record<string, string> = {
  "card.name": "Card name",
  "card.types": "Types",
  "card.superTypes": "Supertypes",
  "card.domains": "Domains",
  "card.might": "Might",
  "card.energy": "Energy",
  "card.power": "Power",
  "card.mightBonus": "Might bonus",
  "card.tags": "Tags",
  slug: "Card name",
  publicCode: "Code",
  setId: "Set",
  setName: "Set",
  rarity: "Rarity",
  artVariant: "Art variant",
  finish: "Finish",
  size: "Size",
  artist: "Artist",
  printedName: "Printed name",
  printedRulesText: "Rules text",
  printedEffectText: "Effect text",
  printedYear: "Year",
  flavorText: "Flavor text",
  imageUrl: "Image URL",
  language: "Language",
  markerSlugs: "Markers",
  distributionChannelSlugs: "Distribution channels",
};

const FIELD_BY_ERROR_KEY: Record<string, PlaceholderField> = {
  "card.name": "card.name",
  "card.types": "card.types",
  "card.domains": "card.domains",
  "card.might": "card.might",
  "card.energy": "card.energy",
  "card.power": "card.power",
  "card.mightBonus": "card.mightBonus",
  "card.tags": "card.tags",
  slug: "card.name",
  publicCode: "printing.publicCode",
  rarity: "printing.rarity",
  artist: "printing.artist",
  printedRulesText: "printing.printedRulesText",
  printedEffectText: "printing.printedEffectText",
  flavorText: "printing.flavorText",
};

/** Reads a validation path like `printings[2].publicCode` as something a contributor can act on. */
export function errorLabel(path: string): string {
  const match = PRINTING_ERROR_PATH.exec(path);
  if (!match?.groups) {
    return ERROR_LABELS[path] ?? path;
  }
  const { index, key } = match.groups;
  const number = (Number(index) + 1).toString();
  return `Printing ${number}: ${ERROR_LABELS[key ?? ""] ?? key ?? ""}`;
}

/** The preview region a validation path points at, when the card shows that field at all. */
export function errorField(path: string): PlaceholderField | null {
  const match = PRINTING_ERROR_PATH.exec(path);
  const key = match?.groups?.key ?? path;
  return FIELD_BY_ERROR_KEY[key] ?? null;
}

export function errorPrintingIndex(path: string): number | null {
  const index = PRINTING_ERROR_PATH.exec(path)?.groups?.index;
  return index === undefined ? null : Number(index);
}

function printingFilled(printing: ContributeFormPrinting | undefined): PlaceholderField[] {
  if (!printing) {
    return [];
  }
  const out: PlaceholderField[] = [];
  if (printing.printedRulesText?.trim()) {
    out.push("printing.printedRulesText");
  }
  if (printing.printedEffectText?.trim()) {
    out.push("printing.printedEffectText");
  }
  if (printing.flavorText?.trim()) {
    out.push("printing.flavorText");
  }
  if (printing.rarity) {
    out.push("printing.rarity");
  }
  if (printing.publicCode?.trim()) {
    out.push("printing.publicCode");
  }
  if (printing.artist?.trim()) {
    out.push("printing.artist");
  }
  return out;
}

/** Which preview regions currently show real data. */
export function filledPreviewFields(
  form: ContributeFormState,
  activePrinting: number | null,
): Set<PlaceholderField> {
  const { card } = form;
  const out: PlaceholderField[] = [];
  if (card.name.trim()) {
    out.push("card.name");
  }
  if (card.domains.length > 0) {
    out.push("card.domains");
  }
  if (card.types.length > 0 || card.superTypes.length > 0) {
    out.push("card.types");
  }
  if (card.tags.length > 0) {
    out.push("card.tags");
  }
  if (card.energy !== null) {
    out.push("card.energy");
  }
  if (card.might !== null) {
    out.push("card.might");
  }
  if (card.power !== null) {
    out.push("card.power");
  }
  if (card.mightBonus !== null) {
    out.push("card.mightBonus");
  }
  return new Set([...out, ...printingFilled(form.printings[activePrinting ?? 0])]);
}
