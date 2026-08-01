/**
 * Video constraints for the scanner's camera.
 *
 * The pipeline consumes roughly seven frames a second on a fast device and
 * fewer on a slow one, but a camera left to its own devices happily delivers
 * 60. Measured on a Pixel 1 (2026-08-01): `frameRate: 60`, against a pipeline
 * spending ~150 ms per frame at best. Every frame past what the loop grabs is
 * sensor and ISP work thrown away, and on a phone that thermally throttles
 * that waste comes back as heat. The scan handoff has the same device
 * degrading from ~0.15 s/frame to 0.8-1.7 s/frame once hot, so the discarded
 * frames are not free.
 *
 * The cap is therefore tied to the encoder self-bench rather than applied
 * everywhere: a device fast enough to keep up has no throttling problem to
 * solve, and a lower ceiling there would only make the preview choppier.
 */

/** Frame rate ceiling for a device the encoder self-bench measured as slow. */
export const SLOW_DEVICE_MAX_FRAME_RATE = 30;

/**
 * Build the `video` constraints for `getUserMedia`.
 *
 * @param slowDevice Whether the encoder self-bench measured this device as
 *   slow, which is what earns the frame rate cap.
 * @returns The constraints to request.
 */
export function scannerVideoConstraints(slowDevice: boolean): MediaTrackConstraints {
  return {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    // A hard max, not an ideal: the point is a guarantee, and a browser is
    // free to ignore an ideal it finds inconvenient. The caller retries
    // without the cap if some camera turns out to have no mode at or below it.
    ...(slowDevice ? { frameRate: { max: SLOW_DEVICE_MAX_FRAME_RATE } } : {}),
  };
}

/**
 * Whether a `getUserMedia` rejection means no camera mode fits the request.
 *
 * Worth distinguishing from every other failure: it is the one rejection the
 * scanner can do something about, by dropping the frame rate cap and asking
 * again. A permission denial or a missing camera would fail identically the
 * second time.
 *
 * @returns True for the modern and legacy overconstrained error names.
 */
export function isOverconstrainedError(thrown: unknown): boolean {
  // DOMException is checked separately for the same reason as in
  // camera-error.ts: it only gained Error in its prototype chain in later
  // engine versions, and jsdom's still lacks it.
  if (!(thrown instanceof Error || thrown instanceof DOMException)) {
    return false;
  }
  return thrown.name === "OverconstrainedError" || thrown.name === "ConstraintNotSatisfiedError";
}
