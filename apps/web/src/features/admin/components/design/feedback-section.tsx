import { InfoIcon, PackageIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Code } from "@/components/ui/code";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

import { Demo, DemoGrid, DemoSection } from "./demo-primitives";

export function FeedbackSection() {
  return (
    <DemoSection
      id="feedback"
      title="Feedback & status"
      note="Toasts via sonner. Alert for inline callouts, Empty for zero states, Skeleton while loading."
    >
      <DemoGrid>
        <Demo name="Toaster (sonner)" hint="Transient result feedback after an action.">
          <Button variant="outline" onClick={() => toast.success("Added 4× Teemo, Swift Scout")}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast.error("Could not copy deck code")}>
            Error toast
          </Button>
        </Demo>
        <Demo name="Alert" hint="Persistent inline callout inside the page flow.">
          <div className="w-full space-y-2">
            <Alert>
              <InfoIcon />
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>Prices refresh once a day.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Import failed</AlertTitle>
              <AlertDescription>3 lines could not be matched to the catalog.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Rotation next week</AlertTitle>
              <AlertDescription>Two of your decks lose cards on Sept 10.</AlertDescription>
            </Alert>
            <Alert variant="info">
              <InfoIcon />
              <AlertTitle>Shared with your group</AlertTitle>
              <AlertDescription>Everyone in Tuesday Night Crew can see this list.</AlertDescription>
            </Alert>
          </div>
        </Demo>
        <Demo
          name="Callout"
          hint="Muted note box for intro banners and asides that carry their own layout. Alert is the icon + title + description form."
        >
          <Callout className="w-full text-sm">
            <p className="font-medium">Welcome to your collection</p>
            <p className="text-muted-foreground mt-0.5">
              Tap the + on any card to add it. Paste a deck code with <Code>Ctrl+V</Code> to import
              one.
            </p>
          </Callout>
        </Demo>
        <Demo name="Code" hint="Inline code chip in help copy: a path, a key, a command.">
          <p className="text-sm">
            Send a <Code>POST</Code> to <Code>/api/v1/ingest/deck-check</Code> with your{" "}
            <Code>orpk_…</Code> key.
          </p>
        </Demo>
        <Demo name="Progress" hint="Determinate completion (imports, collection goals).">
          <Progress value={64} className="w-40" aria-label="Collection progress" />
        </Demo>
        <Demo name="Skeleton" hint="Loading placeholder shaped like the coming content.">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </Demo>
        <Demo name="Avatar" hint="Raw primitive; app code goes through UserAvatar (Composites).">
          <Avatar>
            <AvatarFallback>SK</AvatarFallback>
          </Avatar>
        </Demo>
        <Demo name="Empty" hint="Zero state with icon, copy, and one clear next action.">
          <Empty className="w-full border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageIcon />
              </EmptyMedia>
              <EmptyTitle>No decks yet</EmptyTitle>
              <EmptyDescription>Build your first deck to see it here.</EmptyDescription>
            </EmptyHeader>
            <Button size="sm">
              <PlusIcon /> New deck
            </Button>
          </Empty>
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}
