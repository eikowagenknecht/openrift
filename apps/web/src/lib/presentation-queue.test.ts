import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import {
  MAX_QUEUE_LENGTH,
  appendToQueue,
  clampIndex,
  resolveQueuePrintings,
  stepIndex,
} from "./presentation-queue";

function catalog(...printings: Printing[]): Record<string, Printing> {
  return Object.fromEntries(printings.map((printing) => [printing.id, printing]));
}

describe("resolveQueuePrintings", () => {
  it("resolves ids in the order they were given, not catalog order", () => {
    const a = stubPrinting({ id: "a" });
    const b = stubPrinting({ id: "b" });
    const c = stubPrinting({ id: "c" });

    const result = resolveQueuePrintings(["c", "a", "b"], catalog(a, b, c));

    expect(result.map((printing) => printing.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ids the catalog doesn't know instead of leaving holes", () => {
    const a = stubPrinting({ id: "a" });

    const result = resolveQueuePrintings(["a", "gone", "also-gone"], catalog(a));

    expect(result.map((printing) => printing.id)).toEqual(["a"]);
  });

  it("keeps a repeated id — coming back to a card is legitimate", () => {
    const a = stubPrinting({ id: "a" });
    const b = stubPrinting({ id: "b" });

    const result = resolveQueuePrintings(["a", "b", "a"], catalog(a, b));

    expect(result.map((printing) => printing.id)).toEqual(["a", "b", "a"]);
  });

  it("caps the queue at MAX_QUEUE_LENGTH", () => {
    const a = stubPrinting({ id: "a" });
    const ids = Array.from({ length: MAX_QUEUE_LENGTH + 10 }, () => "a");

    expect(resolveQueuePrintings(ids, catalog(a))).toHaveLength(MAX_QUEUE_LENGTH);
  });

  it("returns nothing for an empty queue", () => {
    expect(resolveQueuePrintings([], catalog())).toEqual([]);
  });
});

describe("appendToQueue", () => {
  it("appends in order and reports what landed", () => {
    expect(appendToQueue(["a"], ["b", "c"])).toEqual({
      ids: ["a", "b", "c"],
      added: 2,
      dropped: 0,
    });
  });

  it("keeps a card the queue already holds", () => {
    // Filling from a list after queueing a card by hand is a real sequence, and
    // the queue allows repeats anyway.
    expect(appendToQueue(["a"], ["a", "b"]).ids).toEqual(["a", "a", "b"]);
  });

  it("takes what fits and counts the rest as dropped", () => {
    const result = appendToQueue(["a", "b"], ["c", "d", "e"], 4);

    expect(result).toEqual({ ids: ["a", "b", "c", "d"], added: 2, dropped: 1 });
  });

  it("adds nothing once the queue is at the cap", () => {
    const result = appendToQueue(["a", "b"], ["c"], 2);

    expect(result).toEqual({ ids: ["a", "b"], added: 0, dropped: 1 });
  });

  it("adds nothing when the source is empty", () => {
    expect(appendToQueue(["a"], [])).toEqual({ ids: ["a"], added: 0, dropped: 0 });
  });

  it("treats an over-full queue as having no room rather than negative room", () => {
    const result = appendToQueue(["a", "b", "c"], ["d"], 2);

    expect(result).toEqual({ ids: ["a", "b", "c"], added: 0, dropped: 1 });
  });

  it("defaults the cap to MAX_QUEUE_LENGTH", () => {
    const incoming = Array.from({ length: MAX_QUEUE_LENGTH + 5 }, (_unused, at) => `p-${at}`);

    const result = appendToQueue([], incoming);

    expect(result.ids).toHaveLength(MAX_QUEUE_LENGTH);
    expect(result.added).toBe(MAX_QUEUE_LENGTH);
    expect(result.dropped).toBe(5);
  });

  it("does not mutate the queue it was given", () => {
    const current = ["a"];

    appendToQueue(current, ["b"]);

    expect(current).toEqual(["a"]);
  });
});

describe("clampIndex", () => {
  it("returns the index when it is already in range", () => {
    expect(clampIndex(2, 5)).toBe(2);
  });

  it("clamps past the end to the last card", () => {
    expect(clampIndex(99, 5)).toBe(4);
  });

  it("clamps a negative index to the first card", () => {
    expect(clampIndex(-3, 5)).toBe(0);
  });

  it("returns 0 for an empty queue", () => {
    expect(clampIndex(4, 0)).toBe(0);
  });

  it("returns 0 for a non-finite index", () => {
    expect(clampIndex(Number.NaN, 5)).toBe(0);
    expect(clampIndex(Number.POSITIVE_INFINITY, 5)).toBe(0);
  });

  it("truncates a fractional index", () => {
    expect(clampIndex(2.9, 5)).toBe(2);
  });
});

describe("stepIndex", () => {
  it("steps forward and back", () => {
    expect(stepIndex(1, 5, 1)).toBe(2);
    expect(stepIndex(1, 5, -1)).toBe(0);
  });

  it("stops at the ends rather than wrapping", () => {
    expect(stepIndex(4, 5, 1)).toBe(4);
    expect(stepIndex(0, 5, -1)).toBe(0);
  });
});
