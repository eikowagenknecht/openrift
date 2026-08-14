import type { CardSearchIndex } from "@openrift/shared";
import { buildCardIndex } from "@openrift/shared";

import type { Repos } from "../deps.js";
import type { ChatCard, ChatEnumLabels } from "../lib/chat-presenters.js";
import { createContentAddressedCache } from "./catalog-assembly.js";

/** A card as the chat index holds it: the presenter's fields plus its id. */
type ChatIndexCard = ChatCard & { id: string };

export interface ChatCardIndex {
  index: CardSearchIndex<ChatIndexCard>;
  labels: ChatEnumLabels;
}

/** @returns A slug → label map for a reference table's rows. */
function labelMap(rows: readonly { slug: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.slug, row.label]));
}

/**
 * Reads the cards, their lookup codes and the enum labels the chat line needs,
 * and folds them into a ready-to-query index.
 *
 * @returns The assembled chat lookup index.
 */
async function assembleChatCardIndex(repos: Repos): Promise<ChatCardIndex> {
  const [cards, codes, enums] = await Promise.all([
    repos.catalog.cards(),
    repos.catalog.printingCodes(),
    repos.enums.all(),
  ]);
  return {
    index: buildCardIndex(
      cards,
      Map.groupBy(codes, (row) => row.cardId),
    ),
    labels: {
      cardTypes: labelMap(enums.cardTypes),
      superTypes: labelMap(enums.superTypes),
      domains: labelMap(enums.domains),
    },
  };
}

/**
 * A process-lived, content-addressed memo of the chat lookup index.
 *
 * The whole catalogue has to be in memory for a lookup to be a scan over
 * pre-folded strings, so rebuilding it per request is out of the question. The
 * Discord bot solves this with a TTL refresh because it only talks to the API
 * over HTTP; server-side we can do better with the same helper the rule
 * catalogue uses: the memo is keyed on cheap content-version probes rather than
 * a clock, so a card edit or a renamed enum label is visible on the next
 * lookup with no staleness window.
 *
 * Both probes matter — the catalogue token covers cards and printings, and the
 * enum token covers the type/domain labels the stat line renders.
 *
 * @returns A zero-arg loader serving the memoized index.
 */
export function createChatCardIndexLoader(repos: Repos): () => Promise<ChatCardIndex> {
  return createContentAddressedCache(
    () => assembleChatCardIndex(repos),
    async () => {
      const [catalogVersion, enumVersion] = await Promise.all([
        repos.catalog.catalogContentVersion(),
        repos.enums.contentVersion(),
      ]);
      return `${catalogVersion}|${enumVersion}`;
    },
  );
}
