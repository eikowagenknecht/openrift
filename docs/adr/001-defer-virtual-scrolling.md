# ADR-001: Defer Virtual Scrolling for Card Grid

**Date:** 2026-02-21
**Status:** Accepted
**Deciders:** @eiko

## Context

The card grid renders all filtered cards simultaneously with no windowing, pagination, or lazy rendering. `@tanstack/react-virtual` was installed as a dependency but never integrated.

The current dataset contains 664 cards across 3 sets (Proving Grounds: 24, Origins: 352, Spiritforged: 288). Each `CardThumbnail` renders 2–4 `<img>` elements, resulting in ~1,300+ DOM nodes when all cards are visible with images enabled.

## Decision

Remove `@tanstack/react-virtual` and defer virtual scrolling until the dataset grows or performance issues are observed.

## Rationale

**Arguments for deferring:**

- 664 cards is a moderate dataset that browsers handle without noticeable jank on most devices.
- Users typically have filters active, reducing the rendered count well below 664.
- The `CardGrid` component uses set-based grouping with sticky headers and a `scrollToGroup` function. Virtualizing this requires modeling rows as a flat list interleaving header rows and card rows with variable sizes — adding meaningful complexity.
- Scroll restoration and group navigation would need to be reworked to use the virtualizer's scroll API.
- The effort-to-impact ratio is unfavorable at the current dataset size.

**Arguments for virtualizing now (rejected):**

- All cards mount simultaneously with no filters — worst case is 664 DOM nodes plus children.
- Mobile devices with limited memory could benefit from reduced DOM size.
- `useResponsiveColumns` already tracks column count reactively, making row calculation straightforward.

## Consequences

- Reduced dependency footprint.
- Slightly higher DOM node count with no filters active (acceptable at current scale).
- When the card pool exceeds ~1,000 cards (e.g., new set releases, card variants), this decision should be revisited.

## Revisit Triggers

- Card pool grows beyond 1,000 entries.
- Card variants or alternate art multiply the entry count.
- Performance profiling reveals scroll jank on target devices.
- Users report sluggish performance on mobile.
