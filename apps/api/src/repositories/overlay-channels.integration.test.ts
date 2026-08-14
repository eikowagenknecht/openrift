import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { afterAll, describe, expect, it } from "vitest";

import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { overlayChannelsRepo } from "./overlay-channels.js";

// ---------------------------------------------------------------------------
// Integration tests: overlay_channels repository (migration 238).
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL. Seeds its
// own users with per-file random ids and deletes only those in afterAll — the
// channel rows go with them via the ON DELETE CASCADE, which is itself worth
// exercising.
//
// The point of these is the pair the OBS poll depends on: the jsonb payload
// surviving a round trip (postgres.js under Bun hands it back as a string), and
// `version` advancing on every write.
// ---------------------------------------------------------------------------

const OWNER = crypto.randomUUID();
const OTHER = crypto.randomUUID();

const ctx = createDbContext(OWNER);

if (ctx) {
  const { db } = ctx;
  await seedTestUser(db, { id: OWNER });
  await seedTestUser(db, { id: OTHER });
}

describe.skipIf(!ctx)("overlayChannelsRepo (integration)", () => {
  const db = ctx!.db;
  const repo = overlayChannelsRepo(db);

  afterAll(async () => {
    await db.deleteFrom("users").where("id", "in", [OWNER, OTHER]).execute();
  });

  it("creates a channel with a token and the default payload", async () => {
    const channel = await repo.create(OWNER);

    expect(channel.token).toHaveLength(12);
    expect(channel.version).toBe(0);
    expect(channel.payload).toEqual(DEFAULT_OVERLAY_PAYLOAD);
  });

  it("finds the channel by user and by token", async () => {
    const created = await repo.create(OTHER);
    const byUser = await repo.findByUserId(OTHER);
    const byToken = await repo.findByToken(created.token);

    expect(byUser?.token).toBe(created.token);
    expect(byToken?.userId).toBe(OTHER);
  });

  it("returns undefined for an unknown token", async () => {
    expect(await repo.findByToken("no-such-token")).toBeUndefined();
  });

  it("round-trips the jsonb payload as an object, not a string", async () => {
    const payload = {
      printingId: "printing-1",
      showPlate: false,
      deckShareUrl: "https://openrift.app/decks/share/abc",
      corner: "top-left" as const,
      scale: 45,
    };

    await repo.setPayload(OWNER, payload);
    const read = await repo.findByUserId(OWNER);

    expect(read?.payload).toEqual(payload);
    expect(typeof read?.payload).toBe("object");
  });

  it("bumps the version on every payload write", async () => {
    const before = await repo.findByUserId(OWNER);
    const updated = await repo.setPayload(OWNER, {
      ...DEFAULT_OVERLAY_PAYLOAD,
      printingId: "printing-2",
    });

    expect(updated?.version).toBe((before?.version ?? 0) + 1);
  });

  it("bumps the version on a token rotation too, so pollers notice", async () => {
    const before = await repo.findByUserId(OWNER);
    const rotated = await repo.rotateToken(OWNER);

    expect(rotated?.token).not.toBe(before?.token);
    expect(rotated?.version).toBe((before?.version ?? 0) + 1);
  });

  it("keeps the payload across a rotation — a leaked token is not a blank scene", async () => {
    const before = await repo.findByUserId(OWNER);
    const rotated = await repo.rotateToken(OWNER);

    expect(rotated?.payload).toEqual(before?.payload);
  });

  it("stops resolving the old token after a rotation", async () => {
    const before = await repo.findByUserId(OWNER);
    await repo.rotateToken(OWNER);

    expect(await repo.findByToken(before!.token)).toBeUndefined();
  });

  it("returns undefined when writing for a user with no channel", async () => {
    const stranger = crypto.randomUUID();

    expect(await repo.setPayload(stranger, DEFAULT_OVERLAY_PAYLOAD)).toBeUndefined();
    expect(await repo.rotateToken(stranger)).toBeUndefined();
  });

  it("drops the channel when its user is deleted", async () => {
    const doomed = crypto.randomUUID();
    await seedTestUser(db, { id: doomed });
    const channel = await repo.create(doomed);

    await db.deleteFrom("users").where("id", "=", doomed).execute();

    expect(await repo.findByToken(channel.token)).toBeUndefined();
  });
});
