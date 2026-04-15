// Cache-miss storm: every request carries a unique query string and
// Cache-Control: no-cache, so both the Cloudflare edge and any downstream
// cache miss, forcing the origin to do full DB work every time. This is the
// scenario that reveals the real origin + Postgres ceiling.
//
// For a pure origin measurement, point BASE_URL at the API origin directly
// (bypassing Cloudflare). Otherwise you are also measuring the CF path.
//
// Usage: BASE_URL=https://staging.openrift.example k6 run scripts/loadtest/cache-miss.js

import { check, sleep } from "k6";
import http from "k6/http";

import { API_BASE } from "./lib/config.js";
import { fetchSlugs, pick } from "./lib/setup.js";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: 25 },
    { duration: "2m", target: 50 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000", "p(99)<5000"],
  },
};

export function setup() {
  return fetchSlugs();
}

export default function cacheMiss(data) {
  const bust = `${__VU}-${__ITER}-${Date.now()}`;
  const slug = pick(data.cardSlugs);

  const res = http.get(`${API_BASE}/cards/${slug}?_=${bust}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  check(res, { ok: (r) => r.status === 200 });

  sleep(0.5);
}
