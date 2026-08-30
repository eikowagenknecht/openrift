/**
 * OpenTelemetry tracing bootstrap, shared by the API and the web server. Call
 * `startTracing` FIRST, before any module that obtains a tracer, so the global
 * tracer provider is registered before any spans are created.
 *
 * When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset nothing is registered; tracer
 * instances default to the OTel NoOp implementation and the rest of the
 * codebase keeps working unchanged.
 *
 * Auto-instrumentation is intentionally omitted: under Bun, the Node loader
 * hooks that `import-in-the-middle` and `require-in-the-middle` rely on are
 * not available, so the auto-instrumentation packages do not patch HTTP, pg,
 * etc. correctly. Both apps instrument the boundaries they care about by hand.
 *
 * The provider is assembled here rather than through `@opentelemetry/sdk-node`
 * because the web server ships as a bundle with no `node_modules` beside it
 * (see the web stage in the Dockerfile). `sdk-node` is CJS that reaches its
 * context manager through a bare `require`, and a bundle that inlines it
 * without resolving that call carries a runtime
 * `require("@opentelemetry/context-async-hooks")` nothing can satisfy, which
 * 500s every SSR request. Importing each piece keeps the graph static, so what
 * the bundle needs is in it. Add new OTel pieces the same way.
 *
 * Node-only: the web app must keep it behind a server-only import.
 */

import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

/**
 * Start tracing and register shutdown flushing.
 *
 * @param serviceName - Fallback `service.name` when `OTEL_SERVICE_NAME` is unset.
 * @returns The registered provider, or undefined when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.
 */
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
          // Tempo's OTLP HTTP receiver expects POSTs to /v1/traces; the SDK
          // appends that path automatically when given the base endpoint.
          url: `${endpoint.replace(/\/$/u, "")}/v1/traces`,
        }),
      ),
    ],
  });
  provider.register({ contextManager: new AsyncLocalStorageContextManager().enable() });

  // Flush remaining spans on shutdown so a Ctrl-C in dev doesn't drop the last
  // few seconds of traces. After flushing, restore the default handler and
  // re-raise — registering a SIGINT/SIGTERM listener otherwise suppresses the
  // runtime's default termination, leaving the process alive and holding its
  // port (orphans accumulate across `bun run dev` cycles).
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
