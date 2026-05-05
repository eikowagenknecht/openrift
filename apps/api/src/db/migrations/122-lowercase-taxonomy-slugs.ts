import type { Kysely } from "kysely";
import { sql } from "kysely";

// Lowercases the `slug` PK in the rarities, card_types, domains, and super_types
// reference tables, plus every column that mirrors those slugs (FK columns on
// printings/cards/card_domains/card_super_types and the text columns on
// candidate_printings/candidate_cards). Display `label` columns are left
// untouched so the UI keeps showing "Common", "Legend", etc.
//
// FKs don't have ON UPDATE CASCADE, so they're dropped, parent + children are
// updated, and FKs re-added. The `protect_well_known` trigger blocks renames of
// well-known rows, so it's disabled across the four tables for the duration.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE rarities    DISABLE TRIGGER trg_rarities_protect_well_known;
    ALTER TABLE card_types  DISABLE TRIGGER trg_card_types_protect_well_known;
    ALTER TABLE domains     DISABLE TRIGGER trg_domains_protect_well_known;
    ALTER TABLE super_types DISABLE TRIGGER trg_super_types_protect_well_known
  `.execute(db);

  await sql`
    ALTER TABLE printings        DROP CONSTRAINT fk_printings_rarity;
    ALTER TABLE cards            DROP CONSTRAINT fk_cards_type;
    ALTER TABLE card_domains     DROP CONSTRAINT card_domains_domain_slug_fkey;
    ALTER TABLE card_super_types DROP CONSTRAINT card_super_types_super_type_slug_fkey
  `.execute(db);

  await sql`
    UPDATE rarities    SET slug = lower(slug) WHERE slug <> lower(slug);
    UPDATE card_types  SET slug = lower(slug) WHERE slug <> lower(slug);
    UPDATE domains     SET slug = lower(slug) WHERE slug <> lower(slug);
    UPDATE super_types SET slug = lower(slug) WHERE slug <> lower(slug)
  `.execute(db);

  await sql`
    UPDATE printings        SET rarity          = lower(rarity)          WHERE rarity          <> lower(rarity);
    UPDATE cards            SET type            = lower(type)            WHERE type            <> lower(type);
    UPDATE card_domains     SET domain_slug     = lower(domain_slug)     WHERE domain_slug     <> lower(domain_slug);
    UPDATE card_super_types SET super_type_slug = lower(super_type_slug) WHERE super_type_slug <> lower(super_type_slug)
  `.execute(db);

  // candidate_printings.rarity / candidate_cards.type / candidate_cards.{super_types,domains}
  // mirror the canonical slugs but have no FK, so update them directly.
  await sql`
    UPDATE candidate_printings SET rarity = lower(rarity) WHERE rarity IS NOT NULL AND rarity <> lower(rarity);
    UPDATE candidate_cards     SET type   = lower(type)   WHERE type   IS NOT NULL AND type   <> lower(type);

    UPDATE candidate_cards
       SET super_types = (
         SELECT COALESCE(array_agg(lower(s) ORDER BY ord), '{}'::text[])
           FROM unnest(super_types) WITH ORDINALITY AS t(s, ord)
       )
     WHERE EXISTS (SELECT 1 FROM unnest(super_types) AS t(s) WHERE s <> lower(s));

    UPDATE candidate_cards
       SET domains = (
         SELECT COALESCE(array_agg(lower(d) ORDER BY ord), '{}'::text[])
           FROM unnest(domains) WITH ORDINALITY AS t(d, ord)
       )
     WHERE EXISTS (SELECT 1 FROM unnest(domains) AS t(d) WHERE d <> lower(d))
  `.execute(db);

  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT fk_printings_rarity FOREIGN KEY (rarity) REFERENCES rarities(slug);
    ALTER TABLE cards
      ADD CONSTRAINT fk_cards_type FOREIGN KEY (type) REFERENCES card_types(slug);
    ALTER TABLE card_domains
      ADD CONSTRAINT card_domains_domain_slug_fkey FOREIGN KEY (domain_slug) REFERENCES domains(slug);
    ALTER TABLE card_super_types
      ADD CONSTRAINT card_super_types_super_type_slug_fkey FOREIGN KEY (super_type_slug) REFERENCES super_types(slug)
  `.execute(db);

  await sql`
    ALTER TABLE rarities    ENABLE TRIGGER trg_rarities_protect_well_known;
    ALTER TABLE card_types  ENABLE TRIGGER trg_card_types_protect_well_known;
    ALTER TABLE domains     ENABLE TRIGGER trg_domains_protect_well_known;
    ALTER TABLE super_types ENABLE TRIGGER trg_super_types_protect_well_known
  `.execute(db);
}

