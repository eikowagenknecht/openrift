import { QRCodeSVG } from "qrcode.react";

import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// Every QR the product shows on screen goes through here. The two settings
// below are the reason this component exists rather than call sites reaching
// for QRCodeSVG directly — both have defaults that are wrong for this app, and
// both are invisible when they go wrong (the code simply fails to scan on some
// phones, which nobody notices in review).

/**
 * Error-correction level for every on-screen QR. `M` recovers from ~15% damage
 * against `L`'s ~7%, which is the margin a phone screen read at an angle across
 * a table actually needs. qrcode.react defaults to `L`, so this must be set.
 */
const QR_LEVEL = "M";

/**
 * Quiet-zone modules baked into the SVG. qrcode.react defaults to 0, which
 * leaves scanners with no margin when the plate is tight against other content.
 */
const QR_MARGIN = 2;

interface QrCodeProps {
  /** The URL (or text) the code encodes. */
  value: string;
  /** Edge length of the code in pixels, excluding the plate's padding. */
  size?: number;
  /** Accessible name, e.g. "QR code for the registration link". */
  label?: string;
  className?: string;
}

/**
 * A scannable QR code on its own light plate.
 *
 * The white plate is not styling: QR modules need a light background and a
 * quiet zone to scan, and the app's dark theme supplies neither. Keeping the
 * plate inside the primitive is what stops a call site from rendering a code
 * that looks fine in light mode and silently stops scanning in dark mode.
 *
 * @returns The plated QR node.
 */
export function QrCode({ value, size = 160, label, className }: QrCodeProps) {
  return (
    <div className={cn("w-fit rounded-md bg-white p-3", className)}>
      <QRCodeSVG
        value={value}
        size={size}
        level={QR_LEVEL}
        marginSize={QR_MARGIN}
        role="img"
        aria-label={label ?? "QR code"}
      />
    </div>
  );
}
