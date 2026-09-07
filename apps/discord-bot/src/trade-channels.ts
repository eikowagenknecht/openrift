import type { ApiClients } from "./api-client.js";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export class TradeChannelCache {
  private channels = new Map<string, Set<string>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly api: ApiClients;

  constructor(api: ApiClients) {
    this.api = api;
  }

  // Unknown guilds and channels default to false: a failed refresh must not scan everything.
  isTradeChannel(guildId: string | null | undefined, channelId: string): boolean {
    return guildId ? (this.channels.get(guildId)?.has(channelId) ?? false) : false;
  }

  set(guildId: string, channelIds: string[]): void {
    if (channelIds.length === 0) {
      this.channels.delete(guildId);
      return;
    }
    this.channels.set(guildId, new Set(channelIds));
  }

  // A failed refresh keeps the previous map; it does not clear it.
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
