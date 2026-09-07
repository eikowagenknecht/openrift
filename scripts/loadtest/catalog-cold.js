// /catalog fires 7 parallel DB queries per request; this simulates a CF purge
// or deploy invalidating caches during a traffic spike, the scenario most
// likely to exhaust the Postgres connection pool. Start low, raise the
// target stages if p95 stays flat.

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
