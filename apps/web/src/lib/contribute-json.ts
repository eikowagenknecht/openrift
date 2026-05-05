/**
 * Helpers for the "contribute card data" form: validates form state against
 * the openrift-data schema, builds the JSON file, and constructs the GitHub
 * URL that opens a prefilled "new file" editor for the contributor.
 *
 * Filenames carry a `--<date>` suffix so the GitHub URL never collides with
 * an existing file. A consolidation Action in openrift-data strips the suffix
 * on PR open. External IDs carry the same suffix to keep the in-PR snapshot
 * unique against `check-uniqueness.mjs`.
 */
import type { Card, Printing } from "@openrift/shared";
import { contributionFileSchema } from "@openrift/shared/contribute-schema";
import type { ZodIssue } from "zod";

const REPO = "openriftapp/openrift-data";
const SCHEMA_REF = "../../schemas/card.schema.json";
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Snake-case JSON keys that map back to a different camelCase form-state key.
 * Anything not in this map (e.g. `name`, `type`, `domains`) keeps the same
 * spelling on both sides.
 */
const JSON_TO_FORM_KEY: Record<string, string> = {
  super_types: "superTypes",
  might_bonus: "mightBonus",
  public_code: "publicCode",
  set_id: "setId",
  set_name: "setName",
  art_variant: "artVariant",
  is_signed: "isSigned",
  marker_slugs: "markerSlugs",
  distribution_channel_slugs: "distributionChannelSlugs",
  printed_rules_text: "printedRulesText",
  printed_effect_text: "printedEffectText",
  image_url: "imageUrl",
  flavor_text: "flavorText",
  printed_name: "printedName",
  printed_year: "printedYear",
};

/**
 * Convert a Zod issue path (snake-case keys, numeric array indices) into the
 * form-state path the UI uses for error display (camelCase keys, `[n]` array
 * indices).
 * @param path The Zod issue's path.
 * @returns A dotted form-state path like `printings[0].publicCode`.
 */
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

interface ContributeFormCard {
  name: string;
  type: string | null;
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
  markerSlugs: string[];
  finish: string | null;
  artist: string | null;
  publicCode: string | null;
  printedRulesText: string | null;
  printedEffectText: string | null;
  imageUrl: string | null;
  flavorText: string | null;
  language: string | null;
  /** Printed name on this specific printing. Always populated; defaults to the card name. */
  printedName: string;
  printedYear: number | null;
}

export interface ContributeFormState {
  /** Kebab-case slug. Used as the contribution filename and external_id base. */
  slug: string;
  card: ContributeFormCard;
  printings: ContributeFormPrinting[];
}

export interface ValidationError {
  path: string;
  message: string;
}

interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

