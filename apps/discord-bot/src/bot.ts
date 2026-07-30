import type { MarketplaceInfoResponse } from "@openrift/shared";
import { parsePiltoverDeckCode } from "@openrift/shared";
import type { AutocompleteInteraction, ChatInputCommandInteraction, Message } from "discord.js";
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";

import type { ApiClients } from "./api-client.js";
import { buildCardEmbed } from "./card-embed.js";
import type { CardIndex } from "./card-search.js";
import { buildCardIndex, findCard, searchCards } from "./card-search.js";
import type { CatalogCache, CatalogCard } from "./catalog-cache.js";
import { buildDeckEmbed, deckImportUrl, fetchDeckImage, resolveDeckEntries } from "./deck-embed.js";
import type { BotEnv } from "./env.js";
import type { GlyphEmojis } from "./glyph-emoji.js";
import { fetchGlyphEmojis, NO_GLYPH_EMOJIS } from "./glyph-emoji.js";
import { extractCardReferences } from "./message-scan.js";
import { printingChoices, resolvePrinting } from "./printing-choice.js";
import { buildRuleEmbed } from "./rule-embed.js";
import type { IndexedRule, RuleIndex } from "./rule-search.js";
import {
  buildRuleIndex,
  findRule,
  isRuleCitation,
  ruleChoice,
  searchRules,
} from "./rule-search.js";
import type { RulesCache } from "./rules-cache.js";

const CARD_COMMAND = {
  name: "card",
  description: "Look up a Riftbound card: image, prices, and its OpenRift page",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "name",
      description: "The card name",
      required: true,
      autocomplete: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: "printing",
      description: "A specific printing (defaults to the main one)",
      required: false,
      autocomplete: true,
    },
  ],
} as const;

const DECK_COMMAND = {
  name: "deck",
  description: "Unfurl a Riftbound deck code: decklist, deck image, and an OpenRift import link",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "code",
      description: "A deck code (from Piltover Archive or an OpenRift deck's share dialog)",
      required: true,
    },
  ],
} as const;

const RULE_COMMAND = {
  name: "rule",
  description: "Look up a Riftbound rule: core (CR) or tournament (TR), by number or keyword",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "query",
      description: "A rule number (CR 103.1, TR 202), a game term (stun), or search text",
      required: true,
      autocomplete: true,
    },
  ],
} as const;

interface BotContext {
  env: BotEnv;
  api: ApiClients;
  cache: CatalogCache;
  rules: RulesCache;
}

/** Glyph emojis of the logged-in application, resolved once on ready; empty until then. */
let glyphEmojis: GlyphEmojis = NO_GLYPH_EMOJIS;

/** Search index rebuilt lazily per snapshot, so refreshes stay cheap until a lookup happens. */
let cachedIndex: { snapshot: unknown; index: CardIndex } | null = null;

function indexFor(cache: CatalogCache): CardIndex | null {
  const snapshot = cache.snapshot;
  if (!snapshot) {
    return null;
  }
  if (cachedIndex?.snapshot !== snapshot) {
    cachedIndex = { snapshot, index: buildCardIndex(snapshot.cards, snapshot.printingsByCardId) };
  }
  return cachedIndex.index;
}

/** Same lazy-per-snapshot pattern as the card index, for the rules. */
let cachedRuleIndex: { snapshot: unknown; index: RuleIndex } | null = null;

function ruleIndexFor(cache: RulesCache): RuleIndex | null {
  const snapshot = cache.snapshot;
  if (!snapshot) {
    return null;
  }
  if (cachedRuleIndex?.snapshot !== snapshot) {
    cachedRuleIndex = { snapshot, index: buildRuleIndex(snapshot) };
  }
  return cachedRuleIndex.index;
}

async function marketplaceInfoFor(
  api: ApiClients,
  printingId: string | undefined,
): Promise<MarketplaceInfoResponse["infos"][string] | undefined> {
  if (!printingId) {
    return undefined;
  }
  try {
    const response = await api.prices.marketplaceInfo({ printings: printingId });
    return response.infos[printingId];
  } catch (error) {
    console.error("marketplace-info lookup failed", error);
    return undefined;
  }
}

