// Every request carries a real session cookie so Cloudflare bypasses its
// edge cache and every page hits origin SSR, the traffic anonymous tests
// can't measure. Get LOADTEST_SESSION_COOKIE by signing in on the target
// host and copying __Secure-better-auth.session_token; pass it (and
// BASE_URL) via env.

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
  // A bad cookie silently runs the whole test against the anonymous edge path.
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
  http.get(`${BASE_URL}/cards`, authedParams("cards_page"));
  http.get(`${BASE_URL}/api/auth/get-session`, authedParams("get_session"));
  sleep(Math.random() * 3 + 2);

  const cardSlug = pick(data.cardSlugs);
  const detail = http.get(`${BASE_URL}/cards/${cardSlug}`, authedParams("card_detail_page"));
  check(detail, { "card detail ok": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 2);

  const collections = http.get(`${BASE_URL}/collections`, authedParams("collections_page"));
  check(collections, { "collections ok": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 2);

  const decks = http.get(`${BASE_URL}/decks`, authedParams("decks_page"));
  check(decks, { "decks ok": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 2);

  http.get(`${BASE_URL}/cards`, authedParams("cards_page"));
  sleep(Math.random() * 2 + 1);
}
