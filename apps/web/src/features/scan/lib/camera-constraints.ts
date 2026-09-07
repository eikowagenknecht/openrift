export const SLOW_DEVICE_MAX_FRAME_RATE = 30;

export function scannerVideoConstraints(slowDevice: boolean): MediaTrackConstraints {
  return {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    // A hard max: browsers may ignore an ideal constraint. Caller retries
    // without the cap if no mode fits.
    ...(slowDevice ? { frameRate: { max: SLOW_DEVICE_MAX_FRAME_RATE } } : {}),
  };
}

/** The one rejection the scanner can act on, by dropping the frame rate cap and retrying. */
export function isOverconstrainedError(thrown: unknown): boolean {
  // DOMException is checked separately, as in camera-error.ts: it only gained
  // Error in its prototype chain in later engine versions, and jsdom's still lacks it.
  if (!(thrown instanceof Error || thrown instanceof DOMException)) {
    return false;
  }
  return thrown.name === "OverconstrainedError" || thrown.name === "ConstraintNotSatisfiedError";
}
