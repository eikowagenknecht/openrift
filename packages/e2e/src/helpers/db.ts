import postgres from "postgres";

// Re-implementation of the helpers from apps/api/src/test/integration-setup.ts
// to avoid importing from the API package directly (different workspace, no build step).

const noop = () => {};

export function replaceDbName(url: string, dbName: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
}

export async function createTempDb(databaseUrl: string, label: string): Promise<string> {
  const name = `openrift_test_${label}_${Date.now()}`;
  const adminSql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  await adminSql.end();
  return name;
}

export async function dropTempDb(databaseUrl: string, name: string): Promise<void> {
  const sql = postgres(replaceDbName(databaseUrl, "postgres"), { onnotice: noop });
  await sql.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
  );
  await sql.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await sql.end();
}

export function connectToDb(url: string) {
  return postgres(url, { onnotice: noop });
}
