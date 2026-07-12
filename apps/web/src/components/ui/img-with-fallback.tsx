import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useState } from "react";

/**
 * An `<img>` that renders `fallback` instead once the image fails to load
 * (missing on the server, network error), so a broken image looks the same as
 * a missing one. The failure is keyed by `src`, so a reused instance that
 * receives a new URL attempts it fresh. The ref covers fetches that settle
 * before React attaches the error listener (e.g. under SSR) — a broken image
 * reports `complete` with naturalWidth 0.
 *
 * @returns The image, or the fallback once the source has failed.
 */
export function ImgWithFallback({
  fallback,
  alt,
  ...imgProps
}: ComponentPropsWithoutRef<"img"> & { fallback: ReactNode; alt: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const { src } = imgProps;
  if (src !== undefined && src === failedSrc) {
    return fallback;
  }
  const markFailed = () => setFailedSrc(src ?? null);
  return (
    <img
      {...imgProps}
      alt={alt}
      ref={(node) => {
        if (node?.complete && node.naturalWidth === 0) {
          markFailed();
        }
      }}
      onError={markFailed}
    />
  );
}
