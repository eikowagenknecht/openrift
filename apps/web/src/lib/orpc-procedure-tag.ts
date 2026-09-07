/**
 * oRPC rebuilds errors from JSON, so every fault has the same message and
 * stack regardless of endpoint. This tag is how Sentry tells them apart.
 * Kept standalone so the SSR Sentry bootstrap avoids the oRPC client graph.
 */

const ORPC_PROCEDURE_KEY = "orpcProcedure";

export function tagProcedure(error: unknown, path: readonly string[]): void {
  if (typeof error !== "object" || error === null) {
    return;
  }
  Object.defineProperty(error, ORPC_PROCEDURE_KEY, {
    value: path.join("."),
    configurable: true,
  });
}

export function taggedProcedure(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const procedure = (error as Record<string, unknown>)[ORPC_PROCEDURE_KEY];
  return typeof procedure === "string" ? procedure : undefined;
}
