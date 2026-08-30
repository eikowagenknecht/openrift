/**
 * Server-side OpenTelemetry SDK bootstrap. Imported as a side-effect from
 * src/server.ts (after instrument.server.mjs) so the global tracer provider is
 * registered before any spans are created. The request middleware and the
 * fetch helper instrument the boundaries we care about by hand.
 *
 * Server-only — Vite/TanStack Start splits the bundles, so this file (and the
 * `@opentelemetry/sdk-node` dependency behind `@openrift/shared/otel-node`)
 * never end up in the browser.
 */

import { startTracing } from "@openrift/shared/otel-node";

startTracing("openrift-web");
