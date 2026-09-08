---
status: accepted
date: 2026-09-07
---

# ADR-047: Printing Desk for Trusted Contributors

## Context and Problem Statement

Promo printings reach the catalogue slowly. A collector who photographs promos for a living spots a new one on the day it is announced, but the only ways into OpenRift are the `/contribute` candidate pipeline (ADR-036), which waits for admin review and takes image URLs rather than files, or the full card-review admin grant (ADR-040), which exposes the diff-based review UI that exists for scraped sources. Neither fits a person who wants to add one printing, upload a few photos and get an image for a social post, and neither gives the admin the promo any faster.

How do we let a trusted contributor put promo printings and photos live without review latency, without exposing the whole admin surface, and without naming that person anywhere in the code?

## Decision Drivers

- Promos should be in the catalogue as soon as the contributor has them. Review latency is the thing to remove.
- The contributor edits a narrow set of fields. Card text, rarity and reference data stay with the admin.
- Every write must be attributable and auditable after the fact.
- The feature must be reusable for the next contributor. A person is one row in `admin_grants`, not a constant.
- The photos are public and become the active image where offered. Credit is part of the deal.

## Considered Options

1. **Candidate pipeline** (ADR-036) with file upload added to image suggestions.
2. **Existing `card-review` grant** on the full admin card pages.
3. **A new section grant with its own narrow pages**, writing live, audited through `admin_events`.

## Decision Outcome

Chosen option: **a new section grant, `printing-desk`, with its own pages (option 3)**, because it removes the review round-trip, keeps the exposed surface to the fields a promo needs, and rides the grant and audit machinery from ADR-040 unchanged.

Option 1 keeps the admin as the bottleneck for every promo, which is the problem statement. Option 2 exposes candidate diffs, field-level accepts and card text editing, which the contributor does not need and which makes the page slow to use for a one-printing task.

### Consequences

- Good, because a promo is live the moment the contributor saves it, and the photo shows on the card page and `/promos` the moment it is set active.
- Good, because the grant is a registry slug plus an allowlist, so a second contributor is an admin action, not a deploy.
- Good, because every write is an `admin_events` row, so the admin reviews after the fact on the existing card pages.
- Bad, because bad data goes live without a gate. The audit trail and the narrow field set are the defence, not review.
- Bad, because the allowlist is hand-maintained and the desk reaches endpoints outside its own prefix (card search, images, citations, channels, markers). A missed path surfaces as a 403 inside the desk.
- Bad, because the post image is another hand-built satori layout beside the list and deck renderers.

### Confirmation

`admin-section-paths.test.ts` pins the desk's allowlist. `require-admin` integration coverage shows a desk grant reaching the desk and image endpoints and being refused elsewhere. The renderer has unit tests per label and aspect producing a valid PNG. The ownership rule has a test where a grant holder updating a printing created by someone else gets a 403 and updating their own succeeds.

## Design

### Grant and scope

`printing-desk` joins `ADMIN_SECTION_SLUGS`. Its allowlist covers the desk's own routes plus, read-only or write as noted, the endpoints the pages compose from: card search and card printings (read), image upload, activate, rotate and delete (write), printing citations (write), distribution channel and marker create (write, never update or delete), sets, finishes, languages and distinct artists (read).

### Ownership

Grant holders may add photos and links to any printing, since a photo of a promo the admin entered is the point of the deal and the path allowlist cannot tell a promo from a base printing. Details (channel, markers, code, finish, language, size, artist, release date, note) are editable by a grant holder only on printings they created. Ownership is the creator recorded in `admin_events` for the printing's create action, so a later edit by the admin does not take the entry away from its creator. Full admins are unrestricted. The check lives in the desk service, not in the path allowlist, because it depends on the row.

### Data model

- `printings.released_at date` and `printings.release_precision`, both nullable, reusing the `set_releases` precision enum. Null means announced with no date. Sets keep their per-language dates; a printing's date is the promo-specific override the catalogue lacked.
- `printings.announced_at date`, nullable, day precision: the day a promo was first shown. It is a catalog fact, unlike the day a contributor collected a card, which stays a post fact. Not on the public site yet.
- Unknown code: `public_code = 'TBA'` and `short_code = 'TBA-<card slug>'`. `short_code` sits in two unique constraints, so the placeholder is per card. UI and exporters render any code starting with `TBA` as "Code TBA". Nullable codes would be the honest model, but they touch every code consumer, the foil-twin view, exports and the scanner, and the placeholder is correctable by hand.
- Image credit lives on the file: `image_files.credit`, nullable, set on upload from the uploader's display name. It is called image credit, not photo credit, because a file can be a scan or a digital asset. A printing-level citation was the first cut and broke as soon as two people supplied images of one printing, since the card page credited whichever name the citation held. Post links are not on the file: a post is about the printing, so it stays a citation, and the contributor has one list to paste into.
- Every upload lands as a front; the side is changed per image afterwards. The image stays active across the move unless the other side already has an active image, so the one-active-per-face rule holds. The public card page still shows fronts only; showing backs is a separate change.

### Pages

Desk home lists printings the user created, with an "All promos" toggle for every printing carrying markers or a channel, and exports the list as CSV. Full admins open on "All promos", grant holders on their own. Card page shows the card's printings per language and a "new promo printing" tile. The form asks for what differs from the base printing: channel, markers, code or the TBA flag, finish, language, size, release date with precision and a note. Channel and marker pickers search first and offer inline create underneath, a leaf under a chosen parent or a new root. The printing page is the one place for a printing: a details section that edits in place (read-only for a grant holder who did not add the printing), the images (drag and drop, credit and side per image, rotation, active per side, delete), and the source links. A separate edit page was the first cut and cost a round trip per correction. The post page renders the image.

### Posts

A post is its own unit: an ordered list of image slides, one label, one format, one date, one caption. The date is a post fact: only "released" maps to something the catalog stores (the printing's release period), while the announcement and collection dates belong to the post and its author, so the composer defaults them and never writes them back. It may span several printings, which is how a month of promos becomes one carousel. The composer lives at `/admin/printing-desk/post` with the slides, label and format in the URL, so a composition is a link and nothing is stored. It is reached from a printing page (that printing's active image as the first slide) and from row selection on the desk home. A "post this file" button on the image rows was the first cut and put the action on the wrong unit. A posts table is deliberately absent: the only thing it would add is history, and the post link already lives on the printing as a source. If "what did I post when" is ever wanted, the composer's URL is exactly what such a row would store.

`printing-post-image.ts` renders one slide and composes from `share-image-core.ts`: satori layout at the base size, resvg raster, bundled fonts. Inputs are the printing, an image file (default the active one), a label from a fixed list in `packages/shared` (announced, released, collected), an aspect (square 1080², portrait 1080×1350, story 1080×1920) and a scale. The image fills the frame over a blurred copy of itself; the strip carries name, code, finish, channel, artist, the image credit of the chosen file and the site host as a brand mark. No QR and no link: Instagram is viewed on the phone that would scan it. The caption, built beside the slides, carries one block per printing with the card URL and `printingId`, so each link lands with its printing open.

## More Information

Builds on ADR-040 (grants), ADR-031 and ADR-024 (share-image pipeline). ADR-036's `/contribute` stays the path for truly new cards, which need the full card shape and review.
