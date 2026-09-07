import { adminIgnoredCandidatesContract } from "@openrift/shared/contracts/admin/ignored-candidates";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import {
  rejectIgnoredSubmission,
  reopenUnignoredSubmission,
} from "../services/card-submission-outcomes.js";

const os = implement(adminIgnoredCandidatesContract).$context<ApiContext>().use(requireAuthedUser);

export const adminIgnoredCandidatesRouter = {
  list: os.list.handler(async ({ context }) => {
    const { ignoredCandidates } = context.repos;

    const [cards, printings] = await Promise.all([
      ignoredCandidates.listIgnoredCards(),
      ignoredCandidates.listIgnoredPrintings(),
    ]);

    return {
      cards: cards.map((r) => ({
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        createdAt: r.createdAt.toISOString(),
      })),
      printings: printings.map((r) => ({
        id: r.id,
        provider: r.provider,
        externalId: r.externalId,
        finish: r.finish,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }),

  ignoreCard: os.ignoreCard.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId } = input;
    await ignoredCandidates.ignoreCard({ provider, externalId });

    // For a user submission this rejects it (per-submission external_id makes
    // the key exact); no-ops for scraped providers.
    await rejectIgnoredSubmission(context.repos, {
      provider,
      externalId,
      adminUserId: context.userId,
      now: new Date(),
    });

    await recordAdminEvent(context.repos, context.userId, {
      action: "candidate-card.ignore",
      entityType: "candidate-card",
      entityId: `${provider}:${externalId}`,
      newValues: { provider, externalId },
    });
  }),

  unignoreCard: os.unignoreCard.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId } = input;
    await ignoredCandidates.unignoreCard(provider, externalId);

    // Undoing the rejection puts the submission back in the queue, so a
    // misclick doesn't leave a contributor looking at a wrong outcome.
    await reopenUnignoredSubmission(context.repos, { provider, externalId });

    await recordAdminEvent(context.repos, context.userId, {
      action: "candidate-card.unignore",
      entityType: "candidate-card",
      entityId: `${provider}:${externalId}`,
      oldValues: { provider, externalId },
    });
  }),

  ignorePrinting: os.ignorePrinting.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId, finish } = input;
    await ignoredCandidates.ignorePrinting({ provider, externalId, finish: finish ?? null });

    await recordAdminEvent(context.repos, context.userId, {
      action: "candidate-printing.ignore",
      entityType: "candidate-printing",
      entityId: `${provider}:${externalId}`,
      newValues: { provider, externalId, finish: finish ?? null },
    });
  }),

  unignorePrinting: os.unignorePrinting.handler(async ({ input, context }): Promise<void> => {
    const { ignoredCandidates } = context.repos;
    const { provider, externalId, finish } = input;
    await ignoredCandidates.unignorePrinting(provider, externalId, finish);

    await recordAdminEvent(context.repos, context.userId, {
      action: "candidate-printing.unignore",
      entityType: "candidate-printing",
      entityId: `${provider}:${externalId}`,
      oldValues: { provider, externalId, finish },
    });
  }),
};
