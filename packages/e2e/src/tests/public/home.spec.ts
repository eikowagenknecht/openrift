import { expect, test } from "../../fixtures/test.js";

test.describe("landing page", () => {
  test("renders the homepage with title and navigation", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "OpenRift", level: 1 })).toBeVisible();

    await expect(page.getByRole("link", { name: /browse cards/iu }).first()).toBeVisible();
  });

  test("navigates to the cards page", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("link", { name: /browse cards/iu })
      .first()
      .click();

    await expect(page).toHaveURL("/cards");
  });

  test("navigates to the signup page", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("link", { name: /sign up/iu })
      .first()
      .click();

    await expect(page).toHaveURL(/\/signup/u);
  });

  // Reaching /login is covered by tests/auth/login.spec.ts; the landing page
  // has no login CTA.

  test("redirects authenticated users to /cards", async ({ authenticatedPage: page }) => {
    // Confirm the session cookie is active first: if this redirects to /login,
    // the storage state is stale and the real assertion below can't pass either.
    await page.goto("/collections");
    await expect(page).toHaveURL("/collections");

    await page.goto("/");
    await expect(page).toHaveURL(/\/cards/u, { timeout: 15_000 });
  });

  test("shows the tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/the Riftbound app for you and your playgroup/iu)).toBeVisible();
  });

  test("shows the stats line with live card counts", async ({ page }) => {
    await page.goto("/");
    // Numbers animate up from 0 on the frame clock, which crawls under parallel
    // load: wait for the line, then for a non-zero count to settle into it.
    const stats = page.getByText(/[\d,.]+ cards · [\d,.]+ printings · [\d,.]+ copies tracked/u);
    await expect(stats).toBeVisible({ timeout: 15_000 });
    await expect(stats).toHaveText(/[1-9][\d,.]* cards · [1-9][\d,.]* printings/u, {
      timeout: 15_000,
    });
  });

  test("tapping the logo hints at the fan cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-fan-index="0"]')).toBeVisible();

    // waitFor must be armed before the click, or the mutation can be missed to a poll race.
    // The class contains "/", so match via attribute selector, not a CSS class selector.
    const hinted = page
      .locator('[data-fan-index="0"] [class*="border-primary/50"]')
      .waitFor({ state: "attached", timeout: 10_000 });
    await page.getByRole("button", { name: "OpenRift" }).click();
    await hinted;
  });

  test("renders the feature showcase and the closing sections", async ({ page }) => {
    await page.goto("/");
    const sections = [
      "Scan cards with your camera",
      "A collection that keeps itself current",
      "See who has what you need",
      "Know what your cards are worth",
      "Switching? Bring your collection.",
      "And that's not even half of it",
      "Ready when you are.",
    ];
    for (const section of sections) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }
  });

  test("showcase rows navigate to their targets", async ({ page }) => {
    // Unauthenticated redirects put the target URL-encoded in the query string.
    const rows: { name: RegExp; url: RegExp }[] = [
      { name: /scan cards with your camera/iu, url: /\/scan/u },
      { name: /a collection that keeps itself current/iu, url: /\/collections/u },
      { name: /see who has what you need/iu, url: /\/groups/u },
      { name: /know what your cards are worth/iu, url: /\/cards/u },
    ];
    for (const row of rows) {
      await page.goto("/");
      await page.getByRole("link", { name: row.name }).click();
      await expect.poll(() => decodeURIComponent(page.url())).toMatch(row.url);
    }
  });

  test("chapter tiles open the feature tour", async ({ page }) => {
    const tiles: { name: RegExp; url: RegExp }[] = [
      { name: /^01 Collect/iu, url: /\/features#chapter-collect$/u },
      { name: /^05 Create/iu, url: /\/features#chapter-create$/u },
    ];
    for (const tile of tiles) {
      await page.goto("/");
      await page.getByRole("link", { name: tile.name }).click();
      await expect.poll(() => decodeURIComponent(page.url())).toMatch(tile.url);
    }
  });

  test("footer internal links navigate to their pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Legal Notice" }).click();
    await expect(page).toHaveURL("/legal-notice");

    await page.goto("/");
    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL("/privacy-policy");

    await page.goto("/");
    await page.getByRole("link", { name: "Support Us" }).click();
    await expect(page).toHaveURL("/support");
  });

  test("footer external links open in a new tab with noreferrer", async ({ page }) => {
    await page.goto("/");

    const discord = page.locator("footer").getByRole("link", { name: /discord/iu });
    await expect(discord).toHaveAttribute("target", "_blank");
    await expect(discord).toHaveAttribute("rel", "noreferrer");
    await expect(discord).toHaveAttribute("href", /discord\.gg/u);

    // Accessible name is the commit hash, which is dynamic; match by href.
    const github = page.locator('footer a[href*="github.com"]');
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(github).toHaveAttribute("rel", "noreferrer");
  });

  test("sets document title, description, and WebSite JSON-LD", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("OpenRift - Riftbound Card Collection Browser");

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /Riftbound/iu);

    // Playwright treats <script> as non-visible text, so read textContent directly.
    const jsonLdScripts = page.locator('script[type="application/ld+json"]');
    await expect(jsonLdScripts).toHaveCount(2);
    const jsonLdContents = await jsonLdScripts.allTextContents();
    expect(jsonLdContents.some((content) => /"@type"\s*:\s*"WebSite"/u.test(content))).toBe(true);
  });

  test("minigame: collecting a fan card removes it from the hand", async ({ page }) => {
    // Desktop width so the fan deals its full five cards, not the mobile three.
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/");

    const cards = page.locator("[data-fan-index]");
    await expect(cards.first()).toBeVisible();
    const dealt = await cards.count();
    expect(dealt).toBeGreaterThan(1);

    // Click via evaluate: the fan cards overlap, so a real mouse click at the
    // center can land on the sibling stacked above it.
    await page.locator('[data-fan-index="0"] button').evaluate((button: HTMLElement) => {
      button.click();
    });

    await expect(cards).toHaveCount(dealt - 1);
    await expect(page.locator('[data-fan-index="0"]')).toHaveCount(0);
  });

  test("minigame: collecting every card spins the logo and re-deals", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/");

    const cards = page.locator("[data-fan-index]");
    await expect(cards.first()).toBeVisible();
    const dealt = await cards.count();

    // Arm the wait before collecting so the mutation isn't missed to a poll race.
    const spun = page
      .locator('img[src*="logo-color.svg"].animate-logo-spin')
      .waitFor({ state: "attached", timeout: 15_000 });

    // A frame apart so React commits each collect before the next click.
    await page.evaluate(async () => {
      async function nextFrame() {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      }
      for (const wrapper of document.querySelectorAll<HTMLElement>("[data-fan-index]")) {
        wrapper.querySelector<HTMLButtonElement>("button")?.click();
        await nextFrame();
      }
    });

    await spun;

    await expect(cards).toHaveCount(dealt, { timeout: 15_000 });
  });
});
