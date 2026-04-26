import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { keywordsRepo } from "./keywords.js";

describe("keywordsRepo", () => {
  it("listAll returns the mocked result", async () => {
    const rows = [{ id: "1", name: "Bold", cssClass: "bold" }];
    const db = createMockDb(rows);
    const repo = keywordsRepo(db);
    const result = await repo.listAll();
    expect(result).toEqual(rows);
  });
});
