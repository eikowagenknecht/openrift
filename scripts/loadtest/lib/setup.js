import http from "k6/http";

import { API_BASE } from "./config.js";

export function fetchSlugs() {
  const res = http.get(`${API_BASE}/catalog`);
  if (res.status !== 200) {
    throw new Error(`Catalog fetch failed: ${res.status} ${res.body}`);
  }
  const body = res.json();
  const cardSlugs = Object.values(body.cards).map((card) => card.slug);
  const setSlugs = body.sets.map((set) => set.slug);
  if (cardSlugs.length === 0 || setSlugs.length === 0) {
    throw new Error("Catalog returned no cards or sets, cannot run load test");
  }
  return { cardSlugs, setSlugs };
}

export function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}
