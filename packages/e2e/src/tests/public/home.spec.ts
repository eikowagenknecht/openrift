import { expect, test } from "../../fixtures/test.js";

test.describe("landing page", () => {
  test("renders the homepage with title and navigation", async ({ page }) => {
    await page.goto("/");

    // Main heading is visible
    await expect(page.getByRole("heading", { name: "OpenRift", level: 1 })).toBeVisible();

    // "Browse cards" link/button is visible
    await expect(page.getByRole("link", { name: /browse cards/i })).toBeVisible();
  });

  test("navigates to the cards page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /browse cards/i }).click();

    await expect(page).toHaveURL("/cards");
  });

  test("navigates to the signup page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /sign up/i }).click();

    await expect(page).toHaveURL(/\/signup/);
  });

  test("navigates to the login page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/login/);
  });

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
    await expect(page).toHaveURL(/\/cards/, { timeout: 15_000 });
  });

  test("shows the tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/open-source Riftbound collection tracker/i)).toBeVisible();
  });

  test("shows the stats line with live card counts", async ({ page }) => {
    await page.goto("/");
    // Numbers animate from 0 up to the real values via useCountUp, so require
    // non-zero digits — otherwise the assertion would pass on the initial
    // "0 cards · 0 printings" frame before data loads.
    await expect(page.getByText(/[1-9]\d* cards · [1-9]\d* printings/)).toBeVisible();
  });

  test("tapping the logo hints at scatter cards", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/");

    const firstCard = page.locator('[data-card-index="0"]');
    await expect(firstCard).toHaveCSS("opacity", "1");

    // The logo button has no accessible name (alt=""), so select it via the
    // image src. Clicking triggers the `hinting` state which adds
    // border-primary/40 to every CardShape button for 400ms.
    await page.locator('button:has(img[src*="logo.webp"])').click();
    await expect(firstCard.locator("button")).toHaveClass(/border-primary\/40/);
  });

  test("renders all four feature tiles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /every card, every printing/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /your collection, tracked/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /build with what you own/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /open, not locked in/i })).toBeVisible();
  });

  test("feature tiles navigate to their targets", async ({ page }) => {
    // Unauthenticated: collections/decks/import redirect to
    // /login?redirect=%2Fcollections... so the target shows up URL-encoded in
    // the query string. Decode the URL before matching.
    const tiles: { name: RegExp; url: RegExp }[] = [
      { name: /every card, every printing/i, url: /\/cards/ },
      { name: /your collection, tracked/i, url: /\/collections(?!\/import)/ },
      { name: /build with what you own/i, url: /\/decks/ },
      { name: /open, not locked in/i, url: /\/collections\/import/ },
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

    const discord = page.getByRole("link", { name: /discord/i });
    await expect(discord).toHaveAttribute("target", "_blank");
    await expect(discord).toHaveAttribute("rel", "noreferrer");
    await expect(discord).toHaveAttribute("href", /discord\.gg/);

    // GitHub link's accessible name is the commit hash, which is dynamic —
    // match by href instead.
    const github = page.locator('footer a[href*="github.com"]');
    await expect(github).toHaveAttribute("target", "_blank");
    await expect(github).toHaveAttribute("rel", "noreferrer");
  });

  test("sets document title, description, and WebSite JSON-LD", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("OpenRift — Riftbound Card Collection Browser");

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /Riftbound/i);

    // Playwright's text matchers (hasText, toHaveText) treat <script> as
    // non-visible and return empty text, so read textContent directly.
    const websiteJsonLd = page.locator('script[type="application/ld+json"]');
    await expect(websiteJsonLd).toHaveCount(1);
    const jsonLdContent = await websiteJsonLd.evaluate((el) => el.textContent);
    expect(jsonLdContent).toMatch(/"@type"\s*:\s*"WebSite"/);
  });

  test("minigame: collecting all visible cards spins the logo", async ({ page }) => {
    // Use a viewport where several cards land inside the scatter's visible area.
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/");

    // Wait for the first layout pass (wrappers fade from opacity-0 to 1).
    const firstCard = page.locator('[data-card-index="0"]');
    await expect(firstCard).toHaveCSS("opacity", "1");

    // Collect every currently-visible scatter card. Done inside the browser so
    // React commits between activate/collect clicks without Playwright round-
    // trips. Collecting a card that's in viewport but behind the hero blocker
    // panel is fine: it raises both gone.size and reachableCount by one, so
    // the "all collected" threshold still lines up.
    await page.evaluate(async () => {
      async function nextFrame() {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      }
      const visibleWrappers = [
        ...document.querySelectorAll<HTMLElement>("[data-card-index]"),
      ].filter((el) => Number(getComputedStyle(el).opacity) > 0.5);
      for (const wrapper of visibleWrappers) {
        const button = wrapper.querySelector<HTMLButtonElement>("button");
        if (!button) {
          continue;
        }
        button.click(); // activate
        await nextFrame();
        button.click(); // collect
        await nextFrame();
      }
    });

    // Once gone.size >= reachableCount, the scatter fires onAllCollected after
    // a 500ms debounce and the logo gets animate-logo-spin for 1000ms.
    const logo = page.locator('img[src*="logo.webp"]');
    await expect(logo).toHaveClass(/animate-logo-spin/);

    // After the spin, CardScatter is re-keyed and state resets, so the
    // collected counter should no longer be visible.
    await expect(page.getByText(/\d+ \/ \d+ collected/)).not.toBeVisible();

    // Fresh scatter mounts with flyIn=true — cards animate back in and
    // settle at opacity-1 again once the fly-in animation finishes.
    await expect(firstCard).toHaveCSS("opacity", "1");
  });

  test("minigame: collecting a scatter card shows the collected counter", async ({ page }) => {
    // Use a viewport tall/wide enough that the center-top scatter card (index 0
    // at 50%, 31.3% of the 8000×3000 canvas) lands inside the visible area and
    // above the hero blocker panel. At the default 1280×720 it's offscreen.
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/");

    // Scatter cards render with opacity-0 + pointer-events-none until the
    // layout effect marks them as visible and the 300ms transition completes.
    // Playwright's toBeVisible ignores opacity, so wait on computed opacity
    // directly — that's what actually gates the card being ready to click.
    const wrapper = page.locator('[data-card-index="0"]');
    const card = wrapper.locator("button");
    const foil = wrapper.locator(".bg-foil");
    await expect(wrapper).toHaveCSS("opacity", "1");

    // First click activates — the foil shimmer fades in to opacity-30.
    // force:true bypasses stability checks (cards have a continuous drift
    // animation, so they're never "stable" by Playwright's definition).
    // Waiting for the foil opacity change also gates the second click on a
    // committed render, so it's seen as a "collect" not another "activate".
    await card.click({ force: true });
    await expect(foil).toHaveCSS("opacity", "0.3");

    // Second click collects — the card flies away and the counter appears.
    await card.click({ force: true });
    await expect(page.getByText(/\d+ \/ \d+ collected/)).toBeVisible();
  });
});
