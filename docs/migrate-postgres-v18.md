# Migrating PostgreSQL 16 → 18

This guide covers upgrading PostgreSQL from v16 to v18 and switching from Docker named volumes to bind mounts. Both changes are included in the same `docker-compose.yml` update.

## What changed

| Before                          | After                           |
| ------------------------------- | ------------------------------- |
| `postgres:16-alpine`            | `postgres:18-alpine`            |
| `siemens/postgres-backup-s3:16` | `siemens/postgres-backup-s3:18` |
| Named volume `pg_data`          | Bind mount `./data/postgres`    |

## Local dev (no data to preserve)

Destroy the old volume and start fresh:

```bash
docker compose down -v
mkdir -p data/postgres
docker compose up -d db
bun db:migrate
```

## Production (preserve data)

Postgres does not support in-place major version upgrades — the data directory format changes between major versions. Use dump & restore.

### 1. Take a backup

```bash
cd ~/openrift   # or ~/openrift-preview

# Dump the entire database (plain SQL, works across versions)
docker compose exec db pg_dumpall -U openrift > backup-pg16.sql
```

Verify the dump is non-empty:

```bash
wc -l backup-pg16.sql   # should be thousands of lines
head -5 backup-pg16.sql  # should start with "-- PostgreSQL database cluster dump"
```

### 2. Stop services and remove the old volume

```bash
docker compose down

# Remove the named volume (data is safe in backup-pg16.sql)
docker volume rm openrift_pg_data          # stable
# docker volume rm openrift-preview_pg_data  # preview
```

### 3. Update files

Copy the updated `docker-compose.yml` and `deploy.sh` from the repo. The key changes:

- `postgres:16-alpine` → `postgres:18-alpine`
- `siemens/postgres-backup-s3:16` → `siemens/postgres-backup-s3:18`
- Volume: `pg_data:/var/lib/postgresql/data` → `./data/postgres:/var/lib/postgresql` (PG 18 stores data in a versioned subdirectory `18/docker/` under this mount)
- Remove the `volumes:` section at the bottom (`pg_data:` declaration)
- `db` and `api` services now use `user: "${UID}:${GID}"` instead of running as root
- `deploy.sh` now creates data directories before starting containers

### 4. Add UID/GID to .env

The `db` and `api` containers now run as a non-root user. Add your user/group IDs to `.env`:

```bash
# Find your IDs
id -u   # UID
id -g   # GID

# Add to .env
echo "UID=1000" >> .env
echo "GID=1000" >> .env
```

Replace `1000` with your actual values if different.

### 5. Start the new database

```bash
# Create data directories with correct ownership (or run deploy.sh)
mkdir -p data/postgres

docker compose up -d db

# Wait for it to be healthy
docker compose ps
```

### 6. Restore the backup

```bash
cat backup-pg16.sql | docker compose exec -T db psql -U openrift
```

### 7. Start remaining services

```bash
docker compose up -d
```

Verify:

```bash
curl -s localhost:3001/api/health | jq .   # stable
# curl -s localhost:3002/api/health | jq .   # preview
```

### 8. Clean up

Once everything is confirmed working, delete the SQL dump:

```bash
rm backup-pg16.sql
```

## Rollback

If something goes wrong, you can roll back by restoring `docker-compose.yml` to the previous version (with `postgres:16-alpine` and the named volume) and importing the same `backup-pg16.sql` dump into a fresh v16 container.