// down() restores the original capitalization for the canonical seeded slugs
// from 062-reference-tables. Custom rows added via the admin UI that don't
// match a seeded slug stay lowercase.
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE rarities    DISABLE TRIGGER trg_rarities_protect_well_known;
    ALTER TABLE card_types  DISABLE TRIGGER trg_card_types_protect_well_known;
    ALTER TABLE domains     DISABLE TRIGGER trg_domains_protect_well_known;
    ALTER TABLE super_types DISABLE TRIGGER trg_super_types_protect_well_known
  `.execute(db);

  await sql`
    ALTER TABLE printings        DROP CONSTRAINT fk_printings_rarity;
    ALTER TABLE cards            DROP CONSTRAINT fk_cards_type;
    ALTER TABLE card_domains     DROP CONSTRAINT card_domains_domain_slug_fkey;
    ALTER TABLE card_super_types DROP CONSTRAINT card_super_types_super_type_slug_fkey
  `.execute(db);

  await sql`
    UPDATE rarities SET slug = CASE slug
      WHEN 'common'   THEN 'Common'
      WHEN 'uncommon' THEN 'Uncommon'
      WHEN 'rare'     THEN 'Rare'
      WHEN 'epic'     THEN 'Epic'
      WHEN 'showcase' THEN 'Showcase'
    END WHERE slug IN ('common','uncommon','rare','epic','showcase');

    UPDATE card_types SET slug = CASE slug
      WHEN 'legend'      THEN 'Legend'
      WHEN 'unit'        THEN 'Unit'
      WHEN 'rune'        THEN 'Rune'
      WHEN 'spell'       THEN 'Spell'
      WHEN 'gear'        THEN 'Gear'
      WHEN 'battlefield' THEN 'Battlefield'
      WHEN 'other'       THEN 'Other'
    END WHERE slug IN ('legend','unit','rune','spell','gear','battlefield','other');

    UPDATE domains SET slug = CASE slug
      WHEN 'fury'      THEN 'Fury'
      WHEN 'calm'      THEN 'Calm'
      WHEN 'mind'      THEN 'Mind'
      WHEN 'body'      THEN 'Body'
      WHEN 'chaos'     THEN 'Chaos'
      WHEN 'order'     THEN 'Order'
      WHEN 'colorless' THEN 'Colorless'
    END WHERE slug IN ('fury','calm','mind','body','chaos','order','colorless');

    UPDATE super_types SET slug = CASE slug
      WHEN 'basic'     THEN 'Basic'
      WHEN 'champion'  THEN 'Champion'
      WHEN 'signature' THEN 'Signature'
      WHEN 'token'     THEN 'Token'
    END WHERE slug IN ('basic','champion','signature','token')
  `.execute(db);

  await sql`
    UPDATE printings SET rarity = CASE rarity
      WHEN 'common'   THEN 'Common'
      WHEN 'uncommon' THEN 'Uncommon'
      WHEN 'rare'     THEN 'Rare'
      WHEN 'epic'     THEN 'Epic'
      WHEN 'showcase' THEN 'Showcase'
    END WHERE rarity IN ('common','uncommon','rare','epic','showcase');

    UPDATE cards SET type = CASE type
      WHEN 'legend'      THEN 'Legend'
      WHEN 'unit'        THEN 'Unit'
      WHEN 'rune'        THEN 'Rune'
      WHEN 'spell'       THEN 'Spell'
      WHEN 'gear'        THEN 'Gear'
      WHEN 'battlefield' THEN 'Battlefield'
      WHEN 'other'       THEN 'Other'
    END WHERE type IN ('legend','unit','rune','spell','gear','battlefield','other');

    UPDATE card_domains SET domain_slug = CASE domain_slug
      WHEN 'fury'      THEN 'Fury'
      WHEN 'calm'      THEN 'Calm'
      WHEN 'mind'      THEN 'Mind'
      WHEN 'body'      THEN 'Body'
      WHEN 'chaos'     THEN 'Chaos'
      WHEN 'order'     THEN 'Order'
      WHEN 'colorless' THEN 'Colorless'
    END WHERE domain_slug IN ('fury','calm','mind','body','chaos','order','colorless');

    UPDATE card_super_types SET super_type_slug = CASE super_type_slug
      WHEN 'basic'     THEN 'Basic'
      WHEN 'champion'  THEN 'Champion'
      WHEN 'signature' THEN 'Signature'
      WHEN 'token'     THEN 'Token'
    END WHERE super_type_slug IN ('basic','champion','signature','token')
  `.execute(db);

  await sql`
    UPDATE candidate_printings SET rarity = CASE rarity
      WHEN 'common'   THEN 'Common'
      WHEN 'uncommon' THEN 'Uncommon'
      WHEN 'rare'     THEN 'Rare'
      WHEN 'epic'     THEN 'Epic'
      WHEN 'showcase' THEN 'Showcase'
    END WHERE rarity IN ('common','uncommon','rare','epic','showcase');

    UPDATE candidate_cards SET type = CASE type
      WHEN 'legend'      THEN 'Legend'
      WHEN 'unit'        THEN 'Unit'
      WHEN 'rune'        THEN 'Rune'
      WHEN 'spell'       THEN 'Spell'
      WHEN 'gear'        THEN 'Gear'
      WHEN 'battlefield' THEN 'Battlefield'
      WHEN 'other'       THEN 'Other'
    END WHERE type IN ('legend','unit','rune','spell','gear','battlefield','other');

    UPDATE candidate_cards
       SET super_types = (
         SELECT COALESCE(array_agg(
                  CASE s
                    WHEN 'basic'     THEN 'Basic'
                    WHEN 'champion'  THEN 'Champion'
                    WHEN 'signature' THEN 'Signature'
                    WHEN 'token'     THEN 'Token'
                    ELSE s
                  END
                  ORDER BY ord), '{}'::text[])
           FROM unnest(super_types) WITH ORDINALITY AS t(s, ord)
       )
     WHERE EXISTS (
       SELECT 1 FROM unnest(super_types) AS t(s)
        WHERE s IN ('basic','champion','signature','token')
     );

    UPDATE candidate_cards
       SET domains = (
         SELECT COALESCE(array_agg(
                  CASE d
                    WHEN 'fury'      THEN 'Fury'
                    WHEN 'calm'      THEN 'Calm'
                    WHEN 'mind'      THEN 'Mind'
                    WHEN 'body'      THEN 'Body'
                    WHEN 'chaos'     THEN 'Chaos'
                    WHEN 'order'     THEN 'Order'
                    WHEN 'colorless' THEN 'Colorless'
                    ELSE d
                  END
                  ORDER BY ord), '{}'::text[])
           FROM unnest(domains) WITH ORDINALITY AS t(d, ord)
       )
     WHERE EXISTS (
       SELECT 1 FROM unnest(domains) AS t(d)
        WHERE d IN ('fury','calm','mind','body','chaos','order','colorless')
     )
  `.execute(db);

  await sql`
    ALTER TABLE printings
      ADD CONSTRAINT fk_printings_rarity FOREIGN KEY (rarity) REFERENCES rarities(slug);
    ALTER TABLE cards
      ADD CONSTRAINT fk_cards_type FOREIGN KEY (type) REFERENCES card_types(slug);
    ALTER TABLE card_domains
      ADD CONSTRAINT card_domains_domain_slug_fkey FOREIGN KEY (domain_slug) REFERENCES domains(slug);
    ALTER TABLE card_super_types
      ADD CONSTRAINT card_super_types_super_type_slug_fkey FOREIGN KEY (super_type_slug) REFERENCES super_types(slug)
  `.execute(db);

  await sql`
    ALTER TABLE rarities    ENABLE TRIGGER trg_rarities_protect_well_known;
    ALTER TABLE card_types  ENABLE TRIGGER trg_card_types_protect_well_known;
    ALTER TABLE domains     ENABLE TRIGGER trg_domains_protect_well_known;
    ALTER TABLE super_types ENABLE TRIGGER trg_super_types_protect_well_known
  `.execute(db);
}
