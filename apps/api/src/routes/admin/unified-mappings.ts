import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { getMappingOverview } from "../../services/marketplace-mapping.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
import { cardmarketConfig, tcgplayerConfig } from "./marketplace-configs.js";

export const unifiedMappingsRoute = new Hono<{ Variables: Variables }>()

  .use("/admin/marketplace-mappings", requireAdmin)

  .get(
    "/admin/marketplace-mappings",
    zValidator("query", z.object({ all: z.string().optional() })),
    async (c) => {
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
  );
