/* oxlint-disable import/no-nodejs-modules -- setup file needs node:util */
/**
 * Vitest per-file setup: polyfills Bun-specific APIs that source code uses.
 */
import { isDeepStrictEqual } from "node:util";

if (globalThis.Bun === undefined) {
  (globalThis as any).Bun = {
    deepEquals: (a: unknown, b: unknown) => isDeepStrictEqual(a, b),
  };
}
