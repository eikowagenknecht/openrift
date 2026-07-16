/**
 * Seeds a demo friend group with synthetic members, collections, shared lists,
 * trades and a mid-event tournament. Built for screenshots (README, docs) so the
 * group overview and trades pages look populated without exposing real user data.
 *
 * Usage: bun --env-file=.env scripts/seed-demo-group.ts <viewer-email>
 *
 * The viewer is an existing real account (whoever you are logged in as while
 * screenshotting) and becomes the group owner. Every other member is synthetic.
 * Re-running drops and rebuilds the group and its synthetic members, so the
 * script is idempotent.
 *
 * @returns Nothing; exits non-zero when the viewer account or a card is missing.
 */
import { createDb } from "../apps/api/src/db/connect.js";
import { requireEnv } from "./env.js";

const viewerEmail = process.argv[2];
if (!viewerEmail) {
  console.error("Usage: bun --env-file=.env scripts/seed-demo-group.ts <viewer-email>");
  process.exit(1);
}

const GROUP_SLUG = "rift-runners";
const GROUP_NAME = "Rift Runners";
const GROUP_DESCRIPTION =
  "Our Tuesday night playgroup. Share what you have spare, grab what you are missing, and settle it at the table.";
const GROUP_CODE = "RIFTRUN";

/** Synthetic members. Emails stay on example.com so no real mailbox is implied. */
const MEMBERS = [
  { key: "mira", email: "mira.tannis@example.com", name: "Mira", role: "admin", joinedDaysAgo: 82 },
  {
    key: "tobias",
    email: "tobias.kestrel@example.com",
    name: "Tobias",
    role: "member",
    joinedDaysAgo: 71,
  },
  { key: "yuki", email: "yuki.sato@example.com", name: "Yuki", role: "member", joinedDaysAgo: 45 },
  {
    key: "nils",
    email: "nils.brandt@example.com",
    name: "Nils",
    role: "member",
    joinedDaysAgo: 30,
  },
  { key: "sam", email: "sam.okoye@example.com", name: "Sam", role: "member", joinedDaysAgo: 9 },
] as const;

type MemberKey = (typeof MEMBERS)[number]["key"];
type PersonKey = MemberKey | "viewer";

/** Contact methods, revealed to the group so the member chips render. */
const CONTACTS = [
  { key: "mira", type: "discord", value: "mira_tannis" },
  { key: "mira", type: "signal", value: "@mira.42" },
  { key: "tobias", type: "discord", value: "kestrel" },
  { key: "yuki", type: "telegram", value: "@yukisato" },
  { key: "nils", type: "in_person", value: "Tuesdays at the shop" },
  { key: "sam", type: "discord", value: "sam.okoye" },
] as const;

/**
 * Cards used across the seed, keyed by a short handle. public_code alone is not
 * unique (the same code exists per finish), so each entry pins the finish too.
 */
const CARDS = {
  ahriEpic: { code: "OGN-119/298", finish: "foil" },
  ahriShowcase: { code: "SFD-227/221", finish: "foil" },
  apheliosShowcase: { code: "SFD-224/221", finish: "foil" },
  azir: { code: "SFD-050/221", finish: "foil" },
  bard: { code: "SFD-079/221", finish: "foil" },
  bardShowcase: { code: "SFD-228/221", finish: "foil" },
  baronEpic: { code: "UNL-147/219", finish: "foil" },
  baronShowcase: { code: "UNL-238/219", finish: "foil" },
  blindMonk: { code: "OGN-257/298", finish: "foil" },
  blindMonkShowcase: { code: "OGN-304/298", finish: "foil" },
  ripper: { code: "UNL-185/219", finish: "foil" },
  battleMistress: { code: "SFD-203/221", finish: "foil" },
  bladeDancer: { code: "SFD-195/221", finish: "foil" },
  ambessa: { code: "T1S-001/005-EN", finish: "foil" },
} as const;

type CardKey = keyof typeof CARDS;

