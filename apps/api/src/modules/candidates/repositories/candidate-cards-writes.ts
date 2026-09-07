import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types/enums";
import type { DeleteResult, Kysely, Selectable, Updateable, UpdateResult } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { CandidatePrintingsTable } from "../../../db/tables/candidates.js";

export function candidateCardWritesRepo(db: Kysely<Database>) {
  return {
    patchCandidatePrinting(
      id: string,
      updates: Updateable<CandidatePrintingsTable>,
    ): Promise<UpdateResult> {
      return db
        .updateTable("candidatePrintings")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();
    },

    deleteCandidatePrinting(id: string): Promise<DeleteResult> {
      return db.deleteFrom("candidatePrintings").where("id", "=", id).executeTakeFirst();
    },

    getCandidatePrintingById(id: string): Promise<Selectable<CandidatePrintingsTable> | undefined> {
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    async copyCandidatePrinting(
      ps: Selectable<CandidatePrintingsTable>,
      target: {
        id: string;
        rarity: string | null;
        artVariant: string | null;
        isSigned: boolean;
        isOvernumbered: boolean;
        markerSlugs: string[];
        finish: string;
      },
    ): Promise<void> {
      await db
        .insertInto("candidatePrintings")
        .values({
          candidateCardId: ps.candidateCardId,
          printingId: target.id,
          shortCode: ps.shortCode,
          setId: ps.setId,
          setName: ps.setName,
          rarity: target.rarity as Rarity | null,
          artVariant: target.artVariant as ArtVariant | null,
          isSigned: target.isSigned,
          isOvernumbered: target.isOvernumbered,
          markerSlugs: target.markerSlugs,
          finish: target.finish as Finish,
          artist: ps.artist,
          publicCode: ps.publicCode,
          printedRulesText: ps.printedRulesText,
          printedEffectText: ps.printedEffectText,
          imageUrl: ps.imageUrl,
          flavorText: ps.flavorText,
          externalId: `${ps.externalId ?? ps.shortCode}-copy-${Date.now()}`,
          extraData: ps.extraData,
        })
        .execute();
    },

    async deleteByProvider(provider: string): Promise<number> {
      const result = await db
        .deleteFrom("candidateCards")
        .where("provider", "=", provider)
        .executeTakeFirstOrThrow();
      return Number(result.numDeletedRows);
    },
  };
}
