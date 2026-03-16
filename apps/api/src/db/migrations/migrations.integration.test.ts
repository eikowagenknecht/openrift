import { afterAll, beforeAll, describe, it } from "bun:test";

import type { Kysely } from "kysely";

import type { Logger } from "../../logger.js";
import { setupTestDb } from "../../test/integration-setup.js";
import { migrate, rollback } from "../migrate.js";
import type { Database } from "../types.js";
import { migrations } from "./index.js";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("migrations up/down cycle", () => {
  let db: Kysely<Database>;
  let log: Logger;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by describe.skipIf
    ({ db, log, teardown } = await setupTestDb(DATABASE_URL!, "migrations"));
  });

  afterAll(async () => {
    await teardown();
  });

  it("reports already up to date on second migrate", async () => {
    // setupTestDb already ran all migrations, so this is a no-op
    await migrate(db, log);
  });

  it("rolls back all migrations one by one", async () => {
    const count = Object.keys(migrations).length;
    for (let i = 0; i < count; i++) {
      await rollback(db, log);
    }
  });

  it("reports nothing to roll back on empty database", async () => {
    await rollback(db, log);
  });

  it("re-applies all migrations from scratch", async () => {
    await migrate(db, log);
  });
});
