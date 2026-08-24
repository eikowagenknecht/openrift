/**
 * The message of a thrown value, with a fallback for anything that is not an
 * Error.
 *
 * Callers reach for this instead of inlining the conditional: the React
 * Compiler cannot lower a conditional (ternary, `??`, `?.`) that sits inside a
 * try/catch, and bails out of the whole component or hook when it finds one.
 * A module-level call keeps the catch block branch-free.
 *
 * Anything that is not an Error gets the fallback, including a plain object
 * carrying a `message` — a server-fn error that lost its prototype crossing the
 * boundary needs the wider handling in `stale-bundle-reload.ts`, not this.
 *
 * @returns The thrown value's message, or `fallback` when it is not an Error.
 */
export function errorText(thrown: unknown, fallback: string): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  return fallback;
}
