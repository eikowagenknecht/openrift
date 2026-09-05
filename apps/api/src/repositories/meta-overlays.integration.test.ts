import { describe, expect, it } from "vitest";

import { MAX_BIND_PARAMETERS } from "../lib/bind-batches.js";
import { createDbContext } from "../test/integration-context.js";
import { metaOverlaysRepo } from "./meta-overlays.js";

const ctx = createDbContext(crypto.randomUUID());

describe.skipIf(!ctx)("metaOverlaysRepo key batching (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaOverlaysRepo(db);

  const overlong = Array.from({ length: MAX_BIND_PARAMETERS + 1 }, () => crypto.randomUUID());

  it("reads cards for more overlay ids than one statement can bind", async () => {
    await expect(repo.cardsByOverlayIds(overlong)).resolves.toEqual(new Map());
  });

  it("reads player overlays for more source keys than one statement can bind", async () => {
    await expect(repo.playerOverlaysBySourceKeys("topdeck", overlong)).resolves.toEqual([]);
  });

  it("reads event overlays for more external ids than one statement can bind", async () => {
    await expect(repo.eventOverlaysBySourceKeys("topdeck", overlong)).resolves.toEqual([]);
  });

  it("sets statuses for more overlay ids than one statement can bind", async () => {
    await expect(repo.setPlayerOverlayStatuses(overlong, "rejected", new Date())).resolves.toBe(0);
  });
});
