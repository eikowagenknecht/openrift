/* oxlint-disable import/no-nodejs-modules -- config file needs fs/path */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

// Load DATABASE_URL from .env so globalSetup can create the temp DB
const envPath = resolve(import.meta.dirname ?? ".", "../../.env");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replaceAll(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env not found — integration tests will skip
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.integration.test.ts"],
    exclude: ["src/db/migrations/migrations.integration.test.ts"],
    globalSetup: ["src/test/vitest-global-setup.ts"],
    setupFiles: ["src/test/vitest-setup.ts"],
    pool: "forks",
    fileParallelism: false,
    coverage: {
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/db/migrations/**",
        "src/test/**",
        "src/**/*.test.ts",
        "src/**/*.integration.test.ts",
      ],
    },
  },
});
