import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
    pool: "forks",
    fileParallelism: false,
    coverage: {
      provider: "istanbul",
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
