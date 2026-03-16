import type { ActivityAction, ActivityType } from "@openrift/shared";
import type { Transaction } from "kysely";

import type { Database } from "../db/index.js";

interface ActivityItemInput {
  copyId?: string | null;
  printingId: string;
  action: ActivityAction;
  fromCollectionId?: string | null;
  fromCollectionName?: string | null;
  toCollectionId?: string | null;
  toCollectionName?: string | null;
  metadataSnapshot?: unknown;
}

interface CreateActivityInput {
  userId: string;
  type: ActivityType;
  name?: string | null;
  date?: string;
  description?: string | null;
  isAuto?: boolean;
  items: ActivityItemInput[];
}

/**
 * Creates an activity with its items inside an existing transaction.
 * @returns The activity ID
 */
export async function createActivity(
  trx: Transaction<Database>,
  input: CreateActivityInput,
): Promise<string> {
  const activity = await trx
    .insertInto("activities")
    .values({
      user_id: input.userId,
      type: input.type,
      name: input.name ?? null,
      date: input.date ? new Date(input.date) : new Date(),
      description: input.description ?? null,
      is_auto: input.isAuto ?? false,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const activityId = activity.id;

  if (input.items.length > 0) {
    await trx
      .insertInto("activity_items")
      .values(
        input.items.map((item) => ({
          activity_id: activityId,
          user_id: input.userId,
          activity_type: input.type,
          copy_id: item.copyId ?? null,
          printing_id: item.printingId,
          action: item.action,
          from_collection_id: item.fromCollectionId ?? null,
          from_collection_name: item.fromCollectionName ?? null,
          to_collection_id: item.toCollectionId ?? null,
          to_collection_name: item.toCollectionName ?? null,
          metadata_snapshot: item.metadataSnapshot ? JSON.stringify(item.metadataSnapshot) : null,
        })),
      )
      .execute();
  }

  return activityId;
}
