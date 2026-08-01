/**
 * Diagnostics for the live camera track.
 *
 * The scanner asks for `facingMode: environment` and takes whatever the
 * browser hands back. On a multi-camera phone that can be the main camera, the
 * ultra-wide, or something else entirely, and nothing in the app has so far
 * reported which. This reads the track's own account of itself so the choice
 * can be measured on real devices before anything tries to automate it.
 *
 * Settings and capabilities are flattened to string pairs rather than typed
 * field by field. `zoom`, `torch`, `focusMode` and `exposureMode` come from the
 * Image Capture spec, not lib.dom's `MediaTrackCapabilities`, and which of them
 * exist varies per browser and per device. Displaying whatever the browser
 * reports is the point of a diagnostics panel, so anything unanticipated shows
 * up instead of being silently dropped.
 */

/** One video input as `enumerateDevices` reported it. */
interface CameraDevice {
  deviceId: string;
  /** Empty string until a camera permission has been granted. */
  label: string;
}

/** A flattened `key: value` row from track settings or capabilities. */
export type CameraInfoEntry = readonly [key: string, value: string];

export interface CameraInfo {
  /** Every `videoinput`, not just back-facing ones: which label means what is exactly what is being measured. */
  devices: CameraDevice[];
  /** The live track's label, or null when the browser reports none. */
  label: string | null;
  /** `getSettings()`, flattened and sorted by key. */
  settings: CameraInfoEntry[];
  /** `getCapabilities()`, flattened and sorted by key. Empty when unsupported. */
  capabilities: CameraInfoEntry[];
  /** False when the browser has no `getCapabilities` on media stream tracks. */
  capabilitiesSupported: boolean;
}

/**
 * Render one settings or capabilities value as display text.
 *
 * Capabilities mix three shapes: plain scalars, string arrays for enumerated
 * modes, and `{ min, max, step }` ranges for numeric knobs like zoom.
 *
 * @returns The value as a single line of text.
 */
export function formatTrackValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? "(none)" : value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const range = value as { min?: unknown; max?: unknown; step?: unknown };
    if (typeof range.min === "number" || typeof range.max === "number") {
      const min = typeof range.min === "number" ? String(range.min) : "?";
      const max = typeof range.max === "number" ? String(range.max) : "?";
      const step = typeof range.step === "number" ? ` (step ${range.step})` : "";
      return `${min} to ${max}${step}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Flatten a settings or capabilities object into sorted display rows.
 *
 * Undefined values are dropped: a browser that omits a field says nothing by
 * omitting it, and a row reading "undefined" is noise. `null` and `false` are
 * kept, because a device reporting `torch: false` is a real answer.
 *
 * @returns One entry per defined key, sorted by key.
 */
export function flattenTrackInfo(info: object | undefined): CameraInfoEntry[] {
  if (!info) {
    return [];
  }
  return Object.entries(info)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, formatTrackValue(value)] as CameraInfoEntry)
    .toSorted((left, right) => left[0].localeCompare(right[0]));
}

/**
 * Read what the browser reports about a live camera stream.
 *
 * Never rejects. Every part is optional in some browser, and a diagnostics
 * panel that throws is worse than one reporting nothing, so each read degrades
 * to an empty result on its own.
 *
 * @returns The track's devices, settings and capabilities, or null when the
 *   stream carries no video track.
 */
export async function readCameraInfo(stream: MediaStream): Promise<CameraInfo | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    return null;
  }

  // Labels are empty until a camera permission has been granted, so this is
  // only worth calling once a stream is open.
  let devices: CameraDevice[] = [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = all
      .filter((device) => device.kind === "videoinput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label }));
  } catch {
    devices = [];
  }

  const capabilitiesSupported = typeof track.getCapabilities === "function";
  let capabilities: MediaTrackCapabilities | undefined;
  if (capabilitiesSupported) {
    try {
      capabilities = track.getCapabilities();
    } catch {
      capabilities = undefined;
    }
  }

  let settings: MediaTrackSettings | undefined;
  try {
    settings = track.getSettings();
  } catch {
    settings = undefined;
  }

  return {
    devices,
    label: track.label === "" ? null : track.label,
    settings: flattenTrackInfo(settings),
    capabilities: flattenTrackInfo(capabilities),
    capabilitiesSupported,
  };
}
