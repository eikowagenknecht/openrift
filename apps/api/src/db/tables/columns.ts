import type { ColumnType } from "kysely";

export type CreatedAt = ColumnType<Date, Date | undefined, Date>;

export type UpdatedAt = ColumnType<Date, Date | undefined, Date>;
