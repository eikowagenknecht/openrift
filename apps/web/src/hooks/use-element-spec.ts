import { useEffect, useRef, useState } from "react";

/** Rendered geometry and paint facts read from a live DOM element. */
export interface ElementSpec {
  width: number;
  height: number;
  /** Computed border-radius, e.g. "6px", "50%", or "" when unset. */
  radius: string;
  /** True when the element is clipped (the corner-cut signature shape). */
  cornerCut: boolean;
  /** Computed font-size, e.g. "14px". */
  fontSize: string;
  /** Computed background-color. */
  background: string;
  /** Computed text color. */
  color: string;
  /** True when the element renders any text (spec lines omit font size otherwise). */
  hasText: boolean;
}

/**
 * Watches the root element for theme or palette flips (the `dark` class and
 * the `data-palette` attribute) and invokes the callback on each change.
 *
 * @returns A cleanup function that disconnects the observer.
 */
export function observeThemeChanges(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-palette"],
  });
  return () => observer.disconnect();
}

/**
 * Reads the rendered spec of an element: box size, radius, clip, font size,
 * and resolved colors. Measuring the live DOM means the numbers can never
 * drift from the styles that produced them.
 *
 * @returns The element's rendered spec.
 */
export function readElementSpec(element: Element): ElementSpec {
  const rect = element.getBoundingClientRect();
  const style = globalThis.getComputedStyle(element);
  return {
    width: rect.width,
    height: rect.height,
    radius: style.borderRadius,
    cornerCut: style.clipPath !== "" && style.clipPath !== "none",
    fontSize: style.fontSize,
    background: style.backgroundColor,
    color: style.color,
    hasText: (element.textContent ?? "").trim().length > 0,
  };
}

/**
 * Whether a computed color value is fully transparent (alpha 0), so swatches
 * can skip the background chip on ghost/outline/link variants.
 *
 * @returns True for transparent values like "rgba(0, 0, 0, 0)".
 */
export function isTransparentColor(value: string): boolean {
  if (value === "" || value === "transparent") {
    return true;
  }
  const inner = /^[a-z-]+\((?<components>.*)\)$/iu.exec(value)?.groups?.components;
  if (inner === undefined) {
    return false;
  }
  const parts = inner.split(/[\s,/]+/u).filter((part) => part !== "");
  // Three components (rgb/oklch without alpha) means opaque.
  if (parts.length < 4) {
    return false;
  }
  const raw = parts.at(-1) ?? "";
  const alpha = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
  return alpha === 0;
}

/**
 * Parses a computed length like "14px" to its number, NaN when unparseable.
 *
 * @returns The numeric part of the length.
 */
export function parsePx(value: string): number {
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed values carry px units; Number() would reject them
  return Number.parseFloat(value);
}

function roundPx(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Formats a measured spec as a compact caption, e.g. "32×32 · r 6 · text 14".
 * Square elements show both dimensions; content-sized ones show height only
 * (their width is driven by the label, not the component).
 *
 * @returns The caption string.
 */
export function formatSpecLine(spec: ElementSpec): string {
  const width = roundPx(spec.width);
  const height = roundPx(spec.height);
  const parts: string[] = [width === height ? `${width}×${height}` : `h ${height}`];
  if (spec.cornerCut) {
    parts.push("corner-cut");
  } else if (spec.radius.endsWith("%")) {
    parts.push(`r ${spec.radius}`);
  } else {
    const radius = parsePx(spec.radius);
    if (Number.isFinite(radius) && radius > 0) {
      parts.push(radius >= 999 ? "r full" : `r ${roundPx(radius)}`);
    }
  }
  if (spec.hasText) {
    const fontSize = parsePx(spec.fontSize);
    if (Number.isFinite(fontSize)) {
      parts.push(`text ${roundPx(fontSize)}`);
    }
  }
  return parts.join(" · ");
}

/**
 * Measures the first element child of the ref'd wrapper and keeps the spec
 * fresh across theme/palette flips. Attach `ref` to a plain wrapper around
 * the component under inspection; `spec` is null until the client measures.
 *
 * @returns The wrapper ref and the measured spec.
 */
export function useElementSpec<T extends HTMLElement = HTMLDivElement>(): {
  ref: React.RefObject<T | null>;
  spec: ElementSpec | null;
} {
  const ref = useRef<T | null>(null);
  const [spec, setSpec] = useState<ElementSpec | null>(null);

  useEffect(() => {
    const measure = () => {
      const target = ref.current?.firstElementChild;
      if (target) {
        setSpec(readElementSpec(target));
      }
    };
    measure();
    return observeThemeChanges(measure);
  }, []);

  return { ref, spec };
}
