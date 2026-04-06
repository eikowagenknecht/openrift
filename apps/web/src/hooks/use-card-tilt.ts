import { useEffect, useRef, useState } from "react";

interface CardTiltOptions {
  mode: "pointer" | "none";
  enabled: boolean;
  maxTilt?: number;
}

interface CardTiltResult {
  containerRef: React.RefCallback<HTMLElement>;
  innerRef: React.RefCallback<HTMLElement>;
  style: React.CSSProperties;
  active: boolean;
}

export function useCardTilt({ mode, enabled, maxTilt = 8 }: CardTiltOptions): CardTiltResult {
  const containerElRef = useRef<HTMLElement | null>(null);
  const innerElRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);
  const [active, setActive] = useState(mode === "none");

  const containerRef = (node: HTMLElement | null) => {
    containerElRef.current = node;
  };

  const innerRef = (node: HTMLElement | null) => {
    innerElRef.current = node;
  };

  // Reset CSS vars + smooth transition when tilt is disabled
  useEffect(() => {
    if (enabled || mode === "none") {
      return;
    }
    const el = containerElRef.current;
    const inner = innerElRef.current;
    if (inner) {
      inner.style.transition = "transform 0.4s ease-out";
    }
    if (el) {
      el.style.setProperty("--foil-rotate-x", "0deg");
      el.style.setProperty("--foil-rotate-y", "0deg");
      el.style.setProperty("--foil-bg-x", "50%");
      el.style.setProperty("--foil-bg-y", "50%");
    }
  }, [enabled, mode]);

  // Pointer mode: attach DOM listeners directly
  useEffect(() => {
    if (!enabled || mode !== "pointer") {
      return;
    }
    const el = containerElRef.current;
    const inner = innerElRef.current;
    if (!el || !inner) {
      return;
    }

    const onEnter = () => {
      // Remove transition so movement is instant
      inner.style.transition = "transform 0s";
      setActive(true);
    };

    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        // Clamp to 0..1 — when a scrollable parent (e.g. the detail aside)
        // scrolls the card away from the pointer, pointerleave doesn't fire,
        // so the next pointermove can report coordinates outside the element.
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

        const rotateY = (x - 0.5) * maxTilt * 2; // -maxTilt..maxTilt
        const rotateX = (0.5 - y) * maxTilt * 2;

        // Map to percentage for foil gradient position
        const bgX = x * 100;
        const bgY = y * 100;

        el.style.setProperty("--foil-rotate-x", `${rotateX}deg`);
        el.style.setProperty("--foil-rotate-y", `${rotateY}deg`);
        el.style.setProperty("--foil-bg-x", `${bgX}%`);
        el.style.setProperty("--foil-bg-y", `${bgY}%`);
      });
    };

    const onLeave = () => {
      cancelAnimationFrame(rafRef.current);
      // Smooth reset with transition
      inner.style.transition = "transform 0.4s ease-out";
      el.style.setProperty("--foil-rotate-x", "0deg");
      el.style.setProperty("--foil-rotate-y", "0deg");
      el.style.setProperty("--foil-bg-x", "50%");
      el.style.setProperty("--foil-bg-y", "50%");
      setActive(false);
    };

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled, mode, maxTilt]);

  const isActive = enabled && (mode === "none" ? true : active);

  return {
    containerRef,
    innerRef,
    style: {},
    active: isActive,
  };
}
