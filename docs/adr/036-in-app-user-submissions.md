---
status: accepted
date: 2026-07-08
---

# ADR-036: In-App User Card Submissions via the Candidate Pipeline

## Context and Problem Statement

The `/contribute` surface lets anyone add a missing card, suggest a correction to an existing card, or suggest a printing image. The in-app form is already rich and already validates the input against a schema, but submission works by opening a prefilled "new file" page on the `openrift-data` GitHub repo. The contributor then has to own a GitHub account, create a fork, click "Propose changes", and open a pull request.

That GitHub round-trip is the friction. Most contributors are Riftbound players, not developers, and the fork/PR flow confuses them. We want submissions collected directly in the app, with no GitHub account required.

The catalog is currently fed by the source-agnostic candidate import pipeline from ADR-008: a data source produces candidate JSON, an admin uploads it, candidates land in `candidate_cards` / `candidate_printings`, and each is reviewed and either promoted into `cards` / `printings` (with image rehosting per ADR-007) or moved to the `ignored_candidate_*` tables. There are no real end-user submissions yet, so the database is effectively canonical for the catalog today.

## Decision Drivers

- Remove the GitHub account requirement from the contributor path.
- Reuse the existing review and promotion machinery rather than build a parallel one.
- Keep spam and junk out of the catalog without a heavy identity system.
- Do not regress the admin's control: every submission stays human-reviewed before it goes live.

## Considered Options

- **New standalone submission table + bespoke review UI:** a fresh `card_submissions` table and its own admin moderation screen.
- **In-app submission into the existing candidate pipeline:** the form writes into `candidate_cards` / `candidate_printings` under a new `usersubmission` provider, and everything downstream (review tabs, accept, ignore) works unchanged.
- **Keep GitHub, wrap it:** hide the GitHub mechanics behind a server bot that opens the PR on the user's behalf, so `openrift-data` stays canonical.

## Decision Outcome

We add in-app submission into the existing candidate pipeline. ADR-008 deliberately made the pipeline source-agnostic and keyed candidates on `(provider, external_id)`, so a new data source is just a new `provider` value. User submissions become candidates like any other source, land in exactly the same matched/unmatched review tabs, promote through exactly the same accept flow, and rejections go to `ignored_candidate_cards`. The database is already canonical for the catalog, so nothing about the source of truth changes.

The GitHub "new file" flow is retired from the user-facing form. `openrift-data` can remain as an optional public export target in the future, but it is no longer part of the contributor path.

### Consequences

- Good, because contributors need only a signed-in OpenRift account, not GitHub.
- Good, because no new review surface is built. User submissions flow into the candidate tabs the admin already uses.
- Good, because the accept flow (including image rehosting from ADR-007) and the ignore flow are reused as-is.
- Good, because `usersubmission` as a distinct provider means user-sourced candidates can be filtered and badged in the admin UI without special-casing.
- Bad, because the submission endpoint is now an authenticated write surface that must defend against abuse, whereas GitHub previously absorbed that with account friction and its own spam controls.
- Bad, because per-submission `external_id`s (see Design) mean the "skip an ignored `(provider, external_id)` on re-upload" protection does not block a resubmitted junk card. Abuse defense leans on the signed-in user, rate limiting, and the admin ban lever instead of the key.
- Neutral, because `openrift-data` is decoupled from the app rather than removed. A public archive can be re-added later as an export without touching this path.

## Design

### Pipeline Overview

```plaintext
Contributor (signed in)          OpenRift
───────────────────────          ────────
Fill /contribute form       →    submission endpoint (authenticated, rate-limited)
                                      ↓
                                 map form JSON → candidate shape
                                      ↓
                                 candidate_cards + candidate_printings
                                 (provider = "usersubmission")
                                      ↓
                                 Admin UI: same review tabs as ADR-008
                                      ↓
                    Accept            Reject
                      ↓                 ↓
              cards / printings   ignored_candidate_cards
              + image rehost      / ignored_candidate_printings
              (ADR-007)
```

### Provider and Natural Key

- `provider = "usersubmission"` for every in-app submission. A single provider covers all three flows. The flow is inferred from which fields the candidate populates (a full new card, an update diff, or a lone `image_url`), not from a separate provider. The admin filters all user submissions as one bucket.
- `external_id` is unique per submission, not per card. Two different users submitting "Jinx" produce two candidate rows, both of which match the live Jinx by `norm_name` and appear in the Updates tab for the admin to handle independently. No submission silently overwrites another in staging.
  - Format: `<slug>--<UTC-datestamp>--<userId>`, reusing the `<slug>--<UTC-datestamp>` value the form already generates and appending the submitter's user id. This is human-readable in the admin table, self-documents who and when at a glance, and is unique per user per minute.

