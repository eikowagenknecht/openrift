/**
 * `startTracing` must run before any module obtains a tracer.
 * Auto-instrumentation is omitted: under Bun, `import-in-the-middle`/`require-in-the-middle` have no
 * loader hooks to patch HTTP, pg, etc. Assembled from individual `@opentelemetry/sdk-*` packages,
 * not `sdk-node`: its CJS `require("@opentelemetry/context-async-hooks")` 500s the web
 * server's bundled build (no `node_modules` beside it). Node-only: keep behind a server-only import.
 */

import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export function startTracing(serviceName: string): NodeTracerProvider | undefined {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    return undefined;
  }

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? serviceName,
      [ATTR_SERVICE_VERSION]: process.env.BUILD_ID ?? "dev",
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          // Tempo's OTLP HTTP receiver expects POSTs to /v1/traces.
          url: `${endpoint.replace(/\/$/u, "")}/v1/traces`,
        }),
      ),
    ],
  });
  provider.register({ contextManager: new AsyncLocalStorageContextManager().enable() });

  // Re-raising after removing the listener restores default signal handling; otherwise the process
  // stays alive holding its port, since registering SIGINT/SIGTERM suppresses the runtime's default.
  const shutdown = async (signal: NodeJS.Signals) => {
    try {
      await provider.shutdown();
    } catch {
      // best-effort
    }
    process.removeAllListeners(signal);
    process.kill(process.pid, signal);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  return provider;
}
