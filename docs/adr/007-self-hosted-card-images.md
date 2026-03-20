---
status: accepted
date: 2026-03-09
---

# ADR-007: Self-Hosted Card Images

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

Three WebP variants are pre-generated per printing image:

| Size   | Width    | Quality | Use case                            |
| ------ | -------- | ------- | ----------------------------------- |
| `300w` | 300px    | 75      | 2× retina at typical card width     |
| `400w` | 400px    | 75      | 2× retina at wider cards, 3×        |
| `full` | Original | 85      | Card detail view                    |
| `orig` | Original | —       | Archive (original format, not WebP) |

These sizes were chosen based on the actual card widths the grid produces. The responsive column system (`useResponsiveColumns`) yields card image widths between ~115px (5+ columns with detail panel open) and ~177px (3-column tablet). With the `sizes` attribute set to the exact card width, the browser picks the smallest srcset entry that covers `image_width × device_pixel_ratio`:

| Scenario                        | Image width | × DPR | Needs | Served |
| ------------------------------- | ----------- | ----- | ----- | ------ |
| Desktop, detail panel open (5+) | ~115px      | 2×    | 230w  | 300w   |
| Mobile (2 cols)                 | ~150px      | 2×    | 300w  | 300w   |
| Tablet (3 cols)                 | ~177px      | 2×    | 354w  | 400w   |
| Mobile (2 cols)                 | ~150px      | 3×    | 450w  | full   |

The previous Sanity CDN srcset used 5 widths (200, 300, 400, 600, 750) because on-the-fly resizing has no storage cost. Analysis of actual card widths shows 600w and 750w are never selected by the browser — no card is wide enough for 2× to exceed 400w. The 200w size only served 1× non-retina devices, which are rare on modern hardware. Dropping these three unused sizes keeps the pre-generated file count manageable without any visible quality loss.

The original is stored as-is in its source format (PNG, JPG, etc.) so images can be re-processed later without depending on external CDNs. The frontend never references the `orig` file.

At ~150 KB average source image, the 3 WebP variants total ~100 KB per printing. With originals: ~250 KB per printing, ~200 MB total for ~800 printings.

### Directory Structure

Files are organized by set, with filenames derived from the printing ID. The printing ID is a composite of `{short_code}:{rarity}:{finish}:{promo|}` (generated by `buildPrintingId()`). For file paths, colons are replaced with hyphens and the promo boolean is abbreviated to `y`/`n`:

`{set_id}/{short_code}-{rarity}-{finish}-{promo:y|n}-{size}.webp`

```plaintext
card-images/
└── ARC/
├── OGN/
│   ├── OGN-027-normal-n-rare-foil-orig.png     # original (archived)
│   ├── OGN-027-normal-n-rare-foil-300w.webp
│   ├── OGN-027-normal-n-rare-foil-400w.webp
│   ├── OGN-027-normal-n-rare-foil-full.webp
│   ├── OGN-027a-altart-n-rare-foil-300w.webp   # alt-art
│   ├── OGN-223-normal-y-common-foil-300w.webp   # signed
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

- Self-hosted thumbnail: `{base}-300w.webp`
- Self-hosted full: `{base}-full.webp`
- Self-hosted srcset: `{base}-300w.webp 300w, {base}-400w.webp 400w`
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
