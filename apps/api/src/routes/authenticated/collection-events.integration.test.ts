import { describe, expect, it } from "vitest";

import { PRINTING_1 } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

const ctx = createTestContext("a0000000-0009-4000-a000-000000000001");

describe.skipIf(!ctx)("Collection events routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  let collectionId: string;

  it("setup: creates a collection and adds copies", async () => {
    await app.fetch(req("GET", "/collections"));
    const colRes = await app.fetch(req("POST", "/collections", { name: "Events Test" }));
    collectionId = ((await colRes.json()) as { id: string }).id;

    await app.fetch(
      req("POST", "/copies", {
        copies: [
          { printingId: PRINTING_1.id, collectionId },
          { printingId: PRINTING_1.id, collectionId },
        ],
      }),
    );
  });

  describe("GET /collection-events", () => {
    it("returns events for the user", async () => {
      const res = await app.fetch(req("GET", "/collection-events"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: { action: string }[]; nextCursor: string | null };
      expect(json.items.length).toBeGreaterThanOrEqual(2);
      expect(json.items[0].action).toBe("added");
    });

    it("supports cursor-based pagination", async () => {
      const res = await app.fetch(req("GET", "/collection-events?limit=1"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: unknown[]; nextCursor: string | null };
      expect(json.items).toHaveLength(1);
      expect(json.nextCursor).not.toBeNull();
    });

    it("returns enriched card data", async () => {
      const res = await app.fetch(req("GET", "/collection-events"));
      const json = (await res.json()) as {
        items: { cardName: string; shortCode: string; rarity: string }[];
      };
      const first = json.items[0];
      expect(first.cardName).toBeTypeOf("string");
      expect(first.shortCode).toBeTypeOf("string");
      expect(first.rarity).toBeTypeOf("string");
    });
  });
});
