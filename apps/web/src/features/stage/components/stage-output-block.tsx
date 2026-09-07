import { Link } from "@tanstack/react-router";
import { PlayIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverlayOutputPanel } from "@/features/stage/components/overlay-output-panel";
import { useUserId } from "@/lib/auth-session";

export function StageOutputBlock({
  onStart,
  canStart,
}: {
  onStart: () => void;
  canStart: boolean;
}) {
  const userId = useUserId();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Output</h2>
      <Tabs defaultValue="screen">
        <TabsList className="w-full">
          <TabsTrigger value="screen">This screen</TabsTrigger>
          <TabsTrigger value="obs">OBS</TabsTrigger>
        </TabsList>

        <TabsContent value="screen" className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            One card at a time, full screen, with nothing of the site around it. Point a window
            capture at this browser and your audience sees the card rather than a website.
          </p>
          <Button onClick={onStart} disabled={!canStart} className="w-full">
            <PlayIcon />
            Start presenting
          </Button>
          <p className="text-muted-foreground text-sm">
            What the card sits on is in the show&apos;s own settings: black, or a green or magenta
            ground to key out in your editor.
          </p>
        </TabsContent>

        <TabsContent value="obs" className="flex flex-col gap-3">
          {userId === null ? (
            <p className="text-muted-foreground text-sm">
              <Link
                to="/login"
                search={{ redirect: "/stage", email: undefined }}
                className="underline underline-offset-2"
              >
                Sign in
              </Link>{" "}
              to get a browser source link for OBS and push cards to it from here.
            </p>
          ) : (
            <OverlayOutputPanel />
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
