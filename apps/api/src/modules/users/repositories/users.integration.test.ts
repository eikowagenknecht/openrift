import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../../../test/integration-context.js";
import { usersRepo } from "./users.js";

const ctx = createDbContext("a0000000-0044-4000-a000-000000000001");

const SEEDED = [
  { id: crypto.randomUUID(), createdAt: new Date("2015-06-01T12:00:00Z") },
  { id: crypto.randomUUID(), createdAt: new Date("2015-06-01T23:59:00Z") },
  { id: crypto.randomUUID(), createdAt: new Date("2015-06-04T00:30:00Z") },
];

describe.skipIf(!ctx)("usersRepo.getSignupSeries (integration)", () => {
  const { db } = ctx!;
  const repo = usersRepo(db);

  afterAll(async () => {
    await db
      .deleteFrom("users")
      .where(
        "id",
        "in",
        SEEDED.map((u) => u.id),
      )
      .execute();
  });

  it("buckets signups by UTC day and fills the gaps between them", async () => {
    await db
      .insertInto("users")
      .values(
        SEEDED.map((user) => ({
          id: user.id,
          email: `signup-series-${user.id}@test.com`,
          name: "Test User",
          image: null,
          createdAt: user.createdAt,
        })),
      )
      .execute();

    const series = await repo.getSignupSeries();
    const start = series.findIndex((day) => day.date === "2015-06-01");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(series.slice(start, start + 4)).toEqual([
      { date: "2015-06-01", count: 2 },
      { date: "2015-06-02", count: 0 },
      { date: "2015-06-03", count: 0 },
      { date: "2015-06-04", count: 1 },
    ]);
    expect(series.at(-1)?.date).toBe(new Date().toISOString().slice(0, 10));
  });
});
