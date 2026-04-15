// Smoke: 1 VU for 1 minute hitting every public route, confirms the script
// works and endpoints respond before running the heavier scenarios.
//
// Usage: BASE_URL=https://staging.openrift.example k6 run scripts/loadtest/smoke.js

import { check, sleep } from "k6";
import http from "k6/http";

import { API_BASE, BASE_URL } from "./lib/config.js";
import { fetchSlugs, pick } from "./lib/setup.js";

export const options = {
  vus: 1,
  duration: "1m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
};

export function setup() {
  return fetchSlugs();
}

export default function smoke(data) {
  const cardSlug = pick(data.cardSlugs);
  const setSlug = pick(data.setSlugs);

  const responses = http.batch([
    ["GET", `${BASE_URL}/`],
    ["GET", `${BASE_URL}/cards`],
    ["GET", `${BASE_URL}/rules`],
    ["GET", `${API_BASE}/catalog`],
    ["GET", `${API_BASE}/prices`],
    ["GET", `${API_BASE}/sets`],
    ["GET", `${API_BASE}/sets/${setSlug}`],
    ["GET", `${API_BASE}/cards/${cardSlug}`],
  ]);

  for (const response of responses) {
    check(response, {
      "status 2xx": (r) => r.status >= 200 && r.status < 300,
    });
  }

  sleep(1);
}
