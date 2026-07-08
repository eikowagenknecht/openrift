---
status: proposed
date: 2026-07-08
---

# ADR-015: Preconstructed Product Catalog

## Context and Problem Statement

At the start of every Riftbound season there is a pre-rift event. Each player receives a kit (a fixed, deterministic set of cards) plus a small number of boosters (random packs), and builds a sealed-style deck from that pool. Several different kits exist per event. OpenRift currently has no way to record what is inside any of these kits. As pre-rift content lands we want a place to store it, browse it, and (later) drive a simulator from it. Phase 2 (the simulator) is a separate ADR.

The contents of a kit are not random and not user-authored: they are catalog data, the same kind of data we already keep in `cards` and `printings`. The model should reflect that, not borrow shape from `lists` or `decks` (which are user-scoped, mutable, and built on different primitives). At the same time, the organize-list UI is already a good editor for "a named pile of printings with quantities", and the admins who curate kit data use it daily.

## Considered Options

1. Dedicated `products` and `product_printings` tables, authored by snapshotting an organize list (chosen)
2. A flagged list reusing `lists` / `list_entries` as storage
3. Content rows hanging off a new `distribution_channels.kind`
4. A deck `format='prerift_kit'` reusing `decks` / `deck_cards`

## Decision Outcome

Products get their own narrow seam: a `products` row (`slug`, `name`, optional markdown `description`) joined to `printings` through `product_printings(product_id, printing_id, quantity)`. Lists remain the authoring vehicle but not the storage: an admin builds the kit in the organize-list UI, then runs a "create product from list" action that snapshots the list's resolved printing entries into the product in one transaction. The flagged-list option was rejected because products would inherit list semantics (an owner, list kinds, dynamic rules, trade preferences) that make no sense for catalog data; the channel and deck options were rejected for the same shape mismatch the other direction.

The first version is deliberately minimal. Compared to the original 2026-05-19 draft of this ADR, v1 drops the `product_kinds` lookup (a product is just a name), the `published_at` draft/publish flow (a product is public the moment it exists), the per-language rows and `language` column (v1 does not model language at all), the admin-controlled `sort_order` (display order falls back to collector number), and the UUID-based JSON importer (the list snapshot is the only content writer). Each cut is listed under _Will Not Be Built_ with its revisit trigger.

### Consequences

- Good, because the `products` shape is read-mostly and the /products surface inherits virtualization, filtering, and grouping from the existing card-browser scaffold with no surface-specific perf work.
- Good, because nothing about a product touches `collection_events`; owning or browsing a product is not the same as owning the cards, and the phase-2 simulator reads the same shape without sandboxing decisions.
- Good, because authoring reuses the organize-list UI end to end: no bespoke content editor, no import file format, no UUID copy-pasting.
- Bad, because there are no drafts: a product is visible the instant it is created. Preparation happens in the private source list, and a mistimed create is public immediately.
- Bad, because contents can only be replaced wholesale from a list. Correcting one card means keeping (or rebuilding) a list and re-running the snapshot.
- Bad, because the generalization is deferred: when a second product type (starter set) or a non-English kit arrives, a kind column and a language column are schema additions, not just data.

## Design Decisions

### Entity

`products` carries: `id` (uuidv7), `slug` (globally unique, `[a-z0-9][a-z0-9-]{2,79}`, mutable, used in URLs), `name` (1 to 120 chars), `description` (markdown, 2000 char max, nullable), `created_at`, `updated_at`.

**Slugs are mutable, with no redirect.** Renames take effect immediately and the old slug 404s. The audience for direct product URLs is small (admins, hobbyists), and discoverability runs through `/products`, not by guessing slugs. A short reserved-slug list (`new`, `create`, `settings`, `admin`) prevents collisions with future app routes.

**No release date, no linked set, no cover image.** They are listed under _Deferred_. The first content printing's image (in collector order) is the thumbnail until we have a reason to choose one explicitly.

### Contents

`product_printings(product_id, printing_id, quantity)` with composite PK `(product_id, printing_id)`. Quantity is a positive integer. Display order is the printing's collector number / name as a stable sort in the query; there is no stored order.

Finish needs no modelling here: `finish` is part of a printing's identity (`uq_printings_identity`), so a kit that ships the same card foil and non-foil is simply two `product_printings` rows pointing at two printings. (The original draft planned a future `finish_id` column; the current printing model makes that moot.)

A printing can appear in multiple products. The same printing appearing twice in one product becomes one row with summed quantity.

### Languages

v1 does not model language. There is no `language` column on `products` and no enforcement on contents: a product holds whatever printings its source list holds, in any language, and the admin curating the data decides what belongs together. If products ever need first-class language handling (a language column, one row per language, filters), the original draft's design (independent rows per language, no cross-language link) is the starting point.

### Authoring

The organize-list UI is the editor. One admin action, "create product from list":

