import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { providerSettingsRepo } from "./provider-settings.js";

const ROW = { provider: "tcgplayer", sortOrder: 1, isHidden: false };

describe("providerSettingsRepo", () => {
  it("listAll returns ordered settings", async () => {
    const db = createMockDb([ROW]);
    const repo = providerSettingsRepo(db);
    expect(await repo.listAll()).toEqual([ROW]);
  });

  it("reorder updates sort orders in a transaction", async () => {
    const db = createMockDb([]);
    const repo = providerSettingsRepo(db);
    await expect(repo.reorder(["tcgplayer", "cardmarket"])).resolves.toBeUndefined();
  });

  it("upsert returns the upserted row", async () => {
    const db = createMockDb([ROW]);
    const repo = providerSettingsRepo(db);
    const result = await repo.upsert("tcgplayer", { sortOrder: 1 });
    expect(result).toEqual(ROW);
  });

  it("upsert with isHidden only", async () => {
    const db = createMockDb([{ ...ROW, isHidden: true }]);
    const repo = providerSettingsRepo(db);
    const result = await repo.upsert("tcgplayer", { isHidden: true });
    expect(result).toEqual({ ...ROW, isHidden: true });
  });

  it("upsert with no optional fields", async () => {
    const db = createMockDb([ROW]);
    const repo = providerSettingsRepo(db);
    const result = await repo.upsert("tcgplayer", {});
    expect(result).toEqual(ROW);
  });
});
