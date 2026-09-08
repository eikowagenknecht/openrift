import type {
  DeskCreateInput,
  DeskUpdateInput,
} from "@openrift/shared/contracts/admin/printing-desk";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { appendSetTotal } from "@openrift/shared/fix-typography";
import { TBA_CODE, tbaShortCode } from "@openrift/shared/printing-code";
import { normalizeToPeriodStart } from "@openrift/shared/set-release";
import { WellKnown } from "@openrift/shared/well-known";
import type { Updateable } from "kysely";

import type { PrintingsTable } from "../../../db/tables/catalog.js";
import type { Repos, Transact } from "../../../deps.js";
import { AppError } from "../../../errors.js";
import type { Io } from "../../../io.js";
import { assertFound } from "../../../lib/assertions.js";
import { isUniqueViolationOn } from "../../../lib/pg-errors.js";
import type { AdminAccess } from "../../../middleware/require-admin.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import {
  acceptPrinting,
  updatePrintingDistributionChannels,
  updatePrintingMarkers,
} from "./printing-admin.js";

interface DeskRelease {
  releasedAt: string | null;
  releasePrecision: PrintingsTable["releasePrecision"];
}

/** Not a check-then-act: two edits racing to the same identity would both pass a pre-read. */
function asIdentityConflict(error: unknown): unknown {
  if (
    isUniqueViolationOn(error, "uq_printings_identity") ||
    isUniqueViolationOn(error, "uq_printings_variant")
  ) {
    return new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Another printing already has that code, finish, size, language and marker combination.",
    );
  }
  return error;
}

/**
 * `chk_printings_release_period_start` rejects a mid-period date at a coarse
 * precision, so the date is snapped before it reaches the write.
 */
function normalizeRelease(release: DeskRelease): DeskRelease {
  const { releasedAt, releasePrecision } = release;
  if ((releasedAt === null) !== (releasePrecision === null)) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Set both a release date and a precision, or neither.",
    );
  }
  const normalized = normalizeToPeriodStart({ releasedAt, precision: releasePrecision });
  return { releasedAt: normalized.releasedAt, releasePrecision: normalized.precision };
}

export async function assertDeskOwnership(
  repos: Pick<Repos, "adminEvents">,
  adminAccess: AdminAccess | null,
  userId: string,
  printingId: string,
): Promise<void> {
  if (adminAccess?.isAdmin) {
    return;
  }
  if (await repos.adminEvents.wasPrintingCreatedBy(printingId, userId)) {
    return;
  }
  throw new AppError(
    403,
    ERROR_CODES.FORBIDDEN,
    "Only the admin can edit a printing you did not add",
  );
}

type CreateRepos = Pick<
  Repos,
  | "adminEvents"
  | "catalog"
  | "catalogMutations"
  | "distributionChannels"
  | "markers"
  | "printingDesk"
  | "printingEvents"
  | "printingImages"
  | "sets"
>;

export async function createDeskPrinting(
  transact: Transact,
  repos: CreateRepos,
  io: Io,
  userId: string,
  input: DeskCreateInput,
): Promise<string> {
  const { cardId, basePrintingId, codeTba, ...fields } = input;

  const card = await repos.catalogMutations.getCardById(cardId);
  assertFound(card, "Card not found");

  // The desk speaks set uuids; `acceptPrinting` takes the slug.
  const set = await repos.sets.getRef(fields.setId);
  assertFound(set, "Set not found");

  const base = basePrintingId
    ? await repos.printingDesk.getFullPrinting(basePrintingId)
    : await repos.printingDesk.findBasePrinting(cardId, fields.language);

  const artist = fields.artist ?? base?.artist;
  if (!artist) {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "This card has no printing to copy from; artist is required.",
    );
  }

  const shortCode = codeTba ? tbaShortCode(card.slug) : fields.shortCode;
  if (!shortCode) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A short code is required.");
  }

  const release = normalizeRelease({
    releasedAt: fields.releasedAt,
    releasePrecision: fields.releasePrecision,
  });

  let printingId: string;
  try {
    printingId = await acceptPrinting(
      transact,
      repos,
      cardId,
      {
        shortCode,
        publicCode: codeTba ? TBA_CODE : shortCode,
        setId: set.slug,
        setName: set.name,
        finish: fields.finish,
        size: fields.size,
        language: fields.language,
        artist,
        markerSlugs: fields.markerSlugs,
        distributionChannelSlugs: fields.distributionChannelSlugs,
        rarity: base?.rarity ?? WellKnown.rarity.COMMON,
        artVariant: WellKnown.artVariant.NORMAL,
        isSigned: false,
        printedRulesText: base?.printedRulesText ?? null,
        printedEffectText: base?.printedEffectText ?? null,
        flavorText: base?.flavorText ?? null,
        printedName: base?.printedName ?? null,
      },
      [],
      io,
      { requireNew: true },
    );
  } catch (error) {
    throw asIdentityConflict(error);
  }

  // `acceptPrinting` runs the public code through `appendSetTotal`, which would
  // turn a TBA code into "TBA/<total>"; the desk's TBA code stays bare.
  await repos.printingDesk.updatePrintingDeskFields(printingId, {
    announcedAt: fields.announcedAt,
    releasedAt: release.releasedAt,
    releasePrecision: release.releasePrecision,
    comment: fields.comment,
    ...(codeTba ? { publicCode: TBA_CODE } : {}),
  });

  await recordAdminEvent(repos, userId, {
    action: "printing.create",
    entityType: "printing",
    entityId: printingId,
    entityLabel: shortCode,
    cardSlug: card.slug,
    newValues: { ...fields, cardId, codeTba, shortCode, artist },
  });

  await repos.catalog.refreshCatalogViews();

  return printingId;
}

