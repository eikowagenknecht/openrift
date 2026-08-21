import { describe, expect, it } from "vitest";

import { moveQueueEntry } from "./card-queue";

describe("moveQueueEntry", () => {
  const ids = ["a", "b", "c"];

  it("moves an entry down", () => {
    expect(moveQueueEntry(ids, 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("moves an entry up", () => {
    expect(moveQueueEntry(ids, 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the ends", () => {
    expect(moveQueueEntry(ids, 0, -1)).toEqual(ids);
    expect(moveQueueEntry(ids, 2, 1)).toEqual(ids);
  });

  it("is a no-op for an out-of-range source", () => {
    expect(moveQueueEntry(ids, 9, -1)).toEqual(ids);
    expect(moveQueueEntry(ids, -1, 1)).toEqual(ids);
  });

  it("does not mutate the input", () => {
    const original = [...ids];
    moveQueueEntry(ids, 0, 1);
    expect(ids).toEqual(original);
  });

  it("handles an empty queue", () => {
    expect(moveQueueEntry([], 0, 1)).toEqual([]);
  });
});
