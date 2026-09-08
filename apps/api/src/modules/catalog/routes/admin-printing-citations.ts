import { adminPrintingCitationsContract } from "@openrift/shared/contracts/admin/printing-citations";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { AdminPrintingCitation } from "@openrift/shared/types/api/admin";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { assertFound } from "../../../lib/assertions.js";
import { isUniqueViolationOn } from "../../../lib/pg-errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import { assertDeskPrintingScope } from "../services/printing-desk.js";

const os = implement(adminPrintingCitationsContract).$context<ApiContext>().use(requireAuthedUser);

interface CitationRow {
  id: string;
  label: string;
  sourceUrl: string | null;
}

/** The wire shape of a citation row; the sort key stays server-side. */
function toCitation(row: CitationRow, canEdit: boolean): AdminPrintingCitation {
  return { id: row.id, label: row.label, sourceUrl: row.sourceUrl, canEdit };
}

async function citationsEditableBy(
  repos: ApiContext["repos"],
  adminAccess: ApiContext["adminAccess"],
  userId: string,
  citationIds: readonly string[],
): Promise<Set<string>> {
  if (adminAccess?.isAdmin) {
    return new Set(citationIds);
  }
  return new Set(await repos.adminEvents.citationIdsCreatedBy(citationIds, userId));
}

/** `citation.create` is the only record of who added a link; the table has no author. */
async function assertCitationAuthor(
  repos: ApiContext["repos"],
  adminAccess: ApiContext["adminAccess"],
  userId: string,
  citationId: string,
): Promise<void> {
  const editable = await citationsEditableBy(repos, adminAccess, userId, [citationId]);
  if (editable.has(citationId)) {
    return;
  }
  throw new AppError(
    403,
    ERROR_CODES.FORBIDDEN,
    "Only the admin can change a link you did not add",
  );
}

/**
 * Turns the partial unique index's violation into a 409 and leaves anything else alone.
 * Do not replace this with a check-then-act: two admins pasting the same link at once would both pass it.
 */
function asDuplicateLinkConflict(error: unknown): unknown {
  if (isUniqueViolationOn(error, "uq_printing_citations_url")) {
    return new AppError(409, ERROR_CODES.CONFLICT, "That link is already cited on this printing.");
  }
  return error;
}

/**
 * Throws 404 unless the citation belongs to the printing in the path, so an id
 * from one printing cannot be edited or deleted through another's URL.
 */
async function assertOwnedByPrinting(
  repo: ApiContext["repos"]["printingCitations"],
  printingId: string,
  citationId: string,
): Promise<CitationRow> {
  const rows = await repo.listForPrinting(printingId);
  const row = rows.find((candidate) => candidate.id === citationId);
  assertFound(row, "Citation not found");
  return { id: row.id, label: row.label, sourceUrl: row.sourceUrl };
}

/**
 * Source citations on a promo printing: the videos and posts backing what the
 * catalog claims about where a card came from. Every citation is hand-entered,
 * and only its author or the admin may change it.
 */
export const adminPrintingCitationsRouter = {
  list: os.list.handler(async ({ input, context }) => {
    const { catalog, printingCitations } = context.repos;
    assertFound(await catalog.printingById(input.printingId), "Printing not found");
    const rows = await printingCitations.listForPrinting(input.printingId);
    const editable = await citationsEditableBy(
      context.repos,
      context.adminAccess,
      context.userId,
      rows.map((row) => row.id),
    );
    return { citations: rows.map((row) => toCitation(row, editable.has(row.id))) };
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { catalog, printingCitations } = context.repos;
    assertFound(await catalog.printingById(input.printingId), "Printing not found");
    await assertDeskPrintingScope(
      context.repos,
      context.adminAccess,
      context.userId,
      input.printingId,
    );

    try {
      const row = await printingCitations.insert({
        printingId: input.printingId,
        label: input.label,
        sourceUrl: input.sourceUrl,
      });
      const citation = toCitation(row, true);
      await recordAdminEvent(context.repos, context.userId, {
        action: "citation.create",
        entityType: "citation",
        entityId: citation.id,
        entityLabel: citation.label,
        cardSlug: null,
        newValues: { printingId: input.printingId, ...citation },
      });
      return citation;
    } catch (error) {
      throw asDuplicateLinkConflict(error);
    }
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { printingCitations } = context.repos;
    const before = await assertOwnedByPrinting(
      printingCitations,
      input.printingId,
      input.citationId,
    );
    await assertCitationAuthor(
      context.repos,
      context.adminAccess,
      context.userId,
      input.citationId,
    );

    // `sourceUrl` is read by key presence, not by value: the contract lets null
    // through to clear a link, so `input.sourceUrl ?? undefined` would silently
    // turn "drop the link" into "leave it alone".
    const patch = {
      ...(input.label === undefined ? {} : { label: input.label }),
      ...(Object.hasOwn(input, "sourceUrl") ? { sourceUrl: input.sourceUrl } : {}),
    };

    try {
      assertFound(await printingCitations.update(input.citationId, patch), "Citation not found");
    } catch (error) {
      throw asDuplicateLinkConflict(error);
    }
    await recordAdminEvent(context.repos, context.userId, {
      action: "citation.update",
      entityType: "citation",
      entityId: input.citationId,
      entityLabel: patch.label ?? before.label,
      cardSlug: null,
      oldValues: { printingId: input.printingId, ...before },
      newValues: patch,
    });
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { printingCitations } = context.repos;
    const before = await assertOwnedByPrinting(
      printingCitations,
      input.printingId,
      input.citationId,
    );
    await assertCitationAuthor(
      context.repos,
      context.adminAccess,
      context.userId,
      input.citationId,
    );
    assertFound(await printingCitations.delete(input.citationId), "Citation not found");
    await recordAdminEvent(context.repos, context.userId, {
      action: "citation.delete",
      entityType: "citation",
      entityId: input.citationId,
      entityLabel: before.label,
      cardSlug: null,
      oldValues: { printingId: input.printingId, ...before },
    });
  }),
};