async function embedForCard(ctx: BotContext, card: CatalogCard, printingInput?: string) {
  const snapshot = ctx.cache.snapshot;
  if (!snapshot) {
    return null;
  }
  const printing = resolvePrinting(snapshot, card, printingInput);
  const marketplaceInfo = await marketplaceInfoFor(ctx.api, printing?.id);
  return buildCardEmbed({
    card,
    printing,
    snapshot,
    marketplaceInfo,
    emojis: glyphEmojis,
    siteUrl: ctx.env.siteUrl,
  });
}

async function handleAutocomplete(ctx: BotContext, interaction: AutocompleteInteraction) {
  const index = indexFor(ctx.cache);
  const focused = interaction.options.getFocused(true);

  if (focused.name === "printing") {
    const snapshot = ctx.cache.snapshot;
    const nameInput = interaction.options.getString("name") ?? "";
    const card = index && nameInput ? findCard(index, nameInput) : undefined;
    await interaction.respond(
      snapshot && card ? printingChoices(snapshot, card, focused.value) : [],
    );
    return;
  }

  const cards = index ? searchCards(index, focused.value, 25) : [];
  await interaction.respond(
    cards.map((card) => ({ name: card.name.slice(0, 100), value: card.slug.slice(0, 100) })),
  );
}

async function handleRuleAutocomplete(ctx: BotContext, interaction: AutocompleteInteraction) {
  const index = ruleIndexFor(ctx.rules);
  const focused = interaction.options.getFocused();
  const entries = index ? searchRules(index, focused, 25) : [];
  await interaction.respond(entries.map((entry) => ruleChoice(entry)));
}

