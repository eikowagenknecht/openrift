/**
 * Default <head> metadata extracted from index.html.
 *
 * Ready to plug into TanStack Start's `routeOptions.head` when we migrate.
 * Until then this module is unused — it exists purely as a preparation step.
 */

export const defaultHead = {
  meta: [
    { charSet: "utf8" as const },
    { name: "viewport", content: "width=device-width, initial-scale=1.0" },
    { name: "description", content: "Fast. Open. Ad-free. A Riftbound companion." },
    { name: "theme-color", content: "#1d1538" },
    { name: "impact-site-verification", content: "5a360cf2-9e98-4886-8c05-4e2e1a39ce0e" },
  ],
  links: [
    { rel: "preconnect", href: "https://cmsassets.rgpub.io" },
    { rel: "icon", type: "image/png", sizes: "64x64", href: "/favicon-64x64.png" },
    { rel: "icon", type: "image/webp", href: "/logo.webp" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon-180x180.png" },
  ],
  title: "OpenRift",
};
