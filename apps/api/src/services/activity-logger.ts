import type { ActivityAction, ActivityType } from "@openrift/shared";
import type { Kysely, Transaction } from "kysely";

import type { Database } from "../db/index.js";
import { activitiesRepo } from "../repositories/activities.js";

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
  trx: Transaction<Database> | Kysely<Database>,
  input: CreateActivityInput,
): Promise<string> {
  const repo = activitiesRepo(trx);

  const activityId = await repo.create({
    userId: input.userId,
    type: input.type,
    name: input.name ?? null,
    date: input.date ? new Date(input.date) : new Date(),
    description: input.description ?? null,
    isAuto: input.isAuto ?? false,
  });

  await repo.createItems(
    input.items.map((item) => ({
      activityId: activityId,
      userId: input.userId,
      activityType: input.type,
      copyId: item.copyId ?? null,
      printingId: item.printingId,
      action: item.action,
      fromCollectionId: item.fromCollectionId ?? null,
      fromCollectionName: item.fromCollectionName ?? null,
      toCollectionId: item.toCollectionId ?? null,
      toCollectionName: item.toCollectionName ?? null,
      metadataSnapshot: item.metadataSnapshot ? JSON.stringify(item.metadataSnapshot) : null,
    })),
  );

  return activityId;
}