/** Cards each person physically owns; these become copies in their collection. */
const OWNED: Record<PersonKey, CardKey[]> = {
  viewer: ["ahriEpic", "bladeDancer", "blindMonk", "azir", "battleMistress"],
  mira: ["apheliosShowcase", "baronShowcase", "ripper", "bard", "ambessa"],
  tobias: ["blindMonkShowcase", "azir", "battleMistress", "baronEpic"],
  yuki: ["bardShowcase", "ahriShowcase", "ripper", "bladeDancer"],
  nils: ["baronEpic", "bard", "blindMonk", "ambessa"],
  sam: ["azir", "ripper", "battleMistress"],
};

/** Copies offered for trade. Must be a subset of OWNED. */
const TRADING: Record<PersonKey, CardKey[]> = {
  viewer: ["ahriEpic", "bladeDancer", "blindMonk"],
  mira: ["apheliosShowcase", "baronShowcase", "ripper"],
  tobias: ["blindMonkShowcase", "battleMistress"],
  yuki: ["bardShowcase", "ahriShowcase"],
  nils: ["baronEpic", "bard"],
  sam: ["azir", "ripper"],
};

/** Cards each person wants. Overlaps with others' TRADING drive the matcher. */
const WANTED: Record<PersonKey, CardKey[]> = {
  viewer: ["apheliosShowcase", "baronShowcase", "bardShowcase"],
  mira: ["bladeDancer", "azir"],
  tobias: ["ahriEpic", "bard"],
  yuki: ["blindMonk", "battleMistress"],
  nils: ["bladeDancer", "apheliosShowcase"],
  sam: ["ahriEpic", "baronEpic"],
};

/**
 * The group's loaner deck: a real, playable Azir list (Emperor of the Sands),
 * so the collection reads as an actual deck someone could borrow rather than a
 * handful of unrelated cards.
 *
 * Spelled out as card names + quantities rather than pointing at a deck id: a
 * personal deck's uuid only exists in one dev database and would not survive a
 * restore, whereas names resolve against the catalog anywhere. Names must match
 * `cards.name` exactly, typographic apostrophes included.
 */
const LOANER_DECK = {
  name: "Loaner deck: Azir",
  description: "The group's spare Azir deck. Ask an admin and it's yours for the night.",
  cards: [
    { name: "Azir, Sovereign", quantity: 1 },
    { name: "Emperor of the Sands", quantity: 1 },
    { name: "Hall of Legends", quantity: 1 },
    { name: "Seat of Power", quantity: 1 },
    { name: "Trifarian War Camp", quantity: 1 },
    { name: "Arise!", quantity: 3 },
    { name: "B.F. Sword", quantity: 3 },
    { name: "Back Off", quantity: 2 },
    { name: "Brutalizer", quantity: 3 },
    { name: "Deathgrip", quantity: 3 },
    { name: "Defy", quantity: 3 },
    { name: "Discipline", quantity: 3 },
    { name: "Doran’s Shield", quantity: 3 },
    { name: "En Garde", quantity: 3 },
    { name: "Eye of the Herald", quantity: 3 },
    { name: "Guards!", quantity: 2 },
    { name: "Hidden Blade", quantity: 3 },
    { name: "Shadow’s Call", quantity: 1 },
    { name: "Soul Sword", quantity: 3 },
    { name: "Vi, Peacekeeper", quantity: 1 },
    { name: "Calm Rune", quantity: 7 },
    { name: "Order Rune", quantity: 5 },
  ],
};

/**
 * The group's shared bulk box: the one collection that should look like a real
 * pile rather than a handful of hand-picked cards. Drawn from the live catalog
 * (not the CARDS pool) so it spans many printings, and shared publicly the way
 * a real group's bulk box is.
 */
const BULK_COLLECTION = {
  name: "Bulk box",
  description: "Everything the group throws in the box. Take what you need, leave what you don't.",
  shareToken: "RiftRunBulk1",
  /** Distinct printings to draw from; each gets 1-3 copies. */
  printingCount: 220,
};

