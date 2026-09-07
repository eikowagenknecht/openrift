import type {
  CardDetailResponse,
  CatalogCardResponse,
  CatalogPrintingResponse,
} from "@openrift/shared";
import { cardsContract } from "@openrift/shared/contracts/cards";
import { implement } from "@orpc/server";

import { buildPrintingsResponse, loadPrintingDecorations } from "../../lib/printing-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(cardsContract).$context<ApiContext>().use(requireUser);

const RELATED_CARDS_LIMIT = 8;

/**
 * Prices are not inlined; they are served separately by `/prices`.
 */
export const cardsRouter = {
  detail: os.detail.handler(async ({ input, context, errors }): Promise<CardDetailResponse> => {
    const repos = context.repos;
    const { catalog } = repos;

    const card = await catalog.cardBySlug(input.cardSlug);
    if (!card) {
      throw errors.NOT_FOUND({ message: `Card not found: ${input.cardSlug}` });
    }

    const [printingRows, imageRows, banRows, errataRow, products, related] = await Promise.all([
      catalog.printingsByCardId(card.id),
      catalog.printingImagesByCardId(card.id),
      catalog.cardBansByCardId(card.id),
      catalog.cardErrataByCardId(card.id),
      repos.products.productsForCard(card.id),
      catalog.relatedCards(card.id, RELATED_CARDS_LIMIT),
    ]);

    const setIds = [...new Set(printingRows.map((p) => p.setId))];
    const printingIds = printingRows.map((p) => p.id);
    const [sets, decorations] = await Promise.all([
      catalog.setsByIds(setIds),
      loadPrintingDecorations(repos, printingIds),
    ]);

    const errata = errataRow
      ? {
          correctedRulesText: errataRow.correctedRulesText,
          correctedEffectText: errataRow.correctedEffectText,
          source: errataRow.source,
          sourceUrl: errataRow.sourceUrl,
          effectiveDate: errataRow.effectiveDate,
        }
      : null;

    const cardResponse: CatalogCardResponse = {
      ...card,
      errata,
      bans: banRows.map((b) => ({
        formatId: b.formatId,
        formatName: b.formatName,
        bannedAt: b.bannedAt,
        reason: b.reason,
      })),
    };

    const printings: CatalogPrintingResponse[] = buildPrintingsResponse(
      printingRows,
      imageRows,
      decorations,
    );

    return { card: cardResponse, printings, sets, products, related };
  }),
};
