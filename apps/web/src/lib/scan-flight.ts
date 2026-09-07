import { centeredGuideQuad } from "@openrift/shared/scan";

import { clamp } from "@/lib/math";

export interface FlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FlightTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

export interface FlightPlan {
  start: FlightRect;
  from: FlightTransform;
  to: FlightTransform;
  durationMs: number;
}

export const FLIGHT_MIN_DURATION_MS = 320;
export const FLIGHT_MAX_DURATION_MS = 520;
export const FLIGHT_FULL_DISTANCE_PX = 900;

const SNAPSHOT_LONG_SIDE_PX = 200;
const SNAPSHOT_QUALITY = 0.7;

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizeRect(rect: FlightRect): FlightRect {
  return {
    x: finite(rect.x),
    y: finite(rect.y),
    width: Math.max(0, finite(rect.width)),
    height: Math.max(0, finite(rect.height)),
  };
}

export function guideRectIn(box: { width: number; height: number }): FlightRect {
  const width = Math.max(0, finite(box.width));
  const height = Math.max(0, finite(box.height));
  if (width === 0 || height === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const [topLeft, topRight, bottomRight] = centeredGuideQuad(width, height);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: topRight.x - topLeft.x,
    height: bottomRight.y - topRight.y,
  };
}

export function flightDurationFor(distance: number): number {
  const travelled = Math.max(0, finite(distance));
  const t = clamp(travelled / FLIGHT_FULL_DISTANCE_PX, 0, 1);
  return Math.round(FLIGHT_MIN_DURATION_MS + (FLIGHT_MAX_DURATION_MS - FLIGHT_MIN_DURATION_MS) * t);
}

export function planFlight(source: FlightRect, target: FlightRect): FlightPlan {
  const start = normalizeRect(source);
  const end = normalizeRect(target);

  const measurable = start.width > 0 && start.height > 0 && end.width > 0 && end.height > 0;
  const scale = measurable ? Math.min(end.width / start.width, end.height / start.height) : 1;

  const translateX = end.x + end.width / 2 - (start.x + start.width / 2);
  const translateY = end.y + end.height / 2 - (start.y + start.height / 2);

  return {
    start,
    from: { translateX: 0, translateY: 0, scale: 1 },
    to: { translateX, translateY, scale },
    durationMs: flightDurationFor(Math.hypot(translateX, translateY)),
  };
}

/**
 * Maps a rect from a video element's displayed box onto the video's pixel
 * grid, accounting for `object-fit: cover` cropping the frame to a centred
 * square of the box.
 */
export function videoCropRect(
  rect: FlightRect,
  displayed: { width: number; height: number },
  video: { width: number; height: number },
): FlightRect | null {
  const box = normalizeRect({ x: 0, y: 0, ...displayed });
  const frame = normalizeRect({ x: 0, y: 0, ...video });
  if (box.width === 0 || box.height === 0 || frame.width === 0 || frame.height === 0) {
    return null;
  }

  const source = normalizeRect(rect);
  const scale = Math.max(box.width / frame.width, box.height / frame.height);
  const offsetX = (box.width - frame.width * scale) / 2;
  const offsetY = (box.height - frame.height * scale) / 2;

  const left = clamp((source.x - offsetX) / scale, 0, frame.width);
  const top = clamp((source.y - offsetY) / scale, 0, frame.height);
  const right = clamp((source.x + source.width - offsetX) / scale, 0, frame.width);
  const bottom = clamp((source.y + source.height - offsetY) / scale, 0, frame.height);

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { x: left, y: top, width, height };
}

export function snapshotVideoRect(
  video: HTMLVideoElement,
  rect: FlightRect,
  longSide = SNAPSHOT_LONG_SIDE_PX,
): string | null {
  const box = video.getBoundingClientRect();
  const crop = videoCropRect(
    rect,
    { width: box.width, height: box.height },
    { width: video.videoWidth, height: video.videoHeight },
  );
  if (crop === null) {
    return null;
  }

  const shrink = Math.min(1, longSide / Math.max(crop.width, crop.height));
  const width = Math.max(1, Math.round(crop.width * shrink));
  const height = Math.max(1, Math.round(crop.height * shrink));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    return null;
  }
  try {
    context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", SNAPSHOT_QUALITY);
  } catch {
    return null;
  }
}
