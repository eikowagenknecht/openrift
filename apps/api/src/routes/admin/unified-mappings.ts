import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { saveMappings, unmapAll, unmapPrinting } from "../../services/marketplace-mapping.js";
import type { Variables } from "../../types.js";
import { createMarketplaceConfigs } from "./marketplace-configs.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const marketplaceSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket"]),
});

const saveMappingsSchema = z.object({
  mappings: z.array(
    z.object({
      printingId: z.string(),
      externalId: z.number(),
    }),
  ),
});

const unmapSchema = z.object({
  printingId: z.string(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const unifiedMappingsRoute = new Hono<{ Variables: Variables }>()

  .get(
    "/admin/marketplace-mappings",
    zValidator("query", z.object({ all: z.string().optional() })),
    async (c) => {
      const db = c.get("db");
      const { getMappingOverview } = c.get("services");
      const { tcgplayer: tcgplayerConfig, cardmarket: cardmarketConfig } =
        createMarketplaceConfigs(db);
      const showAll = c.req.valid("query").all === "true";

      const [tcgResult, cmResult] = await Promise.all([
        getMappingOverview(db, tcgplayerConfig),
        getMappingOverview(db, cardmarketConfig),
      ]);

      // Merge by cardId — combine data from both marketplaces per card
      const mergedMap = new Map<
        string,
        {
          cardId: string;
          cardSlug: string;
          cardName: string;
          cardType: string;
          superTypes: string[];
          domains: string[];
          energy: number | null;
          might: number | null;
          setId: string;
          setName: string;
          printings: {
            printingId: string;
            sourceId: string;
            rarity: string;
            artVariant: string;
            isSigned: boolean;
            isPromo: boolean;
            finish: string;
            collectorNumber: number;
            imageUrl: string | null;
            tcgExternalId: number | null;
            cmExternalId: number | null;
          }[];
          tcgplayer: { stagedProducts: unknown[]; assignedProducts: unknown[] };
          cardmarket: { stagedProducts: unknown[]; assignedProducts: unknown[] };
        }
      >();

      // Index TCGplayer groups by cardId
      for (const group of tcgResult.groups) {
        mergedMap.set(group.cardId, {
          cardId: group.cardId,
          cardSlug: group.cardSlug,
          cardName: group.cardName,
          cardType: group.cardType,
          superTypes: group.superTypes,
          domains: group.domains,
          energy: group.energy,
          might: group.might,
          setId: group.setId,
          setName: group.setName,
          printings: group.printings.map((p) => ({
            printingId: p.printingId,
            sourceId: p.sourceId,
            rarity: p.rarity,
            artVariant: p.artVariant,
            isSigned: p.isSigned,
            isPromo: p.isPromo,
            finish: p.finish,
            collectorNumber: p.collectorNumber,
            imageUrl: p.imageUrl,
            tcgExternalId: p.externalId,
            cmExternalId: null,
          })),
          tcgplayer: {
            stagedProducts: group.stagedProducts,
            assignedProducts: group.assignedProducts,
          },
          cardmarket: { stagedProducts: [], assignedProducts: [] },
        });
      }

      // Merge Cardmarket groups
      for (const group of cmResult.groups) {
        const existing = mergedMap.get(group.cardId);
        if (existing) {
          // Add CM external IDs to existing printings
          const cmByPrinting = new Map(group.printings.map((p) => [p.printingId, p.externalId]));
          for (const p of existing.printings) {
            p.cmExternalId = cmByPrinting.get(p.printingId) ?? null;
          }
          existing.cardmarket = {
            stagedProducts: group.stagedProducts,
            assignedProducts: group.assignedProducts,
          };
        } else {
          mergedMap.set(group.cardId, {
            cardId: group.cardId,
            cardSlug: group.cardSlug,
            cardName: group.cardName,
            cardType: group.cardType,
            superTypes: group.superTypes,
            domains: group.domains,
            energy: group.energy,
            might: group.might,
            setId: group.setId,
            setName: group.setName,
            printings: group.printings.map((p) => ({
              printingId: p.printingId,
              sourceId: p.sourceId,
              rarity: p.rarity,
              artVariant: p.artVariant,
              isSigned: p.isSigned,
              isPromo: p.isPromo,
              finish: p.finish,
              collectorNumber: p.collectorNumber,
              imageUrl: p.imageUrl,
              tcgExternalId: null,
              cmExternalId: p.externalId,
            })),
            tcgplayer: { stagedProducts: [], assignedProducts: [] },
            cardmarket: {
              stagedProducts: group.stagedProducts,
              assignedProducts: group.assignedProducts,
            },
          });
        }
      }

      // Filter after merge so both marketplaces have complete data
      const allGroups = [...mergedMap.values()];
      const filteredGroups = showAll
        ? allGroups
        : allGroups.filter(
            (g) =>
              g.printings.some((p) => p.tcgExternalId === null || p.cmExternalId === null) ||
              (g.tcgplayer.stagedProducts as unknown[]).length > 0 ||
              (g.cardmarket.stagedProducts as unknown[]).length > 0,
          );

      // allCards only needs to be sent once (same card pool for both)
      const allCards =
        tcgResult.allCards.length >= cmResult.allCards.length
          ? tcgResult.allCards
          : cmResult.allCards;

      return c.json({
        groups: filteredGroups,
        unmatchedProducts: {
          tcgplayer: tcgResult.unmatchedProducts,
          cardmarket: cmResult.unmatchedProducts,
        },
        allCards,
      });
    },
  )

  .post(
    "/admin/marketplace-mappings",
    zValidator("query", marketplaceSchema),
    zValidator("json", saveMappingsSchema),
    async (c) => {
      const db = c.get("db");
      const { marketplace } = c.req.valid("query");
      const configs = createMarketplaceConfigs(db);
      const config = configs[marketplace];
      const { mappings } = c.req.valid("json");
      const result = await saveMappings(db, config, mappings);
      return c.json(result);
    },
  )

  .delete(
    "/admin/marketplace-mappings",
    zValidator("query", marketplaceSchema),
    zValidator("json", unmapSchema),
    async (c) => {
      const db = c.get("db");
      const { marketplace } = c.req.valid("query");
      const configs = createMarketplaceConfigs(db);
      const config = configs[marketplace];
      const { printingId } = c.req.valid("json");
      await unmapPrinting(db, config, printingId);
      return c.body(null, 204);
    },
  )

  .delete("/admin/marketplace-mappings/all", zValidator("query", marketplaceSchema), async (c) => {
    const db = c.get("db");
    const { marketplace } = c.req.valid("query");
    const configs = createMarketplaceConfigs(db);
    const config = configs[marketplace];
    const result = await unmapAll(db, config);
    return c.json({ unmapped: result.unmapped });
  });
