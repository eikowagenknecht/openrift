---
status: accepted
date: 2026-03-17
---

# Handle HTTP compression in nginx only, not in the application

## Context and Problem Statement

API responses pass through multiple layers: Hono (app) -> Docker nginx -> host nginx -> Cloudflare -> browser. Each layer can compress responses. Only one should, to avoid conflicts and ensure CDN proxies like Cloudflare receive properly framed responses.

## Considered Options

- Compress in Hono only
- Compress in nginx only
- Compress in both layers
- No compression

## Decision Outcome

Chosen option: "Compress in nginx only", because nginx buffers the full response before compressing, producing properly framed output that CDN proxies handle correctly. This is the conventional approach in reverse-proxy setups.

### Consequences

- Good, because compression config is centralized in one place (`nginx/web.conf`)
- Good, because nginx produces well-formed compressed responses with proper framing
- Neutral, because responses between Hono and nginx travel uncompressed over the Docker network (negligible on localhost)
- Bad, because adding a new reverse proxy layer would require remembering to configure compression there instead

## Pros and Cons of the Options

### Compress in Hono only

- Good, because the app controls compression directly
- Bad, because Hono's streaming `compress()` sends chunked gzip without `Content-Length`, which some CDN proxies cannot handle efficiently
- Bad, because nginx has more mature compression tuning (min length, mime types, compression level)

### Compress in nginx only

- Good, because nginx buffers the full response before compressing, producing properly framed output
- Good, because this is the standard approach when a reverse proxy sits in front of the app

### Compress in both layers

- Bad, because double compression wastes CPU and can confuse intermediary proxies
- Bad, because nginx skips compression when the upstream already set `Content-Encoding`, so the app's less-compatible framing passes through unchanged

### No compression

- Bad, because uncompressed JSON responses (800KB+ for the catalog) waste bandwidth
