/**
 * The procedure an oRPC call was made against, recorded on the error it threw.
 *
 * oRPC rebuilds the API's error from JSON, so every fault arrives with the same
 * message and the same two-frame stack no matter which endpoint produced it.
 * This tag is what lets Sentry tell them apart. It lives alone so the SSR
 * Sentry bootstrap can read it without pulling in the oRPC client graph.
 */

const ORPC_PROCEDURE_KEY = "orpcProcedure";

/**
 * Records the failing procedure on an error, in place.
 * @returns Nothing; a non-object error is left alone.
 */
export function tagProcedure(error: unknown, path: readonly string[]): void {
  if (typeof error !== "object" || error === null) {
    return;
  }
  Object.defineProperty(error, ORPC_PROCEDURE_KEY, {
    value: path.join("."),
    configurable: true,
  });
}

/**
 * Reads the tag back.
 * @returns The dotted procedure path, or undefined for anything untagged.
 */
export function taggedProcedure(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const procedure = (error as Record<string, unknown>)[ORPC_PROCEDURE_KEY];
  return typeof procedure === "string" ? procedure : undefined;
}
