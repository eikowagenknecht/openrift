import type { StagePresetConfig } from "@openrift/shared";
import { sql } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { stagePresetsRepo } from "./stage-presets.js";

// ---------------------------------------------------------------------------
// Integration tests: stage_presets repository (migration 242).
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL. Seeds its
// own users with per-file random ids and deletes only those in afterAll — the
// preset rows go with them via the ON DELETE CASCADE.
//
// The reason this file exists is the write shape: a plain string parameter
// bound to a jsonb column lands as a jsonb *string scalar*, which the table's
// `chk_stage_presets_config_object` check refuses outright. Nothing above the
// repository can see that, because a round trip through JSON.parse looks
// identical either way — so the assertions read `jsonb_typeof` from the
// database rather than trusting the parsed value.
// ---------------------------------------------------------------------------

const OWNER = crypto.randomUUID();
const OTHER = crypto.randomUUID();

const ctx = createDbContext(OWNER);

if (ctx) {
  const { db } = ctx;
  await seedTestUser(db, { id: OWNER });
  await seedTestUser(db, { id: OTHER });
}

const CONFIG: StagePresetConfig = {
  showPlate: true,
  platePosition: "left",
  plateFields: { name: true, stats: false },
  qrUrl: "https://openrift.app/decks/share/abc",
  corner: "top-left",
  scale: 70,
  cardScale: 0.8,
  showText: true,
  ground: "green",
};

describe.skipIf(!ctx)("stagePresetsRepo (integration)", () => {
  const db = ctx!.db;
  const repo = stagePresetsRepo(db);

  afterAll(async () => {
    await db.deleteFrom("users").where("id", "in", [OWNER, OTHER]).execute();
  });

  /** @returns What the database calls the row's stored config: "object", "string", … */
  async function storedType(id: string): Promise<string> {
    const row = await db
      .selectFrom("stagePresets")
      .select(sql<string>`jsonb_typeof(config)`.as("type"))
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    return row.type;
  }

  it("stores a created config as a jsonb object, not a string scalar", async () => {
    const preset = await repo.create(OWNER, { name: "Draft night", config: CONFIG });

    expect(await storedType(preset.id)).toBe("object");
    expect(preset.config).toEqual(CONFIG);
  });

  it("stores an updated config as a jsonb object too", async () => {
    const preset = await repo.create(OWNER, { name: "Green screen", config: { ground: "green" } });

    const updated = await repo.update(preset.id, OWNER, { config: CONFIG });

    expect(await storedType(preset.id)).toBe("object");
    expect(updated?.config).toEqual(CONFIG);
  });

  it("round-trips an empty config, which the default also has to satisfy", async () => {
    const preset = await repo.create(OWNER, { name: "Untouched", config: {} });

    expect(await storedType(preset.id)).toBe("object");
    expect(preset.config).toEqual({});
  });

  it("reads a config back as an object, not the raw jsonb string", async () => {
    const created = await repo.create(OWNER, { name: "Readback", config: CONFIG });

    const listed = await repo.listForUser(OWNER);
    const found = await repo.findByIdForUser(created.id, OWNER);

    expect(typeof found?.config).toBe("object");
    expect(found?.config).toEqual(CONFIG);
    expect(listed.every((row) => typeof row.config === "object")).toBe(true);
  });

  it("renames without restating the config, leaving the stored object intact", async () => {
    const preset = await repo.create(OWNER, { name: "Before", config: CONFIG });

    const renamed = await repo.update(preset.id, OWNER, { name: "After" });

    expect(renamed?.name).toBe("After");
    expect(renamed?.config).toEqual(CONFIG);
    expect(await storedType(preset.id)).toBe("object");
  });

  it("does not reach another user's preset", async () => {
    const preset = await repo.create(OTHER, { name: "Theirs", config: CONFIG });

    expect(await repo.findByIdForUser(preset.id, OWNER)).toBeUndefined();
    expect(await repo.update(preset.id, OWNER, { name: "Mine now" })).toBeUndefined();
    expect(await repo.remove(preset.id, OWNER)).toBe(false);
  });

  it("returns undefined for a malformed id instead of erroring on the uuid cast", async () => {
    expect(await repo.findByIdForUser("not-a-uuid", OWNER)).toBeUndefined();
  });

  it("counts and deletes the user's own presets", async () => {
    const before = await repo.countForUser(OTHER);
    const preset = await repo.create(OTHER, { name: "Doomed", config: {} });

    expect(await repo.countForUser(OTHER)).toBe(before + 1);
    expect(await repo.remove(preset.id, OTHER)).toBe(true);
    expect(await repo.countForUser(OTHER)).toBe(before);
  });
});
