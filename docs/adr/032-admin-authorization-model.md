---
status: accepted
date: 2026-06-27
---

# ADR-032: Admin Authorization stays Prefix-Gated until a Cross-Cutting Role appears

## Context and Problem Statement

The API expresses per-route authentication two ways. A procedure's contract `meta.auth` (`public` / `bearer` / unset) drives both the runtime session gate (`apps/api/src/orpc/base.ts`) and the per-operation OpenAPI `security` marker (`apps/api/src/openapi-doc.ts`). Admin _authorization_, by contrast, is not in the contract at all: it is a `requireAdmin` Hono middleware mounted on the `/api/admin/v1/*` URL prefix (`apps/api/src/app.ts`). The contract and OpenAPI layers can't see it, so until now the admin operations were documented as needing only a session cookie.

A review flagged this as an "authorization split-brain". The question underneath it: should admin move into the contract `meta` alongside `auth`, and is a prefix-gated admin surface a dead end once a second admin-ish role shows up?

Today there is exactly one global role. The `admins` table is bare `userId` membership: no levels, no scoping. Everything else that looks role-like (`owner` / `member` / `judge` on friend groups, `giver` on trades) is a per-resource membership check inside handlers (`getMembership`), not a URL-level gate. So the current design is not "a route tree per role." It is one URL prefix for the one global binary role, plus per-row checks for the rest.

We expect a second admin-ish role eventually, and the likely shape is a cross-cutting capability (e.g. a moderator who can delete user-generated content across every section but cannot create or configure) rather than a section-scoped subset. A cross-cutting boundary does not follow the URL tree, so a prefix cannot express it.

## Decision Drivers

- **Don't build a permission system for a role that doesn't exist.** With one binary role, any permission taxonomy invented now is a guess at boundaries we haven't seen.
- **Fail-closed by construction.** The prefix mount gates _every_ route under `/api/admin/v1/*` regardless of what its contract says, so an admin route cannot forget its gate. Any future model must keep that property.
- **Authz is already centralized.** Admin enforcement lives in one middleware, not scattered `isAdmin` calls, so the eventual migration is bounded and mechanical, not a hunt.
- **The OpenAPI doc should not lie.** The admin spec should show the role requirement, not advertise a bare session cookie.
- **URLs are a stable contract.** The admin SPA and any OpenAPI clients consume these paths; an authz-model change should not churn them.

## Considered Options

1. **Keep prefix + middleware now; migrate to per-route permission metadata when a cross-cutting role lands** (chosen). Fix only the documentation gap today.
2. **Unify admin into `meta.auth: "admin"` now.** Rejected: it reintroduces the exact footgun the prefix avoids (a new admin route that forgets the tag becomes silently non-admin), and to stay safe you keep the prefix mount as a backstop anyway, so you run both mechanisms for one binary role.
3. **Reorganize admin URLs around the permission model.** Rejected: grouping paths by permission re-couples URL structure to authz, which is the coupling the cross-cutting model is built to escape.

## Decision Outcome

**Now:** admin authorization stays the `requireAdmin` middleware on the `/api/admin/v1/*` prefix. The only change is documentation fidelity: `applySecurity` stamps an `adminAuth` security marker onto every operation whose path starts with `/api/admin/`, mirroring the mount, and `app.ts` registers the `adminAuth` scheme (the same session cookie as `cookieAuth`, described as requiring the admin role). No contract `meta` change, no new role machinery.

The marker is deliberately forward-compatible. An OpenAPI security requirement value is a scopes list, so today's `{ adminAuth: [] }` becomes `{ adminAuth: ["content:delete"] }` the day permissions arrive, a value change rather than a redesign.

**Later (when a cross-cutting role is specified):** migrate the admin surface to per-route permission metadata (RBAC), with these invariants:

- Generalize `requireAdmin` into a coarse perimeter gate (`requireStaff`: "holds at least one admin-ish role") kept on the prefix. It stays the fail-closed perimeter and the admin/public OpenAPI doc split.
- Each admin contract op declares `meta.permission` (e.g. `"users:manage"`). A single enforcement middleware resolves the caller's permission set and checks the route's requirement. The prefix gate plus the permission check is the perimeter-then-capability layering.
- Roles become permission bundles in tables (`roles`, `role_permissions`, `user_roles`). `admin` = all permissions; `moderator` = a slice.
- **Default-deny on untagged admin ops.** An admin route missing its `meta.permission` is denied (or restricted to full-admin), never silently open. This carries the prefix's fail-closed instinct into the permission layer, so the migration doesn't reintroduce the forgot-the-tag footgun.

**URLs stay stable through the migration.** Changing _who_ may call an endpoint is metadata's job, not the path's. An authz-model change is not a `v2`. The one genuine URL decision is for capabilities acting on resources that live _outside_ the admin prefix (a moderator deleting a user's deck at `/api/v1/decks/:id`): keep the existing URL and branch the authz when it is the same operation with a broader rule. Mint a new endpoint under the admin prefix only when it is a semantically different admin action (audited, reason-required, ownership-bypassing).

### Consequences

- Good, because the documentation gap is closed today with a localized change, and the marker already anticipates the cross-cutting future, so nothing has to be undone.
- Good, because the fail-closed property is preserved now (prefix mount) and is a stated requirement of the future model (default-deny).
- Good, because existing admin URLs are stable across the eventual migration; only net-new moderation operations on non-admin resources add paths.
- Neutral, because the split between contract `meta.auth` (authentication) and middleware/permission (authorization) persists. The OpenAPI doc now reflects both, so the "split-brain" is a documented layering, not an invisible one.
- Bad, because admin authorization is still not visible in the contract source itself (only in the prefix mount and, after migration, `meta.permission`); a reader of a single contract file does not see the gate. Accepted: the prefix makes the gate unforgettable, which is worth more than co-locating it.

### Confirmation

`apps/api/src/app-openapi-doc.test.ts` asserts the admin doc carries the `adminAuth` scheme and that a representative admin op (`GET /api/admin/v1/users`) is stamped `{ adminAuth: [] }`, while the document default stays `{ cookieAuth: [] }`. When the permission model lands, that test extends to assert each admin op carries its `meta.permission` as the scope and that an untagged admin op is denied.

## More Information

- `apps/api/src/orpc/base.ts` documents the fail-closed `meta.auth` model and why admin authorization deliberately stays out of it.
- `apps/api/src/middleware/require-admin.ts` is the gate (with a 30s in-memory admin-status cache); `apps/api/src/app.ts` mounts it on `/api/admin/v1/*` and registers the security schemes.
- `apps/api/src/openapi-doc.ts` (`applySecurity`) stamps the per-operation markers, including the admin-by-path rule.
