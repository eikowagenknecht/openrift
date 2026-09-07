import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { siteSettingsRepo } from "./site-settings.js";

const ROW = {
  key: "motd",
  value: "Hello",
  scope: "web",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("siteSettingsRepo", () => {
  it("listByScope returns scoped settings", async () => {
    const db = createMockDb([{ key: "motd", value: "Hello" }]);
    const repo = siteSettingsRepo(db);
    const result = await repo.listByScope("web");
    expect(result).toEqual([{ key: "motd", value: "Hello" }]);
  });

  it("listAll returns all settings", async () => {
    const db = createMockDb([ROW]);
    const repo = siteSettingsRepo(db);
    expect(await repo.listAll()).toEqual([ROW]);
  });

  it("getBool reads an explicit false", async () => {
    const db = createMockDb([{ value: "false" }]);
    const repo = siteSettingsRepo(db);
    expect(await repo.getBool("trade-match-digest")).toBe(false);
  });

  it("getBool reads an explicit true", async () => {
    const db = createMockDb([{ value: "true" }]);
    const repo = siteSettingsRepo(db);
    expect(await repo.getBool("trade-match-digest")).toBe(true);
  });

  it("getBool treats an unrecognised value as on", async () => {
    const db = createMockDb([{ value: "off" }]);
    const repo = siteSettingsRepo(db);
    expect(await repo.getBool("trade-match-digest")).toBe(true);
  });

  it("getBool returns undefined for a key that does not exist", async () => {
    const db = createMockDb([]);
    const repo = siteSettingsRepo(db);
    expect(await repo.getBool("nope")).toBeUndefined();
  });

  it("create returns the newly created row", async () => {
    const db = createMockDb([ROW]);
    const repo = siteSettingsRepo(db);
    const result = await repo.create({ key: "motd", value: "Hello", scope: "web" });
    expect(result).toEqual(ROW);
  });

  it("update returns the updated row", async () => {
    const db = createMockDb([ROW]);
    const repo = siteSettingsRepo(db);
    const result = await repo.update("motd", { value: "Updated" });
    expect(result).toEqual(ROW);
  });

  it("deleteByKey returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = siteSettingsRepo(db);
    const result = await repo.deleteByKey("motd");
    expect(result).toEqual({ numDeletedRows: 1n });
  });
});
