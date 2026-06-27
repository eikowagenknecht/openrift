import { TIME_RANGE_DAYS } from "@openrift/shared";
import type { TimeRange } from "@openrift/shared";
import { collectionValueHistoryContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(collectionValueHistoryContract).$context<ApiContext>().use(requireAuthedUser);

export const collectionValueHistoryRouter = {
  get: os.get.handler(async ({ input: query, context }) => {
    const { marketplace: repos } = context.repos;
    const userId = context.userId;

    const days = TIME_RANGE_DAYS[query.range as TimeRange];
    const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

    const collectionIds = query.collectionIds?.split(",").filter(Boolean) ?? null;

    const series = await repos.collectionValueTimeSeries({
      userId,
      marketplace: query.marketplace,
      collectionIds: collectionIds?.length ? collectionIds : null,
      cutoff,
      scope: {
        sets: query.sets?.split(",").filter(Boolean),
        languages: query.languages?.split(",").filter(Boolean),
        domains: query.domains?.split(",").filter(Boolean),
        types: query.types?.split(",").filter(Boolean),
        rarities: query.rarities?.split(",").filter(Boolean),
        finishes: query.finishes?.split(",").filter(Boolean),
        artVariants: query.artVariants?.split(",").filter(Boolean),
        promos: query.promos,
        signed: query.signed === "true" ? true : query.signed === "false" ? false : undefined,
        banned: query.banned === "true" ? true : query.banned === "false" ? false : undefined,
        errata: query.errata === "true" ? true : query.errata === "false" ? false : undefined,
      },
    });

    return {
      series: series.map((point) => ({
        date: point.date,
        valueCents: point.valueCents, // integer cents
        copyCount: point.copyCount,
      })),
    };
  }),
};
