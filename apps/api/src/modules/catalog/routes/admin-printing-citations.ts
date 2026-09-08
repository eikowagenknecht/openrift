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

const os = implement(adminPrintingCitationsContract).$context<ApiContext>().use(requireAuthedUser);

/** The wire shape of a citation row; the sort key stays server-side. */
function toCitation(row: { id: string; label: string; sourceUrl: string | null }) {
  return { id: row.id, label: row.label, sourceUrl: row.sourceUrl } satisfies AdminPrintingCitation;
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
): Promise<AdminPrintingCitation> {
  const rows = await repo.listForPrinting(printingId);
  const row = rows.find((candidate) => candidate.id === citationId);
  assertFound(row, "Citation not found");
  return toCitation(row);
}

/**
 * Source citations on a promo printing: the videos and posts backing what the
 * catalog claims about where a card came from. Every citation is hand-entered;
 * no ingest owns rows, so delete is unrestricted.
 */
export const adminPrintingCitationsRouter = {
  list: os.list.handler(async ({ input, context }) => {
    const { catalog, printingCitations } = context.repos;
    assertFound(await catalog.printingById(input.printingId), "Printing not found");
    const rows = await printingCitations.listForPrinting(input.printingId);
    return { citations: rows.map((row) => toCitation(row)) };
  }),

  create: os.create.handler(async ({ input, context }) => {
    const { catalog, printingCitations } = context.repos;
    assertFound(await catalog.printingById(input.printingId), "Printing not found");

    try {
      const row = await printingCitations.insert({
        printingId: input.printingId,
        label: input.label,
        sourceUrl: input.sourceUrl,
      });
      const citation = toCitation(row);
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
