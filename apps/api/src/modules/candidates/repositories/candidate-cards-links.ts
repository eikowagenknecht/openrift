import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

export function candidatePrintingLinksRepo(db: Kysely<Database>) {
  return {
    async linkCandidatePrintings(
      candidatePrintingIds: string[],
      printingUuid: string | null,
    ): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: printingUuid })
        .where("id", "in", candidatePrintingIds)
        .execute();
    },

    async linkAndCheckCandidatePrintings(
      candidatePrintingIds: string[],
      printingUuid: string,
    ): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: printingUuid, checkedAt: new Date() })
        .where("id", "in", candidatePrintingIds)
        .execute();
    },

    async unlinkCandidatePrintingsByPrintingId(printingId: string): Promise<void> {
      await db
        .updateTable("candidatePrintings")
        .set({ printingId: null })
        .where("printingId", "=", printingId)
        .execute();
    },

    async upsertPrintingLinkOverrides(
      candidatePrintingIds: string[],
      printingId: string,
    ): Promise<void> {
      const rows = await db
        .selectFrom("candidatePrintings as cp")
        .innerJoin("candidateCards as cc", "cc.id", "cp.candidateCardId")
        .select(["cp.externalId", "cp.finish", "cc.provider"])
        .where("cp.id", "in", candidatePrintingIds)
        .execute();
      // Dedupe on the conflict key: two candidate printings sharing one
      // (external id, finish, provider) would make the single INSERT hit the
      // same row twice, which ON CONFLICT DO UPDATE refuses.
      const byKey = new Map(
        rows.map((row) => [
          `${row.provider}:${row.externalId}:${row.finish ?? ""}`,
          {
            externalId: row.externalId,
            finish: row.finish ?? "",
            provider: row.provider,
            printingId,
          },
        ]),
      );
      if (byKey.size === 0) {
        return;
      }
      await db
        .insertInto("printingLinkOverrides")
        .values([...byKey.values()])
        .onConflict((oc) =>
          oc.columns(["externalId", "finish", "provider"]).doUpdateSet({ printingId }),
        )
        .execute();
    },

    async removePrintingLinkOverrides(candidatePrintingIds: string[]): Promise<void> {
      const rows = await db
        .selectFrom("candidatePrintings as cp")
        .innerJoin("candidateCards as cc", "cc.id", "cp.candidateCardId")
        .select(["cp.externalId", "cp.finish", "cc.provider"])
        .where("cp.id", "in", candidatePrintingIds)
        .execute();
      if (rows.length === 0) {
        return;
      }
      await db
        .deleteFrom("printingLinkOverrides")
        .where((eb) =>
          eb.or(
            rows.map((row) =>
              eb.and([
                eb("externalId", "=", row.externalId),
                eb("finish", "=", row.finish ?? ""),
                // The '' wildcard row would keep re-pinning this candidate on
                // the next ingest, so an unlink removes it too.
                eb("provider", "in", [row.provider, ""]),
              ]),
            ),
          ),
        )
        .execute();
    },

    async deletePrintingLinkOverridesById(printingId: string): Promise<void> {
      await db.deleteFrom("printingLinkOverrides").where("printingId", "=", printingId).execute();
    },
  };
}
