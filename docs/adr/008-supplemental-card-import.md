---
status: accepted
date: 2026-03-09
---

# ADR-008: Supplemental Card Import Pipeline

## Context and Problem Statement

OpenRift's card catalog at the time of this decision covered 664 cards across 3 sets, but was missing cards that existed elsewhere — notably the Arcane Box Set, two Spiritforged tokens, and all promo cards. We needed a way to supplement the catalog with data from other sources.

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
                          POST /admin/cards/candidates (ingest)
                              ↓
                          candidate_cards + candidate_printings (staging)
                              ↓
                          Admin UI: review & edit
                              ↓
              Accept       Reject
                ↓             ↓
        cards / printings   ignored_candidate_cards
        + image rehost      / ignored_candidate_printings
        (ADR-007)           (skip on re-upload)
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

### Staging Tables

The live shape ships in `docs/schema.sql` — the design principles that landed:

- **Relational staging** (not JSONB blobs): `candidate_cards` and `candidate_printings` mirror the production card/printing shape so admin edits are plain `UPDATE`s and diffs against existing rows are SQL JOINs.
- **`provider` + `external_id`** form the natural key for incoming candidates — the same upstream record uploaded twice updates the existing row instead of creating a duplicate.
- **`extra_data jsonb`** on each staging row carries provider-specific fields that don't map cleanly to the production schema, so a new data source can be added without a migration.
- **Non-empty CHECK constraints** on every text field — provider, external_id, name, short_code, etc. — so empty-string garbage never reaches the staging table.
- **No `status` column.** The original design tracked `pending` / `accepted` / `rejected` on the candidate row; reality dropped that in favor of presence semantics: accepted candidates promote into `cards` / `printings` and disappear from staging; rejected candidates move into `ignored_candidate_cards` / `ignored_candidate_printings`. Re-uploading an ignored `(provider, external_id)` is skipped at ingest, so the admin doesn't have to reject the same junk twice.
- **`card_name_aliases (card_id uuid, norm_name text)`** maps normalized alternative names to canonical cards. Matching is done by `norm_name` (lowercased, punctuation stripped) rather than literal `name`, which absorbs typographic variants like "Dr Mundo" vs "Dr. Mundo" without needing per-variant aliases.

### New vs. Update Detection

On ingest, the server normalizes each candidate's name into `norm_name` and tries to match it:

1. **Alias match:** `norm_name` exists in `card_name_aliases` → maps to that `card_id`.
2. **Direct normalized-name match:** `norm_name` matches an existing `cards.norm_name` → that's the match.
3. **No match:** treated as a new-card candidate.

The admin UI lists matched and unmatched candidates separately.

### Handling Name Mismatches

When a candidate appears as "new" but is actually an existing card under a different normalized name, the admin adds an entry to `card_name_aliases` and the candidate is reclassified as an update. The alias persists — future uploads from any source that normalize to the same form auto-match.

### Admin UI Flow

**Upload:** Admin uploads a JSON file via file picker, optionally enters a source label. The server validates against the Zod schema, computes matches, and inserts candidates. A summary is shown: N new cards, M update candidates, K validation errors.

**Review — New Cards tab** (candidates whose `norm_name` matches nothing):

- Card image preview (if `image_url` present in candidate)
- All fields inline-editable
- Accept / Reject per card, or batch accept

**Review — Updates tab** (candidates whose `norm_name` matches an existing card directly or via `card_name_aliases`):

- Side-by-side view: existing card data vs. candidate data
- Field-level diff highlighting (changed values)
- Per-field accept toggles — admin cherry-picks which fields to update
- Accept (with selected fields) / Reject

**Accept (new card):** Upsert set (using `set_name` if new), insert into `cards` and `printings`. Image rehosting happens through `image_files` + `printing_images` per ADR-007 — there is no `printings.image_url` column to write.

**Accept (update):** Apply only the accepted field changes to the existing card/printings. Rehost any new images via the same path.

### API Endpoints

Routes live under `/admin/cards/` and `/admin/ignored-candidates/`. See `apps/api/src/routes/admin/cards/queries.ts`, `apps/api/src/routes/admin/cards/mutations.ts`, and `apps/api/src/routes/admin/ignored-candidates.ts` for the live surface. The original draft scoped everything under `/admin/candidates/`; that path tree never shipped.

### Shared Utilities

`buildPrintingId()` is extracted from `refresh-catalog.ts` into a shared utility so that both the catalog refresh and the candidate accept flow generate printing IDs consistently.

## Dependencies

- **ADR-007 (Self-Hosted Card Images):** The accept flow uses the image processing pipeline from ADR-007 to download, resize, and store candidate images.

## Implementation Notes

- The staging tables ship as `candidate_cards` + `candidate_printings` (the draft called them `card_candidates`); both are owned by `apps/api/src/repositories/candidate-cards.ts`.
- Reject handling diverged from the design: rather than a `status='rejected'` row on the candidate table, rejecting a candidate moves it into `ignored_candidate_cards` / `ignored_candidate_printings` keyed by `(provider, external_id)`. Subsequent ingests skip those keys so the same junk never re-surfaces in the review queue.
- `buildPrintingId()` is shared between the catalog refresh and the candidate accept flow.
