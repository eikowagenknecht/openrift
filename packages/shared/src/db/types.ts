import type { ColumnType, Generated } from "kysely";

// Re-declared here to avoid relative parent imports (oxlint no-restricted-imports).
// Keep in sync with the canonical definitions in ../types.ts.
type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield";
type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";
type CardVariant = "Normal" | "Alt Art" | "Overnumbered" | "Signed" | "Foil";

// ─── Column helpers ──────────────────────────────────────────────────────────

/** Timestamp column that defaults to NOW() on insert. */
type CreatedAt = ColumnType<Date, Date | undefined, Date>;

/** Timestamp column that defaults to NOW() and updates on every write. */
type UpdatedAt = ColumnType<Date, Date | undefined, Date>;

// ─── Card data ───────────────────────────────────────────────────────────────

export interface SetsTable {
  id: string;
  name: string;
  total_cards: number;
  created_at: CreatedAt;
}

/**
 * Flat DB representation of a card.
 *
 * Field mapping to the frontend `Card` type:
 * - `set_id`       → `Card.set`
 * - `might/energy/power` → `Card.stats.{ might, energy, power }`
 * - `thumbnail_url/full_url/artist` → `Card.art.{ thumbnailURL, fullURL, artist }`
 */
export interface CardsTable {
  id: string;
  name: string;
  type: CardType;
  super_types: string[];
  rarity: Rarity;
  collector_number: number;
  faction: string;
  might: number;
  energy: number;
  power: number;
  keywords: string[];
  description: string;
  effect: string;
  might_bonus: number;
  set_id: string;
  thumbnail_url: string;
  full_url: string;
  artist: string;
  tags: string[];
  orientation: "portrait" | "landscape";
  public_code: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface PricesTable {
  id: Generated<number>;
  card_id: string;
  variant: CardVariant;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  market_cents: number;
  direct_low_cents: number | null;
  product_id: number | null;
  url: string | null;
  source: string;
  recorded_at: CreatedAt;
}

// ─── Auth (migration 003) ─────────────────────────────────────────────────

export interface UsersTable {
  id: string;
  email: string;
  name: string | null;
  email_verified: boolean;
  image: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  ip_address: string | null;
  user_agent: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface AccountsTable {
  id: string;
  user_id: string;
  account_id: string;
  provider_id: string;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: Date | null;
  refresh_token_expires_at: Date | null;
  scope: string | null;
  id_token: string | null;
  password: string | null;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface VerificationsTable {
  id: string;
  identifier: string;
  value: string;
  expires_at: Date;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── User collections ────────────────────────────────────────────────────────
// ⚠ No migration yet — needs unique(user_id, card_id, variant) for upserts.

export interface UserCardsTable {
  id: Generated<number>;
  user_id: string;
  card_id: string;
  variant: CardVariant;
  quantity: number;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Decks ───────────────────────────────────────────────────────────────────
// ⚠ No migration yet.

export interface UserDecksTable {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

export interface DeckCardsTable {
  id: Generated<number>;
  deck_id: string;
  card_id: string;
  quantity: number;
}

// ─── Database ────────────────────────────────────────────────────────────────

export interface Database {
  // Card data (migration 001)
  sets: SetsTable;
  cards: CardsTable;
  prices: PricesTable;

  // Auth tables (migration 003)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;

  // ⚠ No migration yet
  user_cards: UserCardsTable;
  user_decks: UserDecksTable;
  deck_cards: DeckCardsTable;
}