- The admin picks one of their own printing-kind lists. Card-kind lists are rejected (their entries have no printing identity).
- The list's resolved entries (including rule-produced entries per ADR-034, exactly what the list page shows) are snapshotted into `product_printings`, merging duplicates by printing and summing quantities, in one transaction.
- Re-running the action against an existing product fully replaces its contents (it is not a diff). On any validation failure the transaction rolls back and the prior contents stay intact.
- The product stores no reference to the source list. It is a snapshot; catalog data never points at user data, and deleting the list does not affect the product.

Metadata (`slug`, `name`, `description`) is edited in a plain admin form. Validation on the writer path: slug uniqueness, slug pattern and reserved names, quantity > 0, list kind is `printing`.

### Routing and UI

- **`/products`** is the public index. It lists products by name and content count. Sort: name, recently updated.
- **`/products/$slug`** is a single product page built from the shared card-browser scaffold: `<CardBrowserFilterProvider>` wrapping the surface, `<BrowserToolbar/>` (the compact filter bar) as the layout's toolbar, `<BrowserActiveFilters/>` above the grid, a virtualized `<CardViewer>` grid. Each cell is `<CardCell>` with an `OwnedCountStrip` so users see at a glance which kit cards they already own. There is no `CollectionAddStrip` or `DeckAddStrip`; products are read-only catalog data. Table mode uses the existing default actions column.
- **`/admin/products`** lists every product with create, edit-metadata, delete, and snapshot-from-list affordances. Standard admin layout, no card-browser scaffold. Product management is its own grantable admin section per ADR-040: one `ADMIN_SECTION_SLUGS` entry, one API path matcher, one web route entry.

## Schema sketch

```sql
CREATE TABLE products (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  slug         text NOT NULL UNIQUE
                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description  text CHECK (description IS NULL OR length(description) <= 2000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_printings (
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  printing_id uuid NOT NULL REFERENCES printings(id),
  quantity    integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (product_id, printing_id)
);
CREATE INDEX ix_product_printings_printing ON product_printings (printing_id);
```

The `printings` reference is intentionally _not_ `ON DELETE CASCADE`. A printing should not be deletable while it is in a product; the catalog has to clear the product first. This matches how `deck_cards` references `cards`.

## Will Not Be Built

- **`product_kinds` lookup / kind column.** A product is just a name. Revisit when a second product type (starter set, structure deck) actually ships.
- **`published_at`, drafts, scheduled publication.** Products are public on create; preparation happens in the private source list. Revisit if release-timing mistakes actually hurt.
- **`language` column, per-language product rows, and any language enforcement on contents.** The curating admin decides what belongs in a product. Revisit when products need first-class language handling.
- **JSON/file import and UUID printing references.** The list snapshot is the only content writer; there is no upload format and no file-based seeding.
- **`sort_order` on contents.** Collector order in the query.
- **Row-by-row content editing.** Contents change only by re-snapshotting a list.
- **Cross-language sibling links and slug redirects.**

## Deferred / Out of Scope

- **Booster modelling.** Phase 1 only stores the deterministic kit. Booster pool definitions, draw odds, and slot rules belong to phase 2 (the simulator) or its own catalog ADR.
- **Pre-rift simulator and a `prerift` deck format.** Phase 2: draft a pool from a product plus N boosters, build in an ephemeral sandbox, optionally save as a real deck.
- **Release date, linked set, cover image** on the product row. Add when a real workflow needs them.
- **Cross-surface product filter.** /cards, /collections, and /decks do not gain an "in this product" filter or badge. The /products page is the only discovery surface.
- **Import history / audit log / soft delete.** Snapshots replace contents without retaining prior state; products are hard-deleted and the cascade clears `product_printings`.

## Confirmation

Integration tests cover:

- Snapshot-from-list copies the list's resolved printing entries with quantities; duplicates merge with summed quantities; a card-kind list is rejected.
- Re-snapshot replaces contents atomically: a failed validation rolls back the entire operation, leaving the prior contents intact.
- Deleting a `products` row cascades its `product_printings` rows; a printing referenced by a product cannot be deleted directly.
- Deleting the source list after a snapshot leaves the product untouched.
- Slug rename takes effect immediately and the old slug 404s; slug uniqueness is global; reserved slugs are rejected.
- The owned-count strip on `/products/$slug` reflects the viewer's collection but does not write to it. No `collection_events` are produced by browsing or by any product action.
- A `products` section grant (ADR-040) reaches the /admin/products APIs and nothing else; non-admins without the grant are denied.

UI confirmation: `/products/$slug` composes from `<CardBrowserFilterProvider>`, `<BrowserToolbar>`, and `<CardCell>` (not bespoke layout); a code review checks this.

## More Information

- First proposed 2026-05-19 as a generalised multi-language catalog with kinds, drafts, and a JSON importer. Revised 2026-07-08 after review: v1 shrank to the minimal English-only shape above, with list snapshots as the only authoring path. The cut pieces are recorded under _Will Not Be Built_ with their revisit triggers.
- ADR-005 explains why the collection model is per-user and why catalog data must stay out of `collection_events`.
- ADR-034 defines the resolved-entry semantics (stored plus rule-produced entries) that the snapshot reads.
- ADR-040 defines the per-section admin grant model the `/admin/products` section plugs into.
