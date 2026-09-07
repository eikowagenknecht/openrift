import { createLazyFileRoute } from "@tanstack/react-router";

import { ProsePage } from "@/components/prose-page";

export const Route = createLazyFileRoute("/_app/developers")({
  component: DevelopersPage,
});

// Paths stay relative to the site origin: getSiteUrl() reads window.location.origin
// on the client and can mismatch the SSR value, causing a hydration error.
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
        A free, public, read-only API for Riftbound card data: the same API this site runs on, plain
        JSON over HTTPS, no key or authentication. All paths are relative to this site&apos;s
        origin.
      </p>

      <h2>Identify your client</h2>
      <p>
        Send a descriptive <code>User-Agent</code> naming your project and a way to reach you, for
        example <code>MyDeckTool/1.0 (you@example.com)</code>. It is how I can warn you before a
        breaking change. Browser apps can&apos;t override <code>User-Agent</code> and are identified
        by their <code>Origin</code> header instead.
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

      <h2>Sending tournament decklists</h2>
      <p>
        The one write endpoint is <code>POST /api/v1/ingest/deck-check</code>: it lets a
        registration website or organizer tool push entrant decklists into a tournament&apos;s deck
        check, so judges can verify decks in OpenRift and players can view their own submitted list.
        Unlike the read API it requires an API key, minted by the tournament&apos;s host. The{" "}
        <a href="/help/tournament-decklist-api">Tournament Decklist API</a> help article covers how
        keys are issued, the payload, push semantics, claim links, and rate limits.
      </p>

      <h2>Caching and ETags</h2>
      <p>
        Responses are cacheable. Catalog-style endpoints (catalog, cards, prices, sets, rules) are
        served with <code>Cache-Control: public, max-age=3600, stale-while-revalidate=86400</code>;
        promos use <code>max-age=300</code> and products <code>max-age=60</code>. Every read
        endpoint also returns an <code>ETag</code> header. Cache for at least <code>max-age</code>{" "}
        and revalidate with <code>If-None-Match</code> (the catalog is large).
      </p>

      <h2>Attribution</h2>
      <p>
        If you display this data, please link card names to their OpenRift card pages (
        <code>/cards/{"{card-slug}"}</code>).
      </p>
    </ProsePage>
  );
}
