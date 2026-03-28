import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { keywordStylesRepo } from "./keyword-styles.js";

const ctx = createDbContext("a0000000-0043-4000-a000-000000000001");

describe.skipIf(!ctx)("keywordStylesRepo (integration)", () => {
  const { db } = ctx!;
  const repo = keywordStylesRepo(db);

  it("listAll returns keyword styles ordered by name", async () => {
    const styles = await repo.listAll();
    expect(Array.isArray(styles)).toBe(true);
    // Verify ordering
    if (styles.length > 1) {
      const names = styles.map((s) => s.name);
      expect(names).toEqual([...names].sort());
    }
  });
});
