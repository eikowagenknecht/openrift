import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { fixTypography } from "../../services/fix-typography.js";
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

const cardTextFields: TextFieldConfig[] = [{ field: "rulesText" }, { field: "effectText" }];

const printingTextFields: TextFieldConfig[] = [
  { field: "printedRulesText" },
  { field: "printedEffectText" },
  { field: "flavorText", options: { italicParens: false, keywordGlyphs: false } },
];

// ── Route ───────────────────────────────────────────────────────────────────

export const typographyReviewRoute = new OpenAPIHono<{ Variables: Variables }>()

  .openapi(getTypographyDiffs, async (c) => {
    const { catalog } = c.get("repos");
    const diffs: z.infer<typeof typographyDiffItemSchema>[] = [];

    const cards = await catalog.cards();
    for (const card of cards) {
      for (const { field, options } of cardTextFields) {
        const current = card[field as keyof typeof card] as string | null;
        if (current === null) {
          continue;
        }
        const proposed = fixTypography(current, options);
        if (proposed !== current) {
          diffs.push({
            entity: "card",
            id: card.id,
            name: card.name,
            field,
            current,
            proposed,
          });
        }
      }
    }

    const printings = await catalog.printings();
    // Build a card name lookup for display
    const cardNameById = new Map(cards.map((card) => [card.id, card.name]));
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
      const card = await catalog.cardById(id);
      if (!card) {
        return c.body(null, 404);
      }
      await mut.updateCardById(id, { [field]: proposed });
    } else {
      const printing = await catalog.printingById(id);
      if (!printing) {
        return c.body(null, 404);
      }
      await mut.updatePrintingFieldById(id, field, proposed);
    }

    return c.body(null, 204);
  });
