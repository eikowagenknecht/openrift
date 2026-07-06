---
status: rejected
date: 2026-05-13
---

# ADR-012: Switch to Bun image processing

## Context and Problem Statement

Bun v1.3.14 ships `Bun.Image`, a built-in image processing API benchmarked at 1.2–1.38× sharp 0.34.5. We currently use sharp in `apps/api/src/services/image-rehost.ts` to normalize uploaded card scans, accessed through a thin wrapper in `apps/api/src/io.ts`. Switching would drop a native dependency, shrink install size, and pick up the perf win.

## Considered Options

- Switch to `Bun.Image`
- Keep sharp

## Decision Outcome

Rejected: do not switch to `Bun.Image`. The card-rehost pipeline depends on `trim()` (auto-crop by background color) and `extract()` (crop to a rectangle), neither of which `Bun.Image` exposes. Trim is what strips the white scanner halo around card art, and extract is what shaves the final 1px after trim. Without these, the rehost path would need a hand-rolled pixel-buffer walk, which negates the perf and code-size wins.

### Consequences

- Good, because the rehost pipeline keeps its edge-detection without a rewrite.
- Bad, because we keep a native dependency with platform-specific binaries.
- Bad, because we miss the 1.2–1.38× throughput win.

### Confirmation

Re-evaluate when a future Bun release adds `trim` and `extract` (or equivalents). The replacement would touch only `io.ts` and `image-rehost.ts`.

## Pros and Cons of the Options

### Switch to `Bun.Image`

- Bad, because no `trim` or `extract` means rewriting white-edge cropping ourselves on raw pixel buffers.
- Bad, because `Bun.Image`'s rotation is restricted to 90/180/270 (acceptable today, but a future requirement for arbitrary angles would block us).

### Keep sharp

- Good, because `trim({ background: "white", threshold: 60 })` and `extract({ left, top, width, height })` are core to the rehost pipeline and have no `Bun.Image` equivalent.
- Good, because sharp's libvips backing is mature and well understood.
