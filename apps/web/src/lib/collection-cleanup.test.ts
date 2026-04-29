import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import { describe, expect, it, vi } from "vitest";

import { cleanupWhenIdle } from "./collection-cleanup";

interface Stub {
  id: string;
}

function createLocalOnly() {
  return createCollection(
    localOnlyCollectionOptions<Stub>({
      id: `cleanup-test-${crypto.randomUUID()}`,
      getKey: (item) => item.id,
    }),
  );
}

describe("cleanupWhenIdle", () => {
  it("invokes cleanup() immediately when no subscribers are attached", () => {
    const collection = createLocalOnly();
    const cleanupSpy = vi.spyOn(collection, "cleanup");

    cleanupWhenIdle(collection);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it("defers cleanup() until subscriberCount transitions to 0", async () => {
    const collection = createLocalOnly();
    // localOnly collections start in `idle` and need a subscriber to enter
    // `ready`. Subscribing keeps subscriberCount >= 1.
    const subscription = collection.subscribeChanges(() => {});
    expect(collection.subscriberCount).toBeGreaterThan(0);

    const cleanupSpy = vi.spyOn(collection, "cleanup");
    cleanupWhenIdle(collection);

    // Synchronous: still attached, so cleanup hasn't run.
    expect(cleanupSpy).not.toHaveBeenCalled();

    subscription.unsubscribe();

    await vi.waitFor(() => expect(cleanupSpy).toHaveBeenCalledTimes(1));
  });

  it("is a no-op when called against an already-cleaned-up collection", async () => {
    const collection = createLocalOnly();
    await collection.cleanup();
    expect(collection.status).toBe("cleaned-up");

    const cleanupSpy = vi.spyOn(collection, "cleanup");
    cleanupWhenIdle(collection);
    expect(cleanupSpy).not.toHaveBeenCalled();
  });
});
