import { trace } from "@opentelemetry/api";
import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

const HISTOGRAM_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10,
];

/** Rejects a skewed clock or a forged header rather than recording it as a reading. */
const MAX_PLAUSIBLE_UPSTREAM_DELAY_SECONDS = 120;

function upstreamDelaySeconds(header: string | undefined, now: number): number | undefined {
  if (header === undefined) {
    return undefined;
  }
  // nginx `$msec` is seconds with millisecond resolution.
  const startedMs = Number(header) * 1000;
  if (!Number.isFinite(startedMs)) {
    return undefined;
  }
  const delta = (now - startedMs) / 1000;
  return delta >= 0 && delta <= MAX_PLAUSIBLE_UPSTREAM_DELAY_SECONDS ? delta : undefined;
}

const INVALID_TRACE_ID = "00000000000000000000000000000000";

const getActiveTraceId = (): string | undefined => {
  const traceId = trace.getActiveSpan()?.spanContext().traceId;
  return traceId && traceId !== INVALID_TRACE_ID ? traceId : undefined;
};

type MetricLabels = "method" | "status" | "ok" | "route";

interface RenderPoolStats {
  queued: number;
  active: number;
  workers: number;
}

interface MetricsOptions {
  collectDefaults?: boolean;
  /** Sampled at scrape time; omitted in tests and in any process without a render pool. */
  renderStats?: () => RenderPoolStats;
}

interface Metrics {
  registerMetrics: MiddlewareHandler;
  printMetrics: (c: Context) => Promise<Response>;
  registry: Registry<typeof Registry.OPENMETRICS_CONTENT_TYPE>;
}

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

  // Time lost before Hono runs at all, which http_request_duration_seconds
  // cannot see. Paired with `proxy_set_header X-Request-Start` in nginx/web.conf.
  const upstreamDelay = new Histogram<MetricLabels>({
    name: "http_upstream_delay_seconds",
    help: "Seconds between the proxy forwarding a request and the API beginning to handle it",
    labelNames: ["method", "route"],
    buckets: HISTOGRAM_BUCKETS,
    registers: [registry],
  });

  const { renderStats } = options;
  if (renderStats) {
    const renderGauge = (name: string, help: string, read: (stats: RenderPoolStats) => number) =>
      new Gauge({
        name,
        help,
        registers: [registry],
        collect() {
          this.set(read(renderStats()));
        },
      });
    renderGauge("render_pool_queued", "Render jobs waiting for a free worker", (s) => s.queued);
    renderGauge(
      "render_pool_active",
      "Render jobs currently assigned to a worker",
      (s) => s.active,
    );
    renderGauge("render_pool_workers", "Configured render worker count", (s) => s.workers);
  }

  const registerMetrics = createMiddleware(async (c, next) => {
    const start = process.hrtime.bigint();
    const delaySec = upstreamDelaySeconds(c.req.header("x-request-start"), Date.now());
    try {
      await next();
    } finally {
      const labels = {
        method: c.req.method,
        route: routePath(c),
        status: c.res.status.toString(),
        ok: String(c.res.ok),
      };
      const traceId = getActiveTraceId();
      // prom-client types exemplarLabels with the metric's label union; `as never`
      // passes `traceID` without polluting the metric label types.
      const exemplarLabels = traceId ? ({ traceID: traceId } as never) : undefined;
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      requestDuration.observe({ labels, value: durationSec, exemplarLabels });
      requestsTotal.inc({ labels, value: 1, exemplarLabels });
      if (delaySec !== undefined) {
        upstreamDelay.observe({ method: labels.method, route: labels.route }, delaySec);
      }
    }
  });

  const printMetrics = async (c: Context): Promise<Response> => {
    const body = await registry.metrics();
    return c.body(body, 200, { "Content-Type": registry.contentType });
  };

  return { registerMetrics, printMetrics, registry };
};
