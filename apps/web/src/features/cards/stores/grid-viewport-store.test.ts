import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGridViewportStore } from "@/features/cards/stores/grid-viewport-store";
import { createStoreResetter } from "@/test/store-helpers";

const reset = createStoreResetter(useGridViewportStore);

beforeEach(() => {
  reset();
});

afterEach(() => {
  reset();
});

describe("useGridViewportStore", () => {
  it("starts on the SSR-safe defaults", () => {
    const state = useGridViewportStore.getState();
    expect(state.physicalMax).toBe(8);
    expect(state.physicalMin).toBe(1);
    expect(state.autoColumns).toBe(5);
  });

  it("publishes a new measurement", () => {
    useGridViewportStore.getState().setMeasurements({
      physicalMax: 12,
      physicalMin: 2,
      autoColumns: 6,
    });

    const state = useGridViewportStore.getState();
    expect(state.physicalMax).toBe(12);
    expect(state.physicalMin).toBe(2);
    expect(state.autoColumns).toBe(6);
  });

  it("does not notify subscribers when the measurement is unchanged", () => {
    // ResizeObserver fires on scrollbar-width changes too, so an identical
    // re-publish is common; the toolbar controls shouldn't re-render for it.
    const measurement = { physicalMax: 6, physicalMin: 2, autoColumns: 4 };
    useGridViewportStore.getState().setMeasurements(measurement);

    const listener = vi.fn();
    const unsubscribe = useGridViewportStore.subscribe(listener);
    useGridViewportStore.getState().setMeasurements({ ...measurement });
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies when any single dimension moves", () => {
    useGridViewportStore.getState().setMeasurements({
      physicalMax: 6,
      physicalMin: 2,
      autoColumns: 4,
    });

    const listener = vi.fn();
    const unsubscribe = useGridViewportStore.subscribe(listener);
    useGridViewportStore.getState().setMeasurements({
      physicalMax: 6,
      physicalMin: 2,
      autoColumns: 5,
    });
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useGridViewportStore.getState().autoColumns).toBe(5);
  });
});
