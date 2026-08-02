import type { MarketplaceInfoResponse } from "@openrift/shared";
import { parsePiltoverDeckCode } from "@openrift/shared";
import { isDefinedError, safe } from "@orpc/client";
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
} from "discord.js";
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
  PermissionFlagsBits,
} from "discord.js";

import type { ApiClients } from "./api-client.js";
import {
  buildCardDetailsEmbed,
  detailsCustomId,
  detailsLabel,
  parseDetailsCustomId,
} from "./card-details.js";
import { buildCardEmbed } from "./card-embed.js";
import type { CardIndex } from "./card-search.js";
import { buildCardIndex, findCard, searchCards } from "./card-search.js";
import type { CatalogCache, CatalogCard } from "./catalog-cache.js";
import { buildDeckEmbed, deckImportUrl, fetchDeckImage, resolveDeckEntries } from "./deck-embed.js";
import type { BotEnv } from "./env.js";
import type { GlyphEmojis } from "./glyph-emoji.js";
import { fetchGlyphEmojis, NO_GLYPH_EMOJIS } from "./glyph-emoji.js";
import { fetchTradelistHolders } from "./group-tradelists.js";
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
import type { TradeChannelCache } from "./trade-channels.js";
import type { ScanIndex } from "./trade-scan.js";
import { buildScanIndex, buildTradeReply, scanForCards, tradeLine } from "./trade-scan.js";

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

const LINK_COMMAND = {
  name: "link",
  description: "Link this server to an OpenRift group so card mentions show group tradelists",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "code",
      description: "One-time link code from the group's Manage page on OpenRift",
      required: true,
    },
  ],
  // Server managers only — linking decides what the bot reveals here.
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  dm_permission: false,
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

const TRADE_CHANNEL_COMMAND = {
  name: "tradechannel",
  description: "Mark this channel as a trade channel, so card names in posts get offers attached",
  options: [
    {
      type: ApplicationCommandOptionType.Boolean,
      name: "enabled",
      description: "On to scan this channel, off to stop",
      required: true,
    },
  ],
  // Server managers only — this decides where the bot speaks unprompted.
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  dm_permission: false,
} as const;

