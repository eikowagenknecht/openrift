---
status: proposed
date: 2026-05-19
---

# ADR-015: Preconstructed Product Catalog

## Context and Problem Statement

At the start of every Riftbound season there is a pre-rift event. Each player receives a **kit** (a fixed, deterministic set of cards) plus a small number of **boosters** (random packs), and builds a sealed-style deck from that pool. Several different kits exist per event; the kit you get determines roughly which playstyle you walk in with.

OpenRift currently has no way to record what is inside any of these kits. As pre-rift content lands we want a place to store it, browse it, and (later) drive a simulator from it. Looking at the shape of that data, it is not unique to pre-rift events: it is the same shape as a starter set, a structure deck, or any other fixed-content product Riot might ship. We therefore want a **generalised preconstructed-product catalog** in phase 1, with pre-rift kits as the launch use case. Phase 2 (the simulator) is a separate ADR.

The contents of a kit are not random and not user-authored: they are catalog data, the same kind of data we already keep in `cards`, `printings`, and `distribution_channels`. The model should reflect that, not borrow shape from `lists` or `decks` (which are user-scoped, mutable, and built on different primitives).

## Decision Drivers

- Pre-rift content needs a home before the next event ships; we should not block on a simulator design.
- The same shape will be reused by starter sets and other fixed Riot products. Building a kit-specific table would force a refactor on the first day starter-set data arrives.
- Pre-rift contents are released on a marketing schedule; admins must be able to prepare a product privately and flip it visible at release.
- The data is curated by a small group of admins, not the community, and it is hand-aligned against official product lists.
- The collection model (ADR-005) is intentionally per-user. Catalog data must not bleed into `collection_events`; owning or browsing a product is not the same as owning the cards.
- The repo's shared card-browser scaffold already covers the UI shape we want for a product page (toolbar, filters, grouping, table view, `<CardCell>` slots). Reuse, do not reinvent.

## Considered Options

For each of the five decisions below, we list the contenders. The decision outcome stitches them into one design.

**Where the entity lives:**

- A new top-level `products` table with its own routes.
- A new `distribution_channels.kind` row plus content rows hanging off it.
- A new `intent='kit'` on `lists` reusing `list_entries`.
- A new deck `format='prerift_kit'` reusing `decks` / `deck_cards`.

**Scope:**

- Pre-rift-specific (`prerift_kits` table only).
- Generalised preconstructed products (`products` with a `kind`).

**Granularity:**

- Card.
- Printing.
- Printing + finish.

**Cross-language model:**

- One product row, multiple language printings inside it.
- One product row per language.
- One product row per language plus a `family_id` linking siblings.

**Authoring source:**

- File-based, checked into the repo, imported on migration (ADR-008 pattern).
- Admin UI as the source of truth, with JSON upload supported.
- External feed.

## Decision Outcome

Chosen design:

- A new top-level `products` table, joined to `printings` through `product_printings`. Independent of `distribution_channels`, `lists`, and `decks`. This is catalog data, not a user-scoped collection of cards and not a "how did this printing reach the world" annotation; it deserves its own seam.
- Generalised from day one. Kits, starter sets, and future fixed Riot products share one shape, distinguished by a `kind` lookup row (`product_kinds`), matching how `card_types`, `rarities`, `domains`, and `deck_zones` are modelled.
- Granularity is **printing**. A product gives you a specific art, a specific set, a specific variant. `(product_id, printing_id, quantity, sort_order)`. We do not model finish on this row; if a future product mixes finishes per printing we add a nullable `finish_id`, but every current and announced product can be expressed without it.
- **One row per language, no cross-language family link.** The English pre-rift Sentinels kit and the German pre-rift Sentinels kit are two independent rows. Slugs encode the language convention (e.g. `prerift-2026-sentinels-en`, `prerift-2026-sentinels-de`) and are globally unique. The `language` column on the row is the source of truth; the slug convention is for humans.
- **Admin UI is the source of truth.** Admins can author or edit a product row by row, and they can paste/upload a JSON document that the importer applies as a transaction. There is no file-based source under `apps/api/data/`, no migration-driven seeding for products, and no external feed.

