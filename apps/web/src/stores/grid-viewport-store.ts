import { create } from "zustand";

/**
 * Card-grid measurements published by the active grid so the toolbar's column
 * controls can read them.
 *
 * These are viewport facts, not preferences: `useResponsiveColumns` derives
 * them from the measured container width on every resize, and they mean nothing
 * on the next visit. They lived in the display store, which is a persisted
 * preferences store, so every resize woke every preference subscriber (the
 * server sync among them) with a change that could never be saved. Keeping them
 * here means a resize only wakes the two toolbar controls that care.
 */
interface GridViewportState {
  /** Most columns the container can fit at the minimum card width. */
  physicalMax: number;
  /** Fewest columns the container can fit at the maximum card width. */
  physicalMin: number;
  /** Column count the breakpoint ladder picks when the user hasn't chosen one. */
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