### New vs. Update Detection

Unchanged from ADR-008. The server normalizes each candidate's name into `norm_name` and matches it against `card_name_aliases`, then against `cards.norm_name`, else treats it as a new-card candidate. This means:

- **New card** submissions surface in the New Cards tab.
- **Correction** submissions (the `/contribute/:cardSlug` flow, slug locked) normalize to the existing card and surface in the Updates tab with the field-level diff.
- **Image suggestion** submissions (the `/contribute/:cardSlug/image/:printingId` flow) are a sparse candidate update: the card matches by `norm_name`, the printing matches by its public code, and only the printing `image_url` is populated. The admin accepts just that field, and the image is rehosted through the ADR-007 pipeline. Input is an image URL only in v1 (matching today's form). Direct file upload is out of scope.

### Submitter Metadata

Add dedicated columns to `candidate_cards`:

- `submitted_by_user_id` (nullable, foreign key to users, indexed): records who submitted the candidate.
- `submission_note` (nullable text): the contributor's free-text "where I spotted this" note.

These are chosen over stuffing the values into `extra_data jsonb` so that "submissions by user X", per-user rate limiting, and the admin ban lever are cheap and indexable. This costs one migration. The columns are nullable so admin-uploaded candidates from other providers (which have no submitter) are unaffected.

The column is what makes the v1 abuse story work even though the contributor experience is fire-and-forget: rate limiting and banning both need a recorded submitter. It also leaves the door open to a "My Contributions" page later with no second migration.

### Contributor Experience (v1)

- **Auth:** signed-in OpenRift account required. This is the replacement for GitHub's account requirement, and a far lighter ask than a GitHub account plus fork plus PR.
- **After submit:** a thank-you confirmation, and nothing further (fire and forget). No status page and no accept/reject notification in v1. The `submitted_by_user_id` column keeps a later status/notification surface a pure addition.

### Anti-Abuse (v1)

- Per-user rate limit on the submission endpoint: 50 submissions per user per day, tunable via config. Loose enough that a keen contributor cataloguing a new set in one sitting is never blocked. A single bad actor is capped at 50 junk rows per day before the ban lever applies.
- The signed-in requirement provides attribution and a ban lever. A banned or throttled user cannot flood the review queue.
- No captcha/Turnstile and no honeypot in v1. Add Turnstile later only if abuse actually appears. This is the lightest defense that still relies on a recorded identity, consistent with the fire-and-forget, rate-limit-only choices.

### Schema Mapping

The form validates against its own contribution schema, which is not identical to the ADR-008 candidate shape. The submission endpoint maps the validated form JSON onto the candidate shape server-side (name and stat fields onto `candidate_cards`, per-printing fields onto `candidate_printings`, image URL onto the printing). The form itself does not need to learn the candidate schema.

### Admin UI

No new review screen. User submissions appear in the existing New Cards / Updates tabs. Because they carry `provider = "usersubmission"`, the candidate row gets a "user submission" badge and the candidate list offers a filter toggle to show only user submissions, so they can be triaged separately from script-ingested sources without leaving the existing tabs. The submitter and their note are shown on the candidate for context.

### API Endpoint

A single authenticated, rate-limited submission route accepts the form payload, maps it, and inserts the candidate. It is a public-authenticated route, not an `/admin/*` route. The exact path is illustrative and left to implementation, following the precedent in ADR-008 where the shipped route tree diverged from the draft.

### GitHub Retirement

The GitHub "new file" URL builders (`buildGithubNewFileUrl` / `buildContributionFilename` / `buildCommitMessage`) and the "submit via GitHub" UI are deleted. `contribute-json.ts` is now pure form-state, validation, and submission-payload logic. `openrift-data` is no longer referenced by the app's contribution path. If a public archive is wanted later, accepted submissions can be exported back to `openrift-data` as a separate, server-side concern without reintroducing GitHub into the user path.

## Dependencies

- **ADR-008 (Supplemental Card Import Pipeline):** provides the candidate staging tables, the source-agnostic `(provider, external_id)` key, the review tabs, the accept/promote flow, and the ignore flow that this ADR reuses wholesale.
- **ADR-007 (Self-Hosted Card Images):** the accept flow downloads, resizes, and rehosts submitted image URLs through this pipeline.

## Implementation Notes

- **Dedicated ingest, not `ingestCandidates`.** The batch `ingestCandidates` treats a provider as a full-replace namespace: its Phase 3 deletes any candidate rows under the provider that are absent from the payload. Since all user submissions share `provider = "usersubmission"`, batching one card through it would delete every other user's pending submission. The feature instead ships `services/ingest-user-submission.ts`, which inserts exactly one candidate card (+ printings) with a per-submission-unique `external_id` and never deletes. It reuses the batch ingest's validators (`candidateCardValidator` / `candidatePrintingValidator`, now exported) and the same live card/printing link resolution, so a correction or image suggestion still lands in the admin Updates tab.
- **Server-generated keys.** The endpoint ignores any client-supplied ids. It mints `external_id = <slug>--<UTC-dateStamp>--<userId>` for the card and extends it per printing, from a server timestamp. The client never influences the natural key or the provider.
- **Submitter columns.** Migration `184-candidate-submitter` adds `candidate_cards.submitted_by_user_id` (FK `users(id) ON DELETE SET NULL`, partial index) and `submission_note` (CHECK `<> ''`), both nullable so other providers are unaffected.
- **Rate limit is the daily cap.** `USER_SUBMISSION_DAILY_LIMIT = 50` is enforced inside the ingest transaction: a `pg_advisory_xact_lock(hashtext(userId))` (`ingestRepo.lockUserSubmissions`) serializes a user's concurrent submissions, then the user's candidate rows in the trailing 24h are counted (`ingestRepo.countRecentSubmissionsByUser`). The lock is what makes this race-safe. A plain COUNT under READ COMMITTED cannot see concurrent uncommitted inserts, so parallel requests would otherwise all pass the check. The cap survives restarts. A 256 KB Hono `bodyLimit` fronts the route. There is no per-IP burst limiter (the daily cap plus the signed-in requirement are the agreed defense).
- **Sign-in is route-level, not in-form.** The three `/contribute` routes carry a `beforeLoad` guard that redirects a signed-out visitor to `/login` (redirect-back preserved), and the menu's Contribute entry joins the existing locked-feature set (lock glyph + `SignInRequiredDialog`) like Collection/Groups. So a contributor signs in before filling the form rather than losing their input at submit time. The forms therefore assume an authenticated user.
- **Size and distribution channels carried end-to-end.** Migration `185-candidate-printing-size-channels` adds `size` + `distribution_channel_slugs` to `candidate_printings` (the pipeline previously dropped both). The form collects them, they flow through submission → staging, and `acceptPrinting` (which already supported them) now receives them from the candidate row, so a submitted oversized/channel lands on the accepted printing. Image suggestions stay sparse and assert neither.
- **Admin alert email (added later).** A submission is worthless if nobody notices it, and nothing pushed. `services/card-submission-notifications.ts` emails every admin who opted in, right after the candidate row commits and outside the transaction, best-effort so a mail failure can never fail a contributor's submission. The opt-in is a per-admin preference (`emailNotifications.cardSubmissions`, default **off**, toggled in the profile's Admin section) rather than an `ADMIN_EMAIL` env var or a blanket send to the `admins` table, so promoting a second admin never signs them up for someone else's review mail. The recipient query inner-joins `admins`, so the role is the real gate and a demoted admin stops receiving them without their stored preference changing. Each admin gets their own send (addresses are never shared on a To: line) and their own one-click unsubscribe token, reusing the ADR-030 channel machinery.
- **Admin surfacing.** `candidateCardSummarySchema` gained `hasUserSubmission` (true when any candidate in the normalized-name group is a user submission), computed in `candidate-queries.ts`. The admin candidate table shows a "user submission" badge and a filter toggle (`?source=usersubmission`) that composes with the existing "unchecked" filter.

## Confirmation

Implementation is in line with this ADR when: a signed-in user can submit a new card, a correction, and an image suggestion from `/contribute` with no GitHub interaction; each lands in `candidate_cards` under `provider = "usersubmission"` with `submitted_by_user_id` populated; the admin sees and can accept or reject them in the existing candidate tabs; rejection routes to `ignored_candidate_cards`; and the GitHub "new file" path is gone from the UI. Covered by an integration test that posts a submission and asserts the staged candidate, plus the existing candidate accept/ignore tests continuing to pass for the new provider.
