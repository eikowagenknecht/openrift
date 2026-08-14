import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MAX_QUEUE_LENGTH } from "@/lib/presentation-queue";
import { createStoreResetter } from "@/test/store-helpers";

import { usePresentQueueStore } from "./present-queue-store";

const reset = createStoreResetter(usePresentQueueStore);

beforeEach(reset);
afterEach(reset);

/** @returns The store's current ids. */
function ids(): string[] {
  return usePresentQueueStore.getState().ids;
}

/** @returns How many times `printingId` is queued. */
function count(printingId: string): number {
  return usePresentQueueStore.getState().countByPrintingId.get(printingId) ?? 0;
}

function filler(length: number): string[] {
  return Array.from({ length }, (_unused, at) => `p${at}`);
}

describe("present queue store", () => {
  it("starts empty", () => {
    expect(ids()).toEqual([]);
    expect(usePresentQueueStore.getState().countByPrintingId.size).toBe(0);
  });

  it("loads a queue and indexes its counts", () => {
    usePresentQueueStore.getState().load(["a", "b", "a"]);

    expect(ids()).toEqual(["a", "b", "a"]);
    expect(count("a")).toBe(2);
    expect(count("b")).toBe(1);
  });

  it("truncates an over-long load to the limit", () => {
    usePresentQueueStore.getState().load(filler(MAX_QUEUE_LENGTH + 10));

    expect(ids()).toHaveLength(MAX_QUEUE_LENGTH);
  });

  it("appends and keeps the count index in step", () => {
    usePresentQueueStore.getState().add("a");
    usePresentQueueStore.getState().add("a");

    expect(ids()).toEqual(["a", "a"]);
    expect(count("a")).toBe(2);
  });

  it("ignores an add once the queue is full", () => {
    usePresentQueueStore.getState().load(filler(MAX_QUEUE_LENGTH));

    usePresentQueueStore.getState().add("extra");

    expect(ids()).toHaveLength(MAX_QUEUE_LENGTH);
    expect(count("extra")).toBe(0);
  });

  it("reports what a batch add couldn't fit", () => {
    usePresentQueueStore.getState().load(filler(MAX_QUEUE_LENGTH - 2));

    const result = usePresentQueueStore.getState().addMany(["a", "b", "c", "d"]);

    expect(result).toEqual({ added: 2, dropped: 2 });
    expect(ids()).toHaveLength(MAX_QUEUE_LENGTH);
  });

  it("adds a whole batch when there is room", () => {
    expect(usePresentQueueStore.getState().addMany(["a", "b"])).toEqual({ added: 2, dropped: 0 });
    expect(ids()).toEqual(["a", "b"]);
  });

  it("removes the last stop showing a printing, not the first", () => {
    usePresentQueueStore.getState().load(["a", "b", "a"]);

    usePresentQueueStore.getState().removePrinting("a");

    expect(ids()).toEqual(["a", "b"]);
    expect(count("a")).toBe(1);
  });

  it("ignores removing a printing that isn't queued", () => {
    usePresentQueueStore.getState().load(["a"]);

    usePresentQueueStore.getState().removePrinting("gone");

    expect(ids()).toEqual(["a"]);
  });

  it("removes by position", () => {
    usePresentQueueStore.getState().load(["a", "b", "c"]);

    usePresentQueueStore.getState().removeAt(1);

    expect(ids()).toEqual(["a", "c"]);
    expect(count("b")).toBe(0);
  });

  it("ignores an out-of-range position", () => {
    usePresentQueueStore.getState().load(["a"]);

    usePresentQueueStore.getState().removeAt(5);
    usePresentQueueStore.getState().removeAt(-1);

    expect(ids()).toEqual(["a"]);
  });

  it("moves a stop and clamps at the ends", () => {
    usePresentQueueStore.getState().load(["a", "b", "c"]);

    usePresentQueueStore.getState().move(2, -1);

    expect(ids()).toEqual(["a", "c", "b"]);

    usePresentQueueStore.getState().move(0, -1);

    expect(ids()).toEqual(["a", "c", "b"]);
  });

  it("reorders wholesale", () => {
    usePresentQueueStore.getState().load(["a", "b", "c"]);

    usePresentQueueStore.getState().reorder(["c", "a", "b"]);

    expect(ids()).toEqual(["c", "a", "b"]);
  });

  it("resets back to empty", () => {
    usePresentQueueStore.getState().load(["a", "b"]);

    usePresentQueueStore.getState().reset();

    expect(ids()).toEqual([]);
    expect(count("a")).toBe(0);
  });
});
