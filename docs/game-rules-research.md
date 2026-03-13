# Game Rules Feature — Research Document

> **Date:** 2026-03-13
> **Goal:** Add a digital, searchable, linkable version of the Riftbound game rules to OpenRift

---

## Table of Contents

1. [Official Rules Documents](#1-official-rules-documents)
2. [Rules Version History](#2-rules-version-history)
3. [Core Rules Structure](#3-core-rules-structure)
4. [Existing Community Implementations](#4-existing-community-implementations)
5. [GitHub & Structured Data Sources](#5-github--structured-data-sources)
6. [Competitor Analysis — Other TCGs](#6-competitor-analysis--other-tcgs)
7. [Feature Brainstorm — Best Rules Source Ever](#7-feature-brainstorm--best-rules-source-ever)
8. [Data Extraction Strategy](#8-data-extraction-strategy)
9. [Recommended Approach](#9-recommended-approach)

---

## 1. Official Rules Documents

All official rules are published under [Rules and Releases](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/) on the Riftbound site. The **Official Rules Documents (ORD)** consist of two major components:

| Document | Description |
|----------|-------------|
| **Core Rules (CR)** | The precise logical underpinnings of gameplay — deckbuilding, timing, resolution, layering, etc. ~65 pages. |
| **Tournament Rules (TR)** | Event-specific modifications, organized play procedures, penalties, and policies. |

### Complete List of Published Documents (chronological)

| # | Date | Title | Type |
|---|------|-------|------|
| 1 | 2025-06-06 | [How to Play: Get Started Now](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/how-to-play-get-started/) | Quick Start Guide |
| 2 | 2025-06-06 | [How to Play Riftbound: Core Rules and Gameplay Guide](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/gameplay-guide-core-rules/) | Core Rules (v1.0) |
| 3 | 2025-07-28 | [Deckbuilding Primer](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/deckbuilding-primer/) | Guide |
| 4 | 2025-10-16 | [Riftbound Origins FAQ](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-origins-faq/) | FAQ |
| 5 | 2025-10-16 | [Riftbound Tournament Rules](https://riftbound.leagueoflegends.com/en-us/news/organizedplay/riftbound-tournament-rules/) | Tournament Rules |
| 6 | 2025-10-24 | [Riftbound Core Rules: Patch Notes](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-core-rules-patch-notes/) | CR Patch Notes (v1.1) |
| 7 | 2025-10-28 | [Riftbound: Origins Card Errata](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-origins-card-errata/) | Errata |
| 8 | 2025-12-05 | [Riftbound Core Rules: Spiritforged Patch Notes](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-core-rules-spiritforged-patch-notes/) | CR Patch Notes (v1.2) |
| 9 | 2026-01-14 | [Riftbound Spiritforged Errata](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-spiritforged-errata/) | Errata |
| 10 | 2026-01-14 | [Riftbound Spiritforged FAQ](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/) | FAQ |
| 11 | 2026-01-30 | [Tournament Rules, January Update](https://riftbound.leagueoflegends.com/en-us/news/announcements/tournament-rules-january-update/) | Tournament Rules Update |

### PDF Availability

- The Core Rules PDF is downloadable from the official site
- Mirrored on Scribd: [v1.0 (2025-06-02)](https://www.scribd.com/document/883173099/Riftbound-Core-Rules-2025-06-02), [v1.1 (2025-10-25)](https://www.scribd.com/document/938535952/Riftbound-Core-Rules-v1-1-100125)
- A [Diffchecker comparison](https://www.diffchecker.com/c1wW577p/) exists between the October and June versions

---

## 2. Rules Version History

| Version | Date | Set | Key Changes |
|---------|------|-----|-------------|
| **v1.0** | 2025-06-06 | Origins (launch) | Initial release, 65 pages |
| **v1.1** | 2025-10-24 | Origins (first patch) | Layers now loop until stable; "Relevant Players" concept removed; move destinations must be chosen at chain time |
| **v1.2** | 2025-12-05 | Spiritforged | "Double" and "swap" added as game actions; new rules for unit placement (base or controlled battlefield); housekeeping and language clarifications |

### Update Philosophy

- Rules are updated **at minimum with every set release**
- May be updated more frequently, especially early on
- **No balance changes** — errata and rules updates are for system stability and clarity only
- Patch notes highlight major changes but are not a comprehensive changelog
- Intentional numbering gaps are left for future expansion without renumbering

---

## 3. Core Rules Structure

The Core Rules use a **numbered rule system** (similar to MTG's Comprehensive Rules) with intentional gaps for future growth. Based on the Fextralife wiki and official sources:

```
000. Golden and Silver Rules
  001-002  Golden Rule (card text beats rules text)
  050-055  Silver Rule (terminology), Can't beats Can

100. Game Concepts
  101-103  Deck Construction
  104-118  Setup Process

119. Game Objects
  120-123  Definition and Types
  124-137  Cards (ownership, privacy, front/back, properties)
  138-142  Units
  143-145  Gear
  146-152  Spells
  153-161  Runes and Rune Pools
  162-165  Battlefields
  166-169  Legends
  170-178  Tokens
  179-183  Control

300. Playing the Game
  301-306  Turn Structure
  307-310  States of Turn
  311-313  Priority and Focus
  314-317  Phases (Awaken, Beginning, Channel, Draw, Action, End)

318. Cleanups
  319-323  Cleanup procedures and special cleanups

324. Chains and Showdowns
  325-336  Chain mechanics
  337-345  Showdown mechanics

346. Playing Cards
  347-356  Complete card play process (6 steps)

357+     Abilities, Game Actions, Combat, Scoring, Layers, Modes of Play, Keywords

600+     Revealing, Damage Assignment, Resolution, Cleanup, Scoring
  626     Damage assignment
  627     Resolution steps for battlefield conflicts
  628     Cleanup procedures
  629-632  Scoring (Conquer and Hold methods)
```

**Note:** There are intentional gaps (e.g., 200s seem reserved, gap before 649). The devs have confirmed these are deliberate to allow future expansion without renumbering.

---

## 4. Existing Community Implementations

### 4a. RiftCore (riftcore.app)

- **Type:** Mobile companion app (Android, Google Play)
- **Status:** Unofficial, free with premium tier
- **Rules features:**
  - Full searchable Core Rules and Tournament Rules database
  - Hyperlinked in-app rules
  - Interactive FAQ with most recent rulings
  - Dedicated Card Errata section
- **Other features:** Deck building, collection tracking (camera scan), CSV export, performance tracking
- **Takeaway:** RiftCore is the closest existing competitor. It combines rules + cards + collection in one app. The hyperlinked rules are a key differentiator.

### 4b. riftrules.com

- **Type:** Web-based rules browser (SPA)
- **Features:**
  - Browse Core and Tournament rules with full-text search
  - Anchor links for direct navigation to specific rules
  - Change history tracking between versions
  - Card search and filter with image viewing
  - Individual card detail pages
  - Judge quick reference cards (penalties, remedies, rule links)
- **Takeaway:** This is the most feature-rich web implementation. Search + anchors + change history is exactly the kind of thing we should aim for (and exceed).

### 4c. riftrules.net

- **Type:** Web-based, links to official Riot documents
- **Features:** Aggregates official documents in one place
- **Takeaway:** Simpler aggregator, less interactive

### 4d. riftbound.gg

- **Type:** Community fan site
- **Features:** Hosts the Core Rules and Tournament Rules as web pages, plus Spiritforged patch notes
- **Takeaway:** Content mirror, not interactive

### 4e. runesandrift.com

- **Type:** Content/guide site
- **Features:**
  - Rules guide built from judge-level rulings
  - Separate guides for: Turn Order, Keywords Glossary, Deckbuilding, Combat Sequencing
  - Coaching services
- **Takeaway:** Great editorial approach — breaks down complex rules into digestible topic guides. Good inspiration for supplementary content.

### 4f. Fextralife Wiki (riftbound.wiki.fextralife.com)

- **Type:** Wiki
- **Features:** Full Core Rules with section breakdown, community-editable
- **Takeaway:** Good reference but wiki format is cluttered

### 4g. Piltover Archive (piltoverarchive.com)

- **Type:** News/community site
- **Features:** News articles about rules releases
- **Takeaway:** Journalism, not a rules tool

---

## 5. GitHub & Structured Data Sources

### 5a. Aplexion/Riftbound — Markdown Rulebook

- **URL:** [github.com/Aplexion/Riftbound](https://github.com/Aplexion/Riftbound/blob/main/riftbound_rulebook.md)
- **Format:** Markdown (`riftbound_rulebook.md`)
- **Content:** Numbered rules in markdown format. Appears to be a partial extraction (fragment covering 600s section visible). Uses hierarchical decimal notation (627.1, 627.1.a, etc.)
- **Completeness:** Appears incomplete — truncated, lacks intro sections
- **Usefulness:** Shows that the rules CAN be structured in markdown. Good reference for formatting approach.

### 5b. ApiTCG/riftbound-tcg-data

- **URL:** [github.com/apitcg](https://github.com/apitcg)
- **Format:** Likely JSON (consistent with how ApiTCG handles other TCGs)
- **Content:** Card data (not rules)
- **API docs:** [docs.apitcg.com](https://docs.apitcg.com/)
- **Usefulness:** Could be used to cross-reference card names mentioned in rules with actual card data.

### 5c. OwenMelbz/Riftbound v1 Cards (Gist)

- **URL:** [gist.github.com/OwenMelbz/e04dadf641cc9b81cb882b4612343112](https://gist.github.com/OwenMelbz/e04dadf641cc9b81cb882b4612343112)
- **Content:** Card data for v1
- **Usefulness:** Card data reference, not rules

### 5d. Piltover-Archive/RiftboundDeckCodes

- **URL:** [github.com/Piltover-Archive/RiftboundDeckCodes](https://github.com/Piltover-Archive/RiftboundDeckCodes)
- **Content:** Deck code encoder/decoder
- **Usefulness:** Could integrate for linking rules to deck examples

### 5e. Riot Developer Portal

- **URL:** [developer.riotgames.com/docs/riftbound](https://developer.riotgames.com/docs/riftbound)
- **Access:** Requires API key / written license for select assets including card art, rulesets, and other materials
- **Restriction:** "No automated rule enforcement" — Riot does not want apps that enforce rules during gameplay
- **Usefulness:** Official data source, but displaying/referencing rules (not enforcing them) should be fine under their content policy

### 5f. Scribd PDFs

- [Core Rules v1.0 (2025-06-02)](https://www.scribd.com/document/883173099/Riftbound-Core-Rules-2025-06-02)
- [Core Rules v1.1 (2025-10-25)](https://www.scribd.com/document/938535952/Riftbound-Core-Rules-v1-1-100125)
- [Core Rules v1.0 alternate upload](https://www.scribd.com/document/992230883/Riftbound-Core-Rules-2025-06-02-2)
- **Usefulness:** Can be used to extract text via PDF parsing tools

---

## 6. Competitor Analysis — Other TCGs

### 6a. Magic: The Gathering — The Gold Standard

**Official:** [magic.wizards.com/en/rules](https://magic.wizards.com/en/rules)
- Comprehensive Rules PDF updated with every set (most recent: Feb 27, 2026)
- Massive document (200+ pages)

**Yawgatog.com — Best-in-class hyperlinked rules:**
- [yawgatog.com/resources/magic-rules/](https://yawgatog.com/resources/magic-rules/)
- Unofficial HTML version of the Comprehensive Rules
- **All rule numbers hyperlinked** — click any rule reference to jump to it
- **All glossary terms linked** — click a keyword to see its definition
- **Version diff tracking:** [yawgatog.com/resources/rules-changes/](https://yawgatog.com/resources/rules-changes/) shows changes between every set's rules update
- Recommended by official Magic judges
- **This is the model to beat** for Riftbound rules display

### 6b. Pokémon TCG

- Official rulebook as PDF download from pokemon.com
- **Rulings Compendium** at [compendium.pokegym.net](https://compendium.pokegym.net) — compiles official judge rulings
- Community resources: PTCG Resource (Google Sites), digital toolkit at hamatti.org
- **Takeaway:** PDF + community compendium model

### 6c. Yu-Gi-Oh!

- Official rulebook online at yugioh-card.com
- Massive errata/rulings database
- **Takeaway:** Complex rules need strong search and cross-referencing

### 6d. Digimon Card Game

- [world.digimoncard.com/rule/](https://world.digimoncard.com/rule/)
- Official Rule Manual (Jul 2025) + Comprehensive Rules Manual (Feb 2026)
- Tournament Rules, Errata lists, Rule Revisions, Ban lists — all regularly updated
- **Takeaway:** Well-organized, multi-document official approach

### 6e. One Piece Card Game

- [en.onepiece-cardgame.com/rules/](https://en.onepiece-cardgame.com/rules/)
- Rule Overview Sheet as downloadable PDF
- Regular errata and revisions
- **Takeaway:** PDF-first, minimal web interactivity

### 6f. Flesh and Blood

- Official rules at fabtcg.com
- Comprehensive Rules hosted as web page with anchor navigation
- **Takeaway:** One of the better official web-first approaches

---

## 7. Feature Brainstorm — Best Rules Source Ever

Taking inspiration from the best implementations above and thinking about what would make OpenRift the **definitive** rules destination:

### 7a. Core Features (Must-Have)

| Feature | Description | Inspiration |
|---------|-------------|-------------|
| **Full-text search** | Instant search across all rules with highlighted results | riftrules.com |
| **Deep linking** | Every rule has a permanent URL (`/rules/cr/127.3`) | Yawgatog |
| **Cross-references** | Rule numbers in text are clickable links | Yawgatog |
| **Keyword glossary** | All game keywords linked to their definitions | Yawgatog, runesandrift |
| **Version selector** | Toggle between v1.0, v1.1, v1.2 of the rules | Yawgatog rules-changes |
| **Version diff** | Highlight what changed between versions | Yawgatog, riftrules.com |
| **Table of contents** | Collapsible sidebar navigation with section tree | Standard |
| **Card cross-references** | Card names in rules/examples link to card detail pages | OpenRift unique |

### 7b. Enhanced Features (Should-Have)

| Feature | Description | Inspiration |
|---------|-------------|-------------|
| **Integrated FAQ** | FAQ answers displayed inline next to relevant rules | runesandrift |
| **Errata integration** | Show current errata alongside affected rules | RiftCore |
| **"Explain simply" toggle** | Show a plain-English summary alongside the formal rule text | Unique |
| **Print/export** | Export rules as PDF or print-friendly view | Standard |
| **Breadcrumb navigation** | Show where you are in the rule hierarchy | Standard |
| **Back/forward history** | Browser-like navigation through rules you've visited | Useful for deep dives |
| **Mobile-optimized** | Rules readable on phone at game table | Essential |
| **Copy link button** | One-click copy of deep link to share in Discord/chat | Essential for community |

### 7c. Differentiating Features (Could-Have, makes us THE best)

| Feature | Description | Why It's Special |
|---------|-------------|-----------------|
| **Card-to-rules mapping** | From any card detail page, link to all rules relevant to that card's keywords/abilities | Nobody does this well |
| **Interactive examples** | Animated or step-by-step visual examples for complex rules (chains, combat, layering) | Makes rules actually understandable |
| **AI rules assistant** | Chat interface: "Can I play a spell during my opponent's action phase?" → links to relevant rules | Cutting edge |
| **Community annotations** | Allow users to add tips/notes on rules (moderated) | Wiki-style but focused |
| **Rule of the day** | Highlight an obscure or commonly-misunderstood rule | Engagement |
| **Tournament judge mode** | Quick-reference view with penalties, remedies, and rule links | riftrules.com |
| **Offline support** | PWA/service worker so rules work without internet at events | Essential for IRL play |
| **Changelog RSS/notifications** | Subscribe to rules updates | Nobody does this |
| **Rules quiz/test** | Interactive quizzes to test rules knowledge | Engagement, educational |
| **Keyboard navigation** | Vim-like shortcuts for power users (j/k to scroll rules, / to search) | Developer-friendly |

### 7d. Integration with Existing OpenRift Features

| Integration | Description |
|-------------|-------------|
| **Card browser → Rules** | From a card's detail view, show relevant rules for its keywords (e.g., "Elusive" → rule definition) |
| **Rules → Card browser** | From a rule mentioning card types/keywords, link to cards that have those keywords |
| **URL sync** | Rules state synced to URL (consistent with OpenRift's existing `useCardFilters` pattern) |
| **Shared theming** | Light/dark mode, consistent with existing Tailwind CSS variables |
| **Search unification** | Global search includes both cards AND rules |

---

## 8. Data Extraction Strategy

### Option A: PDF Parsing (Primary)

1. Download the official Core Rules PDF from the Riftbound site
2. Use a PDF-to-text tool (e.g., `pdf-parse`, `pdfjs-dist`, or Python `pdfplumber`)
3. Parse the numbered rule structure into a JSON/structured format:
   ```json
   {
     "version": "1.2",
     "date": "2025-12-05",
     "sections": [
       {
         "number": "001",
         "title": "Golden Rule",
         "text": "Card text supersedes rules text...",
         "subsections": [
           {
             "number": "001.1",
             "text": "Whenever a card fundamentally contradicts..."
           }
         ]
       }
     ]
   }
   ```
4. Store as JSON in the repo (or a lightweight DB table)
5. When a new version drops, re-parse and diff

**Pros:** Authoritative source, always up-to-date with official releases
**Cons:** PDF parsing can be fragile, formatting may vary between versions

### Option B: Leverage Existing Markdown (Supplementary)

- Use [Aplexion/Riftbound](https://github.com/Aplexion/Riftbound/blob/main/riftbound_rulebook.md) as a starting point
- Markdown is already structured and easy to render
- Would need to verify completeness and keep updated

**Pros:** Already in a good format
**Cons:** Appears incomplete, may lag behind official releases

### Option C: Web Scraping riftbound.gg or Fextralife Wiki

- Scrape the already-web-formatted rules from community sites
- Parse HTML into structured data

**Pros:** Already web-formatted, includes section structure
**Cons:** May violate terms of service, dependency on third-party sites

### Option D: Manual Transcription + Community Maintenance

- Manually transcribe the rules into a structured markdown/JSON format in the OpenRift repo
- Accept community PRs for updates
- Use the PDF as the source of truth for verification

**Pros:** Full control, community engagement
**Cons:** Labor-intensive initial effort, risk of errors

### Recommended: Hybrid Approach (A + D)

1. **Parse the PDF** to get the initial structured data (JSON)
2. **Manual review** to fix any parsing artifacts
3. **Store in repo** as versioned JSON files (`rules/cr-v1.0.json`, `rules/cr-v1.1.json`, etc.)
4. **Render in React** with full search, linking, and navigation
5. **Diff engine** to compute and display changes between versions
6. **Community contributions** via PRs for corrections and annotations

---

## 9. Recommended Approach

### Phase 1: Foundation

- Create a `rules` route in the web app
- Parse and structure the current Core Rules (v1.2/Spiritforged) into JSON
- Build a tree-based navigation component (collapsible sidebar)
- Render rules with deep linking (`/rules/cr/127.3`)
- Add full-text search with instant results
- Cross-link rule numbers within the text

### Phase 2: Version Support

- Add all three versions (v1.0, v1.1, v1.2) as separate JSON files
- Build a version selector dropdown
- Implement a diff view showing additions/removals/changes between versions

### Phase 3: Integration

- Link keywords in rules to a glossary
- Cross-reference card names to the card browser
- Add FAQ entries inline next to relevant rules
- Integrate errata display

### Phase 4: Polish & Differentiation

- Mobile optimization for game-table use
- Copy-link buttons for sharing specific rules
- Offline support (service worker)
- Interactive examples for complex mechanics
- Judge quick-reference mode

---

## Key Sources

- [Official Rules and Releases](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/)
- [Core Rules (Official)](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/gameplay-guide-core-rules/)
- [RiftCore App](https://play.google.com/store/apps/details?id=app.riftcore)
- [riftrules.com](https://riftrules.com/)
- [riftrules.net](https://riftrules.net/docs)
- [riftbound.gg Core Rules](https://riftbound.gg/core-rules/)
- [runesandrift.com Rules Guide](https://runesandrift.com/riftbound-rules/)
- [Fextralife Wiki — Core Rules](https://riftbound.wiki.fextralife.com/Core+Rules)
- [Aplexion/Riftbound (GitHub Markdown)](https://github.com/Aplexion/Riftbound/blob/main/riftbound_rulebook.md)
- [ApiTCG (GitHub)](https://github.com/apitcg)
- [Yawgatog — MTG Hyperlinked Rules (gold standard)](https://yawgatog.com/resources/magic-rules/)
- [Riot Developer Portal](https://developer.riotgames.com/docs/riftbound)
- [Scribd — Core Rules v1.0](https://www.scribd.com/document/883173099/Riftbound-Core-Rules-2025-06-02)
- [Scribd — Core Rules v1.1](https://www.scribd.com/document/938535952/Riftbound-Core-Rules-v1-1-100125)
- [Diffchecker — v1.0 vs v1.1](https://www.diffchecker.com/c1wW577p/)
