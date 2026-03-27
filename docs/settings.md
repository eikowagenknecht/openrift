# Settings Reference

This document covers every configurable knob in OpenRift: environment variables, feature flags, and site settings.

## Environment Variables

All env vars are set in `.env` at the repo/deployment root. See `.env.example` for a template with comments.

### API

| Variable             | Required | Default                 | Description                                                                                                         |
| -------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | **yes**  |                         | PostgreSQL connection string. Use `db` (Compose service name) as the host in production, `localhost` for local dev. |
| `BETTER_AUTH_SECRET` | **yes**  |                         | Session secret for Better Auth. Generate with `openssl rand -base64 32`.                                            |
| `APP_ENV`            |          | `development`           | Set to `production` to hide stack traces and validation details in error responses.                                 |
| `PORT`               |          | `3000`                  | Port the Hono server listens on inside the container.                                                               |
| `CORS_ORIGIN`        |          |                         | Comma-separated allowed origins. Supports wildcards (`*.example.com`).                                              |
| `BETTER_AUTH_URL`    |          | `http://localhost:5173` | Public URL for Better Auth callbacks.                                                                               |
| `ADMIN_EMAIL`        |          |                         | Email address that is auto-promoted to admin on signup.                                                             |

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

#### Cron (Price Refresh)

| Variable               | Default      | Description                                                                 |
| ---------------------- | ------------ | --------------------------------------------------------------------------- |
| `CRON_ENABLED`         | `false`      | Set to `true` to enable scheduled price refresh jobs.                       |
| `CRON_TCGPLAYER`       | `0 6 * * *`  | Cron expression for TCGPlayer refresh (06:00 UTC)                           |
| `CRON_CARDMARKET`      | `15 6 * * *` | Cron expression for Cardmarket refresh (06:15 UTC)                          |
| `CRON_CARDTRADER`      | `30 6 * * *` | Cron expression for CardTrader refresh (06:30 UTC)                          |
| `CARDTRADER_API_TOKEN` |              | CardTrader API token. Required for CardTrader refresh; leave empty to skip. |

### Web (Vite)

| Variable             | Default | Description                                                                                                                        |
| -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_PREVIEW_HOSTS` |         | Comma-separated hostname suffixes that identify preview deployments (e.g. `.workers.dev`). Used to detect preview URLs at runtime. |

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

| Variable                      | Default   | Description                                                                       |
| ----------------------------- | --------- | --------------------------------------------------------------------------------- |
| `BACKUP_S3_ENDPOINT`          |           | R2 endpoint URL (no bucket name): `https://<account-id>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET`            |           | R2 bucket name                                                                    |
| `BACKUP_S3_PREFIX`            | `backups` | Object key prefix inside the bucket                                               |
| `BACKUP_S3_ACCESS_KEY_ID`     |           | R2 API token access key (needs Object Read & Write)                               |
| `BACKUP_S3_SECRET_ACCESS_KEY` |           | R2 API token secret key                                                           |
| `BACKUP_ENCRYPTION_PASSWORD`  |           | GPG symmetric encryption passphrase for backups                                   |
| `BACKUP_SCHEDULE`             | `@daily`  | Cron expression for automated backups                                             |
| `BACKUP_KEEP_DAYS`            | `30`      | Delete backups older than this many days                                          |

### Testing

These are set automatically by the test harness and should not be in `.env`.

| Variable             | Description                                                                      |
| -------------------- | -------------------------------------------------------------------------------- |
| `INTEGRATION_DB_URL` | Connection string for the temporary test database (set by the test orchestrator) |
| `KEEP_TEST_DB`       | If set, preserve test databases after the run instead of dropping them           |
| `COVERAGE`           | If set, generate coverage reports during test runs                               |

## Feature Flags

Feature flags gate incomplete or experimental features. They are stored in the `feature_flags` database table and managed from the admin panel at `/admin/feature-flags`. Changes take effect on the next page load with no rebuild needed.

See [feature-flags.md](feature-flags.md) for the full lifecycle, code usage, and API details.

### Current Flags

| Flag         | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `collection` | Enables the card collection UI (collection tracking, sidebar link) |

## Site Settings

Site settings are key-value pairs stored in the `site_settings` database table. They are managed from the admin panel at `/admin/site-settings`. Each setting has a **scope**:

- **`web`** — fetched by the frontend at app boot and available to client-side code.
- **`api`** — server-only, never sent to the browser.

### Recognized Keys

The site settings system is generic (any kebab-case key works), but only the keys below are read by application code. Other keys are stored but have no effect.

| Key                | Scope | Description                                                                                             |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------- |
| `umami-url`        | web   | Base URL of the Umami analytics instance (e.g. `https://analytics.example.com`).                        |
| `umami-website-id` | web   | Umami website ID. Both `umami-url` and `umami-website-id` must be set for the analytics script to load. |

### How It Works

When both Umami settings are configured, the web app injects a `<script>` tag pointing to `{umami-url}/script.js` with the `data-website-id` attribute. Removing either setting disables analytics.

To add a new site setting that code actually reads, use `useSiteSettingValue("your-key")` on the frontend or query the `site_settings` table on the API side.