async function handleRuleCommand(ctx: BotContext, interaction: ChatInputCommandInteraction) {
  const index = ruleIndexFor(ctx.rules);
  const query = interaction.options.getString("query", true);
  const entry = index ? findRule(index, query) : undefined;
  if (!index) {
    await interaction.reply({
      content: "Rules data is still loading, try again in a moment.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!entry) {
    await interaction.reply({
      content: `No rule found matching “${query}”.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // No API round trip needed — the embed is built from the cached snapshot.
  await interaction.reply({
    embeds: [buildRuleEmbed({ entry, index, siteUrl: ctx.env.siteUrl })],
  });
}

async function handleCardCommand(ctx: BotContext, interaction: ChatInputCommandInteraction) {
  const index = indexFor(ctx.cache);
  const query = interaction.options.getString("name", true);
  const card = index ? findCard(index, query) : undefined;
  if (!card) {
    await interaction.reply({
      content: `No card found matching “${query}”.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply();
  // With no explicit printing option, the name query itself is the hint: a
  // code-typed lookup (`/card name:ogn202`) shows that exact printing, while
  // a plain name falls through to the default printing inside resolvePrinting.
  const embed = await embedForCard(ctx, card, interaction.options.getString("printing") ?? query);
  if (!embed) {
    await interaction.editReply("Card data is still loading, try again in a moment.");
    return;
  }
  await interaction.editReply({ embeds: [embed] });
}

async function handleDeckCommand(ctx: BotContext, interaction: ChatInputCommandInteraction) {
  const snapshot = ctx.cache.snapshot;
  if (!snapshot) {
    await interaction.reply({
      content: "Card data is still loading, try again in a moment.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const code = interaction.options.getString("code", true).trim();
  const { entries } = parsePiltoverDeckCode(code);
  if (entries.length === 0) {
    await interaction.reply({
      content: "That doesn't look like a valid deck code.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const deck = resolveDeckEntries(snapshot, entries);
  if (deck.rows.length === 0) {
    await interaction.reply({
      content: "That deck code decoded, but none of its cards are in the catalog yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Defer: the image render below is a real API round trip.
  await interaction.deferReply();
  const image = await fetchDeckImage(ctx.env.apiUrl, deck);
  const imageAttachmentName = image ? "deck.png" : undefined;
  const embed = buildDeckEmbed({
    deck,
    code,
    snapshot,
    siteUrl: ctx.env.siteUrl,
    imageAttachmentName,
  });
  // A real link button under the embed — the title link alone is easy to miss.
  const openButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel("Open in OpenRift")
    .setURL(deckImportUrl(ctx.env.siteUrl, code));
  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(openButton)],
    files: image ? [new AttachmentBuilder(Buffer.from(image), { name: "deck.png" })] : [],
  });
}

type MessageMatch =
  | { type: "card"; card: CatalogCard; reference: string }
  | { type: "rule"; entry: IndexedRule };

async function handleMessage(ctx: BotContext, message: Message) {
  if (message.author.bot || !message.content.includes("[[")) {
    return;
  }
  const cardIndex = indexFor(ctx.cache);
  const ruleIndex = ruleIndexFor(ctx.rules);
  const matches: MessageMatch[] = [];
  for (const reference of extractCardReferences(message.content)) {
    // Citation-shaped references ([[cr 103.1]], [[tr202]], bare [[103.1]])
    // resolve as rules; everything else stays a card lookup.
    if (isRuleCitation(reference)) {
      const entry = ruleIndex ? findRule(ruleIndex, reference) : undefined;
      if (entry && !matches.some((match) => match.type === "rule" && match.entry === entry)) {
        matches.push({ type: "rule", entry });
      }
      continue;
    }
    const card = cardIndex ? findCard(cardIndex, reference) : undefined;
    if (card && !matches.some((match) => match.type === "card" && match.card.id === card.id)) {
      matches.push({ type: "card", card, reference });
    }
  }
  if (matches.length === 0) {
    return;
  }
  // For cards, the reference doubles as the printing hint so [[OGN-202]]
  // shows that printing; plain names fall through to the default inside
  // resolvePrinting.
  const maybeEmbeds = await Promise.all(
    matches.map((match) =>
      match.type === "card"
        ? embedForCard(ctx, match.card, match.reference)
        : (ruleIndex &&
            buildRuleEmbed({ entry: match.entry, index: ruleIndex, siteUrl: ctx.env.siteUrl })) ||
          null,
    ),
  );
  const embeds = maybeEmbeds.filter((embed) => embed !== null);
  if (embeds.length > 0) {
    await message.reply({ embeds, allowedMentions: { repliedUser: false } });
  }
}

/**
 * Wires up the Discord client: registers the slash commands on ready and
 * handles slash commands, autocomplete, and `[[card name]]` message scans.
 * Handler failures are logged, never thrown — one bad lookup must not take
 * down the gateway connection.
 *
 * @returns The configured (not yet logged-in) client.
 */
export function createBot(ctx: BotContext): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    try {
      await readyClient.application.commands.set([CARD_COMMAND, DECK_COMMAND, RULE_COMMAND]);
    } catch (error) {
      console.error("Failed to register slash commands", error);
    }
    // Card text renders glyphs as the app's own emojis; a failed fetch (or an
    // app they were never uploaded to) just falls back to plain words.
    try {
      glyphEmojis = await fetchGlyphEmojis(readyClient);
      console.log(`Glyph emojis loaded: ${glyphEmojis.size}`);
    } catch (error) {
      console.error("Failed to load glyph emojis, card text will use plain words", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete() && interaction.commandName === CARD_COMMAND.name) {
        await handleAutocomplete(ctx, interaction);
      } else if (interaction.isAutocomplete() && interaction.commandName === RULE_COMMAND.name) {
        await handleRuleAutocomplete(ctx, interaction);
      } else if (
        interaction.isChatInputCommand() &&
        interaction.commandName === CARD_COMMAND.name
      ) {
        await handleCardCommand(ctx, interaction);
      } else if (
        interaction.isChatInputCommand() &&
        interaction.commandName === DECK_COMMAND.name
      ) {
        await handleDeckCommand(ctx, interaction);
      } else if (
        interaction.isChatInputCommand() &&
        interaction.commandName === RULE_COMMAND.name
      ) {
        await handleRuleCommand(ctx, interaction);
      }
    } catch (error) {
      console.error("Interaction handling failed", error);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleMessage(ctx, message);
    } catch (error) {
      console.error("Message handling failed", error);
    }
  });

  return client;
}
