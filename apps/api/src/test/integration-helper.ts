/**
 * Shared helpers for integration tests.
 *
 * Each test file still owns its own top-level await setup (mock.module must be
 * called at the module scope with the correct relative path), but the reusable
 * pieces — temp DB creation, migration, seeding, request builders, and teardown
 * — live here.
 */
import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
export const noop = () => {};

export const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
} as unknown as Logger;

export function replaceDbName(url: string, name: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

/** Create a temporary database (drops first if leftover from a crash). */
export async function createTempDb(databaseUrl: string, name: string): Promise<void> {
  const adminSql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  await adminSql.end();
}

/** Drop a temporary database. */
export async function dropTempDb(databaseUrl: string, name: string): Promise<void> {
  const sql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  await sql.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await sql.end();
}

export function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api${path}`, opts);
}
