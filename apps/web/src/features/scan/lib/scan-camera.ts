import {
  isOverconstrainedError,
  scannerVideoConstraints,
} from "@/features/scan/lib/camera-constraints";

interface CameraAcquisition {
  stream: MediaStream | null;
  failure: unknown;
}

/**
 * Retries once without the frame rate cap: the cap is a hard max, so a camera
 * whose only mode runs above it would otherwise refuse to open at all.
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
