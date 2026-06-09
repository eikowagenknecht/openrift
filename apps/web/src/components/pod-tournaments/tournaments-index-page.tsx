import type { PodTournamentStatus } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon, TrophyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreatePodTournament, usePodTournaments } from "@/hooks/use-pod-tournaments";
import { cn, PAGE_PADDING } from "@/lib/utils";

const STATUS_LABEL: Record<PodTournamentStatus, string> = {
  setup: "Not started",
  running: "In progress",
  completed: "Completed",
};

export function TournamentsIndexPage() {
  const { data } = usePodTournaments();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", PAGE_PADDING)}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Heading level={1}>Your tournaments</Heading>
          <p className="text-muted-foreground">Run a Swiss-style free-for-all pod event.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon /> Create
        </Button>
      </header>

      {data.items.length === 0 ? (
        <p className="text-muted-foreground">No tournaments yet. Create one to get started.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.items.map((tournament) => (
            <li key={tournament.id}>
              <Link to="/tournaments/run/$id" params={{ id: tournament.id }}>
                <Card className="hover:border-primary h-full transition-colors">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrophyIcon className="size-4 shrink-0" />
                      {tournament.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>{STATUS_LABEL[tournament.status]}</span>
                    <span>{tournament.activePlayerCount} players</span>
                    <span>
                      {tournament.roundCount} round{tournament.roundCount === 1 ? "" : "s"}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateTournamentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CreateTournamentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const navigate = useNavigate();
  const createTournament = useCreatePodTournament();
  const [name, setName] = useState("");

  async function handleCreate() {
    if (!name.trim()) {
      return;
    }
    try {
      const tournament = await createTournament.mutateAsync({ name: name.trim() });
      onOpenChange(false);
      setName("");
      void navigate({ to: "/tournaments/run/$id", params: { id: tournament.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create tournament");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create tournament</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pt-name">Name</Label>
          <Input
            id="pt-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            placeholder="Summoner Skirmish"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleCreate();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || createTournament.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
