import type { ListKind } from "@openrift/shared/types/api/list";
import type { TradePreference } from "@openrift/shared/types/api/trade-preferences";
import type { Finish, Rarity } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { PrintingDetail } from "../../../repositories/query-helpers.js";
import {
  cardTypesColumn,
  imageId,
  joinFrontImage,
  printingDetailsByIds,
  selectCopyWithCard,
} from "../../../repositories/query-helpers.js";
import type { ListEntryRow } from "./lists-shared.js";
import { tradeOverrideFromRow } from "./lists-shared.js";

export async function fetchEnrichedEntries(
  db: Kysely<Database>,
  kind: ListKind,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  const rows =
    kind === "card"
      ? await cardEntryQuery(db, scope)
      : kind === "printing"
        ? await printingEntryQuery(db, scope)
        : await copyEntryQuery(db, scope);
  return rows.sort((a, b) => a.cardName.localeCompare(b.cardName));
}

interface RuleOnlyDetails {
  cards: Map<string, { cardName: string }>;
  printings: Map<string, PrintingDetail>;
  copies: Map<string, CopyDetail>;
}

interface CopyDetail extends PrintingDetail {
  printingId: string;
  collectionId: string;
  reserved: boolean;
  onLoan: boolean;
}

export async function loadRuleOnlyDetails(
  db: Kysely<Database>,
  kind: ListKind,
  ruleOnly: { cardId?: string; printingId?: string; copyId?: string }[],
): Promise<RuleOnlyDetails> {
  const empty: RuleOnlyDetails = { cards: new Map(), printings: new Map(), copies: new Map() };
  if (ruleOnly.length === 0) {
    return empty;
  }
  if (kind === "card") {
    const ids = ruleOnly
      .map((entry) => entry.cardId)
      .filter((id): id is string => id !== undefined);
    return { ...empty, cards: await cardDetailsByIds(db, ids) };
  }
  if (kind === "printing") {
    const ids = ruleOnly
      .map((entry) => entry.printingId)
      .filter((id): id is string => id !== undefined);
    return { ...empty, printings: await printingDetailsByIds(db, ids) };
  }
  const ids = ruleOnly.map((entry) => entry.copyId).filter((id): id is string => id !== undefined);
  return { ...empty, copies: await copyDetailsByIds(db, ids) };
}

export function buildRuleOnlyRow(
  kind: ListKind,
  entry: {
    cardId?: string;
    printingId?: string;
    copyId?: string;
    quantity: number;
    ruleQuantity: number;
    tradeOverride: TradePreference;
  },
  details: RuleOnlyDetails,
  listId: string,
): ListEntryRow | null {
  if (kind === "card") {
    const detail = entry.cardId ? details.cards.get(entry.cardId) : undefined;
    if (!detail || !entry.cardId) {
      return null;
    }
    return {
      kind: "card",
      id: null,
      listId,
      quantity: entry.quantity,
      ruleQuantity: entry.ruleQuantity,
      source: "rule",
      cardId: entry.cardId,
      cardName: detail.cardName,
      tradeOverride: entry.tradeOverride,
    };
  }
  if (kind === "printing") {
    const detail = entry.printingId ? details.printings.get(entry.printingId) : undefined;
    if (!detail || !entry.printingId) {
      return null;
    }
    return {
      kind: "printing",
      id: null,
      listId,
      quantity: entry.quantity,
      ruleQuantity: entry.ruleQuantity,
      source: "rule",
      printingId: entry.printingId,
      ...detail,
      tradeOverride: entry.tradeOverride,
    };
  }
  const detail = entry.copyId ? details.copies.get(entry.copyId) : undefined;
  if (!detail || !entry.copyId) {
    return null;
  }
  return {
    kind: "copy",
    id: null,
    listId,
    quantity: entry.quantity,
    ruleQuantity: entry.ruleQuantity,
    source: "rule",
    copyId: entry.copyId,
    printingId: detail.printingId,
    collectionId: detail.collectionId,
    cardName: detail.cardName,
    setId: detail.setId,
    rarity: detail.rarity,
    finish: detail.finish,
    shortCode: detail.shortCode,
    language: detail.language,
    imageId: detail.imageId,
    reserved: detail.reserved,
    onLoan: detail.onLoan,
    tradeOverride: entry.tradeOverride,
  };
}

async function cardDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, { cardName: string }>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectFrom("cards as card")
    .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id")
    .select(["card.id", "card.name as name", cardTypesColumn(), "card.tags as tags"])
    .where("card.id", "in", ids)
    .execute();
  return new Map(rows.map((row) => [row.id, { cardName: legendDisplayName(row) }]));
}

