import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { planFlight } from "@/lib/scan-flight";
import type { FlightRect } from "@/lib/scan-flight";

/** One card in flight from the camera guide to the session tray. */
export interface ScanFlight {
  /** Stable for the lifetime of the flight; the key React and callbacks use. */
  id: string;
  /** A data URL snapshot of the locked card, from `snapshotVideoRect`. */
  image: string;
  /** Where the card starts, in viewport coordinates. */
  source: FlightRect;
}

/**
 * How many snapshots may be airborne at once. Each one is a data URL of a video
 * frame, and a fast scanner locks several cards a second, so the oldest are
 * retired early rather than left to pile up.
 */
const MAX_CONCURRENT_FLIGHTS = 4;

/** Slight overshoot at the arrival end, so the card settles instead of stopping. */
const FLIGHT_EASING = "cubic-bezier(0.34, 1.24, 0.64, 1)";

/** Fraction of the flight the card stays fully opaque before fading out. */
const FADE_START = 0.6;

/** Grace period after which a flight is retired even if `finish` never fires. */
const FINISH_GRACE_MS = 400;

/**
 * Reads the user's motion preference.
 *
 * @returns True when the user asked for reduced motion.
 */
function prefersReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Where a card flies when there is no target element (an empty session, or a
 * tray that is not mounted yet): the bottom centre of the viewport, shrunk,
 * which is where the tray sits on phones anyway.
 *
 * @returns A target rect in viewport coordinates.
 */
function fallbackTargetRect(source: FlightRect): FlightRect {
  const width = source.width * 0.35;
  const height = source.height * 0.35;
  const viewportWidth = globalThis.innerWidth ?? 0;
  const viewportHeight = globalThis.innerHeight ?? 0;
  return {
    x: (viewportWidth - width) / 2,
    y: viewportHeight - height * 1.5,
    width,
    height,
  };
}

/**
 * One in-flight snapshot. Mounts at its source rect and drives itself with the
 * Web Animations API, so no React state changes while it travels.
 *
 * The element is placed with `left`/`top` and animated with `transform` only,
 * which keeps the animated value a pure delta from the source rect and keeps
 * the flight off the layout path.
 *
 * @returns The fixed-position image element.
 */
function FlightCard({
  flight,
  targetRef,
  onEnd,
}: {
  flight: ScanFlight;
  targetRef: RefObject<HTMLElement | null>;
  onEnd: (id: string) => void;
}) {
  const nodeRef = useRef<HTMLImageElement>(null);
  const { id, source } = flight;

  // A flight is immutable once started: its snapshot and source rect are a
  // moment in time, and restarting it mid-air on a parent re-render would make
  // the card jump. So the effect runs once per id and reads the rest through
  // refs.
  const targetRefRef = useRef(targetRef);
  const onEndRef = useRef(onEnd);
  const sourceRef = useRef(source);

  // Mirrored in an effect rather than during render: writing a ref while
  // rendering makes the React Compiler bail out of the component.
  useEffect(() => {
    targetRefRef.current = targetRef;
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    const node = nodeRef.current;
    const start = sourceRef.current;
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      onEndRef.current(id);
    };

    // Reduced motion, or a browser without the Web Animations API: never show
    // the card. It renders transparent, so nothing flashes on the way out.
    if (node === null || prefersReducedMotion() || typeof node.animate !== "function") {
      finish();
      return;
    }

    const target = targetRefRef.current.current?.getBoundingClientRect();
    const plan = planFlight(
      start,
      target === undefined
        ? fallbackTargetRect(start)
        : { x: target.x, y: target.y, width: target.width, height: target.height },
    );
    const options: KeyframeAnimationOptions = { duration: plan.durationMs, fill: "forwards" };

    // Transform and opacity run as separate animations so the overshoot easing
    // applies across the whole path while the fade keeps its own late start.
    const move = node.animate(
      [
        {
          transform: `translate3d(${plan.from.translateX}px, ${plan.from.translateY}px, 0) scale(${plan.from.scale})`,
        },
        {
          transform: `translate3d(${plan.to.translateX}px, ${plan.to.translateY}px, 0) scale(${plan.to.scale})`,
        },
      ],
      { ...options, easing: FLIGHT_EASING },
    );
    const fade = node.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: FADE_START },
        { opacity: 0, offset: 1 },
      ],
      { ...options, easing: "linear" },
    );

    move.addEventListener("finish", finish);
    // A backgrounded tab can swallow the finish event; without a backstop the
    // snapshot's data URL would be held for the rest of the session.
    const timer = globalThis.setTimeout(finish, plan.durationMs + FINISH_GRACE_MS);

    return () => {
      globalThis.clearTimeout(timer);
      move.removeEventListener("finish", finish);
      move.cancel();
      fade.cancel();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one flight per id; the rest is read through refs
  }, [id]);

  return (
    <img
      ref={nodeRef}
      src={flight.image}
      alt=""
      className="fixed rounded-md opacity-0 shadow-lg ring-1 ring-white/25 will-change-transform"
      style={{
        left: `${source.x}px`,
        top: `${source.y}px`,
        width: `${source.width}px`,
        height: `${source.height}px`,
        transformOrigin: "center",
      }}
    />
  );
}

/**
 * Decoration over the scan page: flies a snapshot of each locked card from the
 * camera guide into the session tray, so the card in the user's hand is tied to
 * the row that appears.
 *
 * The layer takes rects, so it makes no assumption about where the camera or
 * the tray sit. It never intercepts input and is hidden from assistive tech.
 * Under `prefers-reduced-motion` nothing is drawn and each flight ends at once.
 *
 * @returns The fixed overlay, or null when nothing is in flight.
 */
export function ScanFlightLayer({
  flights,
  targetRef,
  onFlightEnd,
  maxConcurrent = MAX_CONCURRENT_FLIGHTS,
}: {
  /** Active flights, oldest first. The caller drops each one on `onFlightEnd`. */
  flights: readonly ScanFlight[];
  /** The element to fly into — typically the session tray's newest row. */
  targetRef: RefObject<HTMLElement | null>;
  /** Called once per flight when it lands, so the caller can release the image. */
  onFlightEnd: (id: string) => void;
  maxConcurrent?: number;
}) {
  const limit = Math.max(1, maxConcurrent);
  const visible = flights.slice(-limit);
  // Compared by value, not identity: the caller may hand a fresh array on every
  // render, and re-firing the callback for the same ids would be wasted work.
  const droppedKey = flights
    .slice(0, Math.max(0, flights.length - limit))
    .map((flight) => flight.id)
    .join("\n");

  const onFlightEndRef = useRef(onFlightEnd);
  // See FlightCard: ref writes belong in an effect, not in render.
  useEffect(() => {
    onFlightEndRef.current = onFlightEnd;
  });

  useEffect(() => {
    if (droppedKey === "") {
      return;
    }
    for (const id of droppedKey.split("\n")) {
      onFlightEndRef.current(id);
    }
  }, [droppedKey]);

  if (visible.length === 0) {
    return null;
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-60">
      {visible.map((flight) => (
        <FlightCard key={flight.id} flight={flight} targetRef={targetRef} onEnd={onFlightEnd} />
      ))}
    </div>
  );
}
