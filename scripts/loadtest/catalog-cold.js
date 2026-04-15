// Catalog cold-start: concurrent cache-busted hits to /catalog, the endpoint
// that fires 7 parallel DB queries per request. This is what happens if CF
// purges or a deploy invalidates caches during a traffic spike, so it is the
// scenario most likely to exhaust the Postgres connection pool.
//
// Start low; if p95 stays flat, raise the target stages.
//
// Usage: BASE_URL=https://staging.openrift.example k6 run scripts/loadtest/catalog-cold.js

import { check, sleep } from "k6";
import http from "k6/http";

import { API_BASE } from "./lib/config.js";

export const options = {
  stages: [
    { duration: "30s", target: 5 },
    { duration: "1m", target: 20 },
    { duration: "2m", target: 20 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<5000"],
  },
};

export default function catalogCold() {
  const bust = `${__VU}-${__ITER}-${Date.now()}`;
  const res = http.get(`${API_BASE}/catalog?_=${bust}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  check(res, { ok: (r) => r.status === 200 });
  sleep(1);
}
