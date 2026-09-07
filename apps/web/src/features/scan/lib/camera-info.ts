/**
 * Diagnostics for the live camera track: which label a multi-camera phone
 * gives the track the scanner ends up with (`facingMode: environment`),
 * plus its raw settings and capabilities for judging on real devices.
 */

interface CameraDevice {
  deviceId: string;
  label: string;
}

export type CameraInfoEntry = readonly [key: string, value: string];

export interface CameraInfo {
  devices: CameraDevice[];
  label: string | null;
  settings: CameraInfoEntry[];
  capabilities: CameraInfoEntry[];
  capabilitiesSupported: boolean;
}

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

// Undefined fields are dropped (the browser omitted them); null/false are
// kept as real reported values (e.g. `torch: false`).
export function flattenTrackInfo(info: object | undefined): CameraInfoEntry[] {
  if (!info) {
    return [];
  }
  return Object.entries(info)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, formatTrackValue(value)] as CameraInfoEntry)
    .toSorted((left, right) => left[0].localeCompare(right[0]));
}

// Never rejects: each field is optional in some browser and degrades to an
// empty result on its own.
export async function readCameraInfo(stream: MediaStream): Promise<CameraInfo | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) {
    return null;
  }

  // Labels are empty until camera permission has been granted.
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