async function copyDetailsByIds(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, CopyDetail>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await selectCopyWithCard(db)
    .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
    .leftJoin("loanCopies as lc", "lc.copyId", "cp.id")
    .select([
      "cp.id",
      "cp.printingId",
      "cp.collectionId",
      "c.name as name",
      cardTypesColumn(),
      "c.tags as tags",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
      "ctc.copyId as reservedByTradeCopyId",
      "lc.copyId as pinnedByLoanCopyId",
    ])
    .where("cp.id", "in", ids)
    .execute();
  return new Map(
    rows.map((row) => [
      row.id,
      {
        printingId: row.printingId,
        collectionId: row.collectionId,
        cardName: legendDisplayName(row),
        setId: row.setId,
        rarity: row.rarity,
        finish: row.finish,
        shortCode: row.shortCode,
        language: row.language,
        imageId: row.imageId,
        reserved: row.reservedByTradeCopyId !== null,
        onLoan: row.pinnedByLoanCopyId !== null,
      },
    ]),
  );
}

async function cardEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = db
    .selectFrom("listEntries as le")
    .innerJoin("cards as card", "card.id", "le.cardId")
    .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id")
    .where("le.listId", "=", scope.listId);
  if (scope.userId !== undefined) {
    q = q.where("le.userId", "=", scope.userId);
  }
  const rows = await q
    .select([
      "le.id",
      "le.listId",
      "le.quantity",
      "le.cardId",
      "le.pricePref",
      "le.priceAbsoluteCents",
      "le.tradeType",
      "card.name as name",
      cardTypesColumn(),
      "card.tags as tags",
    ])
    .execute();
  return rows.map((row) => ({
    kind: "card",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    ruleQuantity: 0,
    source: "manual",
    cardId: row.cardId as string,
    cardName: legendDisplayName(row),
    tradeOverride: tradeOverrideFromRow(row),
  }));
}

async function printingEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = joinFrontImage(
    db
      .selectFrom("listEntries as le")
      .innerJoin("printings as p", "p.id", "le.printingId")
      .innerJoin("cards as card", "card.id", "p.cardId")
      .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id"),
  ).where("le.listId", "=", scope.listId);
  if (scope.userId !== undefined) {
    q = q.where("le.userId", "=", scope.userId);
  }
  const rows = await q
    .select([
      "le.id",
      "le.listId",
      "le.quantity",
      "le.printingId",
      "le.pricePref",
      "le.priceAbsoluteCents",
      "le.tradeType",
      "card.name as name",
      cardTypesColumn(),
      "card.tags as tags",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
    ])
    .execute();
  return rows.map((row) => ({
    kind: "printing",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    ruleQuantity: 0,
    source: "manual",
    printingId: row.printingId as string,
    cardName: legendDisplayName(row),
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    tradeOverride: tradeOverrideFromRow(row),
  }));
}

async function copyEntryQuery(
  db: Kysely<Database>,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  let q = joinFrontImage(
    db
      .selectFrom("listEntries as le")
      .innerJoin("copies as cp", "cp.id", "le.copyId")
      .innerJoin("printings as p", "p.id", "cp.printingId")
      .innerJoin("cards as card", "card.id", "p.cardId")
      .leftJoin("mvCardAggregates as mca", "mca.cardId", "card.id"),
  )
    // UNIQUE copy_id: at most one live trade per copy, so this join can't multiply rows.
    .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
    // Same UNIQUE copy_id guarantee for loans.
    .leftJoin("loanCopies as lc", "lc.copyId", "cp.id")
    .where("le.listId", "=", scope.listId);
  if (scope.userId !== undefined) {
    q = q.where("le.userId", "=", scope.userId);
  }
  const rows = await q
    .select([
      "le.id",
      "le.listId",
      "le.quantity",
      "le.copyId",
      "le.pricePref",
      "le.priceAbsoluteCents",
      "le.tradeType",
      "card.name as name",
      cardTypesColumn(),
      "card.tags as tags",
      "p.setId",
      "p.rarity",
      "p.finish",
      "p.shortCode",
      "p.language",
      imageId("imgf").as("imageId"),
      "cp.collectionId",
      "cp.printingId",
      "ctc.copyId as reservedByTradeCopyId",
      "lc.copyId as pinnedByLoanCopyId",
    ])
    .execute();
  return rows.map((row) => ({
    kind: "copy",
    id: row.id,
    listId: row.listId,
    quantity: row.quantity,
    ruleQuantity: 0,
    source: "manual",
    copyId: row.copyId as string,
    printingId: row.printingId,
    collectionId: row.collectionId,
    cardName: legendDisplayName(row),
    setId: row.setId,
    rarity: row.rarity as Rarity,
    finish: row.finish as Finish,
    shortCode: row.shortCode,
    language: row.language,
    imageId: row.imageId,
    reserved: row.reservedByTradeCopyId !== null,
    onLoan: row.pinnedByLoanCopyId !== null,
    tradeOverride: tradeOverrideFromRow(row),
  }));
}
