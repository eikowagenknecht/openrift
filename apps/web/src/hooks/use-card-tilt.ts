import { useEffect, useRef } from "react";

interface CardTiltOptions {
  mode: "pointer" | "none";
  enabled: boolean;
  maxTilt?: number;
}

interface CardTiltResult {
  containerRef: React.RefCallback<HTMLElement>;
  innerRef: React.RefCallback<HTMLElement>;
}

export function useCardTilt({ mode, enabled, maxTilt = 8 }: CardTiltOptions): CardTiltResult {
  const containerElRef = useRef<HTMLElement | null>(null);
  const innerElRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);

  const containerRef = (node: HTMLElement | null) => {
    containerElRef.current = node;
  };

  const innerRef = (node: HTMLElement | null) => {
    innerElRef.current = node;
  };

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
      inner.style.transition = "transform 0s";
    };

    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        // Clamped: a scrolled parent can move the card away without firing pointerleave.
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

        const rotateY = (x - 0.5) * maxTilt * 2;
        const rotateX = (0.5 - y) * maxTilt * 2;

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
      inner.style.transition = "transform 0.4s ease-out";
      el.style.setProperty("--foil-rotate-x", "0deg");
      el.style.setProperty("--foil-rotate-y", "0deg");
      el.style.setProperty("--foil-bg-x", "50%");
      el.style.setProperty("--foil-bg-y", "50%");
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

  return {
    containerRef,
    innerRef,
  };
}
