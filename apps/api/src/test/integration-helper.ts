/**
 * mock.module must still be called at each test file's own module scope with
 * the correct relative path; only the reusable setup/teardown pieces live here.
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
 * Like {@link req}, but targets /api/admin/v1. Pass the path WITHOUT the
 * admin base, e.g. `adminReq("GET", "/me")` → `/api/admin/v1/me`.
 */
export function adminReq(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api/admin/v1${path}`, opts);
}
