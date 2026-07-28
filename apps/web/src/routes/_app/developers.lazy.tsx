import { createLazyFileRoute } from "@tanstack/react-router";

import { ProsePage } from "@/components/prose-page";

export const Route = createLazyFileRoute("/_app/developers")({
  component: DevelopersPage,
});

// All API paths on this page are relative to the site origin on purpose:
// rendering an absolute URL in the body would need getSiteUrl(), which reads
// window.location.origin on the client and can mismatch the SSR value (#418
// with our full-document hydration). Relative paths are correct on every
// deploy (prod, preview, dev) with zero hydration risk.
const ENDPOINTS = [
  {
    path: "/api/v1/catalog",
    description: "The full card catalog: every card, printing, and set in one payload.",
  },
  {
    path: "/api/v1/cards/{cardSlug}",
    description: "A single card with all of its printings, their sets, and containing products.",
  },
  {
    path: "/api/v1/prices",
    description: "Current price snapshots from TCGplayer, Cardmarket, and CardTrader.",
  },
  {
    path: "/api/v1/sets",
    description: "All sets with card and printing counts.",
  },
  {
    path: "/api/v1/rules",
    description: "Official rules documents by kind (core or tournament) and version.",
  },
  {
    path: "/api/v1/promos",
    description: "Promo distribution channels (events and products) with their printings.",
  },
  {
    path: "/api/v1/products",
    description: "Sealed products with their full card lists.",
  },
];

function DevelopersPage() {
  return (
    <ProsePage>
      <h1>Developers</h1>
      <p>
        OpenRift has a free, public, read-only API for Riftbound card data. It is the same API this
        site runs on: plain JSON over HTTPS, no API key and no authentication required. All paths
        below are relative to this site&apos;s origin.
      </p>

      <h2>Interactive documentation</h2>
      <p>
        The complete, always-current reference is the <a href="/api/doc">OpenAPI specification</a>,
        browsable in <a href="/api/ui">Swagger UI</a> where you can try every endpoint directly.
      </p>

      <h2>Read endpoints</h2>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map((endpoint) => (
            <tr key={endpoint.path}>
              <td>
                <code>{endpoint.path}</code>
              </td>
              <td>{endpoint.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Several of these have sub-endpoints (set details, per-printing price history, rules
        versions). The OpenAPI specification lists them all with their parameters and response
        schemas.
      </p>

      <h2>Caching and ETags</h2>
      <p>
        Responses are cacheable. Catalog-style endpoints (catalog, cards, prices, sets, rules) are
        served with <code>Cache-Control: public, max-age=3600, stale-while-revalidate=86400</code>;
        promos use <code>max-age=300</code> and products <code>max-age=60</code>. Every read
        endpoint also returns an <code>ETag</code> header. Please respect these headers in your
        client: cache responses for at least the <code>max-age</code>, and revalidate with{" "}
        <code>If-None-Match</code> so unchanged data comes back as a tiny{" "}
        <code>304 Not Modified</code> instead of the full payload (the catalog in particular is
        large).
      </p>

      <h2>Attribution</h2>
      <p>
        If you display data from this API, we&apos;d appreciate it if you link card names back to
        their OpenRift card pages at <code>/cards/{"{card-slug}"}</code> on this site. It is not
        required, but it helps people find the full card details and keeps this project visible.
      </p>
    </ProsePage>
  );
}