/** Slugs from the conditions table; cycled so copies are not all Near Mint. */
const CONDITIONS = ["near-mint", "excellent", "light-played"];

const { db } = createDb(requireEnv("DATABASE_URL"));

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

/** @returns A Date N days before the seed run (fractions allowed). */
function daysAgo(n: number): Date {
  return new Date(NOW - n * DAY_MS);
}

/** @returns A Date N days after the seed run. */
function daysAhead(n: number): Date {
  return new Date(NOW + n * DAY_MS);
}

const viewer = await db
  .selectFrom("users")
  .select(["id", "name", "email"])
  .where("email", "ilike", viewerEmail)
  .executeTakeFirst();

if (!viewer) {
  console.error(`No user found with email: ${viewerEmail}`);
  await db.destroy();
  process.exit(1);
}
const viewerUser = viewer;

// Resolve every card handle to its printing up front so a typo fails loudly
// before anything is written. Columns are camelCase throughout this script: the
// db layer applies Kysely's CamelCasePlugin, so it maps them to the snake_case
// database columns on the way out and camelizes result keys on the way back.
const printings = new Map<CardKey, { id: string; cardId: string; name: string }>();
for (const [key, { code, finish }] of Object.entries(CARDS) as [
  CardKey,
  { code: string; finish: string },
][]) {
  const row = await db
    .selectFrom("printings as p")
    .innerJoin("cards as c", "c.id", "p.cardId")
    .select(["p.id", "p.cardId", "c.name"])
    .where("p.publicCode", "=", code)
    .where("p.finish", "=", finish)
    .where("p.language", "=", "EN")
    .executeTakeFirst();
  if (!row) {
    console.error(`No EN printing for ${key}: ${code} (${finish}). Has the catalog changed?`);
    await db.destroy();
    process.exit(1);
  }
  printings.set(key, row);
}

console.log(`Viewer: ${viewer.name ?? viewer.email} (${viewer.id})`);
console.log(`Resolved ${printings.size} printings.`);

// --- Reset -----------------------------------------------------------------
// Deleting the group cascades members, shares, trades and group collections.
// Deleting the synthetic users cascades their collections, copies and lists.
// The viewer's own lists/collections are named-scoped, so remove them by name.
// Tournaments are only SET NULL'd by the group delete, so drop them first or
// re-runs leave orphans behind.
await db
  .deleteFrom("tournaments")
  .where("groupId", "in", db.selectFrom("friendGroups").select("id").where("slug", "=", GROUP_SLUG))
  .execute();
await db.deleteFrom("friendGroups").where("slug", "=", GROUP_SLUG).execute();
await db
  .deleteFrom("users")
  .where(
    "email",
    "in",
    MEMBERS.map((m) => m.email),
  )
  .execute();

const VIEWER_TRADELIST = "Rift Runners — spares";
const VIEWER_WISHLIST = "Rift Runners — wants";
const VIEWER_COLLECTION = "Rift Runners demo binder";

await db
  .deleteFrom("lists")
  .where("userId", "=", viewer.id)
  .where("name", "in", [VIEWER_TRADELIST, VIEWER_WISHLIST])
  .execute();
await db
  .deleteFrom("copies")
  .where(
    "collectionId",
    "in",
    db
      .selectFrom("collections")
      .select("id")
      .where("userId", "=", viewer.id)
      .where("name", "=", VIEWER_COLLECTION),
  )
  .execute();
await db
  .deleteFrom("collections")
  .where("userId", "=", viewer.id)
  .where("name", "=", VIEWER_COLLECTION)
  .execute();

console.log("Cleared any previous demo data.");

// --- Users -----------------------------------------------------------------
const userIds = new Map<PersonKey, string>([["viewer", viewer.id]]);
for (const m of MEMBERS) {
  const id = `demo_${m.key}_${GROUP_SLUG}`.slice(0, 64);
  await db
    .insertInto("users")
    .values({
      id,
      email: m.email,
      name: m.name,
      emailVerified: true,
      createdAt: daysAgo(m.joinedDaysAgo + 5),
    })
    .execute();
  userIds.set(m.key, id);
}
console.log(`Created ${MEMBERS.length} synthetic members.`);

