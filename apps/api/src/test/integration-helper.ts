/**
 * Shared helpers for integration tests.
 *
 * Each test file still owns its own top-level await setup (mock.module must be
 * called at the module scope with the correct relative path), but the reusable
 * pieces — temp DB creation, migration, seeding, request builders, and teardown
 * — live here.
 */

export { createTempDb, dropTempDb, noopLogger, replaceDbName } from "./integration-setup.js";

export function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api/v1${path}`, opts);
}

/**
 * Like {@link req}, but targets the admin surface mounted at /api/admin/v1
 * instead of the public /api/v1. Pass the path WITHOUT the admin base,
 * e.g. `adminReq("GET", "/me")` → `/api/admin/v1/me`.
 * @returns A Request aimed at the admin API base.
 */
export function adminReq(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api/admin/v1${path}`, opts);
}
