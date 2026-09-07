// Every request carries a unique query string and Cache-Control: no-cache,
// forcing a cache miss at every layer so the origin does full DB work each
// time. Point BASE_URL at the API origin directly for a pure measurement.

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
