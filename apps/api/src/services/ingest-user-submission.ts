/**
 * Ingest a single in-app user card submission into the candidate pipeline
 * (ADR-036).
 *
 * This is deliberately NOT `ingestCandidates`: that function treats a provider
 * as a full-replace namespace and deletes any candidate rows absent from its
 * payload. User submissions all share `provider = "usersubmission"`, so a batch
 * ingest of one card would wipe every other user's pending submission. Instead
 * this inserts exactly one candidate card (+ its printings) with a
 * per-submission-unique `external_id`, never deleting anything. Everything
 * downstream — the admin review tabs, accept/promote, and reject/ignore — is
 * the shared ADR-008 machinery, untouched.
 */
import { WellKnown } from "@openrift/shared";
import type { CardSubmissionInput } from "@openrift/shared/contracts";
import { emptyToNull, normalizeNameForMatching } from "@openrift/shared/utils";
import type { Insertable } from "kysely";

import type { CandidateCardsTable } from "../db/index.js";
import type { Transact } from "../deps.js";
import type { IngestCard, IngestPrinting } from "../routes/admin/cards/schemas.js";
import { candidateCardValidator, candidatePrintingValidator } from "./ingest-candidates.js";

/** The provider name every in-app user submission is ingested under. */
export const USER_SUBMISSION_PROVIDER = "usersubmission";

/** Per-user cap on in-app submissions in a rolling 24h window (ADR-036). */
const USER_SUBMISSION_DAILY_LIMIT = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * UTC date stamp (`YYYYMMDD-HHmm`) baked into per-submission external_ids so a
 * user's two submissions of the same card never collide on the natural key.
 * @param date The instant to format.
 * @returns A `YYYYMMDD-HHmm` UTC string.
 */
