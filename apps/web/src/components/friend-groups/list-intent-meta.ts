import type { ListIntent, ListKind } from "@openrift/shared";
import { FolderIcon, HandshakeIcon, HeartIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export const LIST_INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};

export const LIST_INTENT_NOUN: Record<ListIntent, string> = {
  wish: "wishlist",
  trade: "tradelist",
  organize: "list",
};

export const LIST_KIND_NOUN: Record<ListKind, { singular: string; plural: string }> = {
  card: { singular: "Card", plural: "Cards" },
  printing: { singular: "Printing", plural: "Printings" },
  copy: { singular: "Copy", plural: "Copies" },
};
