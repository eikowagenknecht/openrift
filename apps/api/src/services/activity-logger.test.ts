/* oxlint-disable
   no-empty-function,
   unicorn/no-useless-undefined
   -- test file: mocks require empty fns and explicit undefined */
import { describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { createActivity } from "./activity-logger.js";

// ---------------------------------------------------------------------------
// Mock repos builder
// ---------------------------------------------------------------------------

function createMockRepos(activityId: string) {
  const insertedActivities: unknown[] = [];
  const insertedItems: unknown[] = [];

  const repos = {
    activities: {
      create: (vals: unknown) => {
        insertedActivities.push(vals);
        return Promise.resolve(activityId);
      },
      createItems: (vals: unknown) => {
        insertedItems.push(vals);
        return Promise.resolve([]);
      },
    },
  } as unknown as Repos;

  return { repos, insertedActivities, insertedItems };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createActivity", () => {
  it("inserts an activity row with correct fields", async () => {
    const { repos, insertedActivities } = createMockRepos("act-1");

    await createActivity(repos, {
      userId: "user-1",
      type: "acquisition",
      name: "My Activity",
      description: "A description",
      isAuto: true,
      items: [],
    });

    expect(insertedActivities).toHaveLength(1);
    const vals = insertedActivities[0] as any;
    expect(vals.userId).toBe("user-1");
    expect(vals.type).toBe("acquisition");
    expect(vals.name).toBe("My Activity");
    expect(vals.description).toBe("A description");
    expect(vals.isAuto).toBe(true);
    expect(vals.date).toBeInstanceOf(Date);
  });

  it("defaults name, description to null and isAuto to false", async () => {
    const { repos, insertedActivities } = createMockRepos("act-2");

    await createActivity(repos, {
      userId: "user-1",
      type: "disposal",
      items: [],
    });

    const vals = insertedActivities[0] as any;
    expect(vals.name).toBeNull();
    expect(vals.description).toBeNull();
    expect(vals.isAuto).toBe(false);
  });

  it("uses provided date string when given", async () => {
    const { repos, insertedActivities } = createMockRepos("act-3");

    await createActivity(repos, {
      userId: "user-1",
      type: "acquisition",
      date: "2025-01-15",
      items: [],
    });

    const vals = insertedActivities[0] as any;
    expect(vals.date).toEqual(new Date("2025-01-15"));
  });

  it("inserts activity items with mapped fields", async () => {
    const { repos, insertedItems } = createMockRepos("act-4");

    await createActivity(repos, {
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

    expect(insertedItems).toHaveLength(1);
    const items = insertedItems[0] as any[];
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
    const { repos, insertedItems } = createMockRepos("act-5");

    await createActivity(repos, {
      userId: "user-1",
      type: "acquisition",
      items: [],
    });

    expect(insertedItems).toHaveLength(1);
    const items = insertedItems[0] as any[];
    expect(items).toHaveLength(0);
  });

  it("returns the activity ID", async () => {
    const { repos } = createMockRepos("act-99");

    const id = await createActivity(repos, {
      userId: "user-1",
      type: "reorganization",
      items: [],
    });

    expect(id).toBe("act-99");
  });
});
