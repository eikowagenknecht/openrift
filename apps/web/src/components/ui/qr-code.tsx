import { QR_DARK, QR_MARGIN, qrMatrix } from "@openrift/shared/qr";

import { cn } from "@/lib/utils";

// Hand-authored primitive (not shadcn-scaffolded).
//
// Every QR the product shows on screen goes through here, and the encoding
// itself goes through `@openrift/shared/qr` — the same module the share images
// and the printable binder sheet use, so a code scanned off the screen and one
// scanned off a printout are the same code. The settings that module fixes
// (error correction `M`, a 2-module quiet zone) are the reason both exist
// rather than call sites reaching for an encoder directly: both have defaults
// that are wrong for this app, and both are invisible when they go wrong (the
// code simply fails to scan on some phones, which nobody notices in review).

/**
 * An SVG path covering every dark module, in module units, offset by the quiet
 * zone. Horizontal runs are merged into one rectangle so the path stays short
 * enough to sit inline in the markup.
 * @returns The path's `d` attribute.
 */
function modulesPath(matrix: boolean[][]): string {
  const parts: string[] = [];
  for (const [row, cells] of matrix.entries()) {
    let start: number | null = null;
    for (let col = 0; col <= cells.length; col += 1) {
      const dark = cells[col] === true;
      if (dark && start === null) {
        start = col;
      }
      if (!dark && start !== null) {
        parts.push(`M${start + QR_MARGIN} ${row + QR_MARGIN}h${col - start}v1h-${col - start}z`);
        start = null;
      }
    }
  }
  return parts.join("");
}

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
  const matrix = qrMatrix(value);
  const extent = matrix.length + QR_MARGIN * 2;
  return (
    <div className={cn("w-fit rounded-md bg-white p-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${extent} ${extent}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={label ?? "QR code"}
      >
        <path d={modulesPath(matrix)} fill={QR_DARK} />
      </svg>
    </div>
  );
}
