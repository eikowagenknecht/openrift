import { useEffect, useRef, useState } from "react";

/** Rendered geometry and paint facts read from a live DOM element. */
export interface ElementSpec {
  width: number;
  height: number;
  radius: string;
  cornerCut: boolean;
  fontSize: string;
  background: string;
  color: string;
  hasText: boolean;
}

export function observeThemeChanges(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-palette"],
  });
  return () => observer.disconnect();
}

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

export function parsePx(value: string): number {
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed values carry px units; Number() would reject them
  return Number.parseFloat(value);
}

function roundPx(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Square elements show both dimensions; content-sized ones show height only,
 * since their width is driven by the label, not the component.
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
 * Attach `ref` to a plain wrapper around the component under inspection;
 * `spec` stays null until the client measures its first element child.
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
