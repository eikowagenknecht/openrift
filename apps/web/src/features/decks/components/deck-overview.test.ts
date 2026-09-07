import { describe, expect, it, vi } from "vitest";

import { overviewHoverHandler } from "@/features/decks/lib/deck-overview-derive";

describe("overviewHoverHandler", () => {
  it("passes the handler through outside stacks mode", () => {
    const onHoverCard = vi.fn();
    expect(overviewHoverHandler(false, onHoverCard)).toBe(onHoverCard);
  });

  it("drops the handler in stacks mode so non-stacking zones can't pop the docked preview alone", () => {
    expect(overviewHoverHandler(true, vi.fn())).toBeUndefined();
  });

  it("stays undefined when the caller has no handler", () => {
    expect(overviewHoverHandler(false)).toBeUndefined();
    expect(overviewHoverHandler(true)).toBeUndefined();
  });
});
