import type { ReleasePrecision } from "@openrift/shared/set-release";
import type { CardFace } from "@openrift/shared/types/enums";
import type { Kysely, Selectable, Updateable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { PrintingsTable } from "../../../db/tables/catalog.js";
import { imageUrlWithOriginal, joinFrontImage } from "../../../repositories/query-helpers.js";

export interface DeskPrintingRow {
  printingId: string;
  cardId: string;
  cardSlug: string;
  cardName: string;
  cardType: string;
  setId: string;
  setName: string;
  setSlug: string;
  shortCode: string;
  publicCode: string;
  rarity: string;
  finish: string;
  language: string;
  size: string;
  artist: string;
  markerSlugs: string[];
  distributionChannelSlugs: string[];
  announcedAt: string | null;
  releasedAt: string | null;
  releasePrecision: ReleasePrecision | null;
  comment: string | null;
  imageCount: number;
  activeImageFileId: string | null;
  activeImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeskImageRow {
  printingImageId: string;
  imageFileId: string;
  url: string | null;
  isActive: boolean;
  rotation: number;
  face: CardFace;
  credit: string | null;
}

export interface DeskCardRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  domains: string[];
}

export interface DeskPostImageRow {
  printingId: string;
  cardId: string;
  cardName: string;
  cardType: string;
  publicCode: string;
  finish: string;
  artist: string;
  markerSlugs: string[];
  activeImageFileId: string | null;
}

export interface DeskImageCreditRow {
  credit: string | null;
}

export type DeskImageCreditPatch = Partial<DeskImageCreditRow>;

export type DeskPrintingFilter = { printingIds: readonly string[] } | { promosOnly: true };

export function printingDeskRepo(db: Kysely<Database>) {
  const channelSlugs = sql<string[]>`(
    SELECT coalesce(array_agg(dc.slug ORDER BY dc.slug), '{}')
    FROM printing_distribution_channels pdc
    JOIN distribution_channels dc ON dc.id = pdc.channel_id
    WHERE pdc.printing_id = p.id
  )`.as("distributionChannelSlugs");

  const imageCount = sql<number>`(
    SELECT count(*)::int FROM printing_images pi2 WHERE pi2.printing_id = p.id
  )`.as("imageCount");

  const isPromo = sql<boolean>`(
    cardinality(p.marker_slugs) > 0
    OR EXISTS (SELECT 1 FROM printing_distribution_channels pdc2 WHERE pdc2.printing_id = p.id)
  )`;

  function rowQuery() {
    return joinFrontImage(db.selectFrom("printings as p"))
      .innerJoin("cards as c", "c.id", "p.cardId")
      .innerJoin("sets as s", "s.id", "p.setId")
      .select([
        "p.id as printingId",
        "p.cardId",
        "c.slug as cardSlug",
        "c.name as cardName",
        "c.type as cardType",
        "p.setId",
        "s.name as setName",
        "s.slug as setSlug",
        "p.shortCode",
        "p.publicCode",
        "p.rarity",
        "p.finish",
        "p.language",
        "p.size",
        "p.artist",
        "p.markerSlugs",
        "p.announcedAt",
        "p.releasedAt",
        "p.releasePrecision",
        "p.comment",
        "imgf.id as activeImageFileId",
        imageUrlWithOriginal("imgf").as("activeImageUrl"),
        "p.createdAt",
        "p.updatedAt",
        channelSlugs,
        imageCount,
      ])
      .orderBy("p.updatedAt", "desc");
  }

  return {
    async updatePrintingDeskFields(
      printingId: string,
      patch: Updateable<PrintingsTable>,
    ): Promise<void> {
      if (Object.keys(patch).length === 0) {
        return;
      }
      await db.updateTable("printings").set(patch).where("id", "=", printingId).execute();
    },

    /** Empty `printingIds` short-circuits: Postgres rejects `WHERE id IN ()`. */
    listDeskPrintings(filter: DeskPrintingFilter): Promise<DeskPrintingRow[]> {
      if ("printingIds" in filter) {
        if (filter.printingIds.length === 0) {
          return Promise.resolve([]);
        }
        return rowQuery().where("p.id", "in", filter.printingIds).execute();
      }
      return rowQuery().where(isPromo).execute();
    },

    listDeskPrintingsForCard(cardId: string): Promise<DeskPrintingRow[]> {
      return rowQuery().where("p.cardId", "=", cardId).execute();
    },

    getDeskPrinting(printingId: string): Promise<DeskPrintingRow | undefined> {
      return rowQuery().where("p.id", "=", printingId).executeTakeFirst();
    },

    listDeskImages(printingId: string): Promise<DeskImageRow[]> {
      return db
        .selectFrom("printingImages as pi")
        .innerJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
        .select([
          "pi.id as printingImageId",
          "imgf.id as imageFileId",
          imageUrlWithOriginal("imgf").as("url"),
          "pi.isActive",
          "imgf.rotation",
          "pi.face",
          "imgf.credit",
        ])
        .where("pi.printingId", "=", printingId)
        .orderBy("pi.face")
        .orderBy("pi.isActive", "desc")
        .orderBy("pi.createdAt")
        .execute();
    },

    async getDeskCardBySlug(slug: string): Promise<DeskCardRow | undefined> {
      const card = await db
        .selectFrom("cards")
        .select(["id", "slug", "name", "type"])
        .where("slug", "=", slug)
        .executeTakeFirst();
      if (!card) {
        return undefined;
      }
      const domains = await db
        .selectFrom("cardDomains")
        .select("domainSlug")
        .where("cardId", "=", card.id)
        .orderBy("ordinal")
        .execute();
      return { ...card, domains: domains.map((row) => row.domainSlug) };
    },

    getPostImageRow(printingId: string): Promise<DeskPostImageRow | undefined> {
      return joinFrontImage(db.selectFrom("printings as p"))
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select([
          "p.id as printingId",
          "p.cardId",
          "c.name as cardName",
          "c.type as cardType",
          "p.publicCode",
          "p.finish",
          "p.artist",
          "p.markerSlugs",
          "imgf.id as activeImageFileId",
        ])
        .where("p.id", "=", printingId)
        .executeTakeFirst();
    },

    async findBasePrinting(
      cardId: string,
      language: string,
    ): Promise<Selectable<PrintingsTable> | undefined> {
      const inLanguage = await db
        .selectFrom("printings")
        .selectAll()
        .where("cardId", "=", cardId)
        .where("language", "=", language)
        .orderBy("createdAt")
        .executeTakeFirst();
      if (inLanguage) {
        return inLanguage;
      }
      return await db
        .selectFrom("printings")
        .selectAll()
        .where("cardId", "=", cardId)
        .orderBy("createdAt")
        .executeTakeFirst();
    },

    getFullPrinting(printingId: string): Promise<Selectable<PrintingsTable> | undefined> {
      return db.selectFrom("printings").selectAll().where("id", "=", printingId).executeTakeFirst();
    },

    getImageCredit(imageFileId: string): Promise<DeskImageCreditRow | undefined> {
      return db
        .selectFrom("imageFiles")
        .select(["credit"])
        .where("id", "=", imageFileId)
        .executeTakeFirst();
    },

    async updateImageCredit(imageFileId: string, patch: DeskImageCreditPatch): Promise<void> {
      if (Object.keys(patch).length === 0) {
        return;
      }
      await db.updateTable("imageFiles").set(patch).where("id", "=", imageFileId).execute();
    },
  };
}
