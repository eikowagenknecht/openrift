---
status: proposed
date: 2026-03-09
---

# ADR-008: Supplemental Card Import Pipeline

## Context and Problem Statement

OpenRift's card catalog currently covers 664 cards across 3 sets, but is missing cards that exist elsewhere — notably the Arcane Box Set (6 cards), 2 Spiritforged tokens, and all promo cards. We need a way to supplement the catalog with data from other sources.

## Decision Drivers

- The import pipeline must be decoupled from any specific data source — clean separation of concerns
- Supplemental data must be human-reviewed before entering the catalog — no blind automated imports
- Must handle both entirely new cards and updates to existing cards

## Considered Options

- **Admin manual card entry** — hand-create each card via an admin form
- **Automated source merge** — auto-fetch from external APIs during catalog refresh
- **Static JSON seed files** — version-controlled JSON patches in the repo, merged during refresh
- **Source-agnostic candidate import** — upload JSON via admin UI, review and accept each card

## Decision Outcome

Chosen option: "Source-agnostic candidate import", because it cleanly separates data sourcing from data ingestion. Scripts that produce candidate JSON can live anywhere and evolve independently. The admin UI only knows about the candidate schema — adding a new data source requires no changes to the application.

### Consequences

- Good, because the application is fully decoupled from any specific data source.
- Good, because every imported card is human-reviewed before entering the catalog.
- Good, because the JSON format is stable — adding a new data source requires no application changes.
- Good, because the same pipeline handles both new cards and updates to existing cards.
- Bad, because it requires manual effort (upload + review) rather than being fully automated. Accepted as a deliberate tradeoff for data quality control.

## Design

### Pipeline Overview

```plaintext
Data sourcing             OpenRift
─────────────             ────────
Produce JSON         →    candidates.json
                              ↓
                          POST /admin/candidates/upload
                              ↓
                          card_candidates table (staging)
                              ↓
                          Admin UI: review & edit
                              ↓
                          Accept → cards/printings tables
                                   + download & resize images (ADR-007)
```

### Candidate JSON Format

Scripts that produce candidate JSON conform to this schema, using OpenRift's own types:

```typescript
interface CandidateCard {
  card: {
    external_id: string;
    short_code: string;
    name: string;
    type: CardType;
    super_types: string[];
    domains: Domain[];
    might: number | null;
    energy: number | null;
    power: number | null;
    might_bonus: number | null;
    keywords: string[];
    tags: string[];
    rules_text: string;
    effect_text: string;
  };
  printings: {
    external_id: string;
    short_code: string;
    set_id: string;
    set_name?: string; // required if set doesn't exist yet
    collector_number: number;
    rarity: Rarity;
    art_variant: string;
    is_signed: boolean;
    finish: string;
    artist: string;
    public_code: string;
    printed_rules_text: string;
    printed_effect_text: string;
    image_url?: string; // source URL, downloaded at accept time
  }[];
}
```

A card can have printings across multiple sets (e.g., a promo reprinted in a promo set), so set information lives on printings. `set_name` is only needed when a printing references a set that doesn't exist yet. New sets are created with `printed_total` defaulting to 0 — this can be corrected later via the admin UI.

### Schema Changes

The same migration also makes `printings.image_url` nullable. The column is currently `NOT NULL`, but imported cards may not have an image available. The frontend already handles missing images — `CardThumbnail` renders a placeholder component when `imageURL` is falsy.

### Staging Tables

Two staging tables mirror the structure of `cards` and `printings`, with additional columns for review workflow:

```sql
CREATE TABLE candidate_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status          text NOT NULL DEFAULT 'pending',
  provider        text NOT NULL DEFAULT '',
  match_card_id   text REFERENCES cards(id),
  -- card fields (same as cards table)
  short_code      text,
  name            text NOT NULL,
  type            text NOT NULL,
  super_types     text[] NOT NULL DEFAULT '{}',
  domains         text[] NOT NULL,
  might           integer,
  energy          integer,
  power           integer,
  might_bonus     integer,
  keywords        text[] NOT NULL DEFAULT '{}',
  rules_text      text NOT NULL,
  effect_text     text NOT NULL DEFAULT '',
  tags            text[] NOT NULL DEFAULT '{}',
  -- review metadata
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     text REFERENCES users(id),
  CONSTRAINT chk_candidate_cards_status CHECK (status IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT chk_candidate_cards_type CHECK (type IN ('Legend', 'Unit', 'Rune', 'Spell', 'Gear', 'Battlefield'))
);
CREATE INDEX idx_candidate_cards_status ON candidate_cards(status);
CREATE INDEX idx_candidate_cards_match ON candidate_cards(match_card_id);

CREATE TABLE candidate_printings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_card_id    uuid NOT NULL REFERENCES candidate_cards(id) ON DELETE CASCADE,
  -- printing fields (same as printings table)
  short_code           text NOT NULL,
  set_id               text NOT NULL,
  set_name             text,
  collector_number     integer NOT NULL,
  rarity               text NOT NULL,
  art_variant          text NOT NULL,
  is_signed            boolean NOT NULL DEFAULT false,
  finish               text NOT NULL,
  artist               text NOT NULL,
  public_code          text NOT NULL,
  printed_rules_text   text NOT NULL,
  printed_effect_text  text NOT NULL DEFAULT '',
  image_url            text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_candidate_printings_rarity CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Showcase')),
  CONSTRAINT chk_candidate_printings_finish CHECK (finish IN ('normal', 'foil'))
);
CREATE INDEX idx_candidate_printings_card ON candidate_printings(candidate_card_id);

-- Maps alternative card names (from different sources) to canonical card IDs.
-- Persists across uploads so name differences only need to be resolved once.
CREATE TABLE card_name_aliases (
  alias       text PRIMARY KEY,
  card_id     text NOT NULL REFERENCES cards(id)
);
```

