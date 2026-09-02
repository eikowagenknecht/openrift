# Settings Reference

This document covers every configurable knob in OpenRift: environment variables, feature flags, and site settings.

## Environment Variables

All env vars are set in `.env` at the repo/deployment root. See `.env.example` for a template with comments.

### API

| Variable             | Required | Default                 | Description                                                                                                                                                                                                              |
| -------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`       | **yes**  |                         | PostgreSQL connection string. Use `db` (Compose service name) as the host in production, `localhost` for local dev.                                                                                                      |
| `BETTER_AUTH_SECRET` | **yes**  |                         | Session secret for Better Auth. Generate with `openssl rand -base64 32`.                                                                                                                                                 |
| `APP_ENV`            |          | `development`           | `development` \| `production` \| `preview`. Non-dev values hide stack traces and enforce required prod vars. `preview` additionally excludes the deploy from search indexing (noindex meta, robots.txt, `X-Robots-Tag`). |
| `PORT`               |          | `3000`                  | Port the Hono server listens on inside the container.                                                                                                                                                                    |
| `CORS_ORIGIN`        |          |                         | Comma-separated allowed origins. Supports wildcards (`*.example.com`).                                                                                                                                                   |
| `BETTER_AUTH_URL`    |          | `http://localhost:5173` | Public URL for Better Auth callbacks.                                                                                                                                                                                    |
| `ADMIN_EMAIL`        |          |                         | Email address that is auto-promoted to admin on signup.                                                                                                                                                                  |

#### OAuth Providers

Both fields in a pair must be set to enable the provider. If either is missing, the provider is silently disabled.

| Variable                | Description                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`      | Google OAuth client ID ([console.cloud.google.com](https://console.cloud.google.com/) > Credentials)     |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth client secret                                                                               |
| `DISCORD_CLIENT_ID`     | Discord OAuth client ID ([discord.com/developers](https://discord.com/developers/applications) > OAuth2) |
| `DISCORD_CLIENT_SECRET` | Discord OAuth client secret                                                                              |

#### SMTP (Email Verification)

Email sending is disabled when `SMTP_HOST` is unset.

| Variable      | Default | Description                                             |
| ------------- | ------- | ------------------------------------------------------- |
| `SMTP_HOST`   |         | SMTP server hostname                                    |
| `SMTP_PORT`   | `465`   | SMTP server port                                        |
| `SMTP_SECURE` | `true`  | Use TLS. Set to `false` for unencrypted/STARTTLS.       |
| `SMTP_USER`   |         | SMTP authentication username                            |
| `SMTP_PASS`   |         | SMTP authentication password                            |
| `SMTP_FROM`   |         | "From" address (e.g. `OpenRift <noreply@openrift.app>`) |

#### Job Secrets

Scheduling for these jobs lives in the `/admin/jobs` page (see [Scheduled Jobs](#scheduled-jobs) below), not in env vars. These variables gate or configure the jobs themselves.

| Variable                   | Default                              | Description                                                                                         |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `CARDTRADER_API_TOKEN`     |                                      | CardTrader API token. Required for the CardTrader price refresh job to be enabled.                  |
| `CHANGELOG_PATH`           | `apps/web/src/CHANGELOG.md`          | Path to the changelog file read by the changelog Discord post job.                                  |
| `META_SYNC_BASE_URL`       | `https://api.riftbound.uvsgames.com` | Base URL of the uvsgames API the meta sync reads. Override to point at a recorded fixture server.   |
| `META_PLAYLOLTCG_BASE_URL` | `https://lol-api.playloltcg.com`     | Base URL of the playloltcg API the meta sync reads. Override to point at a recorded fixture server. |

#### Discord Webhooks

Each webhook is independent — leave any unset to disable that notification stream. These are environment variables only; they are **not** configurable as site settings.

| Variable                           | Description                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `DISCORD_WEBHOOK_NEW_PRINTINGS`    | Webhook URL for the new-printings channel. Receives notifications when new printings are created. |
| `DISCORD_WEBHOOK_PRINTING_CHANGES` | Webhook URL for the data-updates channel. Receives notifications when printing data changes.      |
| `DISCORD_WEBHOOK_CHANGELOG`        | Webhook URL for the changelog post job.                                                           |

### Web (Vite)

| Variable             | Default | Description                                                                                                                        |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_PREVIEW_HOSTS` |         | Comma-separated hostname suffixes that identify preview deployments (e.g. `.workers.dev`). Used to detect preview URLs at runtime. |

#### Web SSR (runtime)

Resolved per container at startup, **not** baked into the Docker image. The same image ships to both prod and preview — each deployment sets these from its own `.env`. `APP_ENV` is shared with the API (see above) and drives the preview noindex behavior.

| Variable   | Default                 | Description                                                                                                                                                                                 |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL` | `http://localhost:5173` | Public origin for this deployment. Used for og:image, canonical links, sitemap, share URLs, PDF branding. Set to `https://openrift.app` in prod, `https://preview.openrift.app` in preview. |

