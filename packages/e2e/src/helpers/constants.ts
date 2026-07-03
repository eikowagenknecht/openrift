// Dedicated e2e port range, deliberately clear of the dev servers (web 5173,
// api 3000) and the worktree dev web port (5174, see docs/contributing.md). Overridable
// via env so a second checkout or CI shard can shift the whole pair without a
// code change. Keep the two adjacent so the range stays easy to reason about.
export const API_PORT = Number(process.env.E2E_API_PORT ?? 4310);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4311);
export const API_BASE_URL = `http://localhost:${API_PORT}`;
export const WEB_BASE_URL = `http://localhost:${WEB_PORT}`;

export const STATE_FILE = "/tmp/openrift-e2e-state.json";

export const TEST_USERS = {
  regular: {
    email: "e2e-user@test.com",
    password: "E2eTestPassword1!",
    name: "E2E User",
  },
  admin: {
    email: "e2e-admin@test.com",
    password: "E2eTestPassword1!",
    name: "E2E Admin",
  },
} as const;

export interface E2eState {
  tempDbName: string;
  tempDbUrl: string;
  databaseUrl: string;
}
