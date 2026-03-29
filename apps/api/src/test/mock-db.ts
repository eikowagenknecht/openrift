/* oxlint-disable
   no-empty-function,
   curly,
   no-undefined,
   eqeqeq,
   no-negated-condition,
   typescript/ban-types,
   typescript/no-unsafe-function-type,
   jsdoc/require-returns,
   unicorn/no-useless-undefined
   -- test infrastructure: proxy mock intentionally uses loose patterns */

/**
 * Proxy-based Kysely database mock for unit testing repositories.
 *
 * Chains all method calls and returns the provided result from terminal methods
 * (execute, executeTakeFirst, executeTakeFirstOrThrow). Callback arguments
 * (in .where(), .select(), .onConflict(), .leftJoin(), etc.) are automatically
 * invoked to maximise code coverage of callback bodies.
 */
export function createMockDb(executeResult: unknown = []) {
  function chain(): any {
    const callFn = (fn: unknown) => {
      try {
        (fn as Function)(chain());
      } catch {
        /* ignore callback errors — we only care about executing the code */
      }
    };
    const invokeArg = (arg: unknown) => {
      if (typeof arg === "function") {
        callFn(arg);
      } else if (Array.isArray(arg)) {
        for (const item of arg) {
          if (typeof item === "function") {
            callFn(item);
          }
        }
      }
    };
    const invoke = (...args: unknown[]) => {
      for (const arg of args) {
        invokeArg(arg);
      }
      return chain();
    };
    return new Proxy(invoke, {
      get(_, prop) {
        if (prop === "execute") {
          return async (...args: unknown[]) => {
            for (const arg of args) {
              if (typeof arg === "function") {
                try {
                  await (arg as Function)(chain());
                } catch {
                  /* ignore */
                }
              }
            }
            return executeResult;
          };
        }
        if (prop === "executeTakeFirst") {
          return () =>
            Promise.resolve(Array.isArray(executeResult) ? executeResult[0] : executeResult);
        }
        if (prop === "executeTakeFirstOrThrow") {
          return () => {
            const val = Array.isArray(executeResult) ? executeResult[0] : executeResult;
            return val != null ? Promise.resolve(val) : Promise.reject(new Error("no result"));
          };
        }
        if (prop === "destroy") return () => Promise.resolve();
        // Kysely raw SQL (.execute(db)) calls db.executeQuery() internally
        if (prop === "executeQuery") {
          return () =>
            Promise.resolve({
              rows: Array.isArray(executeResult) ? executeResult : [],
              ...(typeof executeResult === "object" && executeResult !== null
                ? (executeResult as Record<string, unknown>)
                : {}),
            });
        }
        // Prevent Proxy from being treated as a thenable
        if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
        if (typeof prop === "symbol") return undefined;
        return invoke;
      },
      apply(_, __, args) {
        for (const arg of args) {
          invokeArg(arg);
        }
        return chain();
      },
    });
  }
  return chain();
}