Relational staging tables (rather than JSONB) give us DB-level constraints on staged data, simple admin edits via UPDATE, and straightforward diffing against existing cards via SQL JOINs.

- **`match_card_id`** is computed server-side on upload (see detection logic below). NULL means new card; non-NULL means update candidate.
- **`provider`** is a free-form label (e.g., a batch name or date).
- **`set_name`** on candidate printings is only needed when the `set_id` doesn't exist yet.

### New vs. Update Detection

On upload, the server classifies each candidate automatically:

1. **Alias match:** `candidate.name` exists in `card_name_aliases` → `match_card_id` is set from the alias mapping
2. **Exact name match:** `candidate.name` matches an existing `cards.name` → `match_card_id` is set
3. **No match:** `match_card_id` stays NULL (new card)

The admin UI shows these in separate tabs.

### Handling Name Mismatches

When a candidate appears as "new" but is actually an existing card under a different name (e.g., "Dr Mundo" vs "Dr. Mundo"), the admin creates a name alias instead of rejecting and re-uploading. The alias maps the alternative name to the canonical card, and the candidate is reclassified as an update. The alias persists — future uploads from any source using the same name will auto-match.

### Admin UI Flow

**Upload:** Admin uploads a JSON file via file picker, optionally enters a source label. The server validates against the Zod schema, computes matches, and inserts candidates. A summary is shown: N new cards, M update candidates, K validation errors.

**Review — New Cards tab** (`match_card_id IS NULL`):

- Card image preview (if `image_url` present in candidate)
- All fields inline-editable
- Accept / Reject per card, or batch accept

**Review — Updates tab** (`match_card_id IS NOT NULL`):

- Side-by-side view: existing card data vs. candidate data
- Field-level diff highlighting (changed values)
- Per-field accept toggles — admin cherry-picks which fields to update
- Accept (with selected fields) / Reject

**Accept (new card):** Upsert set (using `set_name` if new), insert into `cards` and `printings`, download and resize images per ADR-007, set `image_url` to self-hosted path.

**Accept (update):** Apply only the accepted field changes to the existing card/printings. Download and resize any new images.

### API Endpoints

All behind `requireAdmin` middleware:

| Method  | Path                             | Purpose                                         |
| ------- | -------------------------------- | ----------------------------------------------- |
| `POST`  | `/admin/candidates/upload`       | Upload JSON, validate, compute matches, insert  |
| `GET`   | `/admin/candidates`              | List by tab (new/updates) and status            |
| `PATCH` | `/admin/candidates/:id`          | Admin edits candidate fields                    |
| `POST`  | `/admin/candidates/:id/accept`   | Promote to real tables + process images         |
| `POST`  | `/admin/candidates/:id/reject`   | Mark rejected                                   |
| `POST`  | `/admin/candidates/batch-accept` | Accept multiple                                 |
| `POST`  | `/admin/candidates/:id/alias`    | Create alias for candidate name → existing card |

### Shared Utilities

`buildPrintingId()` is extracted from `refresh-catalog.ts` into a shared utility so that both the catalog refresh and the candidate accept flow generate printing IDs consistently.

## Dependencies

- **ADR-007 (Self-Hosted Card Images):** The accept flow uses the image processing pipeline from ADR-007 to download, resize, and store candidate images.

## Implementation Phases

1. **Database migration** — `card_candidates` table
2. **Shared types + Zod schemas** — `CandidateCard` type, validation schemas, extract `buildPrintingId`
3. **API routes** — upload, list, edit, accept, reject, batch accept
4. **Admin UI** — upload page, review tabs, inline editing, diff view