### Consequences

- Good: each future product kind (starter set, structure deck, future ladder kits) ships as a `product_kinds` row and content, with no schema change.
- Good: catalog browsing and the eventual simulator both read the same shape. The phase-2 simulator just needs to know how to draw boosters; the kit half of the pool is already in place.
- Good: the `products` and `product_printings` shape is read-mostly. The /products surface inherits virtualization and grouping from the existing card-browser scaffold with no surface-specific perf work.
- Good: nothing about a product touches `collection_events`. Sandboxing pre-rift in phase 2 is a non-decision because the data model already says "this is not your collection."
- Bad: UUID-only printing references in the JSON importer are unfriendly. Admins must look up printings by hand (or via a UI helper) before they can paste a product definition. See the trade-off note under _Authoring_.
- Bad: no cross-language link means /products has no "view the EN version" switcher and no admin warning when one language drifts from another. Admins enforce parity by hand. Acceptable while only one product kind exists; revisit if/when starter sets ship with many language variants.
- Bad: three new tables (`products`, `product_kinds`, `product_printings`) plus an admin surface. Mitigated by the model being narrow, the admin UI being CRUD over a small entity, and most read paths reusing the card-browser scaffold.

## Design Decisions

### Entity

`products` carries: `id` (uuidv7), `slug` (unique globally, `[a-z0-9][a-z0-9-]{2,79}`, mutable, used in URLs), `kind_slug` (FK to `product_kinds.slug`), `language_id` (FK to `languages.id`), `name` (1 to 120 chars), `description` (markdown, 2000 char max, nullable), `published_at` (nullable timestamp, NULL means draft), `created_at`, `updated_at`.

**No release date, no linked set, no cover image** in this ADR. They are listed under _Deferred_. A product's first content row's printing image is good enough as a thumbnail until we have a reason to choose one explicitly.

**Slugs are mutable, with no redirect.** Renames take effect immediately and the old slug 404s. The audience for direct product URLs is small (admins, hobbyists), and discoverability runs through `/products` (the index), not by guessing slugs. A short reserved-slug list (`new`, `create`, `settings`, `admin`) prevents collisions with future app routes.

**Slug uniqueness is global, not per-language.** Two products in different languages must have different slugs. We rely on a slug convention to keep this readable (suffixes like `-en`, `-de`, `-fr`) but the database does not enforce the convention; it only enforces uniqueness.

### Kinds

`product_kinds(slug PRIMARY KEY, label, sort_order, description)`. Slugs are stable identifiers used in queries and on the product row; labels are human-facing. The launch population is one row: `prerift_kit`. Starter sets, structure decks, and any future kinds are added by inserting a row, not by migrating an enum or a CHECK constraint.

### Contents

`product_printings(product_id, printing_id, quantity, sort_order)` with composite PK `(product_id, printing_id)`. Quantity is a positive integer. `sort_order` is small-int and is the admin-controlled display order on the product page; tie-breaking falls back to the printing's own collector number / name as a stable secondary key in the query, not the schema.

A printing can appear in multiple products (and frequently will, since starter sets and event kits share commons). The PK is on `(product_id, printing_id)`, not globally on printing.

The same printing appearing twice in one product is not modelled as two rows: it becomes one row with `quantity = 2`. If a product really does ship two physically distinct cards of the same printing (e.g. one foil, one non-foil) and we ever need to express that, we add a nullable `finish_id` column and lift the PK to include it. We defer that until a real product requires it.

### Languages

A product's `language_id` describes which language its printings are in. The constraint is enforced at write time: when adding a `product_printings` row, the importer verifies that `printings.language_id` matches the parent product's `language_id`. We do not add a DB-level constraint for this (it would require a denormalised column or a trigger); the importer is the choke point and an integration test covers the rule.

This rule means: a German product cannot accidentally contain English printings. If a real product does cross languages (it does not, today), we model it as multiple products one per language and live with the duplication.

