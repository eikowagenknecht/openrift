# Decisions

For new Architectural Decision Records (ADRs), please use the following template as a starting point: [adr-template.md](adr-template.md).
It has a lot of sections, but most are optional and should only be used if they add value for this specific MADR!

If you are not sure which to use, go with the default:

- Short title, representative of solved problem and found solution
- Context and Problem Statement
- Considered Options
- Decision Outcome
- Consequences

Only add the other sections if it really is needed.

The MADR documentation is available at <https://adr.github.io/madr/> while general information about ADRs is available at <https://adr.github.io/>.

## Overview

### Accepted

- **[ADR-001](001-virtual-scrolling.md)**: Virtual Scrolling for Card Grid
- **[ADR-002](002-use-bun-as-node-pnpm-replacement.md)**: Use Bun as Node.js and pnpm Replacement
- **[ADR-003](003-adopt-ssr.md)**: Adopt SSR via TanStack Start (originally rejected, reversed 2026-05-13)
- **[ADR-004](004-replace-nuqs-with-tanstack-router.md)**: Replace nuqs with TanStack Router Search Params (originally rejected, reversed 2026-05-13)
- **[ADR-005](005-collection-tracking-data-model.md)**: Collection Tracking Data Model
- **[ADR-006](006-adopt-zustand.md)**: Adopt Zustand for Client-Side State Management
- **[ADR-007](007-self-hosted-card-images.md)**: Self-Hosted Card Images
- **[ADR-008](008-supplemental-card-import.md)**: Supplemental Card Import Pipeline
- **[ADR-009](009-client-side-filtering.md)**: Client-Side Filtering and Full-Dataset Fetch
- **[ADR-010](010-pino-logging.md)**: Use pino for structured logging
- **[ADR-011](011-compression-at-nginx-only.md)**: Handle HTTP compression in nginx only
- **[ADR-013](013-friend-groups.md)**: Friend Groups for Trading Discovery
- **[ADR-016](016-caching-layers.md)**: Caching layers
- **[ADR-017](017-trade-preferences.md)**: Trade Preferences on Shared Lists
- **[ADR-018](018-user-share-bundle.md)**: User Share Bundle for Wish + Trade Lists
- **[ADR-019](019-trade-execution.md)**: In-App Trade Execution for Friend Groups (supersedes ADR-013's "no trade execution" and "notifications deferred" stances)
- **[ADR-021](021-match-tracker.md)**: Local Match Tracker for Points and XP

### Rejected

- **[ADR-012](012-switch-to-bun-image-processing.md)**: Switch to Bun image processing

### Proposed

- **[ADR-014](014-tournament-decks.md)**: Tournament Decks Archive
- **[ADR-015](015-preconstructed-product-catalog.md)**: Preconstructed Product Catalog
- **[ADR-020](020-double-sided-token-data-model.md)**: Double-Sided Token Data Model
- **[ADR-022](022-ffa-pod-pairing.md)**: FFA Pod Pairing for Multiplayer Tournaments
- **[ADR-023](023-card-designer.md)**: Card Designer for Custom Riftbound Cards
- **[ADR-024](024-share-images-for-lists.md)**: Server-Rendered Share Images for Lists
