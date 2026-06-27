// Electric shape-auth proxy (ADR-027 step 2). Electric serves "shapes" —
// filtered single-table replication streams — over plain HTTP, but it has no
// notion of our users. This proxy is the authorization layer: the client asks
// for "my copies" / "my collections", the proxy pins the table, columns, and
// a where clause scoped to the authenticated viewer, and forwards only the
// sync-protocol position params. A client can never widen its shape, because
// the shape definition never leaves the server.

import { Hono } from "hono";
import type { Context } from "hono";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import type { Variables } from "../../types.js";
import { forwardElectricShape } from "../../utils/electric-proxy.js";

interface ShapeDefinition {
  table: string;
  columns: string;
  /** Where clause with `$1` bound to the authenticated viewer's user id. */
  where: string;
}

// Both where clauses mirror copiesRepo.listForAccessibleCollections: personal
// collections plus the shared collections of every group the viewer belongs
// to. Subqueries in where clauses are an Electric preview feature
// (ELECTRIC_FEATURE_FLAGS=allow_subqueries,tagged_subqueries — set in
// docker-compose.yml); Electric tracks them live, so rows enter/leave the
// shape when collections change hands or group membership changes, without
// the rows themselves being touched.
const SHAPES: Record<string, ShapeDefinition> = {
  // `groupId` (a collections column) is deliberately absent from the copies
  // shape: shapes are single-table, so the client joins the collections shape
  // to derive it.
  copies: {
    table: "copies",
    columns: "id,collection_id,printing_id",
    where: `collection_id IN (SELECT id FROM collections WHERE user_id = $1 OR group_id IN (SELECT group_id FROM friend_group_members WHERE user_id = $1))`,
  },
  // What the client renders from the synced collections shape: identity +
  // grouping for the copies join, plus name/description/inbox/sort_order for
  // the collections UI (list, sidebar, rename, reorder). Server-derived
  // per-viewer fields (copy counts, values, deck-building prefs, group
  // slug/name, admin rights) stay on the query layer. Widening this list
  // means bumping the client's PERSISTED_SCHEMA_VERSION.
  collections: {
    table: "collections",
    columns: "id,group_id,name,description,is_inbox,sort_order",
    where: `user_id = $1 OR group_id IN (SELECT group_id FROM friend_group_members WHERE user_id = $1)`,
  },
  // What the client renders from the synced lists shape: identity, the
  // intent/kind discriminators, name, trade defaults, and sort_order for the
  // sidebar ordering (ADR-027 lists vertical). Server-derived fields (entry
  // counts — derived live from the entries shape — share state, timestamps)
  // stay on the query layer. Owner-only: useLists never shows other members'
  // lists; group-shared lists are read through the friend-groups endpoints.
  // Widening this list means bumping the client's PERSISTED_SCHEMA_VERSION.
  lists: {
    table: "lists",
    columns:
      "id,name,intent,kind,default_price_pref,default_price_absolute_cents,default_trade_type,currency,sort_order",
    where: `user_id = $1`,
  },
  // The owner's list entries across all their lists: target ids, quantity,
  // and the per-entry trade override. Card/printing/copy enrichment
  // (names, images, set data) is a server-side join the single-table shape
  // cannot carry, so it stays on the query layer (the list detail query).
  listEntries: {
    table: "list_entries",
    columns:
      "id,list_id,kind,card_id,printing_id,copy_id,quantity,price_pref,price_absolute_cents,trade_type",
    where: `user_id = $1`,
  },
  // The owner's deck cards across all their decks (ADR-027 decks vertical):
  // the deck builder's synced state. Card metadata (name, type, domains) is
  // resolved client-side from the catalog; deck metadata (name, format,
  // aggregates) stays on the query layer. deck_cards has no user_id column,
  // so ownership goes through the decks subquery — Electric tracks it live,
  // so rows leave the shape when a deck is deleted. Widening this list means
  // bumping the client's PERSISTED_SCHEMA_VERSION.
  deckCards: {
    table: "deck_cards",
    columns: "id,deck_id,card_id,zone,quantity,preferred_printing_id",
    where: `deck_id IN (SELECT id FROM decks WHERE user_id = $1)`,
  },
};

// Per-user data behind cookie auth: Electric's cache-friendly headers are
// meant for public shapes hitting Electric directly. The first request of
// every user's shape has an identical URL through this proxy, so a shared
// cache would leak one user's snapshot to another. Never cache.
const PER_USER_CACHE_CONTROL = "private, no-store";

function proxyShape(
  c: Context<{ Variables: Variables }>,
  shape: ShapeDefinition,
): Promise<Response> {
  // Bind `$1` to the authenticated viewer and forward via the shared core.
  return forwardElectricShape(
    c,
    { table: shape.table, columns: shape.columns, where: shape.where, userParam: getUserId(c) },
    PER_USER_CACHE_CONTROL,
  );
}

// Each shape is a sync-protocol stream (the Electric client drives its protocol
// off the status + headers, including 204 live-timeouts and 409 must-refetch),
// so these stay plain Hono rather than oRPC JSON procedures.
export const shapesRoute = new Hono<{ Variables: Variables }>()
  .basePath("/shapes")
  .use(requireAuth)
  .get("/copies", (c) => proxyShape(c, SHAPES.copies))
  .get("/collections", (c) => proxyShape(c, SHAPES.collections))
  .get("/lists", (c) => proxyShape(c, SHAPES.lists))
  .get("/list-entries", (c) => proxyShape(c, SHAPES.listEntries))
  .get("/deck-cards", (c) => proxyShape(c, SHAPES.deckCards));
