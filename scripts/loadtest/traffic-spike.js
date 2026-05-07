// Traffic-spike journey: a realistic mixed-population test for the moment a
// public traffic spike hits the site. Models 95% anonymous traffic
// (mostly absorbed by the Cloudflare edge) and 5% authenticated traffic
// (always origin SSR — this is where the ceiling lives).
//
// Anon visitor: lands on /promos/EN (the public landing URL), browses
// to /cards with a randomised filter so each VU exercises a different SSR
// fan-out, often clicks into a single card. No in-page filter clicks
// modelled — those resolve as TanStack Start _serverFn calls and exercise
// the same handlers a fresh /cards SSR already does.
//
// Authed visitor: same opener, but every request carries a session cookie so
// CF bypasses its edge cache and every page hits origin SSR. Adds a
// /collections drill-down with a real collection id parsed from the API.
//
// Why no in-script signup: better-auth requires email-OTP verification, and
// we don't want load-testing tied to an inbox or to mutate user data on
// preview. We use one pre-created verified test account and share its
// session cookie across the authed VUs — the per-request work (session
// fetch, ownership checks, collection load) doesn't depend on which user it
// is, so this is a fine proxy for the SSR ceiling.
//
// Usage:
//   # 1. Sign in on https://preview.openrift.app in a browser as a test user
//   # 2. Devtools → Application → Cookies → copy __Secure-better-auth.session_token
//   # 3. Run:
//   COOKIE_NAME=__Secure-better-auth.session_token \
//   LOADTEST_SESSION_COOKIE=<paste> \
//   BASE_URL=https://preview.openrift.app \
//     k6 run scripts/loadtest/traffic-spike.js

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

// Filter combinations a visitor might land on via a deep link or by
// clicking a domain/set chip. The empty string means "no filter" —
// the most common cold landing.
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
  sleep(Math.random() * 3 + 2); // 2–5s
}

function thinkLong() {
  sleep(Math.random() * 10 + 5); // 5–15s
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

  // Pre-fetch the user's collection ids so authed VUs can drill into a real
  // collection. Without a real id the /collections/{id} page returns 404 and
  // we'd be load-testing the error path instead of the happy path.
  const collectionsRes = http.get(`${API_BASE}/collections`, {
    cookies: { [COOKIE_NAME]: SESSION_COOKIE },
  });
  if (collectionsRes.status !== 200) {
    throw new Error(`Collections probe failed: ${collectionsRes.status}`);
  }
  const collectionsBody = collectionsRes.json();
  const collectionIds = (collectionsBody.collections ?? []).map((collection) => collection.id);
  if (collectionIds.length === 0) {
    throw new Error(
      "Test user has no collections — create at least one on the target host before running.",
    );
  }

  return { ...fetchSlugs(), collectionIds };
}

export function anonJourney(data) {
  // Step 1: land on /promos/EN (the public landing URL). SSR fans out to
  // /api/v1/promos and /api/v1/init server-side; k6 only sees the HTML hit.
  const promos = http.get(`${BASE_URL}/promos/EN`, anonParams("promos_anon"));
  check(promos, { "promos ok": (response) => response.status === 200 });
  thinkLong();

  // Step 2: browse /cards with a varied filter so each VU stresses a
  // different SSR fan-out (fetchFirstRowCards, fetchCardFacets, fetchCardCounts,
  // fetchCardFilterCounts).
  const filter = pick(CARDS_FILTERS);
  const cards = http.get(`${BASE_URL}/cards${filter}`, anonParams("cards_anon"));
  check(cards, { "cards ok": (response) => response.status === 200 });
  thinkLong();

  // Step 3: 70% of visitors click a card detail.
  if (Math.random() < 0.7) {
    const slug = pick(data.cardSlugs);
    const detail = http.get(`${BASE_URL}/cards/${slug}`, anonParams("card_detail_anon"));
    check(detail, { "card detail ok": (response) => response.status === 200 });
    thinkShort();
  }
}

export function authedJourney(data) {
  // Step 1: same /promos/EN landing, but with a session cookie. CF bypasses
  // edge for any cookie'd request, so this hits origin SSR.
  const promos = http.get(`${BASE_URL}/promos/EN`, authedParams("promos_authed"));
  check(promos, { "promos ok": (response) => response.status === 200 });
  // Hydration triggers a session refetch.
  http.get(`${BASE_URL}/api/auth/get-session`, authedParams("get_session"));
  thinkLong();

  // Step 2: /cards, again origin-only.
  const filter = pick(CARDS_FILTERS);
  const cards = http.get(`${BASE_URL}/cards${filter}`, authedParams("cards_authed"));
  check(cards, { "cards ok": (response) => response.status === 200 });
  http.get(`${BASE_URL}/api/auth/get-session`, authedParams("get_session"));
  thinkLong();

  // Step 3: visit /collections — auth-gated, SSR'd against the user's data.
  const collections = http.get(`${BASE_URL}/collections`, authedParams("collections_page"));
  check(collections, { "collections ok": (response) => response.status === 200 });
  thinkShort();

  // Step 4: drill into a real collection. Hits the paginated copies endpoint
  // which is the per-user query that actually scales with collection size.
  const collectionId = pick(data.collectionIds);
  const detail = http.get(
    `${API_BASE}/collections/${collectionId}/copies`,
    authedParams("collection_detail_api"),
  );
  check(detail, { "collection detail ok": (response) => response.status === 200 });
  thinkShort();
}
