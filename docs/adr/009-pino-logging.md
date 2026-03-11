---
status: accepted
date: 2026-03-11
---

# Use pino for structured logging

## Context and Problem Statement

Services used `console.log` for progress output. These functions run both as CLI scripts and via the API's admin endpoints / cron jobs, where unstructured console output is hard to filter and lacks context (timestamps, service names, log levels).

## Considered Options

- **console.log** — no dependency, but no structure, levels, or context
- **winston** — most popular Node.js logger, used in lootscraper
- **pino** — JSON-first, fast, lightweight, first-class Bun support

## Decision Outcome

Chosen option: **pino**, because it aligns with the existing stack (Bun, Hono, Docker) and its JSON-to-stdout model matches Docker's log capture. Winston would also work but is heavier and less natural in this ecosystem.

Services accept a `Logger` parameter (dependency injection) rather than importing a global instance. This keeps them testable and lets callers control output. Scripts create a logger via `createLogger()` and pass it in; the API creates child loggers with service context.

In development, pipe output through `pino-pretty` for human-readable logs:

```bash
bun dev:api | bunx pino-pretty
```

In production, logs are JSON to stdout — Docker captures them as-is via `docker compose logs`.