### Visibility

`published_at IS NULL` means the product is invisible to non-admin users. Setting `published_at` to any value at or before `now()` makes it public; setting it to a future timestamp does not auto-publish (we keep the model passive: admins flip the visibility manually).

Admins always see all products including drafts, with a clear "draft" badge on the index and product page.

### Authoring

Two surfaces, one writer path:

- **Manual editing.** Admin pages let an admin create a product, edit its metadata, and add/remove `product_printings` rows one at a time. Adding a row uses the same printing picker we already have in the admin tools.
- **JSON upload.** A paste-or-upload textarea on the product edit page accepts a JSON document and applies it as one transaction. The document fully replaces the current `product_printings` rows for that product (it is not a diff). Metadata fields in the document overwrite the row.

The JSON schema:

```json
{
  "name": "Pre-Rift 2026: Sentinels Kit (EN)",
  "slug": "prerift-2026-sentinels-en",
  "kind": "prerift_kit",
  "language": "en",
  "description": "Optional markdown blurb.",
  "published_at": null,
  "contents": [
    { "printing_id": "01940000-0000-0000-0000-000000000042", "quantity": 1, "sort_order": 10 },
    { "printing_id": "01940000-0000-0000-0000-000000000099", "quantity": 3, "sort_order": 20 }
  ]
}
```

- **`printing_id` is the only supported reference.** Set/number/name resolution is _not_ accepted. This is a deliberate trade-off: it is unfriendly to copy from a marketing PDF, but it makes import deterministic, language-correct, and free of slug-drift bugs. The admin UI provides a printing picker that copies the UUID to the clipboard; admins assemble the JSON from those UUIDs.
- The importer validates: slug uniqueness, kind exists, language exists, every `printing_id` resolves, every printing matches the product's language, quantity > 0. On any failure the transaction rolls back and the API returns the list of validation errors.
- Upload-by-slug is supported as well (POST to `/admin/products/:slug` with a document whose `slug` matches the URL). Creating a brand-new product is POST without a URL slug; the `slug` in the document is required.

### Routing and UI

- **`/products`** is the public index of published products. It lists products by name, kind, language, and content count. Admins additionally see drafts. Filters: kind, language. Sort: name, recently updated.
- **`/products/$slug`** is a single product page. Language is read from the row (slug is not parsed). The page is built from the shared card-browser scaffold:
  - Wrap in `<CardBrowserFilterProvider>`; render `<BrowserToolbar/>`, `<BrowserLeftPane/>`, `<BrowserActiveFilters/>`.
  - Grid is virtualized via `<CardViewer>`. Each cell is `<CardCell>` with a `OwnedCountStrip` so users can see at a glance which kit cards they already own. There is no `CollectionAddStrip` or `DeckAddStrip`; products are read-only catalog data.
  - Table mode uses the existing default actions column (no surface-specific table-actions component is needed).
- **`/admin/products`** lists every product (published and draft), with create, edit, delete, JSON upload affordances. Standard admin layout, no card-browser scaffold; this is a CRUD page.

### Importer behaviour

- A JSON upload that changes `language` while the product still has `product_printings` rows is rejected. Admin must clear the contents first or delete and recreate the product.
- A JSON upload that deletes the only published copy of a product kind is allowed; we do not protect against the catalog becoming temporarily empty.
- Deleting a product cascades to `product_printings` (FK `ON DELETE CASCADE`). It does not affect any deck, list, or collection (no other table references `products` in phase 1).

## Schema sketch

