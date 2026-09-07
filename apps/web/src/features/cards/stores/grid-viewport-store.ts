import { create } from "zustand";

// Viewport facts, not preferences: useResponsiveColumns derives these on every
// resize and they mean nothing on the next visit. Kept out of the persisted
// display store so a resize doesn't wake every preference subscriber.
interface GridViewportState {
  physicalMax: number;
  physicalMin: number;
  autoColumns: number;
  setMeasurements: (measurements: {
    physicalMax: number;
    physicalMin: number;
    autoColumns: number;
  }) => void;
}

export const useGridViewportStore = create<GridViewportState>()((set) => ({
  physicalMax: 8,
  physicalMin: 1,
  autoColumns: 5,
  // One setter for all three: they're measured together, so writing them
  // together keeps a resize to a single store notification.
  setMeasurements: (measurements) =>
    set((state) =>
      state.physicalMax === measurements.physicalMax &&
      state.physicalMin === measurements.physicalMin &&
      state.autoColumns === measurements.autoColumns
        ? state
        : measurements,
    ),
}));