/** @returns The user id for a person key. */
function uid(key: PersonKey): string {
  const id = userIds.get(key);
  if (!id) {
    throw new Error(`Unknown person: ${key}`);
  }
  return id;
}

/** @returns The resolved printing for a card handle. */
function printing(card: CardKey): { id: string; cardId: string; name: string } {
  const row = printings.get(card);
  if (!row) {
    throw new Error(`Unresolved card: ${card}`);
  }
  return row;
}

// --- Contact methods -------------------------------------------------------
const contactIds: { key: MemberKey; id: string }[] = [];
for (const [i, c] of CONTACTS.entries()) {
  const row = await db
    .insertInto("userContactMethods")
    .values({ userId: uid(c.key), type: c.type, value: c.value, sortOrder: i })
    .returning("id")
    .executeTakeFirstOrThrow();
  contactIds.push({ key: c.key, id: row.id });
}

// --- Group -----------------------------------------------------------------
const group = await db
  .insertInto("friendGroups")
  .values({
    slug: GROUP_SLUG,
    name: GROUP_NAME,
    description: GROUP_DESCRIPTION,
    code: GROUP_CODE,
    createdAt: daysAgo(90),
  })
  .returning("id")
  .executeTakeFirstOrThrow();

await db
  .insertInto("friendGroupMembers")
  .values([
    { groupId: group.id, userId: viewer.id, role: "owner", joinedAt: daysAgo(90) },
    ...MEMBERS.map((m) => ({
      groupId: group.id,
      userId: uid(m.key),
      role: m.role,
      joinedAt: daysAgo(m.joinedDaysAgo),
    })),
  ])
  .execute();

// Reveal every synthetic contact method to the group.
await db
  .insertInto("friendGroupMemberContacts")
  .values(contactIds.map((c) => ({ groupId: group.id, userId: uid(c.key), contactMethodId: c.id })))
  .execute();

console.log(
  `Created group "${GROUP_NAME}" (/groups/${GROUP_SLUG}) with ${MEMBERS.length + 1} members.`,
);

// --- Collections and copies ------------------------------------------------
const people: PersonKey[] = ["viewer", ...MEMBERS.map((m) => m.key)];
/** copyIds[person][card] -> copy id, used to wire tradelists and reserved trades. */
const copyIds = new Map<string, string>();

