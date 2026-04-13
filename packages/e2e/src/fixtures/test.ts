import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";

/**
 * Extended Playwright test fixture with pre-authenticated browser contexts.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/test.js';
 *   test('my test', async ({ authenticatedPage }) => { ... });
 *
 * @returns The extended test and expect objects.
 */
export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ".auth/user.json" });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ".auth/admin.json" });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
