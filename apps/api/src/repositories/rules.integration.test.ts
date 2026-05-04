import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { rulesRepo } from "./rules.js";

const ctx = createDbContext("a0000000-0044-4000-a000-000000000001");

describe.skipIf(!ctx)("rulesRepo (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = rulesRepo(db);

  // Use a unique version string per kind so we don't collide with real data
  // and can verify kind isolation when both kinds use the same version.
  const sharedVersion = "test-kind-0044-shared";

  afterAll(async () => {
    await repo.deleteVersion("core", sharedVersion);
    await repo.deleteVersion("tournament", sharedVersion);
  });

  it("createVersion + insertRules scopes rows by kind", async () => {
    await repo.createVersion({
      kind: "core",
      version: sharedVersion,
    });
    await repo.createVersion({
      kind: "tournament",
      version: sharedVersion,
    });

    await repo.insertRules([
      {
        kind: "core",
        version: sharedVersion,
        ruleNumber: "100.1",
        sortOrder: 1,
        depth: 0,
        ruleType: "text",
        content: "Core rule body.",
        changeType: "added",
      },
      {
        kind: "tournament",
        version: sharedVersion,
        ruleNumber: "100.1",
        sortOrder: 1,
        depth: 0,
        ruleType: "text",
        content: "Tournament rule body.",
        changeType: "added",
      },
    ]);

    const coreLatest = await repo.listLatest("core");
    const coreSubset = coreLatest.filter((r) => r.version === sharedVersion);
    expect(coreSubset).toHaveLength(1);
    expect(coreSubset[0].content).toBe("Core rule body.");

    const tournamentLatest = await repo.listLatest("tournament");
    const tournamentSubset = tournamentLatest.filter((r) => r.version === sharedVersion);
    expect(tournamentSubset).toHaveLength(1);
    expect(tournamentSubset[0].content).toBe("Tournament rule body.");
  });

  it("listAtVersion is kind-scoped", async () => {
    const coreRows = await repo.listAtVersion("core", sharedVersion);
    const tournamentRows = await repo.listAtVersion("tournament", sharedVersion);
    expect(coreRows.find((r) => r.version === sharedVersion)?.content).toBe("Core rule body.");
    expect(tournamentRows.find((r) => r.version === sharedVersion)?.content).toBe(
      "Tournament rule body.",
    );
  });

  it("getVersion requires both kind and version", async () => {
    const core = await repo.getVersion("core", sharedVersion);
    const tournament = await repo.getVersion("tournament", sharedVersion);
    expect(core?.kind).toBe("core");
    expect(tournament?.kind).toBe("tournament");
  });

  it("listVersions filters by kind when provided", async () => {
    const coreVersions = await repo.listVersions("core");
    const tournamentVersions = await repo.listVersions("tournament");
    expect(coreVersions.some((v) => v.version === sharedVersion && v.kind === "core")).toBe(true);
    expect(
      tournamentVersions.some((v) => v.version === sharedVersion && v.kind === "tournament"),
    ).toBe(true);
    // No cross-kind leak
    expect(coreVersions.every((v) => v.kind === "core")).toBe(true);
    expect(tournamentVersions.every((v) => v.kind === "tournament")).toBe(true);
  });

  it("deleteVersion only removes the specified kind", async () => {
    const tempVersion = "test-kind-0044-delete";
    await repo.createVersion({ kind: "core", version: tempVersion });
    await repo.createVersion({ kind: "tournament", version: tempVersion });

    await repo.deleteVersion("core", tempVersion);

    expect(await repo.getVersion("core", tempVersion)).toBeUndefined();
    expect(await repo.getVersion("tournament", tempVersion)).toBeDefined();

    await repo.deleteVersion("tournament", tempVersion);
  });
});
