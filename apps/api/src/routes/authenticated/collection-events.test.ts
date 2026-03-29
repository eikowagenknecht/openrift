import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

const ctx = createTestContext("a0000000-0010-4000-a000-000000000001");

describe.skipIf(!ctx)("Collection events routes (unit)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = ctx!;

  describe("GET /collection-events", () => {
    it("returns 200 with empty list for new user", async () => {
      const res = await app.fetch(req("GET", "/collection-events"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as { items: unknown[]; nextCursor: string | null };
      expect(json.items).toEqual([]);
      expect(json.nextCursor).toBeNull();
    });

    it("accepts limit parameter", async () => {
      const res = await app.fetch(req("GET", "/collection-events?limit=5"));
      expect(res.status).toBe(200);
    });

    it("accepts cursor parameter", async () => {
      const res = await app.fetch(req("GET", "/collection-events?cursor=2020-01-01T00:00:00.000Z"));
      expect(res.status).toBe(200);
    });
  });
});
