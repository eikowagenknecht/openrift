export const API_PORT = 3100;
export const WEB_PORT = 5174;
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
