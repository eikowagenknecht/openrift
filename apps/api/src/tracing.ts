/**
 * OpenTelemetry SDK bootstrap. Imported FIRST in index.ts (before any module
 * that obtains a tracer) so the global tracer provider is registered before
 * any spans are created. When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset the SDK
 * is not started; tracer instances default to the OTel NoOp implementation
 * and the rest of the codebase keeps working unchanged.
 *
 * Auto-instrumentation is intentionally omitted: under Bun, the Node loader
 * hooks that `import-in-the-middle` and `require-in-the-middle` rely on are
 * not available, so the auto-instrumentation packages do not patch HTTP, pg,
 * etc. correctly. The Hono middleware and Kysely dialect wrapper instrument
 * the two boundaries we care about by hand.
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
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "openrift-api",
      [ATTR_SERVICE_VERSION]: process.env.BUILD_ID ?? "dev",
    }),
    traceExporter: new OTLPTraceExporter({
      // Tempo's OTLP HTTP receiver expects POSTs to /v1/traces; the SDK
      // appends that path automatically when given the base endpoint.
      url: `${endpoint.replace(/\/$/u, "")}/v1/traces`,
    }),
    instrumentations: [],
  });
  sdk.start();

  // Flush remaining spans on shutdown so a Ctrl-C in dev doesn't drop the
  // last few seconds of traces. After flushing, restore the default handler
  // and re-raise — registering a SIGINT/SIGTERM listener otherwise suppresses
  // the runtime's default termination, leaving the process alive and holding
  // its port (orphans accumulate across `bun run dev` cycles).
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
