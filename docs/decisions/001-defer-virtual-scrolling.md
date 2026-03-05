---
status: accepted
date: 2026-03-02
---

# ADR-001: Virtual Scrolling for Card Grid

## Context and Problem Statement

The card grid renders all filtered cards simultaneously with no windowing, pagination, or lazy rendering. The dataset contains 664 cards across 3 sets (Proving Grounds: 24, Origins: 352, Spiritforged: 288). Each `CardThumbnail` renders 2–4 `<img>` elements, resulting in ~1,300+ DOM nodes when all cards are visible — a problem on memory-constrained mobile devices.

The grid also uses set-based grouping with sticky headers and supports scroll-to-group navigation, which adds complexity to any virtualization approach.

## Considered Options

- Implement virtual scrolling using `@tanstack/react-virtual`
- Defer virtual scrolling until the dataset grows or performance issues are observed

## Decision Outcome

Chosen option: "Implement virtual scrolling using `@tanstack/react-virtual`", because the DOM node count is already high enough to degrade performance on mobile devices, and the complexity concerns around grouped layouts were resolved during implementation.

### Consequences

- Good, because only visible rows are mounted, reducing DOM nodes from ~1,300+ to a small window regardless of dataset size.
- Good, because the architecture scales to future sets without performance regression.
- Bad, because the `CardGrid` component is significantly more complex — it models rows as a flat list interleaving header and card rows with variable sizes, and manages scroll margin, sticky header detection, and navigation via refs.

## Pros and Cons of the Options

### Implement virtual scrolling

Uses `useWindowVirtualizer` from `@tanstack/react-virtual` with a flat virtual row model (`VRow = "header" | "cards"`). Each set group is expanded into one header row plus N card rows (chunked by column count). Row heights are estimated dynamically based on card dimensions and refined with measured positions as rows render.

- Good, because it reduces DOM nodes to a small viewport window plus 3 overscan rows, improving performance on memory-constrained devices.
- Good, because `useResponsiveColumns` already tracks column count reactively, making row calculation straightforward.
- Good, because sticky headers are handled via a CSS overlay at `top: 56px` with precomputed cumulative row offsets for active header detection — no per-scroll DOM measurement needed.
- Good, because scroll-to-group, arrow-key navigation, and the draggable scroll indicator all integrate with the virtualizer's `scrollToIndex` API.
- Bad, because the component grew to ~900 lines with refs for closure stability (`virtualizerRef`, `virtualRowsRef`, `rowStartsRef`) and multiple passive scroll listeners.

### Defer virtual scrolling

- Good, because 664 cards is a moderate dataset that browsers handle without noticeable jank on most desktop devices.
- Good, because users typically have filters active, reducing the rendered count well below 664.
- Bad, because the worst case (no filters) renders all 664 cards with ~1,300+ DOM nodes, which is noticeable on mobile.
- Bad, because each new set release increases the baseline DOM cost with no mitigation.
