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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCards } from "@/hooks/use-cards";
import { useCreateTierList } from "@/hooks/use-tier-lists";

/** Value used for the "no set" option; a Select can't carry a null value. */
const NO_SET = "__none__";

interface CreateTierListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Creates a tier list and opens its builder. The set is a scope hint, not a
 * gate: the pool is the whole catalogue either way, and picking one just
 * pre-filters it and labels the share page.
 *
 * @returns The create dialog node.
 */
export function CreateTierListDialog({ open, onOpenChange }: CreateTierListDialogProps) {
  const [title, setTitle] = useState("");
  const [setId, setSetId] = useState<string>(NO_SET);
  const navigate = useNavigate();
  const createTierList = useCreateTierList();
  // The catalogue is already in memory on any card surface, so the set list
  // comes from there rather than a second query.
  const { sets } = useCards();

  const trimmedTitle = title.trim();
  // BaseUI's Select doesn't resolve labels on its own, so the items list has to
  // travel with it whenever values differ from what is displayed.
  const setItems = [
    { value: NO_SET, label: "No particular set" },
    ...sets.map((set) => ({ value: set.id, label: set.name })),
  ];

  const handleCreate = () => {
    createTierList.mutate(
      { title: trimmedTitle, setId: setId === NO_SET ? null : setId },
      {
        onSuccess: (created) => {
          onOpenChange(false);
          setTitle("");
          setSetId(NO_SET);
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
          <DialogDescription>
            Starts on S / A / B / C / D. Rename or add tiers once you are in.
          </DialogDescription>
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
        <Field>
          <FieldLabel htmlFor="new-tier-list-set">Set</FieldLabel>
          <Select items={setItems} value={setId} onValueChange={(value) => setSetId(String(value))}>
            <SelectTrigger id="new-tier-list-set">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {setItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
