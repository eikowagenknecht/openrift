import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

import {
  BUTTON_PAD,
  CARD_ASPECT,
  GAP,
  LABEL_WRAPPER_MT,
  META_LABEL_PY,
  META_LINE_GAP,
  META_LINE_HEIGHT,
  PRICE_LINE_HEIGHT,
  PRICE_MT,
} from "./card-grid-constants";

type VRow = { kind: "header" } | { kind: "cards" };

interface CardGridDebugProps {
  enabled: boolean;
  virtualizer: Virtualizer<Window, Element>;
  virtualRows: VRow[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  columns: number;
  labelHeight: number;
  estimateRowHeight: (index: number) => number;
}

// ── Tree types & rendering ──────────────────────────────────────────

/**
 * Every node shows:  label  exp -> meas  check/cross.
 * Composite nodes show their formula so you can see which children sum
 * to the parent.  Mismatches at any level propagate visually -- nothing
 * is hidden behind tolerances.
 */
interface Node {
  label: string;
  /** Expected value (from constants / formula). */
  exp: number;
  /** Measured value (from DOM). */
  meas: number;
  /** Shown after ✓/✗ — formula for composite nodes, context for leaves. */
  note?: string;
  children?: Node[];
}

function match(n: Node): boolean {
  return Math.abs(n.exp - n.meas) < 0.5;
}

function fmtNode(n: Node, prefix: string, connector: string): string {
  const ok = match(n);
  const mark = ok ? "✓" : "✗";
  const vals = ok ? `${n.meas}` : `${n.meas} exp=${n.exp}`;
  const note = n.note ? `  ${n.note}` : "";
  return `${prefix}${connector}${n.label} ${vals} ${mark}${note}`;
}

function renderChildren(children: Node[], indent: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const last = i === children.length - 1;
    const connector = last ? "└ " : "├ ";
    const nextIndent = indent + (last ? "  " : "│ ");
    out.push(fmtNode(child, indent, connector));
    if (child.children) {
      out.push(...renderChildren(child.children, nextIndent));
    }
  }
  return out;
}

function renderTree(root: Node): string[] {
  const lines = [fmtNode(root, "", "")];
  if (root.children) {
    lines.push(...renderChildren(root.children, ""));
  }
  return lines;
}

// ── Component ───────────────────────────────────────────────────────

