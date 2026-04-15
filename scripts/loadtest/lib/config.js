const baseUrl = __ENV.BASE_URL;
if (!baseUrl) {
  throw new Error("BASE_URL env var is required (e.g. BASE_URL=https://staging.openrift.example)");
}

export const BASE_URL = baseUrl.replace(/\/$/, "");
export const API_BASE = `${BASE_URL}/api/v1`;
