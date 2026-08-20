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

/** @returns The wire shape of a citation row (the sort key stays server-side). */
function toCitation(row: { id: string; label: string; sourceUrl: string | null }) {
  return { id: row.id, label: row.label, sourceUrl: row.sourceUrl } satisfies AdminPrintingCitation;
}

/**
 * Source citations on a promo printing (migration 258): the videos and posts
 * backing what the catalog claims about where a card came from.
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
      // The partial unique index, not a pre-read: two admins pasting the same
      // link at once would both pass a check-then-act.
      if (isUniqueViolationOn(error, "uq_printing_citations_url")) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "That link is already cited on this printing.",
        );
      }
      throw error;
    }
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const { printingCitations } = context.repos;

    // Scoped to the printing in the path, so a citation id from one printing
    // cannot be deleted through another's URL.
    const rows = await printingCitations.listForPrinting(input.printingId);
    assertFound(
      rows.find((row) => row.id === input.citationId),
      "Citation not found",
    );
    assertFound(await printingCitations.delete(input.citationId), "Citation not found");
  }),
};
