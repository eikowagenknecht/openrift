import type { TournamentDetailResponse } from "@openrift/shared";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUpdateTournament } from "@/hooks/use-tournaments";

/**
 * The tournament's display name, edited in place and saved explicitly so a
 * half-typed name never reaches the server.
 * @returns The name card.
 */
export function NameCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const updateTournament = useUpdateTournament();
  const [name, setName] = useState(detail.name);

  async function save() {
    try {
      await updateTournament.mutateAsync({ id: detail.id, name: name.trim() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <Card id="name" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Name</CardTitle>
        <CardDescription>The tournament&apos;s display name.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex max-w-sm gap-2">
          <Input
            id="t-rename"
            value={name}
            maxLength={120}
            disabled={locked}
            aria-label="Tournament name"
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            disabled={
              locked || !name.trim() || name.trim() === detail.name || updateTournament.isPending
            }
            onClick={() => void save()}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
