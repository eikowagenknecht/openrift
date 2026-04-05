import type { Kysely } from "kysely";

/** Placeholder for squashed migrations — these were folded into 001-core-schema. */
// oxlint-disable-next-line no-empty-function -- intentional no-op for squashed migrations
export async function up(_db: Kysely<unknown>): Promise<void> {}
// oxlint-disable-next-line no-empty-function -- intentional no-op for squashed migrations
export async function down(_db: Kysely<unknown>): Promise<void> {}
