import { LinkIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BinderSheetPanel } from "@/features/groups/components/binder-sheet-panel";
import type { ShareImagePanelProps } from "@/features/groups/components/share-image-panel";
import { ShareImagePanel } from "@/features/groups/components/share-image-panel";
import { ShareLinkRow } from "@/features/groups/components/share-link-row";

interface ShareDialogLink {
  url: string | null;
  label: string;
  onCreate: () => void;
  creating?: boolean;
  onStop: () => void;
  stopping?: boolean;
  onReset?: () => void;
  resetting?: boolean;
}

interface ShareDialogPrint {
  shareUrl: string | null;
  defaultTitle: string;
  defaultSubtitle: string;
  filenameHint?: string;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  link?: ShareDialogLink;
  noLinkNote?: ReactNode;
  image?: ShareImagePanelProps;
  print?: ShareDialogPrint;
  children?: ReactNode;
}

/**
 * The app's one share dialog: a Link tab holding the share URL, its QR, any
 * surface-specific extras, and the create/stop lifecycle, an Image tab
 * hosting the {@link ShareImagePanel} when the surface has a server render,
 * and a Print tab hosting the {@link BinderSheetPanel} once a link exists.
 */
export function ShareDialog({
  open,
  onOpenChange,
  title,
  description,
  link,
  noLinkNote,
  image,
  print,
  children,
}: ShareDialogProps) {
  const [tab, setTab] = useState("link");
  const hasLinkSection = link !== undefined;
  const showTabs = hasLinkSection && (image !== undefined || print !== undefined);
  const sharing = link !== undefined && link.url !== null;
  const handleCreate = link?.onCreate;
  const handleStop = link?.onStop;
  const handleReset = link?.onReset;

  const lifecycle = link ? (
    <DialogFooter>
      {sharing && handleReset ? (
        <Button variant="outline" onClick={handleReset} disabled={link.resetting}>
          <RefreshCwIcon />
          Reset link
        </Button>
      ) : null}
      {sharing ? (
        <Button variant="destructive" onClick={handleStop} disabled={link.stopping}>
          <Trash2Icon />
          Stop sharing
        </Button>
      ) : (
        <Button onClick={handleCreate} disabled={link.creating}>
          <LinkIcon />
          Create link
        </Button>
      )}
    </DialogFooter>
  ) : null;

  const linkBody = link ? (
    <div className="flex flex-col gap-4">
      {link.url === null ? null : <ShareLinkRow url={link.url} label={link.label} />}
      {children}
    </div>
  ) : null;

  const printBody = print ? (
    print.shareUrl === null ? (
      <p className="text-muted-foreground text-sm">
        Create a share link first. The binder sheet carries a QR code that opens it.
      </p>
    ) : (
      <BinderSheetPanel
        shareUrl={print.shareUrl}
        defaultTitle={print.defaultTitle}
        defaultSubtitle={print.defaultSubtitle}
        filenameHint={print.filenameHint}
      />
    )
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {showTabs ? (
          <Tabs value={tab} onValueChange={setTab}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <TabsList>
                <TabsTrigger value="link">Link</TabsTrigger>
                {image ? <TabsTrigger value="image">Image</TabsTrigger> : null}
                {print ? <TabsTrigger value="print">Print</TabsTrigger> : null}
              </TabsList>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <TabsContent value="link">{linkBody}</TabsContent>
            {image ? (
              <TabsContent value="image">
                <ShareImagePanel {...image} />
              </TabsContent>
            ) : null}
            {print ? <TabsContent value="print">{printBody}</TabsContent> : null}
            {tab === "link" ? lifecycle : null}
          </Tabs>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {hasLinkSection ? linkBody : noLinkNote}
            {!hasLinkSection && image ? <ShareImagePanel {...image} /> : null}
            {lifecycle}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