interface BotContext {
  env: BotEnv;
  api: ApiClients;
  cache: CatalogCache;
  rules: RulesCache;
  tradeChannels: TradeChannelCache;
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

/** Same lazy-per-snapshot pattern, for the free-prose scan of trade channels. */
let cachedScanIndex: { snapshot: unknown; index: ScanIndex } | null = null;

function scanIndexFor(cache: CatalogCache): ScanIndex | null {
  const snapshot = cache.snapshot;
  if (!snapshot) {
    return null;
  }
  if (cachedScanIndex?.snapshot !== snapshot) {
    cachedScanIndex = {
      snapshot,
      index: buildScanIndex(snapshot.cards, snapshot.printingsByCardId),
    };
  }
  return cachedScanIndex.index;
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

/**
 * Builds a card reply: the embed plus the id of the printing it settled on, so
 * the caller's Details button can ask for that same printing.
 *
 * @returns The embed and printing id, or null while the catalog is loading.
 */
async function embedForCard(
  ctx: BotContext,
  card: CatalogCard,
  printingInput?: string,
  guildId?: string | null,
) {
  const snapshot = ctx.cache.snapshot;
  if (!snapshot) {
    return null;
  }
  const printing = resolvePrinting(snapshot, card, printingInput);
  const [marketplaceInfo, tradelists] = await Promise.all([
    marketplaceInfoFor(ctx.api, printing?.id),
    fetchTradelistHolders(ctx.api, guildId, card.id),
  ]);
  const embed = buildCardEmbed({
    card,
    printing,
    snapshot,
    marketplaceInfo,
    siteUrl: ctx.env.siteUrl,
    tradelists,
  });
  return { embed, printingId: printing?.id };
}

/**
 * The Details button under a card reply: the stat line and card text are left
 * off the embed because they are printed on the artwork, and this opens them
 * on demand, ephemerally.
 *
 * @returns The button, ready to put in an action row.
 */
function detailsButton(card: CatalogCard, printingId: string | undefined, multiple: boolean) {
  return new ButtonBuilder()
    .setStyle(ButtonStyle.Secondary)
    .setCustomId(detailsCustomId(card.id, printingId))
    .setLabel(detailsLabel(card.name, multiple));
}

/**
 * Answers a Details button click with an ephemeral card-details embed. The
 * button carries the card and printing ids, so a click still works after a
 * catalog refresh or a bot restart — only a card that left the catalog fails.
 */
async function handleDetailsButton(ctx: BotContext, interaction: ButtonInteraction) {
  const parsed = parseDetailsCustomId(interaction.customId);
  if (!parsed) {
    return;
  }
  const snapshot = ctx.cache.snapshot;
  const card = snapshot?.cards.find((entry) => entry.id === parsed.cardId);
  if (!snapshot || !card) {
    await interaction.reply({
      content: "That card isn't in the catalog anymore, look it up again.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const printing = parsed.printingId
    ? snapshot.printingsByCardId.get(card.id)?.find((entry) => entry.id === parsed.printingId)
    : undefined;
  await interaction.reply({
    embeds: [
      buildCardDetailsEmbed({
        card,
        printing,
        snapshot,
        emojis: glyphEmojis,
        siteUrl: ctx.env.siteUrl,
      }),
    ],
    flags: MessageFlags.Ephemeral,
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
  const reply = await embedForCard(
    ctx,
    card,
    interaction.options.getString("printing") ?? query,
    interaction.guildId,
  );
  if (!reply) {
    await interaction.editReply("Card data is still loading, try again in a moment.");
    return;
  }
  await interaction.editReply({
    embeds: [reply.embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        detailsButton(card, reply.printingId, false),
      ),
    ],
  });
}

/**
 * The /link command: redeems a one-time code from a group's Manage page,
 * binding this guild to that group. Restricted to members with Manage Server
 * (see LINK_COMMAND); failures stay ephemeral, the success confirmation is
 * public so the channel sees the server got linked.
 */
async function handleLinkCommand(ctx: BotContext, interaction: ChatInputCommandInteraction) {
  const api = ctx.api.discordBot;
  if (!api || !interaction.inGuild()) {
    await interaction.reply({
      content: "Linking only works in a server, and needs the bot's group features enabled.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const code = interaction.options.getString("code", true).trim();
  const { error, data } = await safe(
    api.redeemLink({
      code,
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? null,
    }),
  );
  if (error) {
    const content =
      isDefinedError(error) && error.code === "NOT_FOUND"
        ? "That code isn't valid (anymore). Generate a fresh one on the group's Manage page."
        : isDefinedError(error) && error.code === "CONFLICT"
          ? "This server is already linked to a different OpenRift group. Unlink it there first."
          : "Linking failed, try again in a moment.";
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    content:
      `Linked this server to the OpenRift group **${data.groupName}**. ` +
      "Card mentions here now show who has the card on a tradelist shared with the group.",
  });
}

/**
 * The /tradechannel command: opts the current channel in or out of card-name
 * scanning. Restricted to members with Manage Server, and only meaningful in a
 * guild already linked to a group — linking is the group's consent, this is
 * the server saying where that consent applies.
 */
async function handleTradeChannelCommand(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
) {
  const api = ctx.api.discordBot;
  if (!api || !interaction.inGuild()) {
    await interaction.reply({
      content: "Trade channels only work in a server, and need the bot's group features enabled.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const enabled = interaction.options.getBoolean("enabled", true);
  const { error, data } = await safe(
    api.setTradeChannel({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      enabled,
    }),
  );
  if (error) {
    console.error("set-trade-channel failed", error);
    await interaction.reply({
      content: "Couldn't save that, try again in a moment.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!data.linked) {
    await interaction.reply({
      content:
        "This server isn't linked to an OpenRift group yet. Run `/link` with a code from the group's Manage page first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // Write through so the setting applies to the very next message here,
  // rather than at the cache's next refresh.
  ctx.tradeChannels.set(interaction.guildId, data.channelIds);
  const mode =
    ctx.env.tradeScanMode === "reply"
      ? ""
      : " (the bot is in log-only mode right now, so it won't post yet)";
  await interaction.reply({
    content: enabled
      ? `This channel is now a trade channel. Card names in posts here will get an offers reply.${mode}`
      : "This channel is no longer a trade channel.",
  });
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

/**
 * Answers a post in a trade channel with the offers the guild's linked group
 * holds for the cards it names — no brackets, no command, nothing the poster
 * had to know about. Silence is the default: cards nobody offers contribute
 * no line, and a message whose every name draws a blank produces no reply, so
 * the noise floor is the group's actual supply rather than the match count.
 */
async function handleTradeScan(ctx: BotContext, message: Message) {
  const index = scanIndexFor(ctx.cache);
  if (!index) {
    return;
  }
  const cards = scanForCards(message.content, index);
  if (cards.length === 0) {
    return;
  }
  const holders = await Promise.all(
    cards.map((card) => fetchTradelistHolders(ctx.api, message.guildId, card.id)),
  );
  const lines = cards.map((card, position) =>
    tradeLine(card, holders[position] ?? null, ctx.env.siteUrl),
  );
  const groupName = holders.find((entry) => entry?.groupName)?.groupName ?? null;
  const reply = buildTradeReply(lines, groupName);
  if (!reply) {
    return;
  }
  // Log-only is the default: a channel's real traffic tunes the matcher
  // before the bot ever posts something nobody asked for.
  if (ctx.env.tradeScanMode !== "reply") {
    console.log(
      `[trade-scan log-only] #${message.channelId}: matched ${cards
        .map((card) => card.name)
        .join(", ")} — would reply:\n${reply}`,
    );
    return;
  }
  await message.reply({ content: reply, allowedMentions: { parse: [], repliedUser: false } });
}

async function handleMessage(ctx: BotContext, message: Message) {
  if (message.author.bot) {
    return;
  }
  if (ctx.tradeChannels.isTradeChannel(message.guildId, message.channelId)) {
    // Isolated: a scan failure must not swallow the [[card name]] reply below,
    // which is the path someone explicitly asked for.
    try {
      await handleTradeScan(ctx, message);
    } catch (error) {
      console.error("Trade scan failed", error);
    }
  }
  if (!message.content.includes("[[")) {
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
  const replies = await Promise.all(
    matches.map(async (match) => {
      if (match.type === "card") {
        const reply = await embedForCard(ctx, match.card, match.reference, message.guildId);
        return reply && { ...reply, card: match.card };
      }
      const embed =
        ruleIndex &&
        buildRuleEmbed({ entry: match.entry, index: ruleIndex, siteUrl: ctx.env.siteUrl });
      return embed && { embed, card: null, printingId: undefined };
    }),
  );
  const resolved = replies.filter((reply) => reply !== null);
  if (resolved.length === 0) {
    return;
  }
  // Buttons attach to the message, not to an embed, so a reply covering
  // several mentions carries one labelled button per card.
  const cards = resolved.flatMap((result) =>
    result.card ? [{ card: result.card, printingId: result.printingId }] : [],
  );
  const buttons = cards.map((entry) =>
    detailsButton(entry.card, entry.printingId, cards.length > 1),
  );
  await message.reply({
    embeds: resolved.map((result) => result.embed),
    ...(buttons.length > 0
      ? { components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)] }
      : {}),
    allowedMentions: { repliedUser: false },
  });
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
      // /link only exists when the group features are configured — an
      // unregistered command beats one that can only apologize.
      await readyClient.application.commands.set([
        CARD_COMMAND,
        DECK_COMMAND,
        RULE_COMMAND,
        ...(ctx.api.discordBot ? [LINK_COMMAND, TRADE_CHANNEL_COMMAND] : []),
      ]);
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
      if (interaction.isButton()) {
        await handleDetailsButton(ctx, interaction);
      } else if (interaction.isAutocomplete() && interaction.commandName === CARD_COMMAND.name) {
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
      } else if (
        interaction.isChatInputCommand() &&
        interaction.commandName === LINK_COMMAND.name
      ) {
        await handleLinkCommand(ctx, interaction);
      } else if (
        interaction.isChatInputCommand() &&
        interaction.commandName === TRADE_CHANNEL_COMMAND.name
      ) {
        await handleTradeChannelCommand(ctx, interaction);
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
