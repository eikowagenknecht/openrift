import { Rectangle } from "recharts";

/**
 * Bar shape that disables anti-aliasing on horizontal/vertical edges so
 * adjacent stacked segments meet on a whole pixel and don't show a sub-pixel
 * seam where their boundary lands on a fractional pixel.
 * @returns A Rectangle with shape-rendering set to crispEdges.
 */
export function CrispBar(props: Record<string, unknown>) {
  return <Rectangle {...props} shapeRendering="crispEdges" />;
}

/**
 * Active (hovered) variant of CrispBar with reduced opacity.
 * @returns A Rectangle with crispEdges rendering and hover opacity.
 */
export function CrispBarActive(props: Record<string, unknown>) {
  return <Rectangle {...props} shapeRendering="crispEdges" opacity={0.8} />;
}
