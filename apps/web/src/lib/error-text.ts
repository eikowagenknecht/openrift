/**
 * React Compiler bails on a component with a conditional inside try/catch.
 * Call this from the catch block; don't inline one.
 */
export function errorText(thrown: unknown, fallback: string): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  return fallback;
}
