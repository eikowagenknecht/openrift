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

/** Opacity of the portion of a segment filtered out by another chart's focus. */
const MISS_OPACITY = 0.3;

/**
 * Bar shape that splits one stack segment into the part matching another
 * chart's focus and the filtered-out remainder: the matching part keeps full
 * strength, the rest fades. Both counts are read off the row (`hitKey` and
 * `fullKey`), which is what lets the series stay whole — one Bar per stack, so
 * the tooltip, the column total and the stack order are identical to the
 * unfiltered chart, and only the paint changes.
 *
 * The matching part is drawn at the bottom of the segment, against the axis,
 * so the lit portions of a column stack up as one continuous block.
 * @returns The segment as one or two rectangles.
 */
export function SplitCrispBar(props: Record<string, unknown>) {
  const { hitKey, fullKey, payload, ...rectProps } = props as {
    hitKey?: string;
    fullKey?: string;
    payload?: Record<string, unknown>;
  } & Record<string, unknown>;
  const { y, height } = rectProps as { y?: number; height?: number };

  const full = Number(fullKey && payload ? (payload[fullKey] ?? 0) : 0);
  const hit = Number(hitKey && payload ? (payload[hitKey] ?? 0) : 0);

  // Nothing to split: no geometry yet, an empty segment, or everything matches.
  if (typeof y !== "number" || typeof height !== "number" || height <= 0 || full <= 0) {
    return <Rectangle {...rectProps} shapeRendering="crispEdges" />;
  }
  if (hit >= full) {
    return <Rectangle {...rectProps} shapeRendering="crispEdges" />;
  }
  if (hit <= 0) {
    return <Rectangle {...rectProps} shapeRendering="crispEdges" fillOpacity={MISS_OPACITY} />;
  }

  const hitHeight = height * (hit / full);
  const missHeight = height - hitHeight;
  return (
    <>
      <Rectangle
        {...rectProps}
        height={missHeight}
        shapeRendering="crispEdges"
        fillOpacity={MISS_OPACITY}
      />
      <Rectangle {...rectProps} y={y + missHeight} height={hitHeight} shapeRendering="crispEdges" />
    </>
  );
}