`VITE_BUILD_HASH` is injected automatically at build time (exposed as `__COMMIT_HASH__` in code).

### Docker Compose / Infrastructure

| Variable            | Default                     | Description                                                                    |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `POSTGRES_DB`       | `openrift`                  | Database name                                                                  |
| `POSTGRES_USER`     | `openrift`                  | Database user                                                                  |
| `POSTGRES_PASSWORD` |                             | Database password                                                              |
| `DB_PORT`           | `5432`                      | Host-side PostgreSQL port                                                      |
| `API_PORT`          | `3001`                      | Host-side API port                                                             |
| `WEB_PORT`          | `8080`                      | Host-side web port                                                             |
| `UID`               | `1000`                      | Container user ID for bind-mount ownership                                     |
| `GID`               | `1000`                      | Container group ID for bind-mount ownership                                    |
| `IMAGE_TAG`         | `latest`                    | GHCR image tag (`latest`, `preview`, or `v1.2.3`)                              |
| `DEPLOY_LOCKFILE`   | `/tmp/openrift-deploy.lock` | Path to deploy lock file. Override to run multiple instances on the same host. |

#### Database Backups (S3/R2)

Backup variables live in `backup/.env` (not the main `.env`). See `backup/.env.example` for the full list.

### Testing

These are set automatically by the test harness and should not be in `.env`.

| Variable             | Description                                                                      |
| -------------------- | -------------------------------------------------------------------------------- |
| `INTEGRATION_DB_URL` | Connection string for the temporary test database (set by the test orchestrator) |
| `KEEP_TEST_DB`       | If set, preserve test databases after the run instead of dropping them           |
| `COVERAGE`           | If set, generate coverage reports during test runs                               |

## Scheduled Jobs

Job schedules (price refreshes, meta syncs, trade digest, changelog post) are stored in the `job_schedules` database table and managed from the admin panel at `/admin/jobs`. A job with no row is off; a fresh deployment starts with every job disabled.

Each job shows a suggested schedule on the page. "Enable suggested" turns on one job with that schedule; "Enable all suggested" enables every job at once, which is the normal way to bring up a new deployment. Schedules are five-field cron expressions in UTC, and can be edited or the job disabled again at any time. A job whose required secret (e.g. `CARDTRADER_API_TOKEN`) is missing shows why it cannot be enabled. "Run now" starts an out-of-schedule run immediately; every run, scheduled or manual, appears on the Job Runs page.

## Feature Flags

Feature flags gate incomplete or experimental features. They are stored in the `feature_flags` database table and managed from the admin panel at `/admin/feature-flags`. Changes take effect on the next page load with no rebuild needed.

See [feature-flags.md](feature-flags.md) for the full lifecycle, code usage, and API details. The canonical list of known flags lives in the `KNOWN_FLAGS` array in `apps/web/src/components/admin/feature-flags-page.tsx`.

## Site Settings

Site settings are key-value pairs stored in the `site_settings` database table. They are managed from the admin panel at `/admin/site-settings`. Each setting has a **scope**:

- **`web`** — fetched by the frontend at app boot and available to client-side code.
- **`api`** — server-only, never sent to the browser.

### Recognized Keys

The site settings system is generic (any kebab-case key works), but only the keys below are read by application code. Other keys are stored but have no effect. Unconfigured known settings are shown in the admin UI under "Available settings" for easy setup.

| Key                | Scope | Description                                                                                             |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------- |
| `umami-url`        | web   | Base URL of the Umami analytics instance (e.g. `https://analytics.example.com`).                        |
| `umami-website-id` | web   | Umami website ID. Both `umami-url` and `umami-website-id` must be set for the analytics script to load. |

### How It Works

**Analytics:** When both Umami settings are configured, the web app injects a `<script>` tag pointing to `{umami-url}/script.js` with the `data-website-id` attribute. Removing either setting disables analytics.

**Discord notifications:** Webhook URLs are configured via environment variables (`DISCORD_WEBHOOK_*`, see above), **not** site settings. When configured, a cron job flushes pending printing events to Discord every 15 minutes. New printings are posted to the new-printings channel; field changes (with before/after values) are posted to the changes channel. Events are consolidated per printing within each flush window to reduce noise.

To add a new site setting that code actually reads, use `useSiteSettingValue("your-key")` on the frontend or query the `site_settings` table on the API side. Also add the key to the `KNOWN_SETTINGS` array in `apps/web/src/components/admin/site-settings-page.tsx` so it appears in the admin UI.
