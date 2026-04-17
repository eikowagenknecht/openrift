// Breakpoint test (authed): linear ramp from 0 to a high VU count with
// every request carrying a better-auth session cookie, so Cloudflare
// bypasses its edge cache and every page hits origin SSR. Aborts the
// moment error rate or p95 latency crosses the SLO — the VU count at
// abort is the origin's authed-traffic ceiling.
//
// Authentication model: same as journey-authed.js — sign in once in a
// real browser, copy the session cookie, pass it via env. All VUs share
// the cookie; same-user traffic is a fine proxy for the SSR ceiling.
//
// Usage:
//   # 1. Sign in on https://preview.openrift.app in a browser
//   # 2. Copy the value of __Secure-better-auth.session_token
//   # 3. Run:
//   COOKIE_NAME=__Secure-better-auth.session_token \
//   LOADTEST_SESSION_COOKIE=<paste> \
//   BASE_URL=https://preview.openrift.app \
//     k6 run scripts/loadtest/breakpoint-authed.js
//
// Override the ramp with env vars if the defaults are too timid/aggressive:
//   MAX_VUS=800 RAMP_DURATION=30m k6 run scripts/loadtest/breakpoint-authed.js

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

const MAX_VUS = Number(__ENV.MAX_VUS ?? 500);
const RAMP_DURATION = __ENV.RAMP_DURATION ?? "20m";

function authedParams(name) {
  return {
    tags: { name },
    cookies: { [COOKIE_NAME]: SESSION_COOKIE },
  };
}

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
    "http_req_duration{name:card_detail_page}": [
      { threshold: "p(95)<2500", abortOnFail: true, delayAbortEval: "1m" },
    ],
    "http_req_duration{name:collections_page}": [
      { threshold: "p(95)<2500", abortOnFail: true, delayAbortEval: "1m" },
    ],
    "http_req_duration{name:decks_page}": [
      { threshold: "p(95)<2500", abortOnFail: true, delayAbortEval: "1m" },
    ],
    "http_req_duration{name:get_session}": [
      { threshold: "p(95)<1000", abortOnFail: true, delayAbortEval: "1m" },
    ],
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
  const body = probe.json();
  if (!body || !body.user) {
    throw new Error("Session cookie probe returned no user — cookie is invalid or expired.");
  }
  // oxlint-disable-next-line no-console -- k6 setup log is useful
  console.log(`Authed as ${body.user.email}`);
  return fetchSlugs();
}

export default function breakpointAuthed(data) {
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
