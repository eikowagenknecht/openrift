import type { CardSubmissionInput } from "@openrift/shared/contracts/card-submissions";
import { contributionFileSchema } from "@openrift/shared/contribute-schema";
import { formatCompactUtcStamp } from "@openrift/shared/format-date";
import type { Card, Printing } from "@openrift/shared/types/catalog";
import { trimToNull } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import type { core } from "zod";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

const JSON_TO_FORM_KEY: Record<string, string> = {
  super_types: "superTypes",
  might_bonus: "mightBonus",
  public_code: "publicCode",
  set_id: "setId",
  set_name: "setName",
  art_variant: "artVariant",
  is_signed: "isSigned",
  is_overnumbered: "isOvernumbered",
  marker_slugs: "markerSlugs",
  distribution_channel_slugs: "distributionChannelSlugs",
  printed_rules_text: "printedRulesText",
  printed_effect_text: "printedEffectText",
  image_url: "imageUrl",
  flavor_text: "flavorText",
  printed_name: "printedName",
  printed_year: "printedYear",
};

function mapJsonPathToFormPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      out += `[${segment.toString()}]`;
      continue;
    }
    const key = String(segment);
    const mapped = JSON_TO_FORM_KEY[key] ?? key;
    out += out === "" ? mapped : `.${mapped}`;
  }
  return out;
}

export interface ContributeFormCard {
  name: string;
  types: string[];
  superTypes: string[];
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  mightBonus: number | null;
  tags: string[];
}

export interface ContributeFormPrinting {
  setId: string | null;
  setName: string | null;
  rarity: string | null;
  artVariant: string | null;
  isSigned: boolean;
  isOvernumbered: boolean;
  markerSlugs: string[];
  distributionChannelSlugs: string[];
  finish: string | null;
  size: string | null;
  artist: string | null;
  publicCode: string | null;
  printedRulesText: string | null;
  printedEffectText: string | null;
  imageUrl: string | null;
  flavorText: string | null;
  language: string | null;
  printedName: string;
  printedYear: number | null;
}

