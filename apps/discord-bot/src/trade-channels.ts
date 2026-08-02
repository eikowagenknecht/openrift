import type { ApiClients } from "./api-client.js";

/** How often the trade-channel map is re-read, matching the catalog cadence. */
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Which channels of which guilds are opted into card-name scanning, held in
 * memory. Every message in every guild has to ask this question, so it cannot
 * be a request; the map is small (one row per linked server) and a stale entry
 * costs at most one refresh interval of scanning a channel that was just
 * turned off. `/tradechannel` writes through, so the server that changed the
 * setting sees it immediately.
 */
export class TradeChannelCache {
  private channels = new Map<string, Set<string>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly api: ApiClients;

  constructor(api: ApiClients) {
    this.api = api;
  }

  /**
   * Whether messages in this channel should be scanned. Unknown guilds and
   * channels are "no", so a failed refresh degrades to silence rather than to
   * scanning everything.
   *
   * @returns True when the channel is opted in.
   */
  isTradeChannel(guildId: string | null | undefined, channelId: string): boolean {
    return guildId ? (this.channels.get(guildId)?.has(channelId) ?? false) : false;
  }

  /** Applies a `/tradechannel` change locally, so it takes effect before the next refresh. */
  set(guildId: string, channelIds: string[]): void {
    if (channelIds.length === 0) {
      this.channels.delete(guildId);
      return;
    }
    this.channels.set(guildId, new Set(channelIds));
  }

  /**
   * Re-reads the whole map. A failure keeps the previous snapshot, like the
   * catalog cache — the alternative is a transient API blip silently turning
   * the feature off.
   *
   * @returns True when the refresh succeeded.
   */
  async refresh(): Promise<boolean> {
    if (!this.api.discordBot) {
      return false;
    }
    try {
      const response = await this.api.discordBot.tradeChannels({});
      this.channels = new Map(
        response.guilds.map((guild) => [guild.guildId, new Set(guild.channelIds)]),
      );
      return true;
    } catch (error) {
      console.error("trade-channel refresh failed", error);
      return false;
    }
  }

  /** Loads the map once and keeps it fresh. Safe to call when the feature is off. */
  async start(): Promise<void> {
    if (!this.api.discordBot) {
      return;
    }
    await this.refresh();
    this.timer ??= setInterval(() => {
      void this.refresh();
    }, REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
