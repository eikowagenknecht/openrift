/**
 * Server-side OpenTelemetry SDK bootstrap. Imported as a side-effect from
 * src/server.ts (after instrument.server.mjs) so the global tracer
 * provider is registered before any spans are created.
 *
 * Server-only — Vite/TanStack Start splits the bundles, so this file (and
 * its `@opentelemetry/sdk-node` dependency) never end up in the browser.
 *
 * When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset the SDK is not started and
 * tracer instances default to the OTel NoOp implementation, leaving the
 * rest of the codebase running unchanged. Auto-instrumentation is
 * intentionally omitted to match the API; we instrument the boundaries we
 * care about by hand (request middleware + fetch helper).
 */

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

let sdk: NodeSDK | undefined;

if (endpoint) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "openrift-web",
      [ATTR_SERVICE_VERSION]: process.env.BUILD_ID ?? "dev",
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/u, "")}/v1/traces`,
    }),
    instrumentations: [],
  });
  sdk.start();

  // Flush remaining spans on shutdown so a Ctrl-C in dev doesn't drop the
  // last few seconds of traces. Mirrors the API's approach: re-raise after
  // shutdown so we don't suppress runtime termination and leave orphaned
  // dev processes holding the port.
  const shutdown = async (signal: NodeJS.Signals) => {
    try {
      await sdk?.shutdown();
    } catch {
      // best-effort
    }
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
