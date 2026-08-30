/**
 * OpenTelemetry SDK bootstrap. Imported FIRST in index.ts (before any module
 * that obtains a tracer) so the global tracer provider is registered before
 * any spans are created. The Hono middleware and the Kysely dialect wrapper
 * instrument the two boundaries we care about by hand; see
 * `@openrift/shared/otel-node` for why auto-instrumentation is omitted.
 */

import { startTracing } from "@openrift/shared/otel-node";

startTracing("openrift-api");
