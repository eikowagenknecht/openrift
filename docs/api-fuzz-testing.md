# API Fuzz Testing with Schemathesis

Schemathesis generates and runs property-based tests against the API using the OpenAPI spec.

## Setup (one-time)

```bash
python3 -m venv /tmp/st-venv
/tmp/st-venv/bin/pip install schemathesis
```

## Running

Start the API dev server first (`bun dev:api`), then:

```bash
# Get a session cookie: Browser DevTools > Application > Cookies > better-auth.session_token

# Run against all routes with auth (exclude TRACE method check — Hono returns 401 instead of 405)
/tmp/st-venv/bin/st run http://localhost:3000/api/doc \
  --checks all \
  --exclude-checks unsupported_method \
  --workers 4 \
  --header 'Cookie: better-auth.session_token=<YOUR_TOKEN>'

# Run without auth (public routes only)
/tmp/st-venv/bin/st run http://localhost:3000/api/doc \
  --checks all \
  --exclude-checks unsupported_method \
  --workers 4
```

## What to look for

- **Server error (500)** — real bugs, fix immediately
- **Undocumented HTTP status code (400)** — documentation gap, routes don't declare 400 in OpenAPI responses
- **API rejected schema-compliant request** — usually edge cases (null in query params, business logic rejections)
