import type { ListIntent } from "@openrift/shared";
import { FolderIcon, HandshakeIcon, HeartIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/** The icon each list intent renders with across group surfaces. */
export const LIST_INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};

/** The user-facing noun for each list intent ("wishlist", never "intent"). */
export const LIST_INTENT_NOUN: Record<ListIntent, string> = {
  wish: "wishlist",
  trade: "tradelist",
  organize: "list",
};
