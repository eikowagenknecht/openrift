import { describe, expect, it } from "vitest";

import { MAX_QUEUE_LENGTH } from "./presentation-queue";
import {
  queueCardsSearchSchema,
  queueDraftSearch,
  startPresentingSearch,
} from "./presentation-queue-search";

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

describe("startPresentingSearch", () => {
  it("clears the builder's edit flag so Start presenting isn't a no-op", () => {
    const next = startPresentingSearch({ edit: true, cards: ["old"] }, ["a", "b"]);

    expect(next.edit).toBeUndefined();
    expect(next.cards).toEqual(["a", "b"]);
    expect(next.i).toBe(0);
  });

  it("starts from the top and keeps unrelated params", () => {
    const next = startPresentingSearch({ search: "ekko", i: 7 }, ["a"]);

    expect(next.i).toBe(0);
    expect(next.search).toBe("ekko");
  });

  it("copies the ids rather than aliasing the store's array", () => {
    const queued = ["a", "b"];
    const next = startPresentingSearch({}, queued);

    expect(next.cards).toEqual(queued);
    expect(next.cards).not.toBe(queued);
  });
});

describe("queueDraftSearch", () => {
  it("writes the queue into the URL and keeps unrelated params", () => {
    const next = queueDraftSearch({ search: "ekko" }, ["a", "b"]);

    expect(next.cards).toEqual(["a", "b"]);
    expect(next.search).toBe("ekko");
  });

  it("drops the param for an empty queue", () => {
    expect(queueDraftSearch({ cards: ["a"] }, []).cards).toBeUndefined();
  });

  it("copies the ids rather than aliasing the store's array", () => {
    const queued = ["a"];
    const next = queueDraftSearch({}, queued);

    expect(next.cards).toEqual(queued);
    expect(next.cards).not.toBe(queued);
  });
});
