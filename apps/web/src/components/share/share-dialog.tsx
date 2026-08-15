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

/** Lifecycle wiring for the public share link. */
interface ShareDialogLink {
  /** The live share URL, or null while the thing isn't shared. */
  url: string | null;
  /** Accessible name for the link field, e.g. "Deck share link". */
  label: string;
  onCreate: () => void;
  creating?: boolean;
  onStop: () => void;
  stopping?: boolean;
  /** Rotates the token to a fresh URL; only surfaces that support it pass one. */
  onReset?: () => void;
  resetting?: boolean;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title, e.g. "Share deck". */
  title: string;
  /** Sentence under the title; callers switch it on the shared state. */
  description: ReactNode;
  /**
   * The share-link section and its lifecycle footer. Omit for surfaces that
   * have no link at all (a browser-local deck), which renders the image tab
   * alone with `noLinkNote` explaining why.
   */
  link?: ShareDialogLink;
  /** Shown in place of the link section when `link` is omitted. */
  noLinkNote?: ReactNode;
  /** The Image tab; omit on surfaces with no server-rendered image. */
  image?: ShareImagePanelProps;
  /** Extra Link-tab content below the link row (post-to-chat, cross-links). */
  children?: ReactNode;
}

/**
 * The app's one share dialog: a Link tab holding the share URL, its QR, any
 * surface-specific extras, and the create/stop lifecycle, plus an Image tab
 * hosting the {@link ShareImagePanel} when the surface has a server render.
 *
 * Every share surface (deck, list, collection, tier list) composes this shell
 * instead of assembling its own dialog, which is what keeps the lifecycle
 * buttons, tab order, and image controls identical across the app.
 *
 * @returns The share dialog node.
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
