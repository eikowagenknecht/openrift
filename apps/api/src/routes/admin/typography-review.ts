import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { fixTypography } from "@openrift/shared";
import { z } from "zod";

import type { Variables } from "../../types.js";
import { acceptTypographyFixSchema, typographyDiffItemSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const getTypographyDiffs = createRoute({
  method: "get",
  path: "/typography-review",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ diffs: z.array(typographyDiffItemSchema) }) },
      },
      description: "Typography mismatches",
    },
  },
});

const acceptTypographyFix = createRoute({
  method: "post",
  path: "/typography-review/accept",
  tags: ["Admin - Operations"],
  request: {
    body: { content: { "application/json": { schema: acceptTypographyFixSchema } } },
  },
  responses: {
    204: { description: "Fix accepted" },
  },
});

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

// ── Route ───────────────────────────────────────────────────────────────────

export const typographyReviewRoute = new OpenAPIHono<{ Variables: Variables }>()

  .openapi(getTypographyDiffs, async (c) => {
    const { catalog } = c.get("repos");
    const diffs: z.infer<typeof typographyDiffItemSchema>[] = [];

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
        const proposed = fixTypography(current, options);
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
        const proposed = fixTypography(current, options);
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

    return c.json({ diffs });
  })

  .openapi(acceptTypographyFix, async (c) => {
    const { catalog, candidateMutations: mut } = c.get("repos");
    const { entity, id, field, proposed } = c.req.valid("json");

    if (entity === "card") {
      // Card-level fields (name, tags) live on the card row itself; for tags we
      // re-derive the array from current DB state instead of parsing the joined
      // display string sent by the client.
      if (field === "name") {
        await mut.updateCardById(id, { name: proposed });
        return c.body(null, 204);
      }
      if (field === "tags") {
        const allCards = await catalog.cards();
        const target = allCards.find((card) => card.id === id);
        if (!target) {
          return c.body(null, 404);
        }
        await mut.updateCardById(id, { tags: fixTagList(target.tags) });
        return c.body(null, 204);
      }

      // Otherwise treat as errata text (correctedRulesText / correctedEffectText)
      const errata = await mut.getCardErrata(id);
      if (!errata) {
        return c.body(null, 404);
      }
      await mut.upsertCardErrata(id, {
        ...errata,
        effectiveDate: errata.effectiveDate
          ? errata.effectiveDate.toISOString().slice(0, 10)
          : null,
        [field]: proposed,
      });
    } else {
      const printing = await catalog.printingById(id);
      if (!printing) {
        return c.body(null, 404);
      }
      await mut.updatePrintingFieldById(id, field, proposed);
    }

    return c.body(null, 204);
  });
