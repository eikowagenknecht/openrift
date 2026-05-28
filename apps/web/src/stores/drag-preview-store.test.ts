import { beforeEach, describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { useDragPreviewStore } from "./drag-preview-store";

beforeEach(() => {
  useDragPreviewStore.setState({ preview: [] });
});

describe("useDragPreviewStore", () => {
  it("starts with an empty preview", () => {
    expect(useDragPreviewStore.getState().preview).toEqual([]);
  });

  it("setPreview replaces the preview array", () => {
    const a = stubPrinting();
    const b = stubPrinting();
    useDragPreviewStore.getState().setPreview([a, b]);
    expect(useDragPreviewStore.getState().preview).toEqual([a, b]);
  });

  it("setPreview with an empty list clears the preview", () => {
    const a = stubPrinting();
    useDragPreviewStore.getState().setPreview([a]);
    useDragPreviewStore.getState().setPreview([]);
    expect(useDragPreviewStore.getState().preview).toEqual([]);
  });

  it("setting the same preview content swaps the array reference but matches by content", () => {
    const a = stubPrinting();
    useDragPreviewStore.getState().setPreview([a]);
    const first = useDragPreviewStore.getState().preview;
    useDragPreviewStore.getState().setPreview([a]);
    const second = useDragPreviewStore.getState().preview;
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});
