---
status: accepted
date: 2026-07-07
---

# ADR-038: Per-Copy Metadata (Condition, Grading, Notes, Links)

## Context and Problem Statement

Users want to record the physical state of an owned copy: its ungraded condition, a
professional grade, whether it is altered, public and private notes, and links to photos
or videos. A `copies` row today is only `id, collection_id, printing_id, timestamps`.
ADR-005 chose one row per physical copy specifically so this metadata could attach later
and lists it under Deferred Features. How do we store, expose, and edit per-copy metadata
end to end?

## Decision Drivers

- The client syncs whole copy rows through a single TanStack DB collection; the design
  should keep one synced row per copy, with no extra joins or second synced entity.
- Imports currently discard condition data: the Piltover Archive column lands in a
  display-only bag, RiftMana's `NM:2;HP:3` encoding is dropped, and quantities are
  summed across conditions.
- The planned trades follow-up (condition as a rule filter, `desired_condition` on
  wishes, keep-priority ranking) needs an ordered condition vocabulary, not free text.
- Public share pages must show public metadata but never private notes.

## Considered Options

1. **Nullable metadata columns on `copies`** plus `conditions`/`graders` lookup tables.
2. **1:1 side table** (`copy_details`), joined on demand, rows only for annotated copies.
3. **Single `metadata jsonb` blob** on `copies`.

## Decision Outcome

Chosen option: **nullable columns on `copies` (option 1)**, because typed columns take
FK and check constraints, can be indexed for the future rule filters, and ride the
existing one-row-per-copy sync unchanged.

Option 2 avoids widening the copies feed but adds a join to every copy read and a second
write path for data with no independent lifecycle. Option 3 cannot reference the lookup
tables, pushes all validation into app code, and hits the Bun jsonb-as-string footgun on
every field instead of only on links.

### Consequences

- Good, because the ADR-005 copy-row model absorbs the feature without remodeling;
  counts, stacks, moves, and trades keep working on the same rows.
- Good, because imports stop destroying condition data (per-condition entries instead of
  summed quantities).
- Good, because the ordered `conditions` table is ready to slot into keep-priority
  ranking and rule filters when the trades follow-up lands.
- Bad, because every synced copy row widens for all users, mostly with NULLs. Accepted:
  the payload cost is small and capped by validation limits.
- Bad, because "private" carries two scopes: owner-only on personal collections
  (including ones shared into a group), but member-visible on group-owned collections,
  where a communal copy has no single owner. Accepted and stated in the field's UI copy.
- Bad, because a slabbed copy cannot also record a raw condition (mutual exclusivity).
  Accepted: the grade is the condition of a graded card.

### Confirmation

- `docs/schema.sql` shows the new columns, both lookup tables, and both check
  constraints.
- Integration tests: `copies.update` rejects viewers without write access; public
  collection routes never return `notes_private`; `copies.add` persists metadata.
- Route test: the group shared-collection view nulls `notesPrivate` for non-owner
  members (personal collections shared into a group stay owner-only).
- Unit tests: import parsers emit per-condition entries and map foreign scales onto the
  house scale; the links repo parse accepts both jsonb shapes (string and object).

## Design Decisions

### Schema

- `conditions (slug, label, sort_order)`, seeded with the Cardmarket scale: `mint`,
  `near-mint`, `excellent`, `good`, `light-played`, `played`, `poor`. Wired into the
  enums repo so `useEnumOrders()` serves labels and ordering.
- `graders (slug, label, sort_order)`, seeded with `psa`, `bgs`, `cgc`, `sgc`, `tag`.
  New graders are data inserts, not migrations.
- `copies` gains: `condition` (FK `conditions`), `grader` (FK `graders`),
  `grade double precision` (1 to 10 in half steps, check-enforced; `numeric` would
  come back from postgres.js as a string, precedent in migration 145), `notes_public
text`, `notes_private text`, `is_altered boolean NOT NULL DEFAULT false`,
  `links jsonb NOT NULL DEFAULT '[]'`.
- `CHECK ((grader IS NULL) = (grade IS NULL))` and
  `CHECK (condition IS NULL OR grader IS NULL)`: a copy is either ungraded with an
  optional condition, or graded with grader plus grade and no condition.
- `NULL` condition means unrecorded. Existing copies stay `NULL`; no backfill.
- `links` holds an ordered array of `{url, label?}`. Repo reads parse defensively
  (string or object) per the `user-preferences.ts` pattern.

### Contract and API

- `copyResponseSchema` gains `condition`, `grader`, `grade`, `notesPublic`,
  `notesPrivate`, `isAltered`, `links`.
- `copies.add` items accept the metadata fields optionally, so imports persist
  condition at insert time.
- New `copies.update`: `{copyIds, patch}`, mirroring `move`'s shape. One partial patch
  applies to all listed copies after the same writability check; the batch shape leaves
  room for later bulk edits ("mark selected as Played").
- Validation: links capped at 10 entries, http(s) URLs only; notes capped at 2000
  characters each; grade accepts 1 to 10 in 0.5 steps.

### Visibility

- The authenticated copies feed serves only the viewer's own personal collections and
  the group-owned collections of their groups, so it returns full rows: private notes
  on a communal group-owned copy are visible to every member.
- A personal collection shared into a group is read through the group
  shared-collection route, which nulls `notesPrivate` for every viewer except the
  owner. Private notes on personally-owned copies stay owner-only.
- `publicCopyResponseSchema` gains everything except `notesPrivate`: condition, grader,
  grade, altered flag, public notes, links.

### UI

- One "Copy details" dialog for viewing and editing. In copies view it opens from the
  tile context menu. Stacked views get a "Copies…" context-menu entry listing the
  stack's copies (condition or grade summary per row) that opens the same dialog.
- Copy tiles in copies view show badges: a condition or grade chip, an altered marker,
  and note/photo indicators. Stacked tiles show a single indicator when any copy in the
  stack carries metadata.

### Import and export

- The native CSV format gains Condition, Grader, Grade, Altered, Public Notes, Private
  Notes, and Links columns, and the importer reads them back (full round-trip).
- Piltover Archive export writes the real condition, keeping the `NM` fallback for
  unrecorded copies because the format requires a value. Imports map foreign scales onto
  the house scale, stop summing rows across conditions, and parse RiftMana's `NM:2;HP:3`
  encoding into per-condition entries.

## Migration Shape

1. Migration: lookup tables, `copies` columns, constraints; register in the migration
   barrel; regenerate `docs/schema.sql`.
2. Shared contract: response-schema fields, add-input metadata, `copies.update`.
3. API: widen copy SELECTs, links jsonb parse, update service and route, public share
   projection.
4. Web data layer: `CopyResponse` flows into the synced collection unchanged; new
   optimistic `useUpdateCopies` mutation.
5. UI: copy-details dialog, context-menu entries, tile badges.
6. Import/export changes.

## More Information

- Deferred to the trades follow-up, per ADR-005's plan: condition as a dynamic list-rule
  filter, `desired_condition` on wish entries, condition as a keep-priority axis in
  `list-rule-eval.ts`, and collection-browser filters by condition/graded/altered.
- Also out of scope: `collection_events` entries for metadata edits (the ledger stays a
  movement history) and per-copy acquisition cost (still deferred from ADR-005).
