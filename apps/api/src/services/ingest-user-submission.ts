import type { IngestCard, IngestPrinting } from "@openrift/shared/contracts/admin/card-mutations";
import { USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/card-submissions";
import type {
  CardSubmissionInput,
  CardSubmissionKind,
} from "@openrift/shared/contracts/card-submissions";
/**
 * Not `ingestCandidates`: that function deletes candidate rows absent from
 * its payload, and all user submissions share `provider = "usersubmission"`,
 * so it would wipe every other user's pending submission. This inserts one
 * candidate card with a per-submission-unique `external_id` and never deletes.
 * Payload mapping and link resolution are shared with candidate-fields.ts / candidate-links.ts.
 */
import { WellKnown } from "@openrift/shared/well-known";
import type { Insertable } from "kysely";

import type { CandidateCardsTable } from "../db/index.js";
import type { Transact } from "../deps.js";
import { computeProposedDiff } from "../lib/card-submission-diff.js";
import {
  buildCandidateCardFields,
  buildCandidatePrintingFields,
  candidateCardValidator,
  candidateCardValidatorInput,
  candidatePrintingValidator,
  candidatePrintingValidatorInput,
} from "./candidate-fields.js";
import {
  loadCandidateLinkIndex,
  resolveCardIdByName,
  resolvePrintingLink,
} from "./candidate-links.js";

/** Per-user cap on in-app submissions in a rolling 24h window. */
const USER_SUBMISSION_DAILY_LIMIT = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Map a validated user-submission payload to the candidate `IngestCard` shape,
 * generating the server-side external_ids. The card key is
 * `<slug>--<dateStamp>--<userId>`; printing keys extend it with a per-printing
 * disambiguator, finish and language so multiple printings in one submission
 * stay distinct.
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
      is_overnumbered: printing.is_overnumbered ?? false,
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
      // The contribution form doesn't ask for the printed year; only provider
      // uploads carry it.
      printed_year: null,
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
 * Inferred from the payload, not the client: card-level data present means a
 * correction; its absence means the image flow (printing ID + URL only).
 */
export function inferSubmissionKind(card: IngestCard, cardLinked: boolean): CardSubmissionKind {
  if (!cardLinked) {
    return "new_card";
  }
  const hasCardData =
    card.types.length > 0 ||
    card.super_types.length > 0 ||
    card.domains.length > 0 ||
    card.tags.length > 0 ||
    card.might !== null ||
    card.energy !== null ||
    card.power !== null ||
    card.might_bonus !== null;
  const everyPrintingCarriesAnImage =
    card.printings.length > 0 && card.printings.every((printing) => printing.image_url !== null);
  if (!hasCardData && everyPrintingCarriesAnImage) {
    return "image";
  }
  return "correction";
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
 * `usersubmission` provider. Enforces the per-user daily cap and resolves
 * live card/printing links so corrections land in the admin Updates tab.
 */
export function ingestUserSubmission(
  transact: Transact,
  args: IngestUserSubmissionArgs,
): Promise<UserSubmissionResult> {
  const { userId, submissionNote, card, now } = args;
  const since = new Date(now.getTime() - DAY_MS);

  return transact(async (trxRepos) => {
    const repo = trxRepos.ingest;
    const submissions = trxRepos.cardSubmissions;

    // The advisory lock serializes this user's concurrent submissions: without
    // it, parallel requests all read the same COUNT under READ COMMITTED and
    // all pass the cap. It releases when the transaction ends.
    //
    // Counted on the submission ledger, not candidate_cards: the ledger is
    // append-only, so purging staging can't reset the daily allowance.
    await repo.lockUserSubmissions(userId);
    const recent = await submissions.countRecentByUser(userId, since);
    if (recent >= USER_SUBMISSION_DAILY_LIMIT) {
      return { status: "rate_limited", limit: USER_SUBMISSION_DAILY_LIMIT };
    }

    const errors: string[] = [];
    const cardValidation = candidateCardValidator.safeParse(candidateCardValidatorInput(card));
    if (!cardValidation.success) {
      errors.push(
        ...cardValidation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      );
    }
    for (const printing of card.printings) {
      const printingValidation = candidatePrintingValidator.safeParse(
        candidatePrintingValidatorInput(printing),
      );
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

    // Same link index and same gate as the batch ingest, so a submission links
    // exactly where a provider upload of the same card would.
    const linkIndex = await loadCandidateLinkIndex(repo);
    const liveCardId = resolveCardIdByName(linkIndex, card.name);
    const cardLinked = liveCardId !== null;

    const candidateCardFields = buildCandidateCardFields(card);
    const cardInsert: Insertable<CandidateCardsTable> = {
      provider: USER_SUBMISSION_PROVIDER,
      ...candidateCardFields,
      submittedByUserId: userId,
      submissionNote,
    };
    const candidateCardId = await repo.insertCandidateCard(cardInsert);

    const printingEntries = card.printings.map((printing) => ({
      printing,
      fields: buildCandidatePrintingFields(printing),
    }));
    for (const { printing, fields } of printingEntries) {
      const resolvedPrintingId = resolvePrintingLink(linkIndex, {
        provider: USER_SUBMISSION_PROVIDER,
        externalId: printing.external_id,
        shortCode: printing.short_code,
        finish: printing.finish,
        markerSlugs: printing.marker_slugs,
        language: printing.language,
        cardLinked,
      });

      await repo.insertCandidatePrinting({
        candidateCardId,
        printingId: resolvedPrintingId,
        ...fields,
      });
    }

    // A submission that changes nothing against the live catalog records an empty diff and resolves as already_correct, not an accept.
    const { snapshot, cardSlug } = await submissions.liveSnapshot(
      liveCardId,
      card.printings.map((printing) => printing.short_code),
    );
    const proposedDiff = computeProposedDiff(
      { card: candidateCardFields, printings: printingEntries.map((entry) => entry.fields) },
      snapshot,
    );
    await submissions.insert({
      userId,
      provider: USER_SUBMISSION_PROVIDER,
      externalId: card.external_id,
      candidateCardId,
      kind: inferSubmissionKind(card, cardLinked),
      cardName: card.name,
      cardSlug,
      note: submissionNote,
      proposedDiff,
    });

    return { status: "ok", candidateCardId };
  });
}
