import { defineConfig, devices } from "@playwright/test";

import { WEB_BASE_URL } from "./src/helpers/constants.js";

export default defineConfig({
  testDir: "./src/tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  globalSetup: "./src/global-setup.ts",
  globalTeardown: "./src/global-teardown.ts",

  use: {
    baseURL: WEB_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testDir: "./src",
      testMatch: /auth\.setup\.ts/u,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  // Servers start in global-setup.ts: webServer config evaluates before
  // globalSetup, so the temp database URL it creates wouldn't be visible here.
});
