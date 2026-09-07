import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

// /rules is included because the e2e seed sets its feature flag to TRUE.
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
  // feature_flags is global state shared by parallel test workers, so this
  // file never toggles the `rules` flag off to cover the redirect branch.
  test("renders the rules page", async ({ page }) => {
    await page.goto("/rules");
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
    // Heading text is relative ("Today", "3 days ago"); assert on <time>'s datetime instead.
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
