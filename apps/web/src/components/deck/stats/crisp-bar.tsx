import { Rectangle } from "recharts";

// crispEdges avoids a sub-pixel seam between adjacent stacked segments.
export function CrispBar(props: Record<string, unknown>) {
  return <Rectangle {...props} shapeRendering="crispEdges" />;
}

export function CrispBarActive(props: Record<string, unknown>) {
  return <Rectangle {...props} shapeRendering="crispEdges" opacity={0.8} />;
}

const MISS_OPACITY = 0.3;

/**
 * Splits one stack segment into the part matching another chart's focus and
 * the filtered-out remainder, reading both counts off the row (`hitKey` and
 * `fullKey`) so the series stays whole and only the paint changes.
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
