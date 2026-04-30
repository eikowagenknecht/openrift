import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketplaceLink, trackMarketplaceClick } from "./marketplace-link";

describe("trackMarketplaceClick", () => {
  const track = vi.fn();

  beforeEach(() => {
    track.mockClear();
    globalThis.umami = { track };
  });

  afterEach(() => {
    globalThis.umami = undefined;
  });

  it("forwards marketplace and url to umami.track", () => {
    trackMarketplaceClick("tcgplayer", "https://www.tcgplayer.com/product/42");
    expect(track).toHaveBeenCalledWith("marketplace-click", {
      marketplace: "tcgplayer",
      url: "https://www.tcgplayer.com/product/42",
    });
  });

  it("does not throw when umami is not loaded", () => {
    globalThis.umami = undefined;
    expect(() => {
      trackMarketplaceClick("cardmarket", "https://www.cardmarket.com/foo");
    }).not.toThrow();
  });
});

describe("MarketplaceLink", () => {
  const track = vi.fn();

  beforeEach(() => {
    track.mockClear();
    globalThis.umami = { track };
  });

  afterEach(() => {
    globalThis.umami = undefined;
  });

  it("records a click on the rendered anchor", async () => {
    render(
      <MarketplaceLink marketplace="cardtrader" href="https://www.cardtrader.com/en/cards/9">
        Buy
      </MarketplaceLink>,
    );

    const link = screen.getByRole("link", { name: "Buy" });
    expect(link).toHaveAttribute("href", "https://www.cardtrader.com/en/cards/9");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");

    await userEvent.click(link);
    expect(track).toHaveBeenCalledWith("marketplace-click", {
      marketplace: "cardtrader",
      url: "https://www.cardtrader.com/en/cards/9",
    });
  });

  it("still calls a caller-provided onClick handler", async () => {
    const onClick = vi.fn();
    render(
      <MarketplaceLink
        marketplace="tcgplayer"
        href="https://www.tcgplayer.com/product/1"
        onClick={onClick}
      >
        Buy
      </MarketplaceLink>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Buy" }));
    expect(track).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
