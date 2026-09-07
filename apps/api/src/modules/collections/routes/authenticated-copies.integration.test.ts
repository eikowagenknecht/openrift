import { afterAll, describe, expect, it } from "vitest";

import { PRINTING_1, PRINTING_2 } from "../../../test/fixtures/constants.js";
import { createTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const ctx = createTestContext("a0000000-0003-4000-a000-000000000001");

describe.skipIf(!ctx)("Copies routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db, userId } = ctx!;

  let collectionId: string;
  let secondCollectionId: string;
  let copyIds: string[] = [];

  it("setup: creates collections for copy tests", async () => {
    await app.fetch(req("GET", "/collections"));

    const res1 = await app.fetch(req("POST", "/collections", { name: "Main Collection" }));
    collectionId = ((await readJson(res1)) as { id: string }).id;

    const res2 = await app.fetch(req("POST", "/collections", { name: "Second Collection" }));
    secondCollectionId = ((await readJson(res2)) as { id: string }).id;
  });

  describe("POST /copies", () => {
    it("adds copies to a collection", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [
            { printingId: PRINTING_1.id, collectionId },
            { printingId: PRINTING_1.id, collectionId },
            { printingId: PRINTING_2.id, collectionId },
          ],
        }),
      );
      expect(res.status).toBe(201);

      const json = (await readJson(res)) as {
        items: {
          id: string;
          printingId: string;
          collectionId: string;
          groupId: string | null;
        }[];
      };
      expect(json.items).toHaveLength(3);
      expect(json.items[0]!.id).toBeTypeOf("string");
      expect(json.items[0]!.printingId).toBe(PRINTING_1.id);
      expect(json.items[0]!.collectionId).toBe(collectionId);
      expect(json.items[0]).toHaveProperty("groupId");
      expect(json.items.every((copy) => copy.groupId === null)).toBe(true);
      copyIds = json.items.map((c) => c.id);
    });

    it("defaults to inbox when collectionId is omitted", async () => {
      const res = await app.fetch(
        req("POST", "/copies", { copies: [{ printingId: PRINTING_2.id }] }),
      );
      expect(res.status).toBe(201);

      const json = (await readJson(res)) as { items: { collectionId: string }[] };
      expect(json.items[0]!.collectionId).not.toBe(collectionId);
    });

    describe("groupId for a group-owned collection", () => {
      let groupId: string;
      let groupCollectionId: string;
      const groupCopyIds: string[] = [];

      afterAll(async () => {
        if (groupCopyIds.length > 0) {
          await db.deleteFrom("copies").where("id", "in", groupCopyIds).execute();
        }
        if (groupCollectionId) {
          await db.deleteFrom("collections").where("id", "=", groupCollectionId).execute();
        }
        if (groupId) {
          // friend_group_members cascades on group delete.
          await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
        }
      });

      it("returns the owning groupId for copies added to a group collection", async () => {
        // Slug must match ^[a-z0-9][a-z0-9-]{2,29}$ and be unique per run.
        const group = await db
          .insertInto("friendGroups")
          .values({ slug: `rt-grp-${Date.now()}`, name: "Route Copy Group" })
          .returningAll()
          .executeTakeFirstOrThrow();
        groupId = group.id;

        // The acting user must be a member so the collection is writable.
        await db
          .insertInto("friendGroupMembers")
          .values({ groupId, userId, role: "member" })
          .execute();

        const pooled = await db
          .insertInto("collections")
          .values({ groupId, name: "Pooled Box", isInbox: false, sortOrder: 0 })
          .returningAll()
          .executeTakeFirstOrThrow();
        groupCollectionId = pooled.id;

        const res = await app.fetch(
          req("POST", "/copies", {
            copies: [{ printingId: PRINTING_1.id, collectionId: pooled.id }],
          }),
        );
        expect(res.status).toBe(201);

        const json = (await readJson(res)) as {
          items: {
            id: string;
            collectionId: string;
            groupId: string | null;
          }[];
        };
        expect(json.items).toHaveLength(1);
        expect(json.items[0]!.collectionId).toBe(pooled.id);
        expect(json.items[0]!.groupId).toBe(groupId);
        groupCopyIds.push(json.items[0]!.id);
      });
    });

    it("rejects with empty copies array", async () => {
      const res = await app.fetch(req("POST", "/copies", { copies: [] }));
      expect(res.status).toBe(400);
    });

    it("rejects without copies field", async () => {
      const res = await app.fetch(req("POST", "/copies", {}));
      expect(res.status).toBe(400);
    });

    it("rejects invalid printingId format", async () => {
      const res = await app.fetch(
        req("POST", "/copies", { copies: [{ printingId: "not-a-uuid" }] }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 (not 500) for a valid-format printingId that does not exist (F8)", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [{ printingId: "00000000-0000-4000-8000-000000000000" }],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /copies", () => {
    it("returns all copies for the user", async () => {
      const res = await app.fetch(req("GET", "/copies"));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as { items: Record<string, unknown>[] };
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBe(4);

      const copy = json.items[0];
      expect(copy!.id).toBeTypeOf("string");
      expect(copy!.printingId).toBeTypeOf("string");
      expect(copy!.collectionId).toBeTypeOf("string");
    });
  });

  describe("POST /copies/move", () => {
    it("moves copies to another collection", async () => {
      const res = await app.fetch(
        req("POST", "/copies/move", {
          copyIds: [copyIds[0]],
          toCollectionId: secondCollectionId,
        }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/copies"));
      const list = (await readJson(listRes)) as { items: { id: string; collectionId: string }[] };
      const moved = list.items.find((item) => item.id === copyIds[0]);
      expect(moved?.collectionId).toBe(secondCollectionId);
    });

    it("rejects moving to non-existent collection", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", "/copies/move", { copyIds: [copyIds[1]], toCollectionId: fakeId }),
      );
      expect(res.status).toBe(404);
    });

    it("rejects with empty copyIds", async () => {
      const res = await app.fetch(
        req("POST", "/copies/move", { copyIds: [], toCollectionId: secondCollectionId }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /copies/update", () => {
    let annotatedId: string;

    it("setup: adds a copy with metadata at insert time", async () => {
      const res = await app.fetch(
        req("POST", "/copies", {
          copies: [
            {
              printingId: PRINTING_1.id,
              collectionId,
              condition: "near-mint",
              notesPublic: "Pack fresh",
              notesPrivate: "Bought at Worlds",
              links: [{ url: "https://example.com/front.jpg", label: "Front" }],
            },
          ],
        }),
      );
      expect(res.status).toBe(201);
      const json = (await readJson(res)) as {
        items: { id: string; condition: string | null; links: { url: string }[] }[];
      };
      expect(json.items[0]!.condition).toBe("near-mint");
      expect(json.items[0]!.links).toEqual([
        { url: "https://example.com/front.jpg", label: "Front" },
      ]);
      annotatedId = json.items[0]!.id;
    });

    it("applies a metadata patch and round-trips it through GET /copies", async () => {
      const res = await app.fetch(
        req("POST", "/copies/update", {
          copyIds: [annotatedId],
          patch: { condition: "played", isAltered: true, notesPrivate: null },
        }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/copies"));
      const list = (await readJson(listRes)) as {
        items: {
          id: string;
          condition: string | null;
          isAltered: boolean;
          notesPublic: string | null;
          notesPrivate: string | null;
        }[];
      };
      const updated = list.items.find((item) => item.id === annotatedId);
      expect(updated?.condition).toBe("played");
      expect(updated?.isAltered).toBe(true);
      // Absent patch keys stay untouched; explicit nulls clear.
      expect(updated?.notesPublic).toBe("Pack fresh");
      expect(updated?.notesPrivate).toBeNull();
    });

    it("switching to graded clears the condition (service normalization)", async () => {
      const res = await app.fetch(
        req("POST", "/copies/update", {
          copyIds: [annotatedId],
          patch: { grader: "psa", grade: 9.5 },
        }),
      );
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/copies"));
      const list = (await readJson(listRes)) as {
        items: {
          id: string;
          condition: string | null;
          grader: string | null;
          grade: number | null;
        }[];
      };
      const updated = list.items.find((item) => item.id === annotatedId);
      expect(updated?.grader).toBe("psa");
      expect(updated?.grade).toBe(9.5);
      expect(updated?.condition).toBeNull();
    });

    it("rejects an unknown condition slug with 400", async () => {
      const res = await app.fetch(
        req("POST", "/copies/update", {
          copyIds: [annotatedId],
          patch: { condition: "shredded" },
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects a grade without a grader at the contract", async () => {
      const res = await app.fetch(
        req("POST", "/copies/update", { copyIds: [annotatedId], patch: { grade: 8 } }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent copy IDs", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", "/copies/update", { copyIds: [fakeId], patch: { condition: "mint" } }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("public share strips private notes", () => {
    it("exposes public metadata but never notesPrivate", async () => {
      const addRes = await app.fetch(
        req("POST", "/copies", {
          copies: [
            {
              printingId: PRINTING_2.id,
              collectionId,
              condition: "mint",
              notesPublic: "Shiny",
              notesPrivate: "secret",
            },
          ],
        }),
      );
      expect(addRes.status).toBe(201);

      const shareRes = await app.fetch(req("POST", `/collections/${collectionId}/share`));
      expect(shareRes.status).toBe(200);
      const { shareToken } = (await readJson(shareRes)) as { shareToken: string };

      const publicRes = await app.fetch(req("GET", `/collections/share/${shareToken}`));
      expect(publicRes.status).toBe(200);
      const publicJson = (await readJson(publicRes)) as {
        items: Record<string, unknown>[];
      };
      expect(publicJson.items.length).toBeGreaterThan(0);
      const shiny = publicJson.items.find((item) => item.notesPublic === "Shiny");
      expect(shiny).toBeDefined();
      expect(shiny?.condition).toBe("mint");
      for (const item of publicJson.items) {
        expect(item).not.toHaveProperty("notesPrivate");
      }
    });
  });

  describe("POST /copies/dispose", () => {
    it("disposes (hard-deletes) copies", async () => {
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [copyIds[2]] }));
      expect(res.status).toBe(204);

      const listRes = await app.fetch(req("GET", "/copies"));
      const list = (await readJson(listRes)) as { items: { id: string }[] };
      expect(list.items.find((item) => item.id === copyIds[2])).toBeUndefined();
    });

    it("rejects with empty copyIds", async () => {
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [] }));
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent copy IDs", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", "/copies/dispose", { copyIds: [fakeId] }));
      expect(res.status).toBe(404);
    });
  });

  describe("Event logging", () => {
    it("created collection events for copy operations", async () => {
      const res = await app.fetch(req("GET", "/collection-events"));
      expect(res.status).toBe(200);

      const json = (await readJson(res)) as { items: { action: string }[] };
      const actions = json.items.map((e) => e.action);
      expect(actions).toContain("added");
      expect(actions).toContain("moved");
      expect(actions).toContain("removed");
    });
  });
});
