// Public Electric shape proxy for the card catalog (ADR-027 catalog vertical).
//
// The card catalog is public, read-only, and identical for every visitor, so
// these shapes carry NO `where` clause and NO per-user params — each exposes a
// whole syncable table. The table + column list is still pinned server-side:
// Electric's auth guidance is to never let the client choose the table, even
// for public data. A client can ask for "the printings shape"; it can never
// ask for "the users table".
//
// Unlike the authenticated proxy (per-user, `private, no-store`), these
// responses are shared-cacheable: the data is the same for everyone, so a CDN
// can serve one snapshot to all visitors. No `Vary` on auth.
//
// `printing_markers` is intentionally absent: `printings.marker_slugs` is the
// denormalized, trigger-maintained marker array, so the client resolves markers
// from that array against the `markers` shape without the join table.

import { Hono } from "hono";
import type { Context } from "hono";

import type { Variables } from "../../types.js";
import { forwardElectricShape } from "../../utils/electric-proxy.js";

interface PublicShapeDefinition {
  table: string;
  columns: string;
}

// One shape per syncable catalog table. Columns are the minimum the shared
// `assembleCatalogStaticParts` + the web client consume — created_at/updated_at
// and other non-catalog columns are deliberately omitted. Widening any column
// list means bumping the client's PERSISTED_SCHEMA_VERSION.
const PUBLIC_SHAPES = {
  cards: {
    table: "cards",
    columns: "id,slug,name,type,might,energy,power,might_bonus,keywords,tags,comment",
  },
  // Per-card domain + super-type rows. The materialized `mv_card_aggregates`
  // can't be a shape, so the client aggregates these base tables itself.
  cardDomains: {
    table: "card_domains",
    columns: "card_id,domain_slug,ordinal",
  },
  cardSuperTypes: {
    table: "card_super_types",
    columns: "card_id,super_type_slug",
  },
  printings: {
    table: "printings",
    columns:
      "id,card_id,set_id,short_code,rarity,art_variant,is_signed,finish,artist,public_code,printed_rules_text,printed_effect_text,flavor_text,printed_name,printed_year,language,marker_slugs,comment,canonical_rank",
  },
  sets: {
    table: "sets",
    columns: "id,slug,name,released_at,released,set_type",
  },
  // Image links + the file rows. The catalog only surfaces an image once its
  // file has been rehosted, so the client keeps a row visible when
  // `is_active` and the joined `image_files.rehosted_url` is non-null.
  printingImages: {
    table: "printing_images",
    columns: "id,printing_id,face,image_file_id,is_active",
  },
  imageFiles: {
    table: "image_files",
    columns: "id,rehosted_url",
  },
  markers: {
    table: "markers",
    columns: "id,slug,label,description,sort_order",
  },
  distributionChannels: {
    table: "distribution_channels",
    columns: "id,slug,label,description,kind,parent_id,children_label,sort_order",
  },
  printingDistributionChannels: {
    table: "printing_distribution_channels",
    columns: "printing_id,channel_id,distribution_note",
  },
  cardErrata: {
    table: "card_errata",
    columns: "card_id,corrected_rules_text,corrected_effect_text,source,source_url,effective_date",
  },
  // The client keeps a ban while `unbanned_at` is null and resolves the format
  // display name from the `formats` shape.
  cardBans: {
    table: "card_bans",
    columns: "card_id,format_id,banned_at,unbanned_at,reason",
  },
  formats: {
    table: "formats",
    columns: "id,name",
  },
  // Custom-tag assignments + the tag vocabulary (slug only — the client merges
  // assignments into card → slugs[] exactly like the server assembly).
  cardCustomTags: {
    table: "card_custom_tags",
    columns: "card_id,custom_tag_id",
  },
  customTags: {
    table: "custom_tags",
    columns: "id,slug",
  },
  // Current marketplace prices: latest headline price per (printing, marketplace).
  // Migration 159 made this a real table (replacing mv_latest_printing_prices) so
  // it can be a shape — a materialized view can't sync. Public + read-only; the
  // client rebuilds the static marketplace→currency map itself, so no currency
  // column is synced. The 466k-row price history is never synced.
  latestPrices: {
    table: "latest_printing_prices",
    columns: "printing_id,marketplace,headline_cents",
  },
} satisfies Record<string, PublicShapeDefinition>;

// Catalog data changes only when sets/cards/printings ship — weeks apart — and
// is identical for every visitor, so it is freely shared-cacheable.
const PUBLIC_SHAPE_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

function proxyPublicShape(
  c: Context<{ Variables: Variables }>,
  shape: PublicShapeDefinition,
): Promise<Response> {
  return forwardElectricShape(c, shape, PUBLIC_SHAPE_CACHE_CONTROL);
}

// Each shape is a sync-protocol stream the Electric client drives off the
// status + headers, so these stay plain Hono rather than oRPC JSON procedures.
export const publicShapesRoute = new Hono<{ Variables: Variables }>()
  .basePath("/public-shapes")
  .get("/cards", (c) => proxyPublicShape(c, PUBLIC_SHAPES.cards))
  .get("/card-domains", (c) => proxyPublicShape(c, PUBLIC_SHAPES.cardDomains))
  .get("/card-super-types", (c) => proxyPublicShape(c, PUBLIC_SHAPES.cardSuperTypes))
  .get("/printings", (c) => proxyPublicShape(c, PUBLIC_SHAPES.printings))
  .get("/sets", (c) => proxyPublicShape(c, PUBLIC_SHAPES.sets))
  .get("/printing-images", (c) => proxyPublicShape(c, PUBLIC_SHAPES.printingImages))
  .get("/image-files", (c) => proxyPublicShape(c, PUBLIC_SHAPES.imageFiles))
  .get("/markers", (c) => proxyPublicShape(c, PUBLIC_SHAPES.markers))
  .get("/distribution-channels", (c) => proxyPublicShape(c, PUBLIC_SHAPES.distributionChannels))
  .get("/printing-distribution-channels", (c) =>
    proxyPublicShape(c, PUBLIC_SHAPES.printingDistributionChannels),
  )
  .get("/card-errata", (c) => proxyPublicShape(c, PUBLIC_SHAPES.cardErrata))
  .get("/card-bans", (c) => proxyPublicShape(c, PUBLIC_SHAPES.cardBans))
  .get("/formats", (c) => proxyPublicShape(c, PUBLIC_SHAPES.formats))
  .get("/card-custom-tags", (c) => proxyPublicShape(c, PUBLIC_SHAPES.cardCustomTags))
  .get("/custom-tags", (c) => proxyPublicShape(c, PUBLIC_SHAPES.customTags))
  .get("/latest-prices", (c) => proxyPublicShape(c, PUBLIC_SHAPES.latestPrices));
