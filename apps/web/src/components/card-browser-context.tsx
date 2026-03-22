import type { Printing } from "@openrift/shared";
import { createContext, use } from "react";

interface CardBrowserContextValue {
  printingsByCardId: Map<string, Printing[]>;
  priceRangeByCardId: Map<string, { min: number; max: number }> | null;
  ownedCounts: Map<string, number> | undefined;
  view: "cards" | "printings";
  onCardClick: (printing: Printing) => void;
  onSiblingClick: (printing: Printing) => void;
  onAddCard?: (printing: Printing, anchorEl: HTMLElement) => void;
  siblingPrintings: Printing[];
}

export const CardBrowserContext = createContext<CardBrowserContextValue | null>(null);

export function useCardBrowserContext(): CardBrowserContextValue {
  const ctx = use(CardBrowserContext);
  if (!ctx) {
    throw new Error("useCardBrowserContext must be used within a CardBrowserContext.Provider");
  }
  return ctx;
}
