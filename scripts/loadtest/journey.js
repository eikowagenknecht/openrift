// Realistic anonymous visitor journey: land on home, browse the card grid,
// click into a card, occasionally view a set. Shared slug pool so CDN/browser
// caches behave as they would in production.
//
// Peaks at 200 concurrent VUs. Against a Cloudflare-fronted host this mostly
// exercises the edge; if you want to stress the origin, use cache-miss.js.
//
// Usage: BASE_URL=https://staging.openrift.example k6 run scripts/loadtest/journey.js

import { check, sleep } from "k6";
import http from "k6/http";

import { API_BASE, BASE_URL } from "./lib/config.js";
import { fetchSlugs, pick } from "./lib/setup.js";

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "2m", target: 200 },
    { duration: "5m", target: 200 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:cards_page}": ["p(95)<1500"],
    "http_req_duration{name:card_detail}": ["p(95)<1500"],
    "http_req_duration{name:catalog_api}": ["p(95)<2000"],
  },
};

export function setup() {
  return fetchSlugs();
}

export default function journey(data) {
  http.get(`${BASE_URL}/`, { tags: { name: "home" } });
  sleep(Math.random() * 2 + 1);

  http.get(`${BASE_URL}/cards`, { tags: { name: "cards_page" } });
  http.get(`${API_BASE}/catalog`, { tags: { name: "catalog_api" } });
  sleep(Math.random() * 3 + 2);

  const slug = pick(data.cardSlugs);
  const detail = http.get(`${API_BASE}/cards/${slug}`, {
    tags: { name: "card_detail" },
  });
  check(detail, { "card detail ok": (r) => r.status === 200 });
  sleep(Math.random() * 4 + 2);

  if (Math.random() < 0.4) {
    const setSlug = pick(data.setSlugs);
    http.get(`${API_BASE}/sets/${setSlug}`, { tags: { name: "set_detail" } });
    sleep(Math.random() * 2 + 1);
  }
}
