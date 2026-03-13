# Game Rules Feature — Research Document

> **Date:** 2026-03-13
> **Goal:** Add a digital, searchable, linkable version of the Riftbound game rules to OpenRift

---

## Table of Contents

1. [Official Rules & Related Documents](#1-official-rules--related-documents)
2. [Core Rules — What Changed Between Versions](#2-core-rules--what-changed-between-versions)
3. [Core Rules Structure](#3-core-rules-structure)
4. [Existing Community Implementations](#4-existing-community-implementations)
5. [GitHub & Structured Data Sources](#5-github--structured-data-sources)
6. [Competitor Analysis — Other TCGs](#6-competitor-analysis--other-tcgs)
7. [Feature Brainstorm — Best Rules Source Ever](#7-feature-brainstorm--best-rules-source-ever)
8. [Data Extraction Strategy](#8-data-extraction-strategy)
9. [Recommended Approach](#9-recommended-approach)

---

## 1. Official Rules & Related Documents

All official documents are published under [Rules and Releases](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/) on the Riftbound site. The **Official Rules Documents (ORD)** consist of exactly two rules documents:

| Document | Description |
|----------|-------------|
| **Core Rules (CR)** | The precise logical underpinnings of gameplay — deckbuilding, timing, resolution, layering, etc. ~65 pages. |
| **Tournament Rules (TR)** | Event-specific modifications, organized play procedures, penalties, and policies. |

Everything else (FAQs, errata, patch notes, guides) are **supplementary documents** — they clarify or amend the rules but are not rules documents themselves.

### Core Rules — Version History

| Version | Date | PDF |
|---------|------|-----|
| **v1.0** | 2025-06-06 | [Official](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/gameplay-guide-core-rules/) / [Scribd](https://www.scribd.com/document/883173099/Riftbound-Core-Rules-2025-06-02) |
| **v1.1** | 2025-10-24 | [Scribd](https://www.scribd.com/document/938535952/Riftbound-Core-Rules-v1-1-100125) |
| **v1.2** | 2025-12-05 (effective Dec 12) | Official site (latest) |

A [Diffchecker comparison](https://www.diffchecker.com/c1wW577p/) exists between v1.0 and v1.1.

### Tournament Rules — Version History

| Version | Date |
|---------|------|
| **v1.0** | 2025-10-16 |
| **January Update** | 2026-01-30 |

### Supplementary Documents (not rules, but related)

These clarify, amend, or explain the rules but are separate from the ORD:

| Date | Title | Type |
|------|-------|------|
| 2025-06-06 | [How to Play: Get Started Now](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/how-to-play-get-started/) | Quick Start Guide |
| 2025-07-28 | [Deckbuilding Primer](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/deckbuilding-primer/) | Guide |
| 2025-10-16 | [Riftbound Origins FAQ](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-origins-faq/) | FAQ (**RETIRED** Nov 4, 2025) |
| 2025-10-24 | [Riftbound Core Rules: Patch Notes](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-core-rules-patch-notes/) | CR Patch Notes (v1.0→v1.1) |
| 2025-10-28 | [Riftbound: Origins Card Errata](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-origins-card-errata/) | Card Errata (33 cards) |
| 2025-12-05 | [Riftbound Core Rules: Spiritforged Patch Notes](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-core-rules-spiritforged-patch-notes/) | CR Patch Notes (v1.1→v1.2) |
| 2026-01-14 | [Riftbound Spiritforged Errata](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-spiritforged-errata/) | Card Errata (14 cards) |
| 2026-01-14 | [Riftbound Spiritforged FAQ](https://riftbound.leagueoflegends.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/) | FAQ |

---

## 2. Core Rules — What Changed Between Versions

### v1.0 → v1.1 (Origins first patch, 2025-10-24)

- Layers now loop until stable (apply repeatedly until no objects change)
- "Relevant Players" concept removed from Core Rules
- Move destinations must be chosen at time of putting spell/ability on chain
- Null values, dependencies, triggered abilities updates
- Hidden mechanic, combat terminology, cleanups system revisions

### v1.1 → v1.2 (Spiritforged, 2025-12-05, effective Dec 12)

- Attachment mechanics added
- Equipment keywords: Equip, Quick-Draw, Weaponmaster
- Repeat mechanic
- Inactive Text system
- "Double" and "Swap" added as game actions
- Deathknell overhaul
- Reflexive triggers
- Priority vs Focus distinction
- New rules for unit placement (base or controlled battlefield)

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

357+     Abilities — Triggered abilities, activated abilities, reflexive triggers

433+     Combat — Attacker/defender designations, staged combat, combat damage

600+     Revealing, Damage Assignment, Resolution, Cleanup, Scoring
  626     Damage assignment
  627     Resolution steps for battlefield conflicts
  628     Cleanup procedures
  629-632  Scoring (Conquer and Hold methods)

649+     Keywords (intentional gap before this section)

716+     More Keywords — Hidden, Legion, Focus, Recall, Accelerate, etc.
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
  - Dedicated Card Errata section showing changed cards with updated text inline
  - **"AI Judge" feature** — AI-powered instant rulings explanations (premium)
  - Patch notes tied directly to rule updates
- **Other features:** Deck building, collection tracking (camera scan), CSV export, performance tracking
- **Takeaway:** RiftCore is the closest existing competitor. It combines rules + cards + collection in one app. The hyperlinked rules and inline errata display are key differentiators. **Mobile-only, no web version** — this is the gap we fill.

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

- **Type:** WordPress-based community site
- **Features:** Full Core Rules rendered as HTML with TOC sidebar. Also: deck builder, collection tracker, tier list.
- **Takeaway:** Web-accessible, browser Ctrl+F searchable, but no hyperlinked cross-references, no dedicated search, no keyword glossary. Heavily ad-laden.

### 4d2. playloltcg.help

- **URL:** [playloltcg.help/en/blogs/corerules](https://playloltcg.help/en/blogs/corerules)
- **Type:** Web-based rules broken into topic-based pages
- **Features:**
  - Complete rules with keyword search
  - **Weekly rules proficiency quizzes** for testing knowledge
  - Rules broken into digestible topic-based pages (not one monolithic doc)
  - Judge exam reference materials
- **Takeaway:** Innovative quiz/gamification approach to rules learning. Topic-based breakdown makes rules more approachable than a 65-page PDF. Worth emulating.

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

### 4g. rules.flexslot.gg

- **URL:** [rules.flexslot.gg](https://rules.flexslot.gg/)
- **Type:** Web-based searchable rules tool
- **Features:** Searchable, offline-ready comprehensive rules tool
- **Takeaway:** Another competitor doing searchable + offline rules — validates our approach

### 4h. Piltover Archive (piltoverarchive.com)

- **Type:** News/community site
- **Features:** News articles about rules releases
- **Takeaway:** Journalism, not a rules tool

---

## 5. GitHub & Structured Data Sources

### 5a. benediktwerner/riftbound-archive — Versioned Text Rules (KEY RESOURCE)

- **URL:** [github.com/benediktwerner/riftbound-archive](https://github.com/benediktwerner/riftbound-archive)
- **Format:** PDF + plain text (`.txt`) for each version, plus a `unnumber.py` utility script
- **Content:** Multiple dated versions of Core Rules and Tournament Rules, purpose-built for diffing:
  - `Core-Rules-2025-06-02.pdf` / `.txt` / unnumbered `.txt`
  - `Core-Rules-2025-10-01.pdf` / `.txt` / unnumbered `.txt`
  - `Core-Rules-2025-12-01.pdf` / `.txt` / unnumbered `.txt`
  - `Tournament-Rules-v1.1.pdf` / `.txt`
  - `Tournament-Rules-2025-12.txt`, `Tournament-Rules-2026-01.txt`
  - `FAQ.pdf` / `FAQ.txt`
- **Activity:** 12 commits
- **Usefulness:** **This is the single most valuable resource.** Already has the rules in `.txt` format across all versions, ready for parsing. The `unnumber.py` script strips rule numbers for clean diffing. This eliminates the need for PDF parsing entirely.

### 5b. Aplexion/Riftbound — Markdown Rulebook

- **URL:** [github.com/Aplexion/Riftbound](https://github.com/Aplexion/Riftbound/blob/main/riftbound_rulebook.md)
- **Format:** Markdown (`riftbound_rulebook.md`)
- **Content:** Numbered rules in markdown format. Uses hierarchical decimal notation (627.1, 627.1.a, etc.). Cross-references other rules (e.g., "See rule 616").
- **Completeness:** Partial — appears to cover 600s section. Small repo (3 commits, 2 files).
- **Usefulness:** Shows markdown formatting approach. Combined with the `.txt` files from riftbound-archive, we could build a complete markdown version.

### 5c. ApiTCG/riftbound-tcg-data

- **URL:** [github.com/apitcg](https://github.com/apitcg)
- **Format:** Likely JSON (consistent with how ApiTCG handles other TCGs)
- **Content:** Card data (not rules). Updated Feb 2026.
- **API docs:** [docs.apitcg.com](https://docs.apitcg.com/)
- **Usefulness:** Could be used to cross-reference card names mentioned in rules with actual card data.

### 5d. OwenMelbz/Riftbound v1 Cards (Gist)

- **URL:** [gist.github.com/OwenMelbz/e04dadf641cc9b81cb882b4612343112](https://gist.github.com/OwenMelbz/e04dadf641cc9b81cb882b4612343112)
- **Content:** Card data for v1 in JSON
- **Usefulness:** Card data reference, not rules

### 5e. Piltover-Archive/RiftboundDeckCodes

- **URL:** [github.com/Piltover-Archive/RiftboundDeckCodes](https://github.com/Piltover-Archive/RiftboundDeckCodes)
- **Content:** Deck code encoder/decoder (card codes = 3-char set + 3-digit number + optional variant suffix)
- **Usefulness:** Could integrate for linking rules to deck examples

### 5f. Other Riftbound GitHub Projects

- [NewtonGluten/riftboundbot](https://github.com/NewtonGluten/riftboundbot) — Discord bot for card info
- [Riftbound.build](https://github.com/Riftbound-build/) — Deck building tool
- [DR34M3R-T/Riftbound_print](https://github.com/DR34M3R-T/Riftbound_print) — Printable card layout generator
- [riftbound-tcg GitHub topic](https://github.com/topics/riftbound-tcg) — Aggregation page

### 5g. Riot Developer Portal

- **URL:** [developer.riotgames.com/docs/riftbound](https://developer.riotgames.com/docs/riftbound)
- **Access:** Requires API key / written license for select assets including card art, rulesets, and other materials
- **Restriction:** "No automated rule enforcement" — Riot does not want apps that enforce rules during gameplay
- **Usefulness:** Official data source, but displaying/referencing rules (not enforcing them) should be fine under their content policy

### 5h. Scribd PDFs

- [Core Rules v1.0 (2025-06-02)](https://www.scribd.com/document/883173099/Riftbound-Core-Rules-2025-06-02)
- [Core Rules v1.1 (2025-10-25)](https://www.scribd.com/document/938535952/Riftbound-Core-Rules-v1-1-100125)
- [Core Rules v1.0 alternate upload](https://www.scribd.com/document/992230883/Riftbound-Core-Rules-2025-06-02-2)
- **Usefulness:** Can be used to extract text via PDF parsing tools

### 5i. PDF/TXT-to-Structured-Data Tools (Reference)

| Tool | URL | Approach |
|------|-----|----------|
| **SethCurry/mtg-html-rules** | [GitHub](https://github.com/SethCurry/mtg-html-rules) | Go tool: converts MTG `.txt` rules → HTML with anchor links per rule. **Most directly applicable.** |
| **EthanJWright/pdfparse** | [GitHub](https://github.com/EthanJWright/pdfparse) | PDF → JSON preserving hierarchy via font size/color. Built for D&D modules. |
| **axa-group/Parsr** | [GitHub](https://github.com/axa-group/Parsr) | PDF → JSON/Markdown/CSV/TXT. Detects headings, tables, lists, TOC. |
| **ChrizH/pdfstructure** | [GitHub](https://github.com/ChrizH/pdfstructure) | Font style analysis → tree structure from PDFs. |
| **jstockwin/py-pdf-parser** | [GitHub](https://github.com/jstockwin/py-pdf-parser) | Python tool for structured PDF extraction. |

### 5j. Other TCG Rules on GitHub (Format References)

| TCG | Repo | Format |
|-----|------|--------|
| MTG | [pit142857/mtg-cr](https://github.com/pit142857/mtg-cr) | Every version of Comprehensive Rules in plain text. Gold standard for versioned archives. |
| Flesh and Blood | [rules.fabtcg.com](https://rules.fabtcg.com/en/) | Provides `en-fab-cr.txt` alongside PDF. |
| Lorcana | [hexastix/disney-lorcana-tcg-resources](https://github.com/hexastix/disney-lorcana-tcg-resources) | All official docs aggregated, multi-language. |
| Yu-Gi-Oh! | [DawnbrandBots/yaml-yugi](https://github.com/DawnbrandBots/yaml-yugi) | YAML + JSON, machine-readable card data. |
| General | [jeffreality/cardgame-json-spec](https://github.com/jeffreality/cardgame-json-spec) | JSON schema for any card game, uses `rules_url` for external rules. |

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

### 6f. Flesh and Blood — Best Official Web Implementation

- **URL:** [rules.fabtcg.com/en/cr/](https://rules.fabtcg.com/en/cr/)
- **Format:** Dedicated web platform built with Material Design framework
- **Key Features:**
  - Persistent sidebar navigation with collapsible, hierarchical TOC (9 chapters + glossary)
  - Built-in search with client-side JS — result counts displayed
  - Anchor links with paragraph marks for deep linking to specific rules
  - Cross-referenced rule numbers (e.g., `[7.7.2]`) that link to related sections
  - Multi-language support (English/Japanese)
  - Dark/light mode toggle with local storage persistence
  - Semantic versioning (MAJOR.MINOR.PATCH) prominently displayed
  - Breadcrumb navigation
  - Separate chapter URLs (e.g., `/cr/08-keywords/`)
  - Change log tracking between versions
- **Takeaway:** **This is the gold standard for official web-native TCG rules.** Migrated from PDF to web in mid-2025, signaling an industry trend. Combines search, hyperlinking, navigation, versioning, and clean typography.

### 6g. Netrunner (Null Signal Games)

- **URL:** [rules.nullsignal.games](https://rules.nullsignal.games/)
- **Format:** Browser-friendly HTML document
- **Key Features:**
  - Expandable/collapsible TOC with 11 chapters
  - Built-in search function
  - Extensive hyperlinked cross-references (e.g., `[section 1.10]`, `[rule 1.2.3]`)
  - SVG game icons inline (credit, click, recurring symbols)
  - Deep linking via HTML anchors to every rule
  - PDF versions also available (regular AND annotated with margin notes explaining design intent)
- **Takeaway:** Clean, purpose-built for reference lookup. The **annotated PDF with design intent** is a unique offering worth considering.

### 6h. Disney Lorcana — Colored-Text Version Diffing

- **URL:** [lorcana.gg/comprehensive-rules/](https://lorcana.gg/comprehensive-rules/)
- **Format:** PDF (31 pages), multi-language (EN, DE, FR, IT)
- **Notable Feature:** Uses **colored text to highlight changes** — new/changed text in Sapphire (blue), moved text in Amber (yellow)
- **Takeaway:** The colored-text approach for version diffing is elegant and worth stealing for our version diff feature.

### Feature Comparison Matrix

| Feature | Riot Official | RiftCore App | riftrules.com | FAB (rules.fabtcg.com) | Yawgatog (MTG) | Netrunner (NSG) |
|---|---|---|---|---|---|---|
| Web-native HTML rules | No (PDF) | No (app) | Yes | Yes | Yes | Yes |
| Built-in search | No | Yes | Yes | Yes | No (Ctrl+F) | Yes |
| Hyperlinked cross-refs | No | Yes | No | Yes | Yes | Yes |
| Deep-linkable sections | No | N/A | Yes | Yes | Yes | Yes |
| Keyword glossary | No | Yes | No | Yes | Yes | No |
| Version history/diffing | Patch notes | Yes | Yes | Yes (changelog) | Yes (per-set diffs) | PDF annotations |
| Errata integration | Separate PDF | Yes (inline) | No | Separate | No | Yes |
| Dark/light mode | N/A | Yes | No | Yes | Yes | No |
| Multi-language | No | No | No | Yes (EN/JP) | No | No |
| Offline access | PDF | Yes | No | No | No | No |
| Mobile-optimized | PDF | Native app | Unknown | Responsive | Responsive | Responsive |

**Key insight:** The biggest gap in the Riftbound ecosystem is the lack of a web-native, searchable, hyperlinked rules viewer. RiftCore fills this gap brilliantly but is mobile-only. No web tool currently offers FAB/Yawgatog-level experience for Riftbound.

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
| **Version diff** | Highlight what changed between versions, colored text (blue=new, yellow=moved) | Yawgatog, riftrules.com, Lorcana |
| **Table of contents** | Collapsible sidebar navigation with section tree | FAB, Netrunner |
| **Card cross-references** | Card names in rules/examples link to card detail pages | OpenRift unique |
| **Separate chapter URLs** | Each major section gets its own URL (e.g., `/rules/cr/keywords/`) | FAB |

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
| **Rules quizzes** | Weekly proficiency quizzes to test rules knowledge | playloltcg.help |
| **Annotated mode** | Margin notes explaining design intent behind complex rules | Netrunner annotated PDF |
| **Game icons inline** | SVG icons for game concepts (Energy, Power, domains) inline with rule text | Netrunner |
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

### Option A: Use riftbound-archive .txt Files (RECOMMENDED — Primary)

1. Use the existing `.txt` files from [benediktwerner/riftbound-archive](https://github.com/benediktwerner/riftbound-archive) — all 3 Core Rules versions already extracted to plain text
2. Write a parser (TypeScript or Python script) to convert numbered rules into structured JSON:
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
3. Store as versioned JSON files in the repo
4. Reference [SethCurry/mtg-html-rules](https://github.com/SethCurry/mtg-html-rules) parser approach for rule number detection and cross-linking
5. When a new version drops, obtain the `.txt` and re-parse

**Pros:** Text already extracted (no PDF parsing needed!), all 3 versions available, designed for diffing, includes `unnumber.py` utility
**Cons:** Depends on a third-party repo for new versions (but we can also extract from PDF as fallback)

### Option B: PDF Parsing (Fallback)

1. Download the official Core Rules PDF from the Riftbound site
2. Use a PDF-to-text tool (e.g., `pdf-parse`, `pdfjs-dist`, `pdfplumber`, or [Parsr](https://github.com/axa-group/Parsr))
3. Parse the numbered rule structure into JSON (same format as above)
4. Store as JSON in the repo

**Pros:** Authoritative source, doesn't depend on third-party repo
**Cons:** PDF parsing can be fragile, formatting may vary between versions

### Option C: Leverage Existing Markdown (Supplementary)

- Use [Aplexion/Riftbound](https://github.com/Aplexion/Riftbound/blob/main/riftbound_rulebook.md) as a formatting reference
- Markdown is already structured and easy to render

**Pros:** Shows a good formatting approach
**Cons:** Incomplete (only covers 600s), small individual project

### Option D: Web Scraping riftbound.gg or Fextralife Wiki

- Scrape the already-web-formatted rules from community sites
- Parse HTML into structured data

**Pros:** Already web-formatted, includes section structure
**Cons:** May violate terms of service, dependency on third-party sites

### Option E: Manual Transcription + Community Maintenance

- Manually transcribe the rules into a structured markdown/JSON format in the OpenRift repo
- Accept community PRs for updates
- Use the PDF as the source of truth for verification

**Pros:** Full control, community engagement
**Cons:** Labor-intensive initial effort, risk of errors

### Recommended: Hybrid Approach (A + B)

1. **Start with riftbound-archive `.txt` files** — all 3 versions already extracted
2. **Write a TXT→JSON parser** (reference `mtg-html-rules` approach) to produce structured, versioned JSON
3. **Manual review** to fix any parsing artifacts
4. **Store in repo** as versioned JSON files (`rules/cr-v1.0.json`, `rules/cr-v1.1.json`, etc.)
5. **Render in React** with full search, linking, and navigation
6. **Diff engine** to compute and display changes between versions
7. **PDF parsing as fallback** when riftbound-archive hasn't been updated yet for a new version
8. **Community contributions** via PRs for corrections and annotations

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
- [benediktwerner/riftbound-archive (GitHub TXT — KEY RESOURCE)](https://github.com/benediktwerner/riftbound-archive) — All versions in `.txt` format
- [Aplexion/Riftbound (GitHub Markdown)](https://github.com/Aplexion/Riftbound/blob/main/riftbound_rulebook.md)
- [ApiTCG (GitHub)](https://github.com/apitcg)
- [Yawgatog — MTG Hyperlinked Rules (gold standard)](https://yawgatog.com/resources/magic-rules/)
- [Riot Developer Portal](https://developer.riotgames.com/docs/riftbound)
- [Scribd — Core Rules v1.0](https://www.scribd.com/document/883173099/Riftbound-Core-Rules-2025-06-02)
- [Scribd — Core Rules v1.1](https://www.scribd.com/document/938535952/Riftbound-Core-Rules-v1-1-100125)
- [Diffchecker — v1.0 vs v1.1](https://www.diffchecker.com/c1wW577p/)
- [rules.flexslot.gg](https://rules.flexslot.gg/) — Searchable, offline-ready rules tool
- [BoardGameGeek](https://boardgamegeek.com/boardgame/436560/riftbound-the-league-of-legends-trading-card-game) — Community page with rules links
- [Fextralife Wiki — Card Errata](https://riftbound.wiki.fextralife.com/Card+Errata)

### Errata Scope

- **Origins Errata:** 33 cards affected (including Ava Achiever, Disintegrate, Dragon's Rage, Zhonya's Hourglass, and more)
- **Spiritforged Errata:** 3 Origins cards (Falling Star, Icathian Rain, Reinforce) + 11 Spiritforged cards (Blood Rush, Deathgrip, Janna Savior, Jax Unmatched, etc.)
- Errata are for clarity and error correction only — no power-level balancing
