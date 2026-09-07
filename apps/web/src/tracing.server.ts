/**
 * Imported as a side effect from src/server.ts, after instrument.server.mjs,
 * so the global tracer provider is registered before any spans are created.
 * Server-only: never bundled into the browser build.
 */

import { startTracing } from "@openrift/shared/otel-node";

startTracing("openrift-web");
