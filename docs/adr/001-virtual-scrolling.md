---
status: accepted
date: 2026-03-02
---

# ADR-001: Virtual Scrolling for Card Grid

## Context and Problem Statement

The card grid renders all filtered printings at once, with no windowing, pagination, or lazy rendering. The dataset contains ~3,026 printings of 769 unique cards across 7 sets (Proving Grounds, Origins, Spiritforged, Unleashed, Arcane Box Set, Vendetta, Founders). Each `CardThumbnail` renders 2–4 `<img>` elements, so an unfiltered grid produces over 6,000 DOM nodes, a problem on memory-constrained mobile devices.

The grid also uses set-based grouping with sticky headers and supports scroll-to-group navigation, which complicates any virtualization approach.

## Considered Options

- Implement virtual scrolling using `@tanstack/react-virtual`
- Defer virtual scrolling until the dataset grows or performance issues are observed

## Decision Outcome

We implement virtual scrolling with `@tanstack/react-virtual`. The DOM node count already degrades performance on mobile, and the complexity concerns around grouped layouts were resolved during implementation.

### Consequences

- Good, because only visible rows are mounted, cutting DOM nodes from ~6,000+ to a small window regardless of dataset size, so future sets add no render cost.
- Bad, because `CardGrid` is significantly more complex: it models rows as a flat list interleaving header and card rows with variable sizes, and manages scroll margin, sticky header detection, and navigation via refs.

## Pros and Cons of the Options

### Implement virtual scrolling

Uses `useWindowVirtualizer` from `@tanstack/react-virtual` with a flat virtual row model (`VRow = "header" | "cards"`). Each set group expands into one header row plus N card rows, chunked by column count. Row heights are estimated from card dimensions and refined with measured positions as rows render.

- Good, because `useResponsiveColumns` already tracks column count reactively, keeping row calculation simple.
- Good, because sticky headers work as a CSS overlay at `top: 56px` with precomputed cumulative row offsets for active-header detection, no per-scroll DOM measurement needed.
- Good, because scroll-to-group, arrow-key navigation, and the draggable scroll indicator all integrate with the virtualizer's `scrollToIndex` API.
- Bad, because the component grew to ~670 lines with refs for closure stability (`virtualizerRef`, `virtualRowsRef`, `rowStartsRef`) and multiple passive scroll listeners.

### Defer virtual scrolling

- Good, because ~3,000 printings is a moderate dataset that desktops handle without jank, and users typically have filters active, keeping the rendered count well below the full catalogue.
- Bad, because the worst case (no filters, mobile) is already noticeable, and each new set raises the baseline DOM cost with no mitigation.
