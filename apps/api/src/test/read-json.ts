/**
 * A response body read back in a test. Bun types `Response.json()` as
 * `unknown`, so every assertion against a body would otherwise need its own
 * cast. Route tests assert field by field against a shape the contract already
 * pins, so the default is deliberately permissive; pass an explicit type
 * argument to `readJson` where the exact shape is worth stating.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- see above; a recursive JSON type resolves to a union at every leaf and blocks ordinary property access
export type JsonBody = any;

/**
 * Reads and parses a JSON response body in a test.
 *
 * @returns The parsed body, typed as `T` (permissive by default).
 */
export async function readJson<T = JsonBody>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
