import { describe, expect, it, vi } from "vitest";

import { overviewHoverHandler } from "@/lib/deck-overview-derive";

describe("overviewHoverHandler", () => {
  it("passes the handler through outside stacks mode", () => {
    const onHoverCard = vi.fn();
    expect(overviewHoverHandler(false, onHoverCard)).toBe(onHoverCard);
  });

  // Stacks mode expands the hovered card inside its pile, so the zones that
  // don't stack (Legend, Chosen Champion, a short Runes row) must not be the
  // only thumbs left popping the docked preview.
  it("drops the handler in stacks mode", () => {
    expect(overviewHoverHandler(true, vi.fn())).toBeUndefined();
  });

  it("stays undefined when the caller has no handler", () => {
    expect(overviewHoverHandler(false)).toBeUndefined();
    expect(overviewHoverHandler(true)).toBeUndefined();
  });
});
