import { ERROR_CODES, fixTypography } from "@openrift/shared";
import { adminTypographyReviewContract } from "@openrift/shared/contracts/admin/typography-review";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminTypographyReviewContract).$context<ApiContext>().use(requireAuthedUser);

interface TypographyDiff {
  entity: "card" | "printing";
  id: string;
  name: string;
  field: string;
  current: string;
  proposed: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TextFieldConfig {
  field: string;
  options?: { italicParens?: boolean; keywordGlyphs?: boolean };
}

const errataTextFields: TextFieldConfig[] = [
  { field: "correctedRulesText" },
  { field: "correctedEffectText" },
];

const printingTextFields: TextFieldConfig[] = [
  { field: "printedRulesText" },
  { field: "printedEffectText" },
  { field: "flavorText", options: { italicParens: false, keywordGlyphs: false } },
  { field: "printedName", options: { italicParens: false, keywordGlyphs: false } },
];

// Names and tags are short labels — disable italic-parens/keyword-glyph rewrites.
const labelTypographyOptions = { italicParens: false, keywordGlyphs: false };

function fixTagList(tags: string[]): string[] {
  return tags.map((tag) => fixTypography(tag, labelTypographyOptions));
}

/**
 * Admin typography-review: not-found targets are thrown as `AppError` and
 * mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminTypographyReviewRouter = {
  list: os.list.handler(async ({ context }) => {
    const { catalog, keywords } = context.repos;
    const costKeywords = await keywords.listCostKeywords();
    const diffs: TypographyDiff[] = [];

    const cards = await catalog.cards();
    const cardNameById = new Map(cards.map((card) => [card.id, card.name]));

    // Card name + tags
    for (const card of cards) {
      const proposedName = fixTypography(card.name, labelTypographyOptions);
      if (proposedName !== card.name) {
        diffs.push({
          entity: "card",
          id: card.id,
          name: card.name,
          field: "name",
          current: card.name,
          proposed: proposedName,
        });
      }
      const proposedTags = fixTagList(card.tags);
      const tagsChanged = proposedTags.some((tag, idx) => tag !== card.tags[idx]);
      if (tagsChanged) {
        diffs.push({
          entity: "card",
          id: card.id,
          name: card.name,
          field: "tags",
          current: card.tags.join(", "),
          proposed: proposedTags.join(", "),
        });
      }
    }

    // Check errata text fields for typography issues
    const errataRows = await catalog.cardErrata();
    for (const errata of errataRows) {
      const cardName = cardNameById.get(errata.cardId) ?? "unknown";
      for (const { field, options } of errataTextFields) {
        const current = errata[field as keyof typeof errata] as string | null;
        if (current === null) {
          continue;
        }
        const proposed = fixTypography(current, { ...options, costKeywords });
        if (proposed !== current) {
          diffs.push({
            entity: "card",
            id: errata.cardId,
            name: cardName,
            field,
            current,
            proposed,
          });
        }
      }
    }

    const printings = await catalog.printings();
    for (const printing of printings) {
      for (const { field, options } of printingTextFields) {
        const current = printing[field as keyof typeof printing] as string | null;
        if (current === null) {
          continue;
        }
        const proposed = fixTypography(current, { ...options, costKeywords });
        if (proposed !== current) {
          diffs.push({
            entity: "printing",
            id: printing.id,
            name: cardNameById.get(printing.cardId) ?? printing.shortCode,
            field,
            current,
            proposed,
          });
        }
      }
    }

    return { diffs };
  }),

  accept: os.accept.handler(async ({ input, context }): Promise<void> => {
    const { catalog, catalogMutations: mut, cardErrata } = context.repos;
    const { entity, id, field, proposed } = input;

    if (entity === "card") {
      // Card-level fields (name, tags) live on the card row itself; for tags we
      // re-derive the array from current DB state instead of parsing the joined
      // display string sent by the client.
      if (field === "name") {
        await mut.updateCardById(id, { name: proposed });
        return;
      }
      if (field === "tags") {
        const allCards = await catalog.cards();
        const target = allCards.find((card) => card.id === id);
        if (!target) {
          throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
        }
        await mut.updateCardById(id, { tags: fixTagList(target.tags) });
        return;
      }

      // Otherwise treat as errata text (correctedRulesText / correctedEffectText)
      const errata = await cardErrata.getByCardId(id);
      if (!errata) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card errata not found");
      }
      await cardErrata.upsert(id, {
        ...errata,
        effectiveDate: errata.effectiveDate
          ? errata.effectiveDate.toISOString().slice(0, 10)
          : null,
        [field]: proposed,
      });
      return;
    }

    const printing = await catalog.printingById(id);
    if (!printing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing not found");
    }
    await mut.updatePrintingFieldById(id, field, proposed);
  }),
};