export function formatSubmissionDateStamp(date: Date): string {
  const yyyy = date.getUTCFullYear().toString();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

/**
 * Map a validated user-submission payload to the candidate `IngestCard` shape,
 * generating the server-side external_ids. The card key is
 * `<slug>--<dateStamp>--<userId>` (ADR-036); printing keys extend it with a
 * per-printing disambiguator, finish and language so multiple printings in one
 * submission stay distinct.
 * @param input The Zod-validated submission body.
 * @param userId The submitter's id, part of the external_id.
 * @param dateStamp UTC stamp from {@link formatSubmissionDateStamp}.
 * @returns An `IngestCard` ready for {@link ingestUserSubmission}.
 */
export function buildUserSubmissionCard(
  input: CardSubmissionInput,
  userId: string,
  dateStamp: string,
): IngestCard {
  const { slug, card } = input;
  const cardExternalId = `${slug}--${dateStamp}--${userId}`;

  const printings: IngestPrinting[] = input.printings.map((printing, index) => {
    const shortCode = printing.public_code.split("/", 1)[0] || printing.public_code;
    const finishForId = printing.finish ?? WellKnown.finish.NORMAL;
    const languageForId = (printing.language ?? WellKnown.language.EN).toLowerCase();
    const disambiguator = shortCode || index.toString();
    const externalId = `${slug}:${disambiguator}--${dateStamp}--${userId}:${finishForId}:${languageForId}`;
    return {
      short_code: shortCode,
      set_id: printing.set_id ?? null,
      set_name: printing.set_name ?? null,
      rarity: printing.rarity ?? null,
      art_variant: printing.art_variant ?? null,
      is_signed: printing.is_signed ?? false,
      marker_slugs: printing.marker_slugs ?? [],
      distribution_channel_slugs: printing.distribution_channel_slugs ?? [],
      finish: printing.finish ?? null,
      size: printing.size ?? null,
      artist: printing.artist ?? null,
      public_code: printing.public_code,
      printed_rules_text: printing.printed_rules_text ?? null,
      printed_effect_text: printing.printed_effect_text ?? null,
      image_url: printing.image_url ?? null,
      flavor_text: printing.flavor_text ?? null,
      external_id: externalId,
      extra_data: null,
      language: printing.language ?? null,
      printed_name: printing.printed_name ?? null,
    };
  });

  return {
    name: card.name,
    types: card.types ?? (card.type ? [card.type] : []),
    super_types: card.super_types ?? [],
    domains: card.domains ?? [],
    might: card.might ?? null,
    energy: card.energy ?? null,
    power: card.power ?? null,
    might_bonus: card.might_bonus ?? null,
    // The contribution form has no card-level rules/effect text (those live on
    // printings), and no card short_code.
    rules_text: null,
    effect_text: null,
    tags: card.tags ?? [],
    short_code: null,
    external_id: cardExternalId,
    extra_data: null,
    printings,
  };
}

/**
 * Outcome of an in-app submission. Discriminated so the route can map it to a
 * typed oRPC error without this service depending on oRPC.
 */
export type UserSubmissionResult =
  | { status: "ok"; candidateCardId: string }
  | { status: "rate_limited"; limit: number }
  | { status: "invalid"; errors: string[] };

interface IngestUserSubmissionArgs {
  userId: string;
  submissionNote: string | null;
  card: IngestCard;
  /** "Now", passed in so the 24h window and any test are deterministic. */
  now: Date;
}

/**
 * Insert one user-submitted candidate card and its printings under the
 * `usersubmission` provider. Enforces the per-user daily cap, validates against
 * the same DB-constraint rules as the admin ingest, and resolves the live
 * card/printing links so corrections and image suggestions land in the admin
 * Updates tab rather than as spurious new rows. Never deletes.
 * @param transact Transaction runner from the API context.
 * @param args Submitter id, note, the mapped card, and the current instant.
 * @returns An {@link UserSubmissionResult} describing what happened.
 */
export function ingestUserSubmission(
  transact: Transact,
  args: IngestUserSubmissionArgs,
): Promise<UserSubmissionResult> {
  const { userId, submissionNote, card, now } = args;
  const since = new Date(now.getTime() - DAY_MS);

  return transact(async (trxRepos) => {
    const repo = trxRepos.ingest;

    // ── Per-user daily cap ────────────────────────────────────────────────────
    // The advisory lock serializes this user's concurrent submissions: without
    // it, parallel requests all read the same COUNT under READ COMMITTED and
    // all pass the cap. The lock releases when the transaction ends.
    await repo.lockUserSubmissions(userId);
    const recent = await repo.countRecentSubmissionsByUser(userId, since);
    if (recent >= USER_SUBMISSION_DAILY_LIMIT) {
      return { status: "rate_limited", limit: USER_SUBMISSION_DAILY_LIMIT };
    }

    // ── Validate against the identical rules the admin ingest uses ───────────
    const errors: string[] = [];
    const cardValidation = candidateCardValidator.safeParse({
      name: card.name,
      types: card.types,
      might: card.might,
      energy: card.energy,
      power: card.power,
      might_bonus: card.might_bonus,
      rules_text: emptyToNull(card.rules_text),
      effect_text: emptyToNull(card.effect_text),
      short_code: card.short_code ?? null,
      external_id: card.external_id,
    });
    if (!cardValidation.success) {
      errors.push(
        ...cardValidation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      );
    }
    for (const printing of card.printings) {
      const printingValidation = candidatePrintingValidator.safeParse({
        short_code: printing.short_code,
        set_id: printing.set_id,
        set_name: printing.set_name ?? null,
        rarity: printing.rarity,
        art_variant: printing.art_variant,
        finish: printing.finish,
        size: printing.size,
        artist: printing.artist,
        public_code: printing.public_code,
        printed_rules_text: emptyToNull(printing.printed_rules_text),
        printed_effect_text: emptyToNull(printing.printed_effect_text),
        image_url: printing.image_url ?? null,
        flavor_text: printing.flavor_text ?? null,
        external_id: printing.external_id,
      });
      if (!printingValidation.success) {
        errors.push(
          ...printingValidation.error.issues.map(
            (issue) => `printings.${printing.short_code}.${issue.path.join(".")}: ${issue.message}`,
          ),
        );
      }
    }
    if (errors.length > 0) {
      return { status: "invalid", errors };
    }

    // ── Resolve live card + printing links (for the review "update" view) ────
    const [cardNorms, aliases, printingKeys, linkOverrideRows] = await Promise.all([
      repo.allCardNorms(),
      repo.allCardNameAliases(),
      repo.allPrintingKeys(),
      repo.allPrintingLinkOverrides(),
    ]);
    const cardByNorm = new Map(cardNorms.map((row) => [row.normName, row.id]));
    const aliasByNorm = new Map(aliases.map((row) => [row.normName, row.cardId]));
    const printingByKey = new Map(
      printingKeys.map((row) => [
        `${row.shortCode}:${row.finish}:${[...row.markerSlugs].toSorted().join(",")}:${row.language}`,
        row.id,
      ]),
    );
    const linkOverrides = new Map(
      linkOverrideRows.map((row) => [`${row.externalId}:${row.finish}`, row.printingId]),
    );

    // An empty key identifies nothing — see the note in ingest-candidates.ts.
    const normName = normalizeNameForMatching(card.name);
    const effectiveCardId =
      normName === "" ? null : (cardByNorm.get(normName) ?? aliasByNorm.get(normName) ?? null);

    // ── Insert the candidate card + printings ────────────────────────────────
    const cardInsert: Insertable<CandidateCardsTable> = {
      provider: USER_SUBMISSION_PROVIDER,
      name: card.name,
      types: card.types,
      superTypes: card.super_types,
      domains: card.domains,
      might: card.might,
      energy: card.energy,
      power: card.power,
      mightBonus: card.might_bonus,
      rulesText: emptyToNull(card.rules_text),
      effectText: emptyToNull(card.effect_text),
      tags: card.tags,
      externalId: card.external_id,
      shortCode: card.short_code ?? null,
      extraData: null,
      submittedByUserId: userId,
      submissionNote,
    };
    const candidateCardId = await repo.insertCandidateCard(cardInsert);

    for (const printing of card.printings) {
      const sortedSlugs = [...(printing.marker_slugs ?? [])].toSorted();
      const printingKey =
        effectiveCardId && printing.rarity && printing.finish
          ? `${printing.short_code}:${printing.finish}:${sortedSlugs.join(",")}:${printing.language ?? WellKnown.language.EN}`
          : null;
      const overrideId = linkOverrides.get(`${printing.external_id}:${printing.finish ?? ""}`);
      const resolvedPrintingId =
        overrideId ?? (printingKey ? (printingByKey.get(printingKey) ?? null) : null);

      await repo.insertCandidatePrinting({
        candidateCardId,
        printingId: resolvedPrintingId,
        shortCode: printing.short_code,
        setId: printing.set_id,
        setName: printing.set_name ?? null,
        rarity: printing.rarity,
        artVariant: printing.art_variant,
        isSigned: printing.is_signed,
        markerSlugs: sortedSlugs,
        distributionChannelSlugs: printing.distribution_channel_slugs ?? [],
        finish: printing.finish,
        size: printing.size ?? null,
        artist: printing.artist,
        publicCode: printing.public_code,
        printedRulesText: emptyToNull(printing.printed_rules_text),
        printedEffectText: emptyToNull(printing.printed_effect_text),
        imageUrl: printing.image_url ?? null,
        flavorText: printing.flavor_text ?? null,
        language: printing.language ?? null,
        printedName: printing.printed_name ?? null,
        externalId: printing.external_id,
        extraData: null,
      });
    }

    return { status: "ok", candidateCardId };
  });
}
