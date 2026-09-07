import type { ActivityAction } from "@openrift/shared/types/enums";

import type { Repos } from "../../../deps.js";

interface EventInput {
  userId: string;
  action: ActivityAction;
  printingId: string;
  copyId?: string | null;
  fromCollectionId?: string | null;
  fromCollectionName?: string | null;
  toCollectionId?: string | null;
  toCollectionName?: string | null;
}

/** When called inside a transaction, pass transactional repos to ensure atomicity. */
export async function logEvents(repos: Repos, events: EventInput[]): Promise<void> {
  await repos.collectionEvents.insert(
    events.map((e) => ({
      userId: e.userId,
      action: e.action,
      printingId: e.printingId,
      copyId: e.copyId ?? null,
      fromCollectionId: e.fromCollectionId ?? null,
      fromCollectionName: e.fromCollectionName ?? null,
      toCollectionId: e.toCollectionId ?? null,
      toCollectionName: e.toCollectionName ?? null,
    })),
  );
}