for (const person of people) {
  const collection = await db
    .insertInto("collections")
    .values({
      userId: uid(person),
      groupId: null,
      name: person === "viewer" ? VIEWER_COLLECTION : `${personName(person)}'s binder`,
      description: null,
      isInbox: false,
      sortOrder: 0,
      shareToken: null,
      createdAt: daysAgo(80),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  for (const [i, card] of OWNED[person].entries()) {
    const copy = await db
      .insertInto("copies")
      .values({
        collectionId: collection.id,
        printingId: printing(card).id,
        condition: CONDITIONS[i % CONDITIONS.length],
        createdAt: daysAgo(75 - i),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    copyIds.set(`${person}:${card}`, copy.id);
  }

  // Share each member's binder into the group (staggered, so the feed spreads).
  await db
    .insertInto("friendGroupCollectionShares")
    .values({
      groupId: group.id,
      collectionId: collection.id,
      userId: uid(person),
      sharedAt: daysAgo(person === "viewer" ? 60 : 20 + people.indexOf(person) * 6),
    })
    .execute();
}

/** @returns The display name for a person key. */
function personName(key: PersonKey): string {
  if (key === "viewer") {
    return viewerUser.name ?? "You";
  }
  const member = MEMBERS.find((m) => m.key === key);
  if (!member) {
    throw new Error(`Unknown member: ${key}`);
  }
  return member.name;
}

// Group-owned collections (user_id null, group_id set).
//
// The loaner deck: one collection holding a real decklist. Each card name is
// resolved to a single printing (EN, with an image, lowest public code) and
// stocked at the deck's quantity, so the collection is the physical deck.
const loanerCollection = await db
  .insertInto("collections")
  .values({
    userId: null,
    groupId: group.id,
    name: LOANER_DECK.name,
    description: LOANER_DECK.description,
    isInbox: false,
    sortOrder: 0,
    shareToken: null,
    createdAt: daysAgo(45),
  })
  .returning("id")
  .executeTakeFirstOrThrow();

let loanerCopies = 0;
for (const [i, entry] of LOANER_DECK.cards.entries()) {
  const row = await db
    .selectFrom("printings as p")
    .innerJoin("cards as c", "c.id", "p.cardId")
    .innerJoin("printingImages as pi", "pi.printingId", "p.id")
    .select("p.id")
    .distinctOn("p.id")
    .where("c.name", "=", entry.name)
    .where("p.language", "=", "EN")
    .orderBy("p.id", "asc")
    .executeTakeFirst();
  if (!row) {
    console.error(`Loaner deck: no EN printing with an image for "${entry.name}".`);
    await db.destroy();
    process.exit(1);
  }
  await db
    .insertInto("copies")
    .values(
      Array.from({ length: entry.quantity }, () => ({
        collectionId: loanerCollection.id,
        printingId: row.id,
        condition: CONDITIONS[i % CONDITIONS.length],
        createdAt: daysAgo(45),
      })),
    )
    .execute();
  loanerCopies += entry.quantity;
}

// The bulk box, drawn straight from the catalog. Ordered by public code (not
// random()) so a re-run seeds the same pile, and restricted to printings that
// actually have an image so the collection's cover/fan tiles render.
const bulkPrintings = await db
  .selectFrom("printings as p")
  .innerJoin("printingImages as pi", "pi.printingId", "p.id")
  .select(["p.id", "p.publicCode"])
  .distinct()
  .where("p.language", "=", "EN")
  .orderBy("p.publicCode", "asc")
  .limit(BULK_COLLECTION.printingCount)
  .execute();

const bulkCollection = await db
  .insertInto("collections")
  .values({
    userId: null,
    groupId: group.id,
    name: BULK_COLLECTION.name,
    description: BULK_COLLECTION.description,
    isInbox: false,
    sortOrder: 1,
    shareToken: BULK_COLLECTION.shareToken,
    isPublic: true,
    createdAt: daysAgo(58),
  })
  .returning("id")
  .executeTakeFirstOrThrow();

// 1-3 copies each, so the box has natural duplicates rather than a flat playset.
const bulkCopies = bulkPrintings.flatMap((row, i) =>
  Array.from({ length: (i % 3) + 1 }, () => ({
    collectionId: bulkCollection.id,
    printingId: row.id,
    condition: CONDITIONS[i % CONDITIONS.length],
    createdAt: daysAgo(58 - (i % 40)),
  })),
);
await db.insertInto("copies").values(bulkCopies).execute();

console.log(
  `Created ${people.length} member binders and 2 group collections ` +
    `(loaner deck: ${loanerCopies} cards; bulk box: ${bulkPrintings.length} printings, ` +
    `${bulkCopies.length} copies).`,
);

// --- Lists (tradelists + wishlists), shared into the group -----------------
for (const [i, person] of people.entries()) {
  const tradelist = await db
    .insertInto("lists")
    .values({
      userId: uid(person),
      name: person === "viewer" ? VIEWER_TRADELIST : `${personName(person)}'s spares`,
      intent: "trade",
      kind: "copy",
      createdAt: daysAgo(70),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  for (const card of TRADING[person]) {
    const copyId = copyIds.get(`${person}:${card}`);
    if (!copyId) {
      throw new Error(`${person} trades ${card} but does not own it`);
    }
    await db
      .insertInto("listEntries")
      .values({
        listId: tradelist.id,
        userId: uid(person),
        kind: "copy",
        copyId,
        quantity: 1,
      })
      .execute();
  }

  const wishlist = await db
    .insertInto("lists")
    .values({
      userId: uid(person),
      name: person === "viewer" ? VIEWER_WISHLIST : `${personName(person)}'s wants`,
      intent: "wish",
      kind: "printing",
      createdAt: daysAgo(68),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  for (const card of WANTED[person]) {
    await db
      .insertInto("listEntries")
      .values({
        listId: wishlist.id,
        userId: uid(person),
        kind: "printing",
        printingId: printing(card).id,
        quantity: 1,
      })
      .execute();
  }

  await db
    .insertInto("friendGroupListShares")
    .values([
      {
        groupId: group.id,
        listId: tradelist.id,
        userId: uid(person),
        sharedAt: daysAgo(40 - i * 4),
      },
      {
        groupId: group.id,
        listId: wishlist.id,
        userId: uid(person),
        sharedAt: daysAgo(38 - i * 4),
      },
    ])
    .execute();
}
console.log(`Shared ${people.length * 2} lists into the group.`);

// --- Trades ----------------------------------------------------------------
// Completed trades feed the hero card fan, the activity feed and the traded
// count. Consecutive same-giver/receiver rows collapse into one batch row, so
// the Mira -> viewer pair below deliberately spans two cards.
interface TradeSpec {
  giver: PersonKey;
  receiver: PersonKey;
  card: CardKey;
  initiator: "giver" | "receiver";
  status: "pending" | "reserved" | "completed";
  daysAgo: number;
}

const TRADES: TradeSpec[] = [
  // Completed, spread over the last two months.
  {
    giver: "mira",
    receiver: "viewer",
    card: "ripper",
    initiator: "receiver",
    status: "completed",
    daysAgo: 52,
  },
  {
    giver: "mira",
    receiver: "viewer",
    card: "bard",
    initiator: "receiver",
    status: "completed",
    daysAgo: 52,
  },
  {
    giver: "viewer",
    receiver: "yuki",
    card: "battleMistress",
    initiator: "giver",
    status: "completed",
    daysAgo: 41,
  },
  {
    giver: "tobias",
    receiver: "nils",
    card: "baronEpic",
    initiator: "receiver",
    status: "completed",
    daysAgo: 33,
  },
  {
    giver: "nils",
    receiver: "sam",
    card: "ambessa",
    initiator: "giver",
    status: "completed",
    daysAgo: 24,
  },
  {
    giver: "yuki",
    receiver: "tobias",
    card: "ahriShowcase",
    initiator: "receiver",
    status: "completed",
    daysAgo: 12,
  },
  {
    giver: "sam",
    receiver: "mira",
    card: "azir",
    initiator: "receiver",
    status: "completed",
    daysAgo: 5,
  },
  // Live: pending on the viewer (action needed) and one reserved outgoing.
  {
    giver: "mira",
    receiver: "viewer",
    card: "apheliosShowcase",
    initiator: "giver",
    status: "pending",
    daysAgo: 2,
  },
  {
    giver: "yuki",
    receiver: "viewer",
    card: "bardShowcase",
    initiator: "receiver",
    status: "pending",
    daysAgo: 1,
  },
  {
    giver: "viewer",
    receiver: "tobias",
    card: "ahriEpic",
    initiator: "receiver",
    status: "reserved",
    daysAgo: 4,
  },
];

for (const t of TRADES) {
  const printingRow = printing(t.card);
  const isCompleted = t.status === "completed";
  const trade = await db
    .insertInto("cardTrades")
    .values({
      groupId: group.id,
      giverUserId: uid(t.giver),
      receiverUserId: uid(t.receiver),
      initiator: t.initiator,
      printingId: printingRow.id,
      cardId: printingRow.cardId,
      quantity: 1,
      status: t.status,
      lastActorUserId: uid(t.initiator === "giver" ? t.giver : t.receiver),
      receiverWishEntryId: null,
      giverSyncAppliedAt: null,
      receiverSyncAppliedAt: null,
      requestEmailSentAt: null,
      reservedEmailSentAt: null,
      closedEmailSentAt: null,
      createdAt: daysAgo(t.daysAgo + 3),
      updatedAt: daysAgo(t.daysAgo),
      acceptedAt: isCompleted || t.status === "reserved" ? daysAgo(t.daysAgo + 1) : null,
      completedAt: isCompleted ? daysAgo(t.daysAgo) : null,
      closedAt: isCompleted ? daysAgo(t.daysAgo) : null,
      expiresAt: t.status === "pending" ? daysAhead(5) : null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // A reserved trade holds the giver's physical copy.
  if (t.status === "reserved") {
    const copyId = copyIds.get(`${t.giver}:${t.card}`);
    if (copyId) {
      await db.insertInto("cardTradeCopies").values({ tradeId: trade.id, copyId }).execute();
    }
  }
}
console.log(
  `Created ${TRADES.length} trades (${TRADES.filter((t) => t.status === "completed").length} completed).`,
);

// --- Pending join request --------------------------------------------------
// Gives the members page its "requests" band and bumps the members stat tile.
const applicantId = "demo_applicant_rift-runners";
await db.deleteFrom("users").where("id", "=", applicantId).execute();
await db
  .insertInto("users")
  .values({
    id: applicantId,
    email: "kaya.lindqvist@example.com",
    name: "Kaya",
    emailVerified: true,
    createdAt: daysAgo(6),
  })
  .execute();
await db
  .insertInto("friendGroupInvites")
  .values({
    groupId: group.id,
    userId: applicantId,
    direction: "request",
    createdAt: daysAgo(3),
  })
  .execute();

// --- Tournament ------------------------------------------------------------
// A finished pod event: three finalized rounds of 14 players, shaped after a
// real multiplayer night. Standings read only finalized rounds, so every round
// carries placements; an unfinalized round contributes nothing to the ranking.
//
// endsAt matters: completion is date-derived, not read off `status`. With
// endsAt null a tournament auto-completes 24h after startsAt anyway
// (effectiveTournamentState in packages/shared/src/tournament-lifecycle.ts), so
// set it explicitly rather than leaning on that grace window.
const tournament = await db
  .insertInto("tournaments")
  .values({
    name: "Tuesday Night Skirmish",
    groupId: group.id,
    hostType: "user",
    hostUserId: viewer.id,
    status: "running",
    pairingStyle: "pod",
    currentRound: 3,
    matchFormat: "bo1",
    // Real events get one when the host opens follow-along; without it the
    // report/follow-along link has nothing to point at.
    reportToken: "RiftRunDemo1",
    startsAt: daysAgo(3),
    endsAt: daysAgo(3 - 7 / 24),
    createdAt: daysAgo(21),
  })
  .returning("id")
  .executeTakeFirstOrThrow();

await db
  .insertInto("tournamentStaff")
  .values([
    { tournamentId: tournament.id, userId: viewer.id, role: "organizer" },
    { tournamentId: tournament.id, userId: uid("mira"), role: "judge" },
  ])
  .execute();

// Six group members plus eight walk-ins for a 14-player field, which also
// exercises unclaimed entrants (userId null) alongside claimed ones.
const WALK_INS = ["Priya", "Lars", "Dilan", "Noor", "Ivo", "Marta", "Kwame", "Elif"];
const participantIds: string[] = [];

for (const person of people) {
  const row = await db
    .insertInto("tournamentParticipants")
    .values({
      tournamentId: tournament.id,
      userId: uid(person),
      displayName: personName(person),
      status: "active",
      createdAt: daysAgo(10),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  participantIds.push(row.id);
}

for (const name of WALK_INS) {
  const row = await db
    .insertInto("tournamentParticipants")
    .values({
      tournamentId: tournament.id,
      displayName: name,
      status: "active",
      createdAt: daysAgo(2),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  participantIds.push(row.id);
}

/**
 * A zero-penalty breakdown for a hand-seeded pairing.
 *
 * The keys must match what `loadRounds` reads out of `pods.penalty_breakdown`
 * (apps/api/src/repositories/pod-tournaments.ts), because the run-state
 * response is schema-validated on the way out. Only `sameRegion` is defaulted
 * there (`?? 0`) for rows predating the region feature; every other key,
 * `spread` included, is passed straight through. Miss one and it serialises as
 * undefined, the whole runState payload fails validation, and the overview
 * silently drops every round/standings module rather than erroring visibly.
 */
const NO_PENALTY = JSON.stringify({
  total: 0,
  rematchPairs: 0,
  spread: 0,
  scoreSpread: 0,
  imbalance: 0,
  float: 0,
  threePodRepeat: 0,
  sameRegion: 0,
});

/** Points awarded by finishing position within a pod. */
const GAME_POINTS = [3, 2, 1, 0];

/** @returns The participant id at an index, guarding the fixed seating tables. */
function seatPlayerId(index: number): string {
  const id = participantIds[index];
  if (!id) {
    throw new Error(`No participant at seat index ${index}`);
  }
  return id;
}

/**
 * Three finalized rounds over 14 players. Seating is a fixed permutation per
 * round so pods are not straight repeats, and pod sizes mix 4s and 3s the way
 * an odd field forces. Rounds 1-2 seat all 14; round 3 seats 11 and byes the
 * rest, which exercises pod_byes (a bye still counts as a round played).
 */
const ROUNDS = [
  { number: 1, seating: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], podSizes: [4, 4, 3, 3] },
  { number: 2, seating: [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 3, 7, 11], podSizes: [4, 4, 3, 3] },
  { number: 3, seating: [13, 2, 7, 8, 0, 5, 11, 3, 9, 1, 6, 12, 10, 4], podSizes: [4, 4, 3] },
] as const;

for (const round of ROUNDS) {
  const roundRow = await db
    .insertInto("podRounds")
    .values({
      tournamentId: tournament.id,
      roundNumber: round.number,
      status: "finalized",
      penaltyTotal: 0,
      pairingStrategy: "local-search",
      createdAt: daysAgo(3),
      finalizedAt: daysAgo(3 - round.number / 12),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  let seatCursor = 0;
  for (const [i, size] of round.podSizes.entries()) {
    const podNumber = i + 1;
    const seats = round.seating.slice(seatCursor, seatCursor + size);
    seatCursor += size;

    const pod = await db
      .insertInto("pods")
      .values({
        roundId: roundRow.id,
        podNumber,
        size,
        penaltyBreakdown: NO_PENALTY,
        resultStatus: "reported",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    for (const [seat, participantIndex] of seats.entries()) {
      // Rotate the winner by pod and round so the ranking is not just seat
      // order, and placements stay distinct within each pod.
      const placement = ((seat + podNumber + round.number) % size) + 1;
      await db
        .insertInto("podMembers")
        .values({
          podId: pod.id,
          playerId: seatPlayerId(participantIndex),
          placement,
          gamePoints: GAME_POINTS[placement - 1],
        })
        .execute();
    }
  }

  // Anyone left unseated this round takes a bye.
  for (const participantIndex of round.seating.slice(seatCursor)) {
    await db
      .insertInto("podByes")
      .values({ roundId: roundRow.id, playerId: seatPlayerId(participantIndex) })
      .execute();
  }
}

console.log(
  `Created tournament "Tuesday Night Skirmish" (${participantIds.length} entrants, ${ROUNDS.length} finalized rounds).`,
);

console.log("\nDone.");
console.log(`  Group:      /groups/${GROUP_SLUG}`);
console.log(`  Trades:     /groups/${GROUP_SLUG}/trades`);
console.log(`  Tournament: /tournaments/${tournament.id}`);
console.log(`  Code:       ${GROUP_CODE}`);

await db.destroy();
