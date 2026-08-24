import { CARD_ASPECT } from "@openrift/shared/scan";

import { clamp } from "@/lib/math";

/** An axis-aligned rectangle. Coordinate space depends on the caller. */
export interface FlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One end of a flight, expressed as values `element.animate()` can consume. */
interface FlightTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

/** Everything the flight layer needs to animate one card into the tray. */
export interface FlightPlan {
  /** Where the fixed-position element is placed before the animation runs. */
  start: FlightRect;
  /** The transform at the start of the flight (always the identity). */
  from: FlightTransform;
  /** The transform at the end of the flight, relative to {@link start}. */
  to: FlightTransform;
  durationMs: number;
}

/** Shortest flight, used when source and target already overlap. */
export const FLIGHT_MIN_DURATION_MS = 320;
/** Longest flight. A scan run is a pile of cards, so this stays brisk. */
export const FLIGHT_MAX_DURATION_MS = 520;
/** Centre-to-centre distance at which a flight takes the full duration. */
export const FLIGHT_FULL_DISTANCE_PX = 900;

/** Long side of a snapshot in pixels — big enough to read, small enough to keep. */
const SNAPSHOT_LONG_SIDE_PX = 200;
/** JPEG quality for snapshots. */
const SNAPSHOT_QUALITY = 0.7;

/**
 * Coerces a possibly-missing or non-finite measurement to a usable number.
 *
 * @returns The value, or 0 when it is NaN or infinite.
 */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Drops non-finite coordinates and negative extents from a caller-supplied rect.
 *
 * @returns A rect whose numbers are all finite and whose extents are >= 0.
 */
function normalizeRect(rect: FlightRect): FlightRect {
  return {
    x: finite(rect.x),
    y: finite(rect.y),
    width: Math.max(0, finite(rect.width)),
    height: Math.max(0, finite(rect.height)),
  };
}

/**
 * The centred card-shaped guide rect inside a displayed video box, in that
 * box's own coordinates.
 *
 * Mirrors `guideQuadFor` in `use-card-scanner.ts`: the outline is 70% of the
 * box height, or 90% of its width when that portrait card would overflow
 * sideways (which is what happens on the desktop 16:9 preview).
 *
 * @returns The guide rect, or a zero rect when the box has no area.
 */
export function guideRectIn(box: { width: number; height: number }): FlightRect {
  const width = Math.max(0, finite(box.width));
  const height = Math.max(0, finite(box.height));
  if (width === 0 || height === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let cardHeight = 0.7 * height;
  let cardWidth = cardHeight * CARD_ASPECT;
  if (cardWidth > 0.9 * width) {
    cardWidth = 0.9 * width;
    cardHeight = cardWidth / CARD_ASPECT;
  }
  return {
    x: (width - cardWidth) / 2,
    y: (height - cardHeight) / 2,
    width: cardWidth,
    height: cardHeight,
  };
}

/**
 * How long a flight over `distance` pixels should take. Longer trips get more
 * time so the motion reads as one throw, but the range is narrow — the user is
 * working through a pile and every extra millisecond is a card not scanned.
 *
 * @returns A duration in milliseconds, between the min and max constants.
 */
export function flightDurationFor(distance: number): number {
  const travelled = Math.max(0, finite(distance));
  const t = clamp(travelled / FLIGHT_FULL_DISTANCE_PX, 0, 1);
  return Math.round(FLIGHT_MIN_DURATION_MS + (FLIGHT_MAX_DURATION_MS - FLIGHT_MIN_DURATION_MS) * t);
}

/**
 * Plans a FLIP-style flight from a source rect to a target rect, both in
 * viewport coordinates.
 *
 * The element is placed at `start` with `position: fixed` and a centre
 * transform origin, then transformed to `to`. The scale is uniform and fits
 * the source inside the target, so a tray thumbnail of a different aspect
 * never squashes the card. A source or target with no area keeps scale 1 —
 * the card then just slides, which is better than vanishing.
 *
 * @returns The start box, both transforms, and a suggested duration.
 */
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
 * Maps a rect given in a video element's displayed box onto the video's own
 * pixel grid, accounting for `object-fit: cover` (the displayed area is a
 * centre crop of the frame, so part of the frame is off-box).
 *
 * The result is clipped to the frame, so a rect that hangs off the box yields
 * the visible part rather than an out-of-range crop.
 *
 * @returns The crop in video pixels, or null when either box has no area or
 * the rect lands entirely outside the frame.
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

/**
 * Grabs the current video frame inside `rect` (a rect in the video element's
 * displayed box) as a small JPEG data URL, for the flight layer to fly into
 * the tray.
 *
 * Touches the DOM, unlike the rest of this module. Returns null rather than
 * throwing when there is no frame yet, no 2D context, or the canvas is tainted
 * by a cross-origin source.
 *
 * @returns A `data:image/jpeg` URL, or null when no snapshot could be taken.
 */
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
