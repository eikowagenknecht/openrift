import { expect, test } from "../../fixtures/test.js";

test.describe("landing page", () => {
  test("renders the homepage with title and navigation", async ({ page }) => {
    await page.goto("/");

    // Main heading is visible
    await expect(page.getByRole("heading", { name: "OpenRift", level: 1 })).toBeVisible();

    // "Browse cards" link/button is visible
    await expect(page.getByRole("link", { name: /browse cards/iu })).toBeVisible();
  });

  test("navigates to the cards page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /browse cards/iu }).click();

    await expect(page).toHaveURL("/cards");
  });

  test("navigates to the signup page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /sign up/iu }).click();

    await expect(page).toHaveURL(/\/signup/u);
  });

  // There is no "navigate to login" test: the landing page renders no header,
  // and its two CTAs are "Browse cards" and "Sign up free". Reaching /login is
  // covered by tests/auth/login.spec.ts.

  test("redirects authenticated users to /cards", async ({ authenticatedPage: page }) => {
    // Pre-flight: confirm the session cookie is active for this context by
    // hitting a route that only loads for authenticated users. If this step
    // redirects to /login the storage state is stale and the real test below
    // could never pass either.
    await page.goto("/collections");
    await expect(page).toHaveURL("/collections");

    // Now the real assertion: going to / with an active session redirects to
    // /cards. Allow extra time in case the redirect is client-side after
    // hydration rather than at SSR.
    await page.goto("/");
    await expect(page).toHaveURL(/\/cards/u, { timeout: 15_000 });
  });

  test("shows the tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/the Riftbound app for you and your playgroup/iu)).toBeVisible();
  });

  test("shows the stats line with live card counts", async ({ page }) => {
    await page.goto("/");
    // Numbers animate from 0 up to the real values via useCountUp, so require
    // a non-zero leading digit — otherwise the assertion would pass on the
    // initial "0 cards · 0 printings" frame before data loads. The counts go
    // through toLocaleString, so allow thousands separators.
    await expect(
      page.getByText(/[1-9][\d,.]* cards · [1-9][\d,.]* printings · [\d,.]+ copies tracked/u),
    ).toBeVisible();
  });

  test("tapping the logo hints at the fan cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-fan-index="0"]')).toBeVisible();

    // Tapping the logo sets `hinting`, which swaps every fan card's border to
    // border-primary/50 for 400ms. Start waiting before the click: waitFor
    // reacts to DOM mutations, while an assertion polled on a fixed schedule
    // could sample either side of that window. The class carries a "/", which
    // a CSS class selector would need escaped — match the attribute instead.
    const hinted = page
      .locator('[data-fan-index="0"] [class*="border-primary/50"]')
      .waitFor({ state: "attached", timeout: 10_000 });
    await page.getByRole("button", { name: "OpenRift" }).click();
    await hinted;
  });

  test("renders the feature rows and the toolbox", async ({ page }) => {
    await page.goto("/");
    const sections = [
      "Every card, every printing",
      "Prices, side by side",
      "Collections, wishlists, tradelists",
      "Private groups",
      "Advanced deck building",
      "And a full toolbox",
    ];
    for (const section of sections) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }
  });

  test("feature rows navigate to their targets", async ({ page }) => {
    // Unauthenticated: collections/decks/groups redirect to
    // /login?redirect=%2Fcollections... so the target shows up URL-encoded in
    // the query string. Decode the URL before matching.
    const rows: { name: RegExp; url: RegExp }[] = [
      { name: /every card, every printing/iu, url: /\/cards/u },
      { name: /collections, wishlists, tradelists/iu, url: /\/collections/u },
      { name: /private groups/iu, url: /\/groups/u },
      { name: /advanced deck building/iu, url: /\/decks/u },
    ];
    for (const row of rows) {
      await page.goto("/");
      await page.getByRole("link", { name: row.name }).click();
      await expect.poll(() => decodeURIComponent(page.url())).toMatch(row.url);
    }
  });

  test("toolbox tiles navigate to their tools", async ({ page }) => {
    const tiles: { name: string; url: RegExp }[] = [
      { name: "Pack opener", url: /\/pack-opener/u },
      { name: "Rules reference", url: /\/rules/u },
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

    const discord = page.getByRole("link", { name: /discord/iu });
    await expect(discord).toHaveAttribute("target", "_blank");
    await expect(discord).toHaveAttribute("rel", "noreferrer");
    await expect(discord).toHaveAttribute("href", /discord\.gg/u);

    // GitHub link's accessible name is the commit hash, which is dynamic —
    // match by href instead.
    const github = page.locator('footer a[href*="github.com"]');
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(github).toHaveAttribute("rel", "noreferrer");
  });

  test("sets document title, description, and WebSite JSON-LD", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("OpenRift - Riftbound Card Collection Browser");

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /Riftbound/iu);

    // Playwright's text matchers (hasText, toHaveText) treat <script> as
    // non-visible and return empty text, so read textContent directly.
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

    // Click from inside the browser rather than with the mouse: the cards
    // overlap by design (each leans over its left neighbor), so a real click
    // at a card's center can land on the sibling stacked above it.
    await page.locator('[data-fan-index="0"] button').evaluate((button: HTMLElement) => {
      button.click();
    });

    // The collected card stays mounted for its 800ms fly-away, then unmounts.
    await expect(cards).toHaveCount(dealt - 1);
    await expect(page.locator('[data-fan-index="0"]')).toHaveCount(0);
  });

  test("minigame: collecting every card spins the logo and re-deals", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/");

    const cards = page.locator("[data-fan-index]");
    await expect(cards.first()).toBeVisible();
    const dealt = await cards.count();

    // The spin lasts 1000ms, starting 1300ms after the last collect (fly-away
    // plus the all-collected delay). Arm the wait before collecting so the
    // mutation is observed rather than polled for, which could miss it.
    const spun = page
      .locator('img[src*="logo-color.svg"].animate-logo-spin')
      .waitFor({ state: "attached", timeout: 15_000 });

    // Collect the whole hand inside the browser, a frame apart so React
    // commits each collect before the next click arrives.
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

    // After the spin the fan is re-keyed, so the full hand deals back in.
    await expect(cards).toHaveCount(dealt, { timeout: 15_000 });
  });
});
