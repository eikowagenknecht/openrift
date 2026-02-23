# ADR-001: Virtual Scrolling for Card Grid

**Date:** 2026-02-21
**Status:** Superseded
**Deciders:** @eiko

## Context

The card grid renders all filtered cards simultaneously with no windowing, pagination, or lazy rendering. `@tanstack/react-virtual` was installed as a dependency but never integrated.

The current dataset contains 664 cards across 3 sets (Proving Grounds: 24, Origins: 352, Spiritforged: 288). Each `CardThumbnail` renders 2–4 `<img>` elements, resulting in ~1,300+ DOM nodes when all cards are visible with images enabled.

## Original Decision (Accepted 2026-02-21)

Remove `@tanstack/react-virtual` and defer virtual scrolling until the dataset grows or performance issues are observed.

### Rationale

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

## Update (Superseded)

Virtual scrolling has since been implemented using `@tanstack/react-virtual` in `CardGrid`. The complexity concerns around set-based grouping with sticky headers were resolved during implementation.
