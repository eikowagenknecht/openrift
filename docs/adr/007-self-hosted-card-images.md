---
status: accepted
date: 2026-03-09
---

# ADR-007: Self-Hosted Card Images

> **Update 2026-04-12:** The `card-images/` directory was renamed to `media/cards/` and the URL prefix changed from `/card-images/` to `/media/cards/`. The `media/` directory also hosts `sets/` for set images. All references below use the original naming from the initial decision.

## Context and Problem Statement

All card images are currently served from an external CDN we don't control. If the CDN changes URLs, rate-limits us, or goes down, our card browser breaks. We need to self-host card images so we control our own availability.

## Decision Drivers

- No additional hosting cost — must work within existing infrastructure (Hetzner CX22, Cloudflare free tier)
- Images must be served efficiently with responsive sizes for mobile and desktop
- The current frontend uses Sanity CDN's query-string API for on-the-fly resizing (`?w=300&fm=webp`) — self-hosted images need a different approach
- The API container currently uses `bun build --compile` into a distroless image, which doesn't support native addons

## Considered Options

### Image storage

- **Cloudflare R2** — S3-compatible object storage, free tier (10GB storage, 10M reads/mo)
- **allinkl.com webserver** — unlimited traffic shared hosting, upload via PHP endpoint or FTP
- **Hetzner CX22** — same server as the API, serve via host nginx

### Image processing

- **sharp** (native, libvips) — fastest, requires native bindings
- **wasm-vips** (WASM) — no native deps, ~3-8× slower than sharp
- **jimp** (pure JS) — no native deps, ~20× slower, buggy WebP support
- **@napi-rs/image** (native, Rust) — fast, same native binding constraints as sharp

### API container base image

- **distroless + `bun build --compile`** (current) — smallest image, single binary, but no native addon support
- **`oven/bun:1-alpine`** — supports native addons (sharp), smaller than current image (155 MB vs 184 MB)
- **`oven/bun:1-slim`** — supports native addons, larger image (261 MB)

## Decision Outcome

### Image storage

Chosen option: "Hetzner CX22", because it adds no cost, no new services, and the API server already runs there. Card images are served by host nginx with Cloudflare CDN in front. A bind-mounted directory (`./card-images`) gives the API container write access while keeping images accessible to host nginx at a predictable path.

**Cost comparison at scale:**

| Scenario    | Hetzner                              | R2         | allinkl             |
| ----------- | ------------------------------------ | ---------- | ------------------- |
| Low usage   | $0                                   | $0         | $0                  |
| 50M req/mo  | $0 (20TB included, CDN absorbs most) | ~$0-5/mo   | $0                  |
| 500M req/mo | $0 with CDN                          | ~$10-50/mo | $0, maybe throttled |

All options are viable. Hetzner wins on simplicity — the API writes to local disk, no network calls needed.

### Image processing

Chosen option: "sharp", because it's the fastest and most battle-tested option. Image processing only happens during admin operations (not user-facing hot paths), but sharp's native prebuilds for alpine/musl work out of the box with no compilation step.

No image library with WebP support works with `bun build --compile` — neither native `.node` files nor `.wasm` files are embedded into the compiled binary. This necessitates the base image change below.

### API container base image

Chosen option: "`oven/bun:1-alpine`", because it supports sharp's native bindings and is actually smaller (155 MB base) than the current distroless + compiled binary image (184 MB total). The `--compile` step is removed from the Dockerfile.

### Consequences

- Good, because self-hosted images eliminate the dependency on external CDNs.
- Good, because the `bun:1-alpine` image is smaller than the current distroless image.
- Good, because the bind mount makes images accessible to both the API container and host nginx with no network overhead.
- Good, because pre-generated responsive sizes reduce bandwidth for mobile users.
- Bad, because dropping `bun build --compile` loses the single-binary deployment model. Mitigated by the fact that the compiled binary was already 184 MB — the practical benefit was minimal.
- Bad, because sharp adds a native dependency. Mitigated by alpine's musl-compatible prebuilds working out of the box.
- Neutral, because storage (~200 MB for all card images at 3 sizes) is negligible on the 40 GB disk.

## Design

### Image Sizes

Two WebP variants are pre-generated per printing image, both capped on the **short edge** so portrait and landscape cards land at the same display size after layout. The pristine source is kept separately as `-orig.{ext}`.

| Size   | Short edge | Quality | Use case                               |
| ------ | ---------- | ------- | -------------------------------------- |
| `400w` | 400px      | 85      | Grid thumbnails                        |
| `full` | 800px      | 85      | Card detail modal + deck hover preview |
| `orig` | Source     | —       | Archive (original format, not served)  |

For portrait cards (width < height) the cap is applied to the width; for landscape cards (width > height, e.g. Battlefields) it is applied to the height. `sharp`'s `withoutEnlargement: true` keeps smaller-than-cap sources at their native size. Names keep the `w` suffix for continuity even though the cap is short-edge, not strictly width.

Rendered card widths in the grid range ~115–177px across layouts. At 2× DPR that's 230–354 physical px — comfortably covered by the 400w variant, so the grid no longer uses `srcset` for self-hosted images. The `full` variant's 800 short-edge cap hits the exact pixel budget for the deck hover preview on retina (400px CSS × 2 DPR = 800px for portrait, 560px CSS × 2 DPR = 1120px for landscape which maps to the 1120-wide side of the 1120×800 landscape file).

