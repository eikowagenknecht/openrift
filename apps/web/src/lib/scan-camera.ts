import { isOverconstrainedError, scannerVideoConstraints } from "@/lib/camera-constraints";

/** What opening the scanner's camera produced. */
interface CameraAcquisition {
  /** The opened stream, or null when every attempt was rejected. */
  stream: MediaStream | null;
  /** The rejection explaining a null stream; null on success. */
  failure: unknown;
}

/**
 * Open the scanner's camera, retrying once without the frame rate cap.
 *
 * The cap is a hard max, so a camera whose only mode runs above it would
 * refuse to open at all — on exactly the slow devices the cap is meant to
 * help. Retrying uncapped costs one extra call in a case that should never
 * happen, and turns a dead camera into a merely hot one. Any other rejection
 * (permission denied, no camera) would fail identically the second time, so
 * it is returned as-is.
 *
 * @param capFrameRate Whether the encoder self-bench asked for the slow-device
 *   frame rate cap.
 * @returns The stream, or the rejection that explains why there is none.
 */
export async function acquireScannerStream(capFrameRate: boolean): Promise<CameraAcquisition> {
  let stream: MediaStream | null = null;
  let failure: unknown = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: scannerVideoConstraints(capFrameRate),
    });
  } catch (cameraError) {
    failure = cameraError;
  }

  if (stream === null && capFrameRate && isOverconstrainedError(failure)) {
    console.log("[scan] no camera mode under the frame rate cap, retrying uncapped");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: scannerVideoConstraints(false),
      });
    } catch (retryError) {
      failure = retryError;
    }
  }

  return { stream, failure };
}
