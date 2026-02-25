import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolves and creates the dump output directory for a given source name. */
export function createDumpDir(callerUrl: string, name: string): string {
  const dir = dirname(fileURLToPath(callerUrl));
  const dumpDir = join(dir, "..", "data", `${name}-dump`);
  mkdirSync(dumpDir, { recursive: true });
  return dumpDir;
}

/** Writes data as pretty-printed JSON with a trailing newline. */
export function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

/** Runs an async main function with a standard error handler. */
export function runDump(main: () => Promise<void>): void {
  main().catch((error) => {
    console.error("Dump failed:", error.message);
    process.exit(1);
  });
}
