import { trace } from "@opentelemetry/api";
import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

const HISTOGRAM_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

const INVALID_TRACE_ID = "00000000000000000000000000000000";

const getActiveTraceId = (): string | undefined => {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  return traceId && traceId !== INVALID_TRACE_ID ? traceId : undefined;
};

type MetricLabels = "method" | "status" | "ok" | "route";

interface MetricsOptions {
  collectDefaults?: boolean;
}

interface Metrics {
  registerMetrics: MiddlewareHandler;
  printMetrics: (c: Context) => Promise<Response>;
  registry: Registry<typeof Registry.OPENMETRICS_CONTENT_TYPE>;
}

/**
 * Hono middleware that records per-request prom metrics with OpenMetrics
 * exemplars carrying the active OTel `traceID`. Grafana's prometheus
 * datasource is wired to surface exemplars as clickable trace links into
 * Tempo, so latency/throughput panels offer a one-click jump to the exact
 * trace that produced an outlier point.
 *
 * @param options - Pass `collectDefaults: false` in tests to skip the
 * Bun runtime collectors.
 * @returns The middleware, the /metrics handler, and the registry.
 */
export const createMetricsMiddleware = (options: MetricsOptions = {}): Metrics => {
  const registry = new Registry<typeof Registry.OPENMETRICS_CONTENT_TYPE>();
  registry.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);

  if (options.collectDefaults ?? true) {
    collectDefaultMetrics({ register: registry });
  }

  const requestDuration = new Histogram<MetricLabels>({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "status", "ok", "route"],
    buckets: HISTOGRAM_BUCKETS,
    enableExemplars: true,
    registers: [registry],
  });

  const requestsTotal = new Counter<MetricLabels>({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "status", "ok", "route"],
    enableExemplars: true,
    registers: [registry],
  });

  const registerMetrics = createMiddleware(async (c, next) => {
    const start = process.hrtime.bigint();
    try {
      await next();
    } finally {
      const labels = {
        method: c.req.method,
        route: c.req.routePath,
        status: c.res.status.toString(),
        ok: String(c.res.ok),
      };
      const traceId = getActiveTraceId();
      // prom-client types exemplarLabels with the metric's label union, but
      // exemplar labels are independent at runtime. `as never` lets us pass
      // `traceID` without polluting the metric label types.
      const exemplarLabels = traceId ? ({ traceID: traceId } as never) : undefined;
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      requestDuration.observe({ labels, value: durationSec, exemplarLabels });
      requestsTotal.inc({ labels, value: 1, exemplarLabels });
    }
  });

  const printMetrics = async (c: Context): Promise<Response> => {
    const body = await registry.metrics();
    return c.body(body, 200, { "Content-Type": registry.contentType });
  };

  return { registerMetrics, printMetrics, registry };
};
