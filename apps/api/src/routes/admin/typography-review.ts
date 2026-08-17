import { ERROR_CODES, fixTypography } from "@openrift/shared";
import type { TypographyTarget } from "@openrift/shared/contracts/admin/typography-review";
import { adminTypographyReviewContract } from "@openrift/shared/contracts/admin/typography-review";
import { implement } from "@orpc/server";
import type { Updateable } from "kysely";

import type { PrintingsTable } from "../../db/index.js";
import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminTypographyReviewContract).$context<ApiContext>().use(requireAuthedUser);

interface TypographyDiff {
  target: TypographyTarget;
  name: string;
  current: string;
  proposed: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type PrintingTarget = Extract<TypographyTarget, { entity: "printing" }>;

interface TextFieldConfig<TField> {
  field: TField;
  options?: { italicParens?: boolean; keywordGlyphs?: boolean };
}

const errataTextFields: TextFieldConfig<"correctedRulesText" | "correctedEffectText">[] = [
  { field: "correctedRulesText" },
  { field: "correctedEffectText" },
];

const printingTextFields: TextFieldConfig<PrintingTarget["field"]>[] = [
  { field: "printedRulesText" },
  { field: "printedEffectText" },
  { field: "flavorText", options: { italicParens: false, keywordGlyphs: false } },
  { field: "printedName", options: { italicParens: false, keywordGlyphs: false } },
];

/**
 * Maps a reviewable printing field to a typed single-column update. Spelling the
 * columns out (rather than a computed key) is what ties the contract enum to
 * `printings`: a renamed column fails to compile here, and a field added to the
 * contract trips the exhaustiveness check.
 * @returns The update payload for that column.
 */
function printingUpdateFor(
  field: PrintingTarget["field"],
  proposed: string,
): Updateable<PrintingsTable> {
  switch (field) {
    case "printedRulesText": {
      return { printedRulesText: proposed };
    }
    case "printedEffectText": {
      return { printedEffectText: proposed };
    }
    case "flavorText": {
      return { flavorText: proposed };
    }
    case "printedName": {
      return { printedName: proposed };
    }
    default: {
      const unhandled: never = field;
      throw new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Unsupported printing field: ${String(unhandled)}`,
      );
    }
  }
}

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
          target: { entity: "card", id: card.id, field: "name" },
          name: card.name,
          current: card.name,
          proposed: proposedName,
        });
      }
      const proposedTags = fixTagList(card.tags);
      const tagsChanged = proposedTags.some((tag, idx) => tag !== card.tags[idx]);
      if (tagsChanged) {
        diffs.push({
          target: { entity: "card", id: card.id, field: "tags" },
          name: card.name,
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
        const current = errata[field];
        if (current === null) {
          continue;
        }
        const proposed = fixTypography(current, { ...options, costKeywords });
        if (proposed !== current) {
          diffs.push({
            target: { entity: "card", id: errata.cardId, field },
            name: cardName,
            current,
            proposed,
          });
        }
      }
    }

    const printings = await catalog.printings();
    for (const printing of printings) {
      for (const { field, options } of printingTextFields) {
        const current = printing[field];
        if (current === null) {
          continue;
        }
        const proposed = fixTypography(current, { ...options, costKeywords });
        if (proposed !== current) {
          diffs.push({
            target: { entity: "printing", id: printing.id, field },
            name: cardNameById.get(printing.cardId) ?? printing.shortCode,
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
    const { target, proposed } = input;

    if (target.entity === "card") {
      const { id, field } = target;
      // Card-level fields (name, tags) live on the card row itself; for tags we
      // re-derive the array from current DB state instead of parsing the joined
      // display string sent by the client.
      if (field === "name") {
        await mut.updateCardById(id, { name: proposed });
        return;
      }
      if (field === "tags") {
        const allCards = await catalog.cards();
        const card = allCards.find((row) => row.id === id);
        if (!card) {
          throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card not found");
        }
        await mut.updateCardById(id, { tags: fixTagList(card.tags) });
        return;
      }

      // The remaining two card fields are errata text, not card columns.
      const errata = await cardErrata.getByCardId(id);
      if (!errata) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Card errata not found");
      }
      await cardErrata.upsert(id, {
        ...errata,
        ...(field === "correctedRulesText"
          ? { correctedRulesText: proposed }
          : { correctedEffectText: proposed }),
      });
      return;
    }

    const { id, field } = target;
    const printing = await catalog.printingById(id);
    if (!printing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing not found");
    }
    await mut.updatePrintingById(id, printingUpdateFor(field, proposed));
  }),
};
