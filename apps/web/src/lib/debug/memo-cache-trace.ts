// Dev-only React Compiler diagnostic. Intercepts React's
// "previous cache was allocated with size X but size Y was requested" warning
// and dumps the call stack at the moment it fires. The top frames name the
// compiled function whose `_c(Y)` landed on a memoCache slot previously
// written at a different size — usually a `"use memo"` helper called behind
// a conditional in its caller, or compiled differently across render passes.
//
// The entire module body is wrapped in `if (import.meta.env.DEV)`. In
// production Vite replaces `import.meta.env.DEV` with `false`, the block is
// dead code, and the bundler strips it — nothing ships to prod beyond an
// empty module file.
//
// Only fires on the specific React-Compiler size-mismatch warning; all other
// console.error calls pass through untouched.
if (import.meta.env.DEV) {
  const original = console.error;
  console.error = function interceptedError(...args: unknown[]): void {
    const first = args[0];
    if (typeof first === "string" && first.includes("previous cache was allocated with size")) {
      const [allocated, requested] = args.slice(1);
      // oxlint-disable-next-line unicorn/error-message -- throwaway Error just for its stack
      const stack = new Error("stack").stack ?? "(no stack)";
      const trimmed = stack
        .split("\n")
        .slice(1)
        .filter((line) => !line.includes("memo-cache-trace") && line.trim() !== "");
      // oxlint-disable no-console -- dev-only diagnostic printed to browser console
      console.log(
        `[react-compiler-mismatch] allocated=${String(allocated)} requested=${String(requested)}`,
      );
      for (const line of trimmed.slice(0, 15)) {
        console.log(`  ${line.trim()}`);
      }
      // oxlint-enable no-console
    }
    return Reflect.apply(original, this, args);
  };
}
