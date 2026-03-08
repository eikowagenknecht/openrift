import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import type { CardFields } from "@/lib/card-fields";

import {
  BUTTON_PAD,
  CARD_ASPECT,
  COMPACT_THRESHOLD,
  GAP,
  LABEL_WRAPPER_MT,
  META_LABEL_PY,
  META_LINE_GAP,
  META_LINE_HEIGHT,
  META_LINE_HEIGHT_SM,
  PRICE_LINE_HEIGHT,
  PRICE_MT,
  SM_BREAKPOINT,
} from "./card-grid-constants";

type VRow = { kind: "header" } | { kind: "cards" };

interface CardGridDebugProps {
  enabled: boolean;
  virtualizer: Virtualizer<Window, Element>;
  virtualRows: VRow[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  columns: number;
  labelHeight: number;
  thumbWidth: number;
  cardFields: CardFields | undefined;
  estimateSize: (index: number) => number;
}

function diff(label: string, exp: number, meas: number): string {
  const e = exp.toFixed(1);
  const m = meas.toFixed(1);
  const ok = e === m ? "✓" : "✗";
  return `${ok} ${label}: exp=${e} meas=${m}`;
}

export function CardGridDebug({
  enabled,
  virtualizer,
  virtualRows,
  containerRef,
  columns,
  labelHeight,
  thumbWidth,
  cardFields,
  estimateSize,
}: CardGridDebugProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const jumpLogRef = useRef<string[]>([]);
  const prevTotalRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const check = () => {
      const el = elRef.current;
      if (!el) {
        return;
      }
      const total = virtualizer.getTotalSize();
      const items: VirtualItem[] = virtualizer.getVirtualItems();
      const prevTotal = prevTotalRef.current;

      // Expected values from constants
      const containerWidth = containerRef.current?.offsetWidth ?? 0;
      const cardWidth = (containerWidth - GAP * (columns - 1)) / columns;
      const expImgH = (cardWidth - BUTTON_PAD * 2) * CARD_ASPECT;
      const expRow = estimateSize(items[0]?.index ?? 0);

      const lines = [
        `scroll=${Math.round(globalThis.scrollY)} total=${total} items=${items.length}`,
      ];

      // Find first card row and measure its DOM
      const f = cardFields ?? { number: true, title: true, type: true, rarity: true, price: true };
      const hasMetaFields = f.number || f.title || f.type || f.rarity;
      const hasLabel = hasMetaFields || f.price;
      const firstCard = items.find((it) => virtualRows[it.index]?.kind === "cards");
      if (firstCard) {
        const rowEl = document.querySelector(`[data-index="${firstCard.index}"]`);
        const gridEl = rowEl?.firstElementChild;
        const btn = gridEl?.querySelector("button");
        const imgDiv = btn?.children[0];
        const lblDiv = hasLabel ? btn?.children[1] : undefined;
        const metaEl = hasMetaFields && lblDiv ? lblDiv.children[0] : undefined;
        const priceEl = f.price && lblDiv ? lblDiv.children[hasMetaFields ? 1 : 0] : undefined;
        const measRow = firstCard.size;
        const measBtn = btn?.getBoundingClientRect().height ?? 0;
        const measImg = imgDiv?.getBoundingClientRect().height ?? 0;

        lines.push(
          diff("row", expRow, measRow),
          diff("  imgH", expImgH, measImg),
          diff("  pad*2", BUTTON_PAD * 2, BUTTON_PAD * 2),
        );

        if (hasLabel) {
          const measLblMt = lblDiv ? Number.parseFloat(getComputedStyle(lblDiv).marginTop) : 0;
          lines.push(diff("  lblMt", LABEL_WRAPPER_MT, measLblMt));
        }
        if (hasMetaFields) {
          const measMeta = metaEl?.getBoundingClientRect().height ?? 0;
          const compact = thumbWidth < COMPACT_THRESHOLD;
          const aboveSm = globalThis.innerWidth >= SM_BREAKPOINT;
          const hasLine1 = f.number || f.title;
          const hasLine2 = f.type || f.rarity;
          const line1Height = !compact && aboveSm ? META_LINE_HEIGHT_SM : META_LINE_HEIGHT;
          let expMeta = META_LABEL_PY;
          if (hasLine1) {
            expMeta += line1Height;
          }
          if (hasLine1 && hasLine2) {
            expMeta += META_LINE_GAP;
          }
          if (hasLine2) {
            expMeta += META_LINE_HEIGHT;
          }
          lines.push(diff("  meta", expMeta, measMeta));
        }
        if (f.price) {
          const measPriceMt = priceEl ? Number.parseFloat(getComputedStyle(priceEl).marginTop) : 0;
          const measPrice = priceEl?.getBoundingClientRect().height ?? 0;
          lines.push(
            diff("  priceMt", PRICE_MT, measPriceMt),
            diff("  priceH", PRICE_LINE_HEIGHT, measPrice),
          );
        }

        lines.push(diff("  btn", Math.ceil(expImgH) + BUTTON_PAD * 2 + labelHeight, measBtn));
      }

      // Log jumps
      if (prevTotal && Math.abs(total - prevTotal) > 1) {
        jumpLogRef.current.push(`JUMP ${prevTotal}→${total} (Δ${total - prevTotal})`);
        if (jumpLogRef.current.length > 6) {
          jumpLogRef.current.splice(0, jumpLogRef.current.length - 6);
        }
      }
      prevTotalRef.current = total;

      el.textContent = [...lines, ...jumpLogRef.current].join("\n");
    };
    check();
    globalThis.addEventListener("scroll", check, { passive: true });
    return () => globalThis.removeEventListener("scroll", check);
  });

  if (!enabled) {
    return null;
  }

  return (
    <div
      ref={elRef}
      style={{
        position: "fixed",
        top: 60,
        left: 4,
        right: 4,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        color: "#0f0",
        fontSize: 10,
        fontFamily: "monospace",
        padding: 6,
        borderRadius: 6,
        whiteSpace: "pre",
        pointerEvents: "none",
        maxHeight: "40vh",
        overflow: "hidden",
      }}
    />
  );
}
