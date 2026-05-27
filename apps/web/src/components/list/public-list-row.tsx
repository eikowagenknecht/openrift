import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type { ListIntent, ListKind } from "@openrift/shared";
import { FolderIcon, HandshakeIcon, HeartIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { listKindIcon } from "@/components/list/create-list-dialog";
import { cn } from "@/lib/utils";

const INTENT_ICON: Record<ListIntent, ComponentType<SVGProps<SVGSVGElement>>> = {
  wish: HeartIcon,
  trade: HandshakeIcon,
  organize: FolderIcon,
};

const KIND_NOUN: Record<ListKind, { singular: string; plural: string }> = {
  card: { singular: "Card", plural: "Cards" },
  printing: { singular: "Printing", plural: "Printings" },
  copy: { singular: "Copy", plural: "Copies" },
};

interface PublicListRowProps {
  intent: ListIntent;
  kind: ListKind;
  name: string;
  entryCount: number;
  /** Optional inline slot between the name and the entry-count, e.g. visibility badges. */
  badges?: ReactNode;
}

/**
 * Read-only row summarising a list on public surfaces (user share bundle,
 * group member detail). Intent icon on the left, name in the middle, kind + entry
 * count on the right. Pass `render={<Link ... />}` to make the row navigable.
 *
 * @returns A row element rendered as the supplied `render` target (defaults to `div`).
 */
export function PublicListRow({
  intent,
  kind,
  name,
  entryCount,
  badges,
  className,
  render,
  ...props
}: PublicListRowProps & useRender.ComponentProps<"div">) {
  const IntentIcon = INTENT_ICON[intent];
  const KindIcon = listKindIcon(kind);
  const noun = entryCount === 1 ? KIND_NOUN[kind].singular : KIND_NOUN[kind].plural;
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "bg-card text-card-foreground hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-3 rounded-lg border p-3 transition-colors outline-none focus-visible:ring-2",
          className,
        ),
        children: (
          <>
            <IntentIcon className="text-muted-foreground size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
            {badges ? <span className="flex shrink-0 items-center gap-1">{badges}</span> : null}
            <span className="text-muted-foreground text-2xs inline-flex shrink-0 items-center gap-1">
              <KindIcon className="size-3" />
              {entryCount} {noun}
            </span>
          </>
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "public-list-row",
    },
  });
}