function emptyCard(): ContributeFormCard {
  return {
    name: "",
    type: null,
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
    markerSlugs: [],
    finish: null,
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
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * UTC date stamp used in filenames and external IDs: `YYYYMMDD-HHmm`. UTC
 * keeps the suffix consistent regardless of the contributor's timezone, which
 * matters when the consolidation Action diffs against the file in main.
 * @param date Date to format.
 * @returns A `YYYYMMDD-HHmm` string in UTC.
 */
export function formatDateStamp(date: Date): string {
  const yyyy = date.getUTCFullYear().toString();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

/**
 * Validates the form state by building the contribution JSON and running it
 * through the shared `contributionFileSchema` (the same schema used to generate
 * openrift-data's `card.schema.json`). The slug isn't part of the JSON file —
 * it's the filename — so it gets a separate check up front; if it fails, we
 * skip the schema run since the JSON's `external_id` would derive from a bad
 * slug and surface a misleading error.
 * @param state Current form state.
 * @returns Validation result with form-state error paths (camelCase, `[n]`).
 */
export function validateContribution(state: ContributeFormState): ValidationResult {
  const errors: ValidationError[] = [];

  if (!state.slug || !SLUG_PATTERN.test(state.slug)) {
    errors.push({
      path: "slug",
      message: "Slug must be lowercase letters, digits, and hyphens.",
    });
  }

  const json = buildContributionJson(state, formatDateStamp(new Date()));
  const result = contributionFileSchema.safeParse(json);
  if (!result.success) {
    for (const issue of result.error.issues) {
      // The two `external_id` fields are generated from the slug, so any
      // pattern failure there is really a slug failure — already surfaced.
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

/**
 * Replace Zod's terse default messages with the contributor-friendly ones the
 * form has shown historically. Falls through to Zod's own message otherwise.
 * @param issue The Zod issue to humanize.
 * @returns A user-facing error message.
 */
function humanizeIssue(issue: ZodIssue): string {
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
  $schema: string;
  card: SnakeCardJson;
  printings: SnakePrintingJson[];
}

function trimOrNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
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
  setIfPresent(out, "type", trimOrNull(card.type), isNonEmptyString);
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
  setIfPresent(out, "set_id", trimOrNull(printing.setId), isNonEmptyString);
  setIfPresent(out, "set_name", trimOrNull(printing.setName), isNonEmptyString);
  setIfPresent(out, "rarity", trimOrNull(printing.rarity), isNonEmptyString);
  setIfPresent(out, "art_variant", trimOrNull(printing.artVariant), isNonEmptyString);
  if (printing.isSigned) {
    out.is_signed = true;
  }
  setIfPresent(out, "marker_slugs", printing.markerSlugs, isNonEmptyArray);
  setIfPresent(out, "finish", trimOrNull(printing.finish), isNonEmptyString);
  setIfPresent(out, "artist", trimOrNull(printing.artist), isNonEmptyString);
  setIfPresent(out, "public_code", trimOrNull(printing.publicCode), isNonEmptyString);
  setIfPresent(out, "printed_rules_text", trimOrNull(printing.printedRulesText), isNonEmptyString);
  setIfPresent(
    out,
    "printed_effect_text",
    trimOrNull(printing.printedEffectText),
    isNonEmptyString,
  );
  setIfPresent(out, "image_url", trimOrNull(printing.imageUrl), isNonEmptyString);
  setIfPresent(out, "flavor_text", trimOrNull(printing.flavorText), isNonEmptyString);
  setIfPresent(out, "language", trimOrNull(printing.language), isNonEmptyString);
  setIfPresent(out, "printed_year", printing.printedYear, isNonNull);
  return out;
}

/**
 * Builds the contribution JSON. The `--<dateStamp>` suffix on every external_id
 * is stripped by openrift-data's consolidation Action when the PR opens, so the
 * merged file has clean IDs like `community:<slug>`.
 * @param state Current form state.
 * @param dateStamp UTC date stamp from {@link formatDateStamp}.
 * @returns The contribution JSON object ready for serialization.
 */
export function buildContributionJson(
  state: ContributeFormState,
  dateStamp: string,
): ContributionJson {
  const cardExternalId = `community:${state.slug}--${dateStamp}`;
  const card = buildCardJson(state.card, cardExternalId);
  const cardName = state.card.name.trim();
  const printings = state.printings.map((printing, index) => {
    const finish = trimOrNull(printing.finish) ?? "normal";
    const language = (trimOrNull(printing.language) ?? "EN").toLowerCase();
    const shortCode = trimOrNull(printing.publicCode)?.split("/", 1)[0];
    const disambiguator = shortCode || index.toString();
    const printingExternalId = `community:${state.slug}:${disambiguator}--${dateStamp}:${finish}:${language}`;
    return buildPrintingJson(printing, printingExternalId, cardName);
  });
  return { $schema: SCHEMA_REF, card, printings };
}

export function buildContributionFilename(slug: string, dateStamp: string): string {
  return `data/cards/${slug}--${dateStamp}.json`;
}

/**
 * Builds a Conventional Commits subject line for the prefilled commit.
 * Without this, GitHub auto-suggests "Create <filename>", which doesn't pass
 * openrift-data's commitlint check.
 * @param cardName Card display name; falls back to "card" if blank.
 * @param isCorrection True for the correction flow (existing card), false for new submissions.
 * @returns A commit subject like `feat: add Ahri, Alluring`.
 */
export function buildCommitMessage(cardName: string, isCorrection: boolean): string {
  const trimmed = cardName.trim() || "card";
  return isCorrection ? `fix: update ${trimmed}` : `feat: add ${trimmed}`;
}

/**
 * Builds the GitHub "new file" URL that opens the prefilled editor. GitHub's
 * `value` parameter is read as form data when the editor mounts, so URL-encoded
 * JSON survives intact through their fork-and-commit flow. The `message` param
 * sets the commit subject so it follows Conventional Commits (openrift-data
 * enforces it).
 * @param filename Repo-relative path under openrift-data.
 * @param json The contribution JSON; serialized with 2-space indent.
 * @param message Conventional Commits subject line for the commit and PR title.
 * @returns A URL the contributor can open in a new tab.
 */
export function buildGithubNewFileUrl(
  filename: string,
  json: ContributionJson,
  message: string,
): string {
  const body = JSON.stringify(json, null, 2);
  const params = new URLSearchParams({ filename, value: body, message });
  return `https://github.com/${REPO}/new/main?${params.toString()}`;
}

/**
 * Converts an existing OpenRift card + its printings into form state suitable
 * for the correction flow. The internal `imageId` references aren't real URLs,
 * so `imageUrl` is left blank, and the contributor supplies a fresh hosted link.
 * @param card The card to prefill.
 * @param printings All printings of that card.
 * @param setSlugById Lookup map from set UUID to set slug, used to populate `setId`.
 * @param setNameById Lookup map from set UUID to display name.
 * @returns Form state mirroring the card's current data.
 */
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
      type: card.type || null,
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
      markerSlugs: p.markers.map((m) => m.slug),
      finish: p.finish || null,
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