The card detail modal and standalone card page also use `full`. On very wide retina displays the modal will render the 800-capped image slightly soft; this is an accepted trade-off for the ~2× storage savings and faster hover previews.

The original is stored as-is in its source format (PNG, JPG, etc.) so images can be re-processed later. The frontend never references `orig` — only backfill tools do.

At ~150 KB average source image, the 2 WebP variants total ~80 KB per printing. With originals: ~230 KB per printing.

### Progressive Hover Preview

The deck editor's hover preview layers two `<img>` tags: the bottom one points at the grid's already-cached `400w` thumbnail (renders instantly with no network round-trip), the top one loads `full` and crossfades in via `onLoad`. This gives every hover a zero-latency first paint regardless of cache state, and retina users crisp up after the full variant finishes loading (~50–150ms).

### Directory Structure

Files are organized by set, with filenames derived from the printing ID. The printing ID is a composite of `{short_code}:{rarity}:{finish}:{promo|}` (generated by `buildPrintingId()`). For file paths, colons are replaced with hyphens and the promo boolean is abbreviated to `y`/`n`:

`{set_id}/{short_code}-{rarity}-{finish}-{promo:y|n}-{size}.webp`

```plaintext
card-images/
└── ARC/
├── OGN/
│   ├── OGN-027-normal-n-rare-foil-orig.png     # original (archived)
│   ├── OGN-027-normal-n-rare-foil-400w.webp
│   ├── OGN-027-normal-n-rare-foil-full.webp
│   ├── OGN-027a-altart-n-rare-foil-400w.webp   # alt-art
│   ├── OGN-223-normal-y-common-foil-400w.webp  # signed
│   └── ...
├── SFD/
```

### Database

The `image_url` column in `printings` stores a relative base path without size or extension suffix. The frontend appends both (`-{size}.webp`) when constructing the final URL:

```plaintext
/card-images/OGN/OGN-027-normal-n-n-foil
```

### Frontend Image URL Handling

`getCardImageUrl()` in `apps/web/src/lib/images.ts` gains a branch for self-hosted images. Detection: path starts with `/card-images/`.

- Self-hosted thumbnail: `{base}-400w.webp`
- Self-hosted full: `{base}-full.webp`
- Self-hosted srcset: none (single 400w variant; `getCardImageSrcSet` returns `undefined`)
- External URLs: existing query-param logic (kept until migration completes, then removed)

### Serving Images

The `web` container's nginx serves card images directly — the same bind-mounted directory is mounted read-only into the `web` container at `/usr/share/nginx/html/card-images/`. Since the SPA is served from `/usr/share/nginx/html/`, requests to `/card-images/...` resolve to static files automatically with no extra nginx config needed.

No host nginx changes are required. Host nginx continues to only handle TLS termination and proxying — all routing stays self-contained within Docker.

Cloudflare CDN caches responses automatically. Card images never change once generated — cache hit rate will be near 100%.

### Dockerfile Changes

The API stage switches from distroless + compiled binary to `bun:1-alpine` running the source directly:

```dockerfile
FROM oven/bun:1-alpine AS api
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/package.json ./
EXPOSE 3000
CMD ["bun", "run", "apps/api/src/index.ts"]
```

### Docker Compose Changes

Add a bind mount for card images, shared between the `api` (read-write) and `web` (read-only) containers:

```yaml
api:
  volumes:
    - ./card-images:/app/card-images

web:
  volumes:
    - ./card-images:/usr/share/nginx/html/card-images:ro
```

A bind mount is used instead of a named Docker volume (like `pg_data`) because both containers need access to the same directory. A named volume would work too, but bind mounts make the on-disk location explicit and predictable across our stable and preview instances (`~/openrift/card-images/` and `~/openrift-preview/card-images/`).

A placeholder directory `apps/web/public/card-images/` with a `README.md` is checked into the repo to prevent accidental use of this path for static assets. The bind mount shadows this directory in production, so the README is never served.

### Migration Process

An admin endpoint (`POST /admin/rehost-images`) triggers a one-time migration, accessible via a "Rehost Images" button on the admin candidates page. The button shows a progress summary (e.g., "142/664 rehosted") and is disabled once all images are self-hosted.

1. Query all printings where `image_url` is an external URL
2. For each printing: download the source image, save the original in its source format (`-orig.{ext}`), resize with sharp to 3 WebP variants (300w at q75, 400w at q75, full at q85), write all files to `/app/card-images/{set_id}/`
3. Update `image_url` in the database to the self-hosted path
4. Return progress summary

After migration completes, the external URL branch in `getCardImageUrl()` is removed.

### API Endpoint

Behind `requireAdmin` middleware:

| Method | Path                   | Purpose                                     |
| ------ | ---------------------- | ------------------------------------------- |
| `POST` | `/admin/rehost-images` | Rehost all external images to local storage |

## Implementation Phases

1. **Dockerfile + Docker Compose** — switch to `bun:1-alpine`, add bind mount, add sharp dependency
2. **Image processing service** — download, resize, store
3. **Frontend image URL handling** — `getCardImageUrl` branching
4. **Rehost endpoint + admin UI button** — trigger one-time migration
