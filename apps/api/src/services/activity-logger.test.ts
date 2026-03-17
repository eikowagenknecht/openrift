/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it } from "bun:test";

import { createActivity } from "./activity-logger.js";

// ---------------------------------------------------------------------------
// Mock transaction builder
// ---------------------------------------------------------------------------

interface InsertedRow {
  table: string;
  values: unknown;
}

function createMockTrx(activityId: string) {
  const inserted: InsertedRow[] = [];

  const insertChain = (table: string) => {
    const chain: any = {};
    chain.values = (vals: unknown) => {
      inserted.push({ table, values: vals });
      return chain;
    };
    chain.returning = () => chain;
    chain.executeTakeFirstOrThrow = () => Promise.resolve({ id: activityId });
    chain.execute = () => Promise.resolve([]);
    return chain;
  };

  const trx: any = {
    insertInto: (table: string) => insertChain(table),
  };

  return { trx, inserted };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createActivity", () => {
  it("inserts an activity row with correct fields", async () => {
    const { trx, inserted } = createMockTrx("act-1");

    await createActivity(trx, {
      userId: "user-1",
      type: "acquisition",
      name: "My Activity",
      description: "A description",
      isAuto: true,
      items: [],
    });

    const activityInsert = inserted.find((i) => i.table === "activities");
    expect(activityInsert).toBeDefined();

    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    const vals = activityInsert!.values as any;
    expect(vals.userId).toBe("user-1");
    expect(vals.type).toBe("acquisition");
    expect(vals.name).toBe("My Activity");
    expect(vals.description).toBe("A description");
    expect(vals.isAuto).toBe(true);
    expect(vals.date).toBeInstanceOf(Date);
  });

  it("defaults name, description to null and isAuto to false", async () => {
    const { trx, inserted } = createMockTrx("act-2");

    await createActivity(trx, {
      userId: "user-1",
      type: "disposal",
      items: [],
    });

    // oxlint-disable-next-line typescript/no-non-null-assertion -- find always matches in this test
    const vals = inserted.find((i) => i.table === "activities")!.values as any;
    expect(vals.name).toBeNull();
    expect(vals.description).toBeNull();
    expect(vals.isAuto).toBe(false);
  });

  it("uses provided date string when given", async () => {
    const { trx, inserted } = createMockTrx("act-3");

    await createActivity(trx, {
      userId: "user-1",
      type: "acquisition",
      date: "2025-01-15",
      items: [],
    });

    // oxlint-disable-next-line typescript/no-non-null-assertion -- find always matches in this test
    const vals = inserted.find((i) => i.table === "activities")!.values as any;
    expect(vals.date).toEqual(new Date("2025-01-15"));
  });

  it("inserts activity items with mapped fields", async () => {
    const { trx, inserted } = createMockTrx("act-4");

    await createActivity(trx, {
      userId: "user-1",
      type: "acquisition",
      items: [
        {
          copyId: "copy-1",
          printingId: "print-1",
          action: "added",
          toCollectionId: "col-1",
          toCollectionName: "Main",
        },
        {
          printingId: "print-2",
          action: "removed",
          fromCollectionId: "col-2",
          fromCollectionName: "Old",
          metadataSnapshot: { foo: "bar" },
        },
      ],
    });

    const itemsInsert = inserted.find((i) => i.table === "activityItems");
    expect(itemsInsert).toBeDefined();

    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by toBeDefined above
    const items = itemsInsert!.values as any[];
    expect(items).toHaveLength(2);

    expect(items[0].activityId).toBe("act-4");
    expect(items[0].userId).toBe("user-1");
    expect(items[0].activityType).toBe("acquisition");
    expect(items[0].copyId).toBe("copy-1");
    expect(items[0].printingId).toBe("print-1");
    expect(items[0].action).toBe("added");
    expect(items[0].toCollectionId).toBe("col-1");
    expect(items[0].toCollectionName).toBe("Main");
    expect(items[0].fromCollectionId).toBeNull();
    expect(items[0].fromCollectionName).toBeNull();
    expect(items[0].metadataSnapshot).toBeNull();

    expect(items[1].copyId).toBeNull();
    expect(items[1].fromCollectionId).toBe("col-2");
    expect(items[1].fromCollectionName).toBe("Old");
    expect(items[1].metadataSnapshot).toBe('{"foo":"bar"}');
  });

  it("does not insert activity items when items array is empty", async () => {
    const { trx, inserted } = createMockTrx("act-5");

    await createActivity(trx, {
      userId: "user-1",
      type: "acquisition",
      items: [],
    });

    const itemsInsert = inserted.find((i) => i.table === "activityItems");
    expect(itemsInsert).toBeUndefined();
  });

  it("returns the activity ID", async () => {
    const { trx } = createMockTrx("act-99");

    const id = await createActivity(trx, {
      userId: "user-1",
      type: "reorganization",
      items: [],
    });

    expect(id).toBe("act-99");
  });
});
