import type { Kysely } from "kysely";

import type { Database } from "../db/types.js";
import { buildPrintingId } from "../utils.js";

interface IngestCard {
  name: string;
  type: string;
  super_types: string[];
  domains: string[];
  might: number | null;
  energy: number | null;
  power: number | null;
  might_bonus: number | null;
  rules_text: string;
  effect_text: string;
  tags: string[];
  source_id?: string | null;
  source_entity_id?: string | null;
  extra_data?: unknown | null;
  printings: IngestPrinting[];
}

interface IngestPrinting {
  source_id: string;
  set_id: string;
  set_name?: string | null;
  collector_number: number;
  rarity: string;
  art_variant: string;
  is_signed: boolean;
  is_promo: boolean;
  finish: string;
  artist: string;
  public_code: string;
  printed_rules_text: string;
  printed_effect_text: string;
  image_url?: string | null;
  flavor_text?: string;
  extra_data?: unknown | null;
}

export interface UpdatedCardDetail {
  name: string;
  sourceId: string | null;
  fields: { field: string; from: unknown; to: unknown }[];
}

export interface IngestResult {
  newCards: number;
  updates: number;
  unchanged: number;
  errors: string[];
  updatedCards: UpdatedCardDetail[];
}

function jsonOrNull(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return null;
  }
  return value;
}

const CARD_FIELDS = [
  "name",
  "type",
  "super_types",
  "domains",
  "might",
  "energy",
  "power",
  "might_bonus",
  "rules_text",
  "effect_text",
  "tags",
  "source_id",
  "source_entity_id",
  "extra_data",
] as const;

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  ) {
    return null;
  }
  return value;
}

function getChangedFields(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  fields: readonly string[],
): { field: string; from: unknown; to: unknown }[] {
  const diffs: { field: string; from: unknown; to: unknown }[] = [];
  for (const f of fields) {
    if (!(f in incoming)) {
      continue;
    }
    const a = normalize(existing[f]);
    const b = normalize(incoming[f]);
    let changed = false;
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changed = true;
      }
    } else if (a !== b) {
      changed = true;
    }
    if (changed) {
      diffs.push({ field: f, from: a, to: b });
    }
  }
  return diffs;
}

/**
 * Ingest card data from a named source into card_sources / printing_sources.
 *
 * For each card:
 * 1. Match card_id via aliases -> exact name -> null
 * 2. Find existing card_sources row by (source, card_id) or (source, name)
 * 3. If found and changed: update, reset checked_at. Unchanged: skip.
 * 4. If not found: insert new row.
 * 5. Same for printing_sources.
 *
 * @returns Counts of new, updated, unchanged cards and any errors.
 */
