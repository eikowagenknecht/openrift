import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { CardsTable, PrintingsTable } from "../../../db/tables/catalog.js";

export interface ExportPrintingRow extends Selectable<PrintingsTable> {
  setSlug: string;
  setName: string;
  imageId: string | null;
  rehostedUrl: string | null;
  originalUrl: string | null;
}

export function candidateExportRepo(db: Kysely<Database>) {
  return {
    exportCards(): Promise<
      (Selectable<CardsTable> & { domains: string[]; superTypes: string[]; types: string[] })[]
    > {
      return db
        .selectFrom("cards")
        .innerJoin("mvCardAggregates as mca", "mca.cardId", "cards.id")
        .selectAll("cards")
        .select(["mca.domains", "mca.superTypes", "mca.types"])
        .orderBy("cards.name")
        .execute();
    },

    exportCardErrata(): Promise<
      { cardId: string; correctedRulesText: string | null; correctedEffectText: string | null }[]
    > {
      return db
        .selectFrom("cardErrata")
        .select(["cardId", "correctedRulesText", "correctedEffectText"])
        .execute();
    },

    exportPrintings(): Promise<ExportPrintingRow[]> {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .leftJoin("printingImages", (jb) =>
          jb
            .onRef("printingImages.printingId", "=", "printings.id")
            .on("printingImages.face", "=", "front")
            .on("printingImages.isActive", "=", true),
        )
        .leftJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
        .selectAll("printings")
        .select([
          "sets.slug as setSlug",
          "sets.name as setName",
          "printingImages.id as imageId",
          "ci.rehostedUrl",
          "ci.originalUrl",
        ])
        .innerJoin("printingsOrdered as po", "po.id", "printings.id")
        .orderBy("po.canonicalRank")
        .execute();
    },
  };
}