const SCALAR_FIELDS = [
  "setId",
  "finish",
  "size",
  "language",
  "artist",
  "announcedAt",
  "comment",
] as const;

type UpdateRepos = Pick<
  Repos,
  | "adminEvents"
  | "catalog"
  | "catalogMutations"
  | "distributionChannels"
  | "markers"
  | "printingDesk"
  | "sets"
>;

export async function updateDeskPrinting(
  transact: Transact,
  repos: UpdateRepos,
  adminAccess: AdminAccess | null,
  userId: string,
  input: DeskUpdateInput,
): Promise<void> {
  const { printingId, codeTba, shortCode, markerSlugs, distributionChannelSlugs, ...fields } =
    input;

  const before = await repos.printingDesk.getFullPrinting(printingId);
  assertFound(before, "Printing not found");
  await assertDeskOwnership(repos, adminAccess, userId, printingId);

  const patch: Updateable<PrintingsTable> = {};
  for (const field of SCALAR_FIELDS) {
    if (fields[field] !== undefined) {
      patch[field] = fields[field] as never;
    }
  }
  if (patch.setId !== undefined) {
    assertFound(await repos.sets.getRef(String(patch.setId)), "Set not found");
  }
  if (fields.releasedAt !== undefined || fields.releasePrecision !== undefined) {
    const release = normalizeRelease({
      releasedAt: fields.releasedAt === undefined ? before.releasedAt : fields.releasedAt,
      releasePrecision:
        fields.releasePrecision === undefined ? before.releasePrecision : fields.releasePrecision,
    });
    patch.releasedAt = release.releasedAt;
    patch.releasePrecision = release.releasePrecision;
  }

  if (codeTba !== undefined || shortCode !== undefined) {
    const card = await repos.catalogMutations.getCardById(before.cardId);
    assertFound(card, "Card not found");
    const nextShortCode = codeTba ? tbaShortCode(card.slug) : (shortCode ?? before.shortCode);
    const total = await repos.catalogMutations.getSetPrintedTotalForPrinting(printingId);
    patch.shortCode = nextShortCode;
    patch.publicCode = codeTba
      ? TBA_CODE
      : appendSetTotal(nextShortCode, total?.printedTotal ?? null);
  }

  try {
    await repos.printingDesk.updatePrintingDeskFields(printingId, patch);
    if (markerSlugs !== undefined) {
      await updatePrintingMarkers(transact, printingId, markerSlugs);
    }
    if (distributionChannelSlugs !== undefined) {
      await updatePrintingDistributionChannels(repos, printingId, distributionChannelSlugs);
    }
  } catch (error) {
    throw asIdentityConflict(error);
  }

  const changed = Object.keys(patch);
  await recordAdminEvent(repos, userId, {
    action: "printing.update",
    entityType: "printing",
    entityId: printingId,
    entityLabel: patch.shortCode === undefined ? before.shortCode : String(patch.shortCode),
    cardSlug: null,
    oldValues: Object.fromEntries(changed.map((key) => [key, before[key as keyof typeof before]])),
    newValues: { ...patch, ...(markerSlugs ? { markerSlugs } : {}) },
  });

  await repos.catalog.refreshCatalogViews();
}
