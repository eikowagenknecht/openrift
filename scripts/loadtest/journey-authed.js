// Logged-in visitor journey: every request carries a better-auth session
// cookie, so Cloudflare bypasses its edge cache and every page hits origin
// SSR. This is the scenario we care about for traffic spikes — anonymous
// traffic is already absorbed by the CF edge; logged-in traffic isn't.
//
// Authentication model: you obtain a session cookie once (sign in via a
// real browser on the target host) and pass it to k6 via
// LOADTEST_SESSION_COOKIE. All VUs share that cookie. Same-user traffic is
// a fine proxy for measuring the SSR ceiling — the per-request work (session
// fetch, user-specific markers in the header, ownership checks) is the same
// regardless of which user.
//
// Usage:
//   # 1. Sign in on https://preview.openrift.app in a browser
//   # 2. Open devtools → Application → Cookies → copy the value of
//   #    __Secure-better-auth.session_token (or better-auth.session_token)
//   # 3. Run:
//   COOKIE_NAME=__Secure-better-auth.session_token \
//   LOADTEST_SESSION_COOKIE=<paste> \
//   BASE_URL=https://preview.openrift.app \
//     k6 run scripts/loadtest/journey-authed.js

import { check, sleep } from "k6";
import http from "k6/http";

import { BASE_URL } from "./lib/config.js";
import { fetchSlugs, pick } from "./lib/setup.js";

const SESSION_COOKIE = __ENV.LOADTEST_SESSION_COOKIE;
if (!SESSION_COOKIE) {
  throw new Error(
    "LOADTEST_SESSION_COOKIE is required. Sign in on the target host in a browser, copy the session cookie value, and pass it via env.",
  );
}
// Default to the HTTPS-prefixed variant since we test against preview/prod.
const COOKIE_NAME = __ENV.COOKIE_NAME ?? "__Secure-better-auth.session_token";

function authedParams(name) {
  return {
    tags: { name },
    cookies: { [COOKIE_NAME]: SESSION_COOKIE },
  };
}

export const options = {
  stages: [
    { duration: "1m", target: 20 },
    { duration: "2m", target: 50 },
    { duration: "3m", target: 100 },
    { duration: "2m", target: 100 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:cards_page}": ["p(95)<1500"],
    "http_req_duration{name:card_detail_page}": ["p(95)<1500"],
    "http_req_duration{name:collections_page}": ["p(95)<1500"],
    "http_req_duration{name:decks_page}": ["p(95)<1500"],
    "http_req_duration{name:get_session}": ["p(95)<500"],
  },
};

export function setup() {
  // Verify the cookie works before spinning up VUs. A bad cookie would
  // otherwise produce a 9-minute run that quietly exercises the anonymous
  // path at the edge — the opposite of what we want to measure.
  const probe = http.get(`${BASE_URL}/api/auth/get-session`, {
    cookies: { [COOKIE_NAME]: SESSION_COOKIE },
  });
  if (probe.status !== 200) {
    throw new Error(
      `Session cookie probe failed: ${probe.status} — check LOADTEST_SESSION_COOKIE and COOKIE_NAME.`,
    );
  }
  const body = probe.json();
  if (!body || !body.user) {
    throw new Error("Session cookie probe returned no user — cookie is invalid or expired.");
  }
  // oxlint-disable-next-line no-console -- k6 setup log is useful
  console.log(`Authed as ${body.user.email}`);
  return fetchSlugs();
}

export default function journeyAuthed(data) {
  // Land on /cards (SSR, can't be edge-cached for logged-in users).
  http.get(`${BASE_URL}/cards`, authedParams("cards_page"));
  // The client then refetches the session on hydration — measure that too.
  http.get(`${BASE_URL}/api/auth/get-session`, authedParams("get_session"));
  sleep(Math.random() * 3 + 2);

  // Drill into a card detail page (SSR).
  const cardSlug = pick(data.cardSlugs);
  const detail = http.get(`${BASE_URL}/cards/${cardSlug}`, authedParams("card_detail_page"));
  check(detail, { "card detail ok": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 2);

  // Visit /collections — auth-gated route, always origin.
  const collections = http.get(`${BASE_URL}/collections`, authedParams("collections_page"));
  check(collections, { "collections ok": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 2);

  // Visit /decks — auth-gated route, always origin.
  const decks = http.get(`${BASE_URL}/decks`, authedParams("decks_page"));
  check(decks, { "decks ok": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 2);

  // Bounce back to /cards (second SSR hit per journey).
  http.get(`${BASE_URL}/cards`, authedParams("cards_page"));
  sleep(Math.random() * 2 + 1);
}