export function CardGridDebug({
  enabled,
  virtualizer,
  virtualRows,
  containerRef,
  columns,
  labelHeight,
  estimateRowHeight,
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

      // Derived layout values — mirrors estimateRowHeight logic
      const containerWidth = containerRef.current?.offsetWidth ?? 0;
      const cardWidth = (containerWidth - GAP * (columns - 1)) / columns;
      const expImgH = (cardWidth - BUTTON_PAD * 2) * CARD_ASPECT;
      const expRow = estimateRowHeight(items[0]?.index ?? 0);

      const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const interLoaded = document.fonts.check('12px "Inter Variable"');
      const lines = [
        `scroll=${Math.round(globalThis.scrollY)} total=${total} items=${items.length} cols=${columns} cW=${cardWidth.toFixed(0)} rem=${rootFontSize} inter=${interLoaded}`,
      ];

      // Find first card row and build measurement tree
      const firstCard = items.find((it) => virtualRows[it.index]?.kind === "cards");
      if (firstCard) {
        const rowEl = document.querySelector(`[data-index="${firstCard.index}"]`);
        const gridEl = rowEl?.firstElementChild;
        const btn = gridEl?.querySelector("button");
        const imgDiv = btn?.children[0];
        const lblDiv = btn ? btn.children[btn.childElementCount - 1] : undefined;
        const metaEl = lblDiv ? lblDiv.children[0] : undefined;
        const priceEl = lblDiv ? lblDiv.children[1] : undefined;

        // Row-level measurements — use raw getBoundingClientRect for fractional
        // precision (firstCard.size is the virtualizer's rounded integer).
        const virtSize = firstCard.size;
        const measRow = rowEl?.getBoundingClientRect().height ?? virtSize;
        const measImg = imgDiv?.getBoundingClientRect().height ?? 0;
        const btnCS = btn ? getComputedStyle(btn) : undefined;
        const measPadT = btnCS ? Number.parseFloat(btnCS.paddingTop) : 0;
        const measPadB = btnCS ? Number.parseFloat(btnCS.paddingBottom) : 0;

        const rowChildren: Node[] = [
          { label: "padT", exp: BUTTON_PAD, meas: measPadT },
          { label: "imgH", exp: expImgH, meas: measImg },
        ];

        // Label area — margin is outside the element, so it's a row-level sibling
        if (lblDiv) {
          const measLblMt = Number.parseFloat(getComputedStyle(lblDiv as Element).marginTop);
          const measLblH = (lblDiv as Element).getBoundingClientRect().height;
          rowChildren.push({ label: "lblMt", exp: LABEL_WRAPPER_MT, meas: measLblMt });
          const labelChildren: Node[] = [];

          // Meta subtree
          if (metaEl) {
            const measMeta = (metaEl as Element).getBoundingClientRect().height;
            const metaCS = getComputedStyle(metaEl as Element);
            const measPy =
              Number.parseFloat(metaCS.paddingTop) + Number.parseFloat(metaCS.paddingBottom);

            const expMeta = META_LABEL_PY + META_LINE_HEIGHT + META_LINE_GAP + META_LINE_HEIGHT;

            const metaChildren: Node[] = [{ label: "py", exp: META_LABEL_PY, meas: measPy }];

            const l1 = (metaEl as Element).children[0] as HTMLElement | undefined;
            const l1Rect = l1?.getBoundingClientRect();
            const l1CS = l1 ? getComputedStyle(l1) : undefined;
            const l1Info = l1CS
              ? `lh=${l1CS.lineHeight} fs=${l1CS.fontSize} font=${l1CS.fontFamily.split(",")[0]}`
              : "";
            const l1Box = l1
              ? `rect=${l1Rect?.height} offset=${l1.offsetHeight} scroll=${l1.scrollHeight} overflow=${l1CS?.overflow}`
              : "";
            metaChildren.push({
              label: "L1",
              exp: META_LINE_HEIGHT,
              meas: l1Rect?.height ?? 0,
              note: `text-xs ${l1Info}\n          ${l1Box}`,
            });

            const l2 = (metaEl as Element).children[1];
            const l2Rect = l2?.getBoundingClientRect();
            const measGap = l1Rect && l2Rect ? l2Rect.top - l1Rect.bottom : 0;
            metaChildren.push({
              label: "gap",
              exp: META_LINE_GAP,
              meas: measGap,
            });
            metaChildren.push({
              label: "L2",
              exp: META_LINE_HEIGHT,
              meas: l2?.getBoundingClientRect().height ?? 0,
              note: "text-xs",
            });

            labelChildren.push({
              label: "meta",
              exp: expMeta,
              meas: measMeta,
              note: "py+L1+gap+L2",
              children: metaChildren,
            });
          }

          // Price subtree
          if (priceEl) {
            const measPriceMt = Number.parseFloat(getComputedStyle(priceEl as Element).marginTop);
            const measPriceH = (priceEl as Element).getBoundingClientRect().height;
            labelChildren.push({
              label: "price",
              exp: PRICE_MT + PRICE_LINE_HEIGHT,
              meas: measPriceMt + measPriceH,
              note: "mt+h",
              children: [
                { label: "mt", exp: PRICE_MT, meas: measPriceMt },
                { label: "h", exp: PRICE_LINE_HEIGHT, meas: measPriceH },
              ],
            });
          }

          rowChildren.push({
            label: "label",
            exp: labelHeight - LABEL_WRAPPER_MT,
            meas: measLblH,
            note: "meta+price",
            children: labelChildren,
          });
        }
        rowChildren.push({ label: "padB", exp: BUTTON_PAD, meas: measPadB });

        // Tree: fractional expected (from constants, before ceil) vs fractional
        // DOM measurement.  This is where you fix constant mismatches.
        const rawSum = expImgH + BUTTON_PAD * 2 + labelHeight;

        lines.push(
          ...renderTree({
            label: "row",
            exp: rawSum,
            meas: measRow,
            note: "imgH+pad+label",
            children: rowChildren,
          }),
        );

        // Virtualizer line: integer comparison that drives scroll stability.
        // est = estimateRowHeight (our prediction), virt = what the virtualizer stored.
        const estOk = expRow === virtSize ? "✓" : "✗";
        lines.push(`est=${expRow} virt=${virtSize} ${estOk}  ⌈${rawSum}⌉→${expRow}`);
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
