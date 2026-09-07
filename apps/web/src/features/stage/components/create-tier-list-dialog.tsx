import { useNavigate } from "@tanstack/react-router";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCreateTierList } from "@/features/stage/hooks/use-tier-lists";

interface CreateTierListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTierListDialog({ open, onOpenChange }: CreateTierListDialogProps) {
  const [title, setTitle] = useState("");
  const navigate = useNavigate();
  const createTierList = useCreateTierList();

  const trimmedTitle = title.trim();

  const handleCreate = () => {
    createTierList.mutate(
      { title: trimmedTitle },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          setTitle("");
          void navigate({ to: "/tier-lists/$tierListId", params: { tierListId: created.id } });
        },
        // No toast: the global mutation error handler owns the failure message.
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New tier list</DialogTitle>
          <DialogDescription>Starts with tiers S to D.</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="new-tier-list-title">Title</FieldLabel>
          <Input
            id="new-tier-list-title"
            value={title}
            maxLength={120}
            placeholder="Origins — best commons"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={trimmedTitle === "" || createTierList.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
