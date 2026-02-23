import type { ColumnType, Generated } from "kysely";

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

export interface CardsTable {
  id: string;
  name: string;
  type: string;
  super_types: string[];
  rarity: string;
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
  orientation: string;
  public_code: string;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface PricesTable {
  id: Generated<number>;
  card_id: string;
  variant: string;
  price_cents: number;
  source: string;
  recorded_at: CreatedAt;
}

// ─── Auth (Better Auth will manage these — types here for Kysely queries) ────

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

export interface UserCardsTable {
  id: Generated<number>;
  user_id: string;
  card_id: string;
  variant: string;
  quantity: number;
  created_at: CreatedAt;
  updated_at: UpdatedAt;
}

// ─── Decks ───────────────────────────────────────────────────────────────────

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

  // Auth (managed by Better Auth — added when auth is set up)
  users: UsersTable;
  sessions: SessionsTable;
  accounts: AccountsTable;
  verifications: VerificationsTable;

  // Collections & decks (added when auth is set up)
  user_cards: UserCardsTable;
  user_decks: UserDecksTable;
  deck_cards: DeckCardsTable;
}
