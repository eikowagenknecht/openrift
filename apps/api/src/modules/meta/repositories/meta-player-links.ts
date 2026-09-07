import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { MetaPlayerLinksTable } from "../../../db/tables/meta.js";

/** One decision on a cited-but-unread mirror's standing, confirmed by a human. */

export type MetaPlayerLinkRow = Selectable<MetaPlayerLinksTable>;

export interface MetaPlayerLinkInput {
  metaEventId: string;
  provider: string;
  sourceIdentity: string;
  metaEventPlayerId: string | null;
}

export function metaPlayerLinksRepo(db: Kysely<Database>) {
  return {
    forEvent(metaEventId: string): Promise<MetaPlayerLinkRow[]> {
      return db
        .selectFrom("metaPlayerLinks")
        .selectAll()
        .where("metaEventId", "=", metaEventId)
        .execute();
    },

    /**
     * One review's decisions, in one transaction. Re-deciding one standing
     * replaces its row.
     */
    async putMany(inputs: readonly MetaPlayerLinkInput[]): Promise<void> {
      if (inputs.length === 0) {
        return;
      }
      await db.transaction().execute(async (trx) => {
        for (const input of inputs) {
          await trx
            .insertInto("metaPlayerLinks")
            .values(input)
            .onConflict((oc) =>
              oc
                .columns(["metaEventId", "provider", "sourceIdentity"])
                .doUpdateSet({ metaEventPlayerId: input.metaEventPlayerId }),
            )
            .execute();
        }
      });
    },

    async remove(metaEventId: string, provider: string, sourceIdentity: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaPlayerLinks")
        .where("metaEventId", "=", metaEventId)
        .where("provider", "=", provider)
        .where("sourceIdentity", "=", sourceIdentity)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },
  };
}
