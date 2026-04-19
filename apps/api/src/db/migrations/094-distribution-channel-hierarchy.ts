import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("distribution_channels")
    .addColumn("parent_id", "uuid")
    .addColumn("children_label", "text")
    .execute();

  await db.schema
    .alterTable("distribution_channels")
    .addForeignKeyConstraint(
      "distribution_channels_parent_id_fkey",
      ["parent_id"],
      "distribution_channels",
      ["id"],
    )
    .onDelete("restrict")
    .execute();

  await db.schema
    .alterTable("distribution_channels")
    .addCheckConstraint(
      "distribution_channels_no_self_parent",
      sql`parent_id IS NULL OR parent_id <> id`,
    )
    .execute();

  await db.schema
    .alterTable("distribution_channels")
    .addCheckConstraint(
      "distribution_channels_children_label_check",
      sql`children_label IS NULL OR children_label <> ''`,
    )
    .execute();

  await db.schema
    .createIndex("idx_distribution_channels_parent_id")
    .on("distribution_channels")
    .column("parent_id")
    .execute();

  // Hierarchy validation: cycle detection, kind consistency with parent and
  // children, and leaf-only printing assignment (a parent cannot already have
  // printings attached when its first child is created).
  await sql`
    CREATE FUNCTION trg_distribution_channels_validate() RETURNS trigger AS $$
    DECLARE
      parent_kind text;
      cursor_id uuid;
      depth int := 0;
    BEGIN
      IF NEW.parent_id IS NOT NULL THEN
        SELECT kind INTO parent_kind FROM distribution_channels WHERE id = NEW.parent_id;
        IF parent_kind IS NULL THEN
          RAISE EXCEPTION 'Parent distribution channel % not found', NEW.parent_id;
        END IF;
        IF parent_kind <> NEW.kind THEN
          RAISE EXCEPTION 'Child channel kind (%) must match parent kind (%)',
            NEW.kind, parent_kind;
        END IF;

        cursor_id := NEW.parent_id;
        WHILE cursor_id IS NOT NULL AND depth < 32 LOOP
          IF cursor_id = NEW.id THEN
            RAISE EXCEPTION 'Cycle detected in distribution channel hierarchy';
          END IF;
          SELECT parent_id INTO cursor_id FROM distribution_channels WHERE id = cursor_id;
          depth := depth + 1;
        END LOOP;
        IF depth >= 32 THEN
          RAISE EXCEPTION 'Distribution channel hierarchy exceeds maximum depth';
        END IF;

        IF EXISTS (
          SELECT 1 FROM printing_distribution_channels WHERE channel_id = NEW.parent_id
        ) THEN
          RAISE EXCEPTION 'Cannot attach child under channel % because it already has printings',
            NEW.parent_id;
        END IF;
      END IF;

      IF TG_OP = 'UPDATE' AND NEW.kind IS DISTINCT FROM OLD.kind THEN
        IF EXISTS (
          SELECT 1 FROM distribution_channels WHERE parent_id = NEW.id AND kind <> NEW.kind
        ) THEN
          RAISE EXCEPTION 'Cannot change kind of % because children have a different kind',
            NEW.id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER distribution_channels_validate
    BEFORE INSERT OR UPDATE ON distribution_channels
    FOR EACH ROW EXECUTE FUNCTION trg_distribution_channels_validate()
  `.execute(db);

  // Printings can only link to leaf channels (no children). Enforced on insert
  // and update of the join table.
  await sql`
    CREATE FUNCTION trg_printing_distribution_channels_validate() RETURNS trigger AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM distribution_channels WHERE parent_id = NEW.channel_id) THEN
        RAISE EXCEPTION 'Channel % has children; printings can only link to leaf channels',
          NEW.channel_id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER printing_distribution_channels_validate
    BEFORE INSERT OR UPDATE ON printing_distribution_channels
    FOR EACH ROW EXECUTE FUNCTION trg_printing_distribution_channels_validate()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS printing_distribution_channels_validate ON printing_distribution_channels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS trg_printing_distribution_channels_validate()`.execute(db);
  await sql`DROP TRIGGER IF EXISTS distribution_channels_validate ON distribution_channels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS trg_distribution_channels_validate()`.execute(db);

  await db.schema.dropIndex("idx_distribution_channels_parent_id").ifExists().execute();

  await db.schema
    .alterTable("distribution_channels")
    .dropConstraint("distribution_channels_children_label_check")
    .execute();
  await db.schema
    .alterTable("distribution_channels")
    .dropConstraint("distribution_channels_no_self_parent")
    .execute();
  await db.schema
    .alterTable("distribution_channels")
    .dropConstraint("distribution_channels_parent_id_fkey")
    .execute();

  await db.schema
    .alterTable("distribution_channels")
    .dropColumn("children_label")
    .dropColumn("parent_id")
    .execute();
}
