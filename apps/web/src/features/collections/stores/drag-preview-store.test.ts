import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { useDragPreviewStore } from "./drag-preview-store";

const reset = createStoreResetter(useDragPreviewStore);
beforeEach(reset);
afterEach(reset);

describe("useDragPreviewStore", () => {
  it("starts empty with a default noun", () => {
    const state = useDragPreviewStore.getState();
    expect(state.preview).toEqual([]);
    expect(state.selectionCount).toBe(0);
    expect(state.selectionNoun).toBe("printing");
  });

  it("setPreview replaces the fan, count, and noun together", () => {
    const a = stubPrinting();
    const b = stubPrinting();
    useDragPreviewStore.getState().setPreview([a, b], 5, "printing");
    const state = useDragPreviewStore.getState();
    expect(state.preview).toEqual([a, b]);
    expect(state.selectionCount).toBe(5);
    expect(state.selectionNoun).toBe("printing");
  });

  it("setPreview with an empty list clears the preview", () => {
    const a = stubPrinting();
    useDragPreviewStore.getState().setPreview([a], 3, "card");
    useDragPreviewStore.getState().setPreview([], 0, "card");
    expect(useDragPreviewStore.getState().preview).toEqual([]);
    expect(useDragPreviewStore.getState().selectionCount).toBe(0);
  });

  it("setting the same preview content swaps the array reference but matches by content", () => {
    const a = stubPrinting();
    useDragPreviewStore.getState().setPreview([a], 1, "copy");
    const first = useDragPreviewStore.getState().preview;
    useDragPreviewStore.getState().setPreview([a], 1, "copy");
    const second = useDragPreviewStore.getState().preview;
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});