export async function ingestCardSources(
  db: Kysely<Database>,
  source: string,
  cards: IngestCard[],
): Promise<IngestResult> {
  if (!source.trim()) {
    throw new Error("source name must not be empty");
  }

  // Load alias table for matching
  const aliasRows = await db.selectFrom("card_name_aliases").select(["alias", "card_id"]).execute();
  const aliasMap = new Map(aliasRows.map((r) => [r.alias.toLowerCase(), r.card_id]));

  // Load existing card names for exact matching
  const cardRows = await db.selectFrom("cards").select(["id", "name"]).execute();
  const nameToCardId = new Map(cardRows.map((r) => [r.name.toLowerCase(), r.id]));

  let newCards = 0;
  let updates = 0;
  let unchanged = 0;
  const errors: string[] = [];
  const updatedCards: UpdatedCardDetail[] = [];

  for (const card of cards) {
    try {
      const nameLower = card.name.toLowerCase();
      const matchCardId = aliasMap.get(nameLower) ?? nameToCardId.get(nameLower) ?? null;

      // oxlint-disable-next-line no-loop-func -- sequential per-card transactions that share counters
      await db.transaction().execute(async (trx) => {
        // Find existing card_source row: by (source, source_id) if available,
        // otherwise by (source, name) for entries without source_id
        const existingCardSource = card.source_id
          ? await trx
              .selectFrom("card_sources")
              .selectAll()
              .where("source", "=", source)
              .where("source_id", "=", card.source_id)
              .executeTakeFirst()
          : await trx
              .selectFrom("card_sources")
              .selectAll()
              .where("source", "=", source)
              .where("name", "=", card.name)
              .where("source_id", "is", null)
              .executeTakeFirst();

        let cardSourceId: string;

        if (existingCardSource) {
          // Compare fields to see if anything changed
          const changedFields = getChangedFields(
            existingCardSource as unknown as Record<string, unknown>,
            card as unknown as Record<string, unknown>,
            CARD_FIELDS,
          );

          if (changedFields.length > 0) {
            updatedCards.push({
              name: card.name,
              sourceId: card.source_id ?? null,
              fields: changedFields,
            });
            await trx
              .updateTable("card_sources")
              .set({
                card_id: matchCardId,
                name: card.name,
                type: card.type,
                super_types: card.super_types,
                domains: card.domains,
                might: card.might,
                energy: card.energy,
                power: card.power,
                might_bonus: card.might_bonus,
                rules_text: card.rules_text,
                effect_text: card.effect_text,
                tags: card.tags,
                ...(card.source_id !== undefined && { source_id: card.source_id ?? null }),
                ...(card.source_entity_id !== undefined && {
                  source_entity_id: card.source_entity_id ?? null,
                }),
                ...(card.extra_data !== undefined && { extra_data: jsonOrNull(card.extra_data) }),
                checked_at: null,
                updated_at: new Date(),
              })
              .where("id", "=", existingCardSource.id)
              .execute();
            updates++;
          } else {
            // Update card_id if it was previously unmatched
            if (matchCardId && !existingCardSource.card_id) {
              await trx
                .updateTable("card_sources")
                .set({ card_id: matchCardId, updated_at: new Date() })
                .where("id", "=", existingCardSource.id)
                .execute();
            }
            unchanged++;
          }
          cardSourceId = existingCardSource.id;
        } else {
          // Insert new card_source
          const [inserted] = await trx
            .insertInto("card_sources")
            .values({
              card_id: matchCardId,
              source,
              name: card.name,
              type: card.type,
              super_types: card.super_types,
              domains: card.domains,
              might: card.might,
              energy: card.energy,
              power: card.power,
              might_bonus: card.might_bonus,
              rules_text: card.rules_text,
              effect_text: card.effect_text,
              tags: card.tags,
              ...(card.source_id !== undefined && { source_id: card.source_id ?? null }),
              ...(card.source_entity_id !== undefined && {
                source_entity_id: card.source_entity_id ?? null,
              }),
              ...(card.extra_data !== undefined && { extra_data: jsonOrNull(card.extra_data) }),
            })
            .returning("id")
            .execute();
          cardSourceId = inserted.id;
          newCards++;
        }

        // Process printings
        for (const p of card.printings) {
          const printingId = matchCardId
            ? buildPrintingId(
                p.source_id,
                p.art_variant || "normal",
                p.is_signed,
                p.is_promo,
                p.finish,
              )
            : null;

          // Check if the printing actually exists
          let resolvedPrintingId: string | null = null;
          if (printingId) {
            const exists = await trx
              .selectFrom("printings")
              .select("id")
              .where("id", "=", printingId)
              .executeTakeFirst();
            resolvedPrintingId = exists ? printingId : null;
          }

          // Find existing printing_source
          const existingPS = resolvedPrintingId
            ? await trx
                .selectFrom("printing_sources")
                .selectAll()
                .where("card_source_id", "=", cardSourceId)
                .where("printing_id", "=", resolvedPrintingId)
                .executeTakeFirst()
            : await trx
                .selectFrom("printing_sources")
                .selectAll()
                .where("card_source_id", "=", cardSourceId)
                .where("source_id", "=", p.source_id)
                .where("finish", "=", p.finish)
                .executeTakeFirst();

          const printingFields = {
            source_id: p.source_id,
            set_id: p.set_id,
            set_name: p.set_name ?? null,
            collector_number: p.collector_number,
            rarity: p.rarity,
            art_variant: p.art_variant,
            is_signed: p.is_signed,
            is_promo: p.is_promo,
            finish: p.finish,
            artist: p.artist,
            public_code: p.public_code,
            printed_rules_text: p.printed_rules_text,
            printed_effect_text: p.printed_effect_text,
            image_url: p.image_url ?? null,
            flavor_text: p.flavor_text ?? "",
            extra_data: jsonOrNull(p.extra_data),
          };

          if (existingPS) {
            const pChangedFields = getChangedFields(
              existingPS as unknown as Record<string, unknown>,
              printingFields as unknown as Record<string, unknown>,
              Object.keys(printingFields),
            );

            if (pChangedFields.length > 0) {
              await trx
                .updateTable("printing_sources")
                .set({
                  ...printingFields,
                  // Preserve manually-assigned printing_id; only auto-assign if unset
                  ...(!existingPS.printing_id && resolvedPrintingId
                    ? { printing_id: resolvedPrintingId }
                    : {}),
                  checked_at: null,
                  updated_at: new Date(),
                })
                .where("id", "=", existingPS.id)
                .execute();
            } else if (resolvedPrintingId && !existingPS.printing_id) {
              await trx
                .updateTable("printing_sources")
                .set({ printing_id: resolvedPrintingId, updated_at: new Date() })
                .where("id", "=", existingPS.id)
                .execute();
            }
          } else {
            await trx
              .insertInto("printing_sources")
              .values({
                card_source_id: cardSourceId,
                printing_id: resolvedPrintingId,
                ...printingFields,
              })
              .execute();
          }
        }
      });
    } catch (error) {
      errors.push(`${card.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { newCards, updates, unchanged, errors, updatedCards };
}
