import { LinkIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import type { ShareImagePanelProps } from "@/components/share/share-image-panel";
import { ShareImagePanel } from "@/components/share/share-image-panel";
import { ShareLinkRow } from "@/components/share/share-link-row";
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

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  link?: ShareDialogLink;
  noLinkNote?: ReactNode;
  image?: ShareImagePanelProps;
  children?: ReactNode;
}

/**
 * The app's one share dialog: a Link tab holding the share URL, its QR, any
 * surface-specific extras, and the create/stop lifecycle, plus an Image tab
 * hosting the {@link ShareImagePanel} when the surface has a server render.
 */
export function ShareDialog({
  open,
  onOpenChange,
  title,
  description,
  link,
  noLinkNote,
  image,
  children,
}: ShareDialogProps) {
  const [tab, setTab] = useState("link");
  const hasLinkSection = link !== undefined;
  const showTabs = hasLinkSection && image !== undefined;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {showTabs ? (
          <Tabs value={tab} onValueChange={setTab}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <TabsList>
                <TabsTrigger value="link">Link</TabsTrigger>
                <TabsTrigger value="image">Image</TabsTrigger>
              </TabsList>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <TabsContent value="link">{linkBody}</TabsContent>
            <TabsContent value="image">{image ? <ShareImagePanel {...image} /> : null}</TabsContent>
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