```sql
CREATE TABLE product_kinds (
  slug        text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  description text,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO product_kinds (slug, label, sort_order)
VALUES ('prerift_kit', 'Pre-Rift Kit', 10);

CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  slug          text NOT NULL UNIQUE
                     CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  kind_slug     text NOT NULL REFERENCES product_kinds(slug),
  language_id   text NOT NULL REFERENCES languages(id),
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description   text CHECK (description IS NULL OR length(description) <= 2000),
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_products_published ON products (published_at) WHERE published_at IS NOT NULL;
CREATE INDEX ix_products_kind      ON products (kind_slug);
CREATE INDEX ix_products_language  ON products (language_id);

CREATE TABLE product_printings (
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  printing_id uuid NOT NULL REFERENCES printings(id),
  quantity    integer NOT NULL CHECK (quantity > 0),
  sort_order  smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, printing_id)
);
CREATE INDEX ix_product_printings_printing ON product_printings (printing_id);
```

The `printings` reference is intentionally _not_ `ON DELETE CASCADE`. A printing should not be deletable while it is in a product; the catalog has to clear the product first. This matches how `deck_cards` references `cards`.

## Will Not Be Built

- **Cross-language sibling link** (`family_id`, slug-prefix heuristic, redirect tables). Phase 1 ships one row per language with no link. If product proliferation grows beyond pre-rift kits we revisit then.
- **Human-readable printing references in the importer** (`set + collector_number + language`, name-based resolution, "all three accepted" fallback). UUID-only is the single supported form.
- **File-based seeding** of product data on migration. The DB is the source of truth; there is no `apps/api/data/products/` directory.
- **Mixed-language contents inside one product.** Enforced at the importer level.

## Deferred / Out of Scope

- **Booster modelling.** Pre-rift events include random boosters alongside the kit. Phase 1 only stores the deterministic kit. Booster pool definitions, draw odds, and slot rules belong to phase 2 (the simulator) or its own catalog ADR.
- **Pre-rift simulator.** Phase 2 will add a sim that drafts a pool from a product plus N boosters, lets the user build a deck inside an ephemeral sandbox, and optionally saves the result as a real deck under a `prerift` deck format. The persistence model is "ephemeral by default, optional save as deck."
- **`prerift` deck format.** Added with phase 2.
- **Release date, linked set, cover image** on the product row. Add when a real workflow needs them.
- **Mixed-finish products** (one printing in both foil and non-foil within the same kit). Add a nullable `finish_id` and lift the PK if a real product ships with this shape.
- **Cross-surface product filter.** /cards, /collections, and /decks do not gain a "in this product" filter or badge in phase 1. The standalone /products page is the only discovery surface.
- **Public draft preview links.** Drafts are admin-only. There is no shareable preview URL for an unpublished product.
- **Schedule-driven publication.** `published_at` in the future does not auto-publish; admins flip it by hand at release time.
- **Import history / audit log.** JSON uploads replace contents in one transaction without retaining the prior state. If an admin uploads bad JSON they re-upload corrected JSON. No undo.
- **Soft delete.** Products are hard-deleted. Cascade clears `product_printings`. Nothing else references them in phase 1.

## Confirmation

Integration tests cover:

- Inserting a `product_printings` row whose printing language differs from the parent product's language is rejected by the importer (and a direct DB write is caught by the matching integration test, so we know the importer is the only gate).
- Deleting a `products` row cascades its `product_printings` rows; a printing referenced by a product cannot be deleted directly.
- Adding a new `product_kinds` row makes that kind selectable in product creation without any schema change.
- A product with `published_at IS NULL` is not visible on `/products` to a non-admin user and `/products/$slug` returns 404 for that audience; an admin sees it with a draft badge.
- Slug rename takes effect immediately; the old slug 404s. Slug uniqueness is enforced globally (different-language siblings cannot share a slug).
- JSON upload replaces contents atomically: a failed validation rolls back the entire upload, leaving the prior contents intact.
- JSON upload rejects: unknown printing_id, quantity <= 0, slug collision against another product, unknown kind, unknown language, mismatched printing language.
- Owned-count strip on `/products/$slug` reflects the viewer's collection but does not write to it; no `collection_events` are produced by browsing or by any product action.

UI confirmation: `/products/$slug` reuses `<CardBrowserFilterProvider>`, `<BrowserToolbar>`, and `<CardCell>` (not bespoke layout); a code review checks that the page composes from these shared primitives.
