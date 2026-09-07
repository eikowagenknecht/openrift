import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardFan } from "./card-fan";

const IMAGE_URLS = [
  "https://img.example/a.webp",
  "https://img.example/b.webp",
  "https://img.example/c.webp",
  "https://img.example/d.webp",
  "https://img.example/e.webp",
];

const COLLECT_SETTLE_MS = 1500;

describe("CardFan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing until image URLs are available", () => {
    const { container } = render(<CardFan imageUrls={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one card button per fanned image", () => {
    const { container } = render(<CardFan imageUrls={IMAGE_URLS} />);
    expect(container.querySelectorAll("button").length).toBe(IMAGE_URLS.length);
  });

  it("keeps the fan cards out of the keyboard tab order", () => {
    const { container } = render(<CardFan imageUrls={IMAGE_URLS} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.tabIndex).toBe(-1);
    }
  });

  it("fires onAllCollected once every card is collected", () => {
    const onAllCollected = vi.fn();
    const { container } = render(
      <CardFan imageUrls={IMAGE_URLS} onAllCollected={onAllCollected} />,
    );
    for (const button of container.querySelectorAll("button")) {
      fireEvent.click(button);
    }
    expect(onAllCollected).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(COLLECT_SETTLE_MS);
    });
    expect(onAllCollected).toHaveBeenCalledTimes(1);
  });

  it("does not fire onAllCollected while cards remain", () => {
    const onAllCollected = vi.fn();
    const { container } = render(
      <CardFan imageUrls={IMAGE_URLS} onAllCollected={onAllCollected} />,
    );
    const firstButton = container.querySelector("button");
    expect(firstButton).not.toBeNull();
    fireEvent.click(firstButton as HTMLButtonElement);
    act(() => {
      vi.advanceTimersByTime(COLLECT_SETTLE_MS);
    });
    expect(onAllCollected).not.toHaveBeenCalled();
  });
});
