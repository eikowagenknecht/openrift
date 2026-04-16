import { expect, test } from "@playwright/test";

test.describe("root essentials", () => {
  test.describe("404 / unknown route", () => {
    test("renders header, not-found heading, Go home link, and footer", async ({ page }) => {
      await page.goto("/this-path-does-not-exist");

      await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();

      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toBeVisible();
      const headingText = await heading.textContent();
      expect(headingText?.trim()).toBeTruthy();

      const goHome = page.getByRole("link", { name: /go home/i });
      await expect(goHome).toBeVisible();
      await expect(goHome).toHaveAttribute("href", "/");

      await expect(page.getByRole("link", { name: "Legal Notice" })).toBeVisible();

      await goHome.click();
      await expect(page).toHaveURL("/");
    });

    test("different invalid paths render non-empty 404 copy", async ({ page }) => {
      await page.goto("/first-bogus-path");
      const first = await page.getByRole("heading", { level: 1 }).textContent();
      expect(first?.trim()).toBeTruthy();

      await page.goto("/second-bogus-path");
      const second = await page.getByRole("heading", { level: 1 }).textContent();
      expect(second?.trim()).toBeTruthy();
    });
  });

  test.describe("404 is not a redirect", () => {
    test("URL after load stays on the requested invalid path", async ({ page }) => {
      await page.goto("/does-not-exist");
      await expect(page).toHaveURL("/does-not-exist");
    });
  });

  test.describe("favicon + apple-touch-icon", () => {
    test("declares icon links and the assets return 200", async ({ page }) => {
      await page.goto("/");

      const pngIcon = page.locator('link[rel="icon"][type="image/png"][sizes="64x64"]');
      await expect(pngIcon).toHaveAttribute("href", "/favicon-64x64.png");

      const webpIcon = page.locator('link[rel="icon"][type="image/webp"]');
      await expect(webpIcon).toHaveAttribute("href", "/logo.webp");

      const appleIcon = page.locator('link[rel="apple-touch-icon"]');
      await expect(appleIcon).toHaveAttribute("href", "/apple-touch-icon-180x180.png");

      const faviconResponse = await page.request.get("/favicon-64x64.png");
      expect(faviconResponse.status()).toBe(200);

      const logoResponse = await page.request.get("/logo.webp");
      expect(logoResponse.status()).toBe(200);
    });
  });

  test.describe("viewport / charset / theme-color", () => {
    test("sets the standard root meta tags", async ({ page }) => {
      await page.goto("/");

      const charset = await page.evaluate(() => document.characterSet);
      expect(charset.toLowerCase()).toBe("utf-8");

      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
        "content",
        "width=device-width, initial-scale=1",
      );
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1d1538");
      await expect(page.locator('meta[name="impact-site-verification"]')).toHaveAttribute(
        "content",
        "5a360cf2-9e98-4886-8c05-4e2e1a39ce0e",
      );
    });
  });

  test.describe("default document title", () => {
    test("root sets the default title", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveTitle("OpenRift — Riftbound Card Collection Browser");
    });
  });

  test.describe("theme blocking script", () => {
    // Guards against FOUC regressions: the server inlines a synchronous script
    // that reads the theme cookie and, for "auto", checks prefers-color-scheme
    // before React hydrates. If this ever stops being inlined, light/dark users
    // would flash the wrong palette on first paint.
    test("inlines a matchMedia/theme-preference script in the document", async ({ page }) => {
      await page.goto("/");
      const html = await page.content();
      expect(html).toContain('pref="auto"');
      expect(html).toContain("matchMedia");
    });
  });

  test.describe("toaster mounted", () => {
    test("sonner region is in the DOM on the root route", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("region", { name: /notifications/i })).toBeAttached();
    });
  });

  test.describe("robots meta — preview vs prod", () => {
    test("non-preview builds do not set noindex on the root", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('meta[name="robots"][content*="nofollow"]')).toHaveCount(0);
    });
  });

  test.describe("manifest-like links", () => {
    test("no PWA manifest link present", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    });
  });
});
