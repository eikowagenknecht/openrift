import type { ActivityAction, ActivityType } from "@openrift/shared";
import type { Database } from "@openrift/shared/db";
import type { Transaction } from "kysely";

export interface ActivityItemInput {
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
  const activityId = crypto.randomUUID();

  await trx
    .insertInto("activities")
    .values({
      id: activityId,
      user_id: input.userId,
      type: input.type,
      name: input.name ?? null,
      date: input.date ? new Date(input.date) : new Date(),
      description: input.description ?? null,
      is_auto: input.isAuto ?? false,
    })
    .execute();

  if (input.items.length > 0) {
    await trx
      .insertInto("activity_items")
      .values(
        input.items.map((item) => ({
          id: crypto.randomUUID(),
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

/**
 * Creates an auto-activity (single item, no name) inside an existing transaction.
 * @returns The activity ID
 */
export function createAutoActivity(
  trx: Transaction<Database>,
  userId: string,
  type: ActivityType,
  item: ActivityItemInput,
): Promise<string> {
  return createActivity(trx, {
    userId,
    type,
    isAuto: true,
    items: [item],
  });
}
