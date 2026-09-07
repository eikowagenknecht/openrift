/** Frosted only under `data-frosted`: `backdrop-filter` measurably drops scroll frames on /cards. */
export const STICKY_SURFACE =
  "bg-background [[data-frosted]_&]:bg-background/80 [[data-frosted]_&]:backdrop-blur-lg";

/** As {@link STICKY_SURFACE}, on the popover palette. */
export const STICKY_SURFACE_POPOVER =
  "bg-popover [[data-frosted]_&]:bg-popover/90 [[data-frosted]_&]:backdrop-blur-sm";
