import { describe, expect, it } from "vitest";

import { MAX_QUEUE_LENGTH } from "./presentation-queue";
import { queueCardsSearchSchema } from "./presentation-queue-search";

function ids(count: number): string[] {
  return Array.from({ length: count }, (_unused, at) => `p${at}`);
}

describe("queueCardsSearchSchema", () => {
  it("passes a queue inside the limit through unchanged", () => {
    expect(queueCardsSearchSchema.parse(["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps a queue exactly at the limit", () => {
    expect(queueCardsSearchSchema.parse(ids(MAX_QUEUE_LENGTH))).toHaveLength(MAX_QUEUE_LENGTH);
  });

  it("truncates an over-long queue instead of dropping every card", () => {
    const parsed = queueCardsSearchSchema.parse(ids(MAX_QUEUE_LENGTH + 40));

    expect(parsed).toHaveLength(MAX_QUEUE_LENGTH);
    expect(parsed?.[0]).toBe("p0");
  });

  it("is idempotent, so the router rewriting the shortened URL settles", () => {
    const once = queueCardsSearchSchema.parse(ids(MAX_QUEUE_LENGTH + 5));

    expect(queueCardsSearchSchema.parse(once)).toEqual(once);
  });

  it("treats a missing param as no queue", () => {
    expect(queueCardsSearchSchema.parse(undefined)).toBeUndefined();
  });

  it("falls back to no queue for a malformed param", () => {
    expect(queueCardsSearchSchema.parse("not-an-array")).toBeUndefined();
    expect(queueCardsSearchSchema.parse([1, 2])).toBeUndefined();
  });
});
