import type { useRender } from "@base-ui/react/use-render";
import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import { FolderIcon, HandshakeIcon, HeartIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { CardLink } from "@/components/ui/card-link";
import { LIST_KIND_ICON } from "@/features/lists/components/create-list-dialog";
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
  badges?: ReactNode;
}

export function PublicListRow({
  intent,
  kind,
  name,
  entryCount,
  badges,
  className,
  render,
  ...props
}: PublicListRowProps & useRender.ComponentProps<"a">) {
  const IntentIcon = INTENT_ICON[intent];
  const KindIcon = LIST_KIND_ICON[kind];
  const noun = entryCount === 1 ? KIND_NOUN[kind].singular : KIND_NOUN[kind].plural;
  return (
    <CardLink
      render={render}
      className={cn("flex-row items-start gap-3 p-3", className)}
      {...props}
    >
      <IntentIcon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium break-words">{name}</span>
        {badges}
      </div>
      <span className="text-muted-foreground text-2xs mt-1 inline-flex shrink-0 items-center gap-1">
        <KindIcon className="size-3" />
        {entryCount} {noun}
      </span>
    </CardLink>
  );
}
