// Usage: sign in on the target host in a browser, copy the session cookie
// value, then run with LOADTEST_SESSION_COOKIE=<value> COOKIE_NAME=<name>
// BASE_URL=<host> k6 run scripts/loadtest/traffic-spike.js

import { check, sleep } from "k6";
import http from "k6/http";

import { API_BASE, BASE_URL } from "./lib/config.js";
import { fetchSlugs, pick } from "./lib/setup.js";

const SESSION_COOKIE = __ENV.LOADTEST_SESSION_COOKIE;
if (!SESSION_COOKIE) {
  throw new Error(
    "LOADTEST_SESSION_COOKIE is required. Sign in on the target host in a browser, copy the session cookie value, and pass it via env.",
  );
}
const COOKIE_NAME = __ENV.COOKIE_NAME ?? "__Secure-better-auth.session_token";

// Repeated "" weights the common no-filter cold landing.
const CARDS_FILTERS = [
  "",
  "",
  "",
  "?domain=Body",
  "?domain=Mind",
  "?rarity=Rare",
  "?keyword=Strike",
];

function authedParams(name) {
  return {
    tags: { name },
    cookies: { [COOKIE_NAME]: SESSION_COOKIE },
  };
}

function anonParams(name) {
  return { tags: { name } };
}

function thinkShort() {
  sleep(Math.random() * 3 + 2);
}

function thinkLong() {
  sleep(Math.random() * 10 + 5);
}

export const options = {
  scenarios: {
    anon: {
      executor: "ramping-vus",
      exec: "anonJourney",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "2m", target: 200 },
        { duration: "5m", target: 200 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
    authed: {
      executor: "ramping-vus",
      exec: "authedJourney",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 3 },
        { duration: "2m", target: 10 },
        { duration: "5m", target: 10 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:promos_anon}": ["p(95)<1500"],
    "http_req_duration{name:cards_anon}": ["p(95)<1500"],
    "http_req_duration{name:card_detail_anon}": ["p(95)<1500"],
    "http_req_duration{name:promos_authed}": ["p(95)<2000"],
    "http_req_duration{name:cards_authed}": ["p(95)<2000"],
    "http_req_duration{name:collections_page}": ["p(95)<2000"],
    "http_req_duration{name:collection_detail_api}": ["p(95)<1500"],
    "http_req_duration{name:get_session}": ["p(95)<500"],
  },
};

export function setup() {
  const probe = http.get(`${BASE_URL}/api/auth/get-session`, {
    cookies: { [COOKIE_NAME]: SESSION_COOKIE },
  });
  if (probe.status !== 200) {
    throw new Error(
      `Session cookie probe failed: ${probe.status} — check LOADTEST_SESSION_COOKIE and COOKIE_NAME.`,
    );
  }
  const session = probe.json();
  if (!session || !session.user) {
    throw new Error("Session cookie probe returned no user — cookie is invalid or expired.");
  }
  // oxlint-disable-next-line no-console -- k6 setup log is useful
  console.log(`Authed as ${session.user.email}`);

  const collectionsRes = http.get(`${API_BASE}/collections`, {
    cookies: { [COOKIE_NAME]: SESSION_COOKIE },
  });
  if (collectionsRes.status !== 200) {
    throw new Error(`Collections probe failed: ${collectionsRes.status}`);
  }
  const collectionsBody = collectionsRes.json();
  const collectionIds = (collectionsBody.items ?? []).map((collection) => collection.id);
  if (collectionIds.length === 0) {
    throw new Error(
      "Test user has no collections — create at least one on the target host before running.",
    );
  }

  return { ...fetchSlugs(), collectionIds };
}

export function anonJourney(data) {
  const promos = http.get(`${BASE_URL}/promos/EN`, anonParams("promos_anon"));
  check(promos, { "promos ok": (response) => response.status === 200 });
  thinkLong();

  const filter = pick(CARDS_FILTERS);
  const cards = http.get(`${BASE_URL}/cards${filter}`, anonParams("cards_anon"));
  check(cards, { "cards ok": (response) => response.status === 200 });
  thinkLong();

  if (Math.random() < 0.7) {
    const slug = pick(data.cardSlugs);
    const detail = http.get(`${BASE_URL}/cards/${slug}`, anonParams("card_detail_anon"));
    check(detail, { "card detail ok": (response) => response.status === 200 });
    thinkShort();
  }
}

export function authedJourney(data) {
  const promos = http.get(`${BASE_URL}/promos/EN`, authedParams("promos_authed"));
  check(promos, { "promos ok": (response) => response.status === 200 });
  http.get(`${BASE_URL}/api/auth/get-session`, authedParams("get_session"));
  thinkLong();

  const filter = pick(CARDS_FILTERS);
  const cards = http.get(`${BASE_URL}/cards${filter}`, authedParams("cards_authed"));
  check(cards, { "cards ok": (response) => response.status === 200 });
  http.get(`${BASE_URL}/api/auth/get-session`, authedParams("get_session"));
  thinkLong();

  const collections = http.get(`${BASE_URL}/collections`, authedParams("collections_page"));
  check(collections, { "collections ok": (response) => response.status === 200 });
  thinkShort();

  const collectionId = pick(data.collectionIds);
  const detail = http.get(
    `${API_BASE}/collections/${collectionId}/copies`,
    authedParams("collection_detail_api"),
  );
  check(detail, { "collection detail ok": (response) => response.status === 200 });
  thinkShort();
}