export interface ContributeFormState {
  slug: string;
  card: ContributeFormCard;
  printings: ContributeFormPrinting[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

function emptyCard(): ContributeFormCard {
  return {
    name: "",
    types: [],
    superTypes: [],
    domains: [],
    might: null,
    energy: null,
    power: null,
    mightBonus: null,
    tags: [],
  };
}

export function emptyPrinting(): ContributeFormPrinting {
  return {
    setId: null,
    setName: null,
    rarity: null,
    artVariant: null,
    isSigned: false,
    isOvernumbered: false,
    markerSlugs: [],
    distributionChannelSlugs: [],
    finish: null,
    size: WellKnown.cardSize.STANDARD,
    artist: null,
    publicCode: null,
    printedRulesText: null,
    printedEffectText: null,
    imageUrl: null,
    flavorText: null,
    language: "EN",
    printedName: "",
    printedYear: null,
  };
}

export function emptyFormState(): ContributeFormState {
  return { slug: "", card: emptyCard(), printings: [emptyPrinting()] };
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
}

export function validateContribution(state: ContributeFormState): ValidationResult {
  const errors: ValidationError[] = [];

  if (!state.slug || !SLUG_PATTERN.test(state.slug)) {
    errors.push({
      path: "slug",
      message: "Slug must be lowercase letters, digits, and hyphens.",
    });
  }

  const json = buildContributionJson(state, formatCompactUtcStamp(new Date()));
  const result = contributionFileSchema.safeParse(json);
  if (!result.success) {
    for (const issue of result.error.issues) {
      // external_id is derived from the slug, so a pattern failure here is a slug failure, already surfaced above.
      if (issue.path.at(-1) === "external_id") {
        continue;
      }
      errors.push({
        path: mapJsonPathToFormPath(issue.path),
        message: humanizeIssue(issue),
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

function humanizeIssue(issue: core.$ZodIssue): string {
  const lastKey = String(issue.path.at(-1) ?? "");
  if (lastKey === "name" && issue.path[0] === "card" && issue.code === "too_small") {
    return "Card name is required.";
  }
  if (lastKey === "public_code" && issue.code === "invalid_type") {
    return "Code is required.";
  }
  return issue.message;
}

type SnakeCardJson = Record<string, unknown>;
type SnakePrintingJson = Record<string, unknown>;

interface ContributionJson {
  card: SnakeCardJson;
  printings: SnakePrintingJson[];
}

function setIfPresent(
  object: Record<string, unknown>,
  key: string,
  value: unknown,
  isMeaningful: (v: unknown) => boolean,
): void {
  if (isMeaningful(value)) {
    object[key] = value;
  }
}

const isNonNull = (v: unknown): boolean => v !== null && v !== undefined;
const isNonEmptyArray = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
const isNonEmptyString = (v: unknown): boolean => typeof v === "string" && v.length > 0;

function buildCardJson(card: ContributeFormCard, externalId: string): SnakeCardJson {
  const out: SnakeCardJson = { name: card.name.trim(), external_id: externalId };
  setIfPresent(out, "types", card.types, isNonEmptyArray);
  setIfPresent(out, "super_types", card.superTypes, isNonEmptyArray);
  setIfPresent(out, "domains", card.domains, isNonEmptyArray);
  setIfPresent(out, "might", card.might, isNonNull);
  setIfPresent(out, "energy", card.energy, isNonNull);
  setIfPresent(out, "power", card.power, isNonNull);
  setIfPresent(out, "might_bonus", card.mightBonus, isNonNull);
  setIfPresent(out, "tags", card.tags, isNonEmptyArray);
  return out;
}

function buildPrintingJson(
  printing: ContributeFormPrinting,
  externalId: string,
  cardName: string,
): SnakePrintingJson {
  const printedName = printing.printedName.trim() || cardName;
  const out: SnakePrintingJson = {
    external_id: externalId,
    printed_name: printedName,
  };
  setIfPresent(out, "set_id", trimToNull(printing.setId), isNonEmptyString);
  setIfPresent(out, "set_name", trimToNull(printing.setName), isNonEmptyString);
  setIfPresent(out, "rarity", trimToNull(printing.rarity), isNonEmptyString);
  setIfPresent(out, "art_variant", trimToNull(printing.artVariant), isNonEmptyString);
  if (printing.isSigned) {
    out.is_signed = true;
  }
  if (printing.isOvernumbered) {
    out.is_overnumbered = true;
  }
  setIfPresent(out, "marker_slugs", printing.markerSlugs, isNonEmptyArray);
  setIfPresent(
    out,
    "distribution_channel_slugs",
    printing.distributionChannelSlugs,
    isNonEmptyArray,
  );
  setIfPresent(out, "finish", trimToNull(printing.finish), isNonEmptyString);
  setIfPresent(out, "size", trimToNull(printing.size), isNonEmptyString);
  setIfPresent(out, "artist", trimToNull(printing.artist), isNonEmptyString);
  setIfPresent(out, "public_code", trimToNull(printing.publicCode), isNonEmptyString);
  setIfPresent(out, "printed_rules_text", trimToNull(printing.printedRulesText), isNonEmptyString);
  setIfPresent(
    out,
    "printed_effect_text",
    trimToNull(printing.printedEffectText),
    isNonEmptyString,
  );
  setIfPresent(out, "image_url", trimToNull(printing.imageUrl), isNonEmptyString);
  setIfPresent(out, "flavor_text", trimToNull(printing.flavorText), isNonEmptyString);
  setIfPresent(out, "language", trimToNull(printing.language), isNonEmptyString);
  setIfPresent(out, "printed_year", printing.printedYear, isNonNull);
  return out;
}

// Only validateContribution consumes this; the external_ids here exist to satisfy the schema and are dropped by buildSubmissionPayload.
export function buildContributionJson(
  state: ContributeFormState,
  dateStamp: string,
): ContributionJson {
  const cardExternalId = `community:${state.slug}--${dateStamp}`;
  const card = buildCardJson(state.card, cardExternalId);
  const cardName = state.card.name.trim();
  const printings = state.printings.map((printing, index) => {
    const finish = trimToNull(printing.finish) ?? WellKnown.finish.NORMAL;
    const language = (trimToNull(printing.language) ?? "EN").toLowerCase();
    const shortCode = trimToNull(printing.publicCode)?.split("/", 1)[0];
    const disambiguator = shortCode || index.toString();
    const printingExternalId = `community:${state.slug}:${disambiguator}--${dateStamp}:${finish}:${language}`;
    return buildPrintingJson(printing, printingExternalId, cardName);
  });
  return { card, printings };
}

// Slug arrays are sorted so a reordering by the pickers doesn't read as an edit.
function printingFingerprint(printing: ContributeFormPrinting): string {
  return JSON.stringify({
    ...printing,
    markerSlugs: [...printing.markerSlugs].toSorted(),
    distributionChannelSlugs: [...printing.distributionChannelSlugs].toSorted(),
  });
}

// Printings unchanged from `baseline` are left out, since the correction flow prefills every
// printing and a one-field fix would otherwise bury the edit among rows proposing nothing.
export function buildSubmissionPayload(
  state: ContributeFormState,
  submissionNote: string | null,
  baseline?: ContributeFormState,
): CardSubmissionInput {
  const cardName = state.card.name.trim();
  const card = buildCardJson(state.card, "");
  delete card.external_id;
  const untouched = new Set(baseline?.printings.map((p) => printingFingerprint(p)));
  const printings = state.printings
    .filter((printing) => !untouched.has(printingFingerprint(printing)))
    .map((printing) => {
      const printingJson = buildPrintingJson(printing, "", cardName);
      delete printingJson.external_id;
      return printingJson;
    });
  const trimmedNote = submissionNote?.trim() ? submissionNote.trim() : null;
  return {
    slug: state.slug,
    card: card as CardSubmissionInput["card"],
    printings: printings as CardSubmissionInput["printings"],
    submissionNote: trimmedNote,
  };
}

// Only the fields identifying the card and target printing are populated, so the resulting
// JSON omits everything else and the consolidation Action treats absent fields as "leave alone".
export function buildImagePatchState(args: {
  cardName: string;
  cardSlug: string;
  printing: Printing;
  setSlug: string;
  setName: string;
  imageUrl: string;
}): ContributeFormState {
  return {
    slug: args.cardSlug,
    card: {
      ...emptyCard(),
      name: args.cardName,
    },
    printings: [
      {
        ...emptyPrinting(),
        setId: args.setSlug,
        setName: args.setName,
        finish: args.printing.finish || null,
        size: null,
        publicCode: args.printing.publicCode || null,
        imageUrl: args.imageUrl,
        language: args.printing.language || "EN",
        printedName: args.printing.printedName ?? "",
      },
    ],
  };
}

// The internal imageId references aren't real URLs, so imageUrl is left blank here.
export function prefillFromCard(
  card: Card,
  printings: Printing[],
  setSlugById: Map<string, string>,
  setNameById: Map<string, string>,
): ContributeFormState {
  return {
    slug: card.slug,
    card: {
      name: card.name,
      types: [...card.types],
      superTypes: [...card.superTypes],
      domains: [...card.domains],
      might: card.might,
      energy: card.energy,
      power: card.power,
      mightBonus: card.mightBonus,
      tags: [...card.tags],
    },
    printings: printings.map((p) => ({
      setId: setSlugById.get(p.setId) ?? null,
      setName: setNameById.get(p.setId) ?? null,
      rarity: p.rarity || null,
      artVariant: p.artVariant || null,
      isSigned: p.isSigned,
      isOvernumbered: p.isOvernumbered,
      markerSlugs: p.markers.map((m) => m.slug),
      distributionChannelSlugs: p.distributionChannels.map((channel) => channel.channel.slug),
      finish: p.finish || null,
      size: p.size ?? WellKnown.cardSize.STANDARD,
      artist: p.artist || null,
      publicCode: p.publicCode || null,
      printedRulesText: p.printedRulesText,
      printedEffectText: p.printedEffectText,
      imageUrl: null,
      flavorText: p.flavorText,
      language: p.language || "EN",
      printedName: p.printedName ?? "",
      printedYear: p.printedYear,
    })),
  };
}
