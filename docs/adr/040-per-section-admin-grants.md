---
status: accepted
date: 2026-07-08
---

# ADR-040: Per-Section Admin Grants

## Context and Problem Statement

ADR-032 kept admin authorization as one binary role behind the `requireAdmin` gate on the `/api/admin/v1/*` prefix and deferred any permission system until a real second role appeared. That role has now appeared, but section-scoped rather than cross-cutting: a trusted helper should manage exactly one admin section (Custom Tags) without access to the rest of the admin surface. How do we express that without building the full RBAC that ADR-032 sketched for the cross-cutting case?

## Considered Options

1. Minimal per-section grants checked inside the existing prefix gate (chosen)
2. The full RBAC migration from ADR-032 (`roles`, `role_permissions`, per-route `meta.permission`)
3. Per-user feature flags as pseudo-permissions

## Decision Outcome

A grant is a row in `admin_grants(user_id, section)`, where `section` is a slug from the shared registry `ADMIN_SECTION_SLUGS` (`packages/shared/src/admin-sections.ts`). The prefix gate stays the single enforcement point: `requireAdmin` resolves `{ isAdmin, sections }` (30s cache), full admins pass everything, and grant holders pass only the API paths their sections map to (`apps/api/src/middleware/admin-section-paths.ts`) plus the `/me` probe, which reports the access so the web app can scope its route guard, sidebar, and header entry. Full admins manage grants on `/admin/users`.

Adding a grantable section means one registry slug, one API path matcher, and one web route entry; the latter two are exhaustive `Record<AdminSectionSlug, …>` types, so the compiler forces them. RBAC was rejected because one section-scoped helper still gives no evidence for permission taxonomy boundaries; feature flags were rejected because they are a product-experiment mechanism, and using them for authorization muddies both.

### Consequences

- Good, because fail-closed is preserved: the prefix mount still gates every admin route, and unknown section slugs or unmapped paths deny.
- Good, because a new section is a three-file, compile-enforced change with no migration.
- Bad, because the path-to-section mapping is hand-maintained: an admin page that reads endpoints outside its own prefix needs those added explicitly (Custom Tags needed the read-only `cards/all-cards` list), and a missed path surfaces as 403s inside the granted page.
- Bad, because this is not a general permission model. A cross-cutting capability (e.g. moderator) still triggers ADR-032's RBAC plan; these grants would fold into it as narrow roles.

## More Information

- ADR-032 documents why authorization stays in the prefix gate rather than contract `meta`, and the RBAC plan this ADR deliberately does not start.
- `apps/api/src/middleware/require-admin.test.ts` and `admin-section-paths.test.ts` pin the gate behavior and the per-section path allowlist.
