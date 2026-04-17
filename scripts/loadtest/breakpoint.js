// Breakpoint test (anonymous): linear ramp from 0 to a high VU count,
// aborting the moment error rate or p95 latency crosses the SLO. The VU
// count at abort is the app's anonymous-traffic ceiling.
//
// Against a Cloudflare-fronted host this mostly measures edge capacity —
// use breakpoint-authed.js to find the origin SSR ceiling.
//
// Usage: BASE_URL=https://preview.openrift.app k6 run scripts/loadtest/breakpoint.js
//
// Override the ramp with env vars if the defaults are too timid/aggressive:
//   MAX_VUS=2000 RAMP_DURATION=40m k6 run scripts/loadtest/breakpoint.js

import { check, sleep } from "k6";
import http from "k6/http";

import { API_BASE, BASE_URL } from "./lib/config.js";
import { fetchSlugs, pick } from "./lib/setup.js";

const MAX_VUS = Number(__ENV.MAX_VUS ?? 1000);
const RAMP_DURATION = __ENV.RAMP_DURATION ?? "30m";

export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP_DURATION, target: MAX_VUS },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "1m" }],
    "http_req_duration{name:cards_page}": [
      { threshold: "p(95)<2500", abortOnFail: true, delayAbortEval: "1m" },
    ],
    "http_req_duration{name:card_detail}": [
      { threshold: "p(95)<2500", abortOnFail: true, delayAbortEval: "1m" },
    ],
    "http_req_duration{name:catalog_api}": [
      { threshold: "p(95)<3000", abortOnFail: true, delayAbortEval: "1m" },
    ],
  },
};

export function setup() {
  return fetchSlugs();
}

export default function breakpoint(data) {
  http.get(`${BASE_URL}/`, { tags: { name: "home" } });
  sleep(Math.random() * 2 + 1);

  http.get(`${BASE_URL}/cards`, { tags: { name: "cards_page" } });
  http.get(`${API_BASE}/catalog`, { tags: { name: "catalog_api" } });
  sleep(Math.random() * 3 + 2);

  const slug = pick(data.cardSlugs);
  const detail = http.get(`${API_BASE}/cards/${slug}`, { tags: { name: "card_detail" } });
  check(detail, { "card detail ok": (r) => r.status === 200 });
  sleep(Math.random() * 4 + 2);

  if (Math.random() < 0.4) {
    const setSlug = pick(data.setSlugs);
    http.get(`${API_BASE}/sets/${setSlug}`, { tags: { name: "set_detail" } });
    sleep(Math.random() * 2 + 1);
  }
}
