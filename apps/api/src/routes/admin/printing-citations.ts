import { ERROR_CODES } from "@openrift/shared";
import type { AdminPrintingCitation } from "@openrift/shared";
import { adminPrintingCitationsContract } from "@openrift/shared/contracts/admin/printing-citations";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertFound } from "../../lib/assertions.js";
import { isUniqueViolationOn } from "../../lib/pg-errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminPrintingCitationsContract).$context<ApiContext>().use(requireAuthedUser);

/** The wire shape of a citation row; the sort key stays server-side. */
function toCitation(row: { id: string; label: string; sourceUrl: string | null }) {
  return { id: row.id, label: row.label, sourceUrl: row.sourceUrl } satisfies AdminPrintingCitation;
}

/**
 * Turns the partial unique index's violation into a 409 and leaves anything
 * else alone. Caught rather than pre-read on purpose: two admins pasting the
 * same link at once would both pass a check-then-act.
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
): Promise<void> {
  const rows = await repo.listForPrinting(printingId);
  assertFound(
    rows.find((row) => row.id === citationId),
    "Citation not found",
  );
}

/**
 * Source citations on a promo printing: the videos and posts backing what the
 * catalog claims about where a card came from.
 *
 * Every citation here is hand-entered, which is what makes this router smaller
 * than the meta archive's equivalent — there is no ingest that owns rows, so no
 * delete has to be refused.
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
      return toCitation(row);
    } catch (error) {
      throw asDuplicateLinkConflict(error);
    }
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { printingCitations } = context.repos;
    await assertOwnedByPrinting(printingCitations, input.printingId, input.citationId);

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
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { printingCitations } = context.repos;
    await assertOwnedByPrinting(printingCitations, input.printingId, input.citationId);
    assertFound(await printingCitations.delete(input.citationId), "Citation not found");
  }),
};
