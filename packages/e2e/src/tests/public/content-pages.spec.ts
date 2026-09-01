import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

// Smoke check: each public content page returns 2xx and renders without
// throwing a client-side error. /rules is included because the e2e seed sets
// the rules feature flag to TRUE — see apps/api/src/test/fixtures/seed.sql.
const CONTENT_PATHS = [
  "/legal-notice",
  "/privacy-policy",
  "/support",
  "/rules",
  "/roadmap",
  "/changelog",
] as const;

test.describe("public content pages — smoke", () => {
  for (const path of CONTENT_PATHS) {
    test(`${path} loads without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("/legal-notice", () => {
  test("renders the page heading", async ({ page }) => {
    await page.goto("/legal-notice");
    await expect(page.getByRole("heading", { name: "Legal Notice", level: 1 })).toBeVisible();
  });

  test("sets document title and description meta", async ({ page }) => {
    await page.goto("/legal-notice");
    await expect(page).toHaveTitle("Legal Notice - OpenRift");
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", "Legal notice and imprint for OpenRift.");
  });

  test("links to the privacy policy", async ({ page }) => {
    await page.goto("/legal-notice");
    await page.getByRole("article").getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL("/privacy-policy");
  });
});

test.describe("/privacy-policy", () => {
  test("renders the page heading", async ({ page }) => {
    await page.goto("/privacy-policy");
    await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  });

  test("sets document title and description meta", async ({ page }) => {
    await page.goto("/privacy-policy");
    await expect(page).toHaveTitle("Privacy Policy - OpenRift");
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      "How OpenRift handles your data, cookies, and privacy.",
    );
  });

  test("external links open in a new tab with noreferrer", async ({ page }) => {
    await page.goto("/privacy-policy");
    const automattic = page.getByRole("link", { name: /automattic\.com\/privacy/u });
    await expect(automattic).toHaveAttribute("target", "_blank");
    await expect(automattic).toHaveAttribute("rel", "noreferrer");
  });

  test("does not set noindex (legal pages should be crawlable)", async ({ page }) => {
    await page.goto("/privacy-policy");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });
});

test.describe("/support", () => {
  test("renders the page heading", async ({ page }) => {
    await page.goto("/support");
    await expect(page.getByRole("heading", { name: "Support the Rift", level: 1 })).toBeVisible();
  });

  test("sets document title and description meta", async ({ page }) => {
    await page.goto("/support");
    await expect(page).toHaveTitle("Support - OpenRift");
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      "Get help with OpenRift. Report bugs, request features, or contact the developer.",
    );
  });

  test("Ko-fi and GitHub Sponsors links open in a new tab with noreferrer", async ({ page }) => {
    await page.goto("/support");

    const kofi = page.getByRole("link", { name: /ko-fi/iu });
    await expect(kofi).toHaveAttribute("target", "_blank");
    await expect(kofi).toHaveAttribute("rel", "noreferrer");
    await expect(kofi).toHaveAttribute("href", /ko-fi\.com/u);

    const sponsors = page.getByRole("link", { name: /sponsor on github/iu });
    await expect(sponsors).toHaveAttribute("target", "_blank");
    await expect(sponsors).toHaveAttribute("rel", "noreferrer");
    await expect(sponsors).toHaveAttribute("href", /github\.com\/sponsors/u);

    const discord = page.getByRole("link", { name: /join the discord/iu });
    await expect(discord).toHaveAttribute("target", "_blank");
    await expect(discord).toHaveAttribute("rel", "noreferrer");
  });
});

test.describe("/rules", () => {
  // The e2e seed (apps/api/src/test/fixtures/seed.sql) sets the `rules`
  // feature flag to TRUE, so the route renders rather than redirecting. We
  // intentionally do not toggle the flag off in this file: feature_flags is
  // global state and other parallel test workers would see the flip. The
  // redirect branch is covered by the route's beforeLoad logic (unit-tested
  // server-side) and would only need an e2e cover if the default ever flips.
  test("renders the rules page", async ({ page }) => {
    await page.goto("/rules");
    // /rules redirects to the default "core" kind.
    await expect(page).toHaveURL(/\/rules\/core$/u);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test("sets document title and description meta", async ({ page }) => {
    await page.goto("/rules");
    await expect(page).toHaveTitle("Core Rules - OpenRift");
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      "Read the official Riftbound core game rules with version history and keyword reference.",
    );
  });
});

test.describe("/roadmap", () => {
  test("renders the page heading", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page.getByRole("heading", { name: "Roadmap", level: 1 })).toBeVisible();
  });

  test("sets document title and description meta", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page).toHaveTitle("Roadmap - OpenRift");
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      "Every feature OpenRift has shipped so far, and how to shape what comes next.",
    );
  });
});

test.describe("/changelog", () => {
  // Read the topmost date from the live changelog file so the test stays
  // green when new entries are added — assert against whatever date currently
  // sits at the top, rather than a hardcoded one.
  const changelogPath = fileURLToPath(
    new URL("../../../../../apps/web/src/CHANGELOG.md", import.meta.url),
  );
  const changelog = readFileSync(changelogPath, "utf-8");
  const topDateMatch = changelog.match(/^## (?<date>\d{4}-\d{2}-\d{2})/mu);
  const topDate = topDateMatch?.groups?.date;
  if (topDate === undefined) {
    throw new Error("Could not find a `## YYYY-MM-DD` heading in CHANGELOG.md");
  }

  test("renders the page heading", async ({ page }) => {
    await page.goto("/changelog");
    await expect(page.getByRole("heading", { name: /what's new/iu, level: 1 })).toBeVisible();
  });

  test("shows the most recent changelog date", async ({ page }) => {
    await page.goto("/changelog");
    // The heading's visible text is relative wording ("Today", "3 days ago"),
    // so assert on the <time> element's machine-readable day instead — it says
    // the same thing without the test having to restate `formatRelativeDay`.
    await expect(page.locator(`time[datetime="${topDate}"]`).first()).toBeVisible();
  });

  test("sets document title and description meta", async ({ page }) => {
    await page.goto("/changelog");
    await expect(page).toHaveTitle("Changelog - OpenRift");
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute(
      "content",
      "Recent updates and new features in OpenRift.",
    );
  });
});
