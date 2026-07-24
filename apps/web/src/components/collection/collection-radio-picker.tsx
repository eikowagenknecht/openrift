import type { CollectionResponse } from "@openrift/shared";
import { PlusSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/** Sentinel value for the "create a new collection" radio option. */
export const NEW_COLLECTION_OPTION = "__new__";

interface CollectionRadioPickerProps {
  collections: CollectionResponse[];
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  /** Name for the collection created when the "New collection" row is picked. */
  newName: string;
  onNewNameChange: (name: string) => void;
  /** Namespaces the radio input ids so two pickers can coexist in one page. */
  idPrefix: string;
}

/**
 * Radio list of the viewer's collections plus a "New collection" row with an
 * inline name input. The dialogs that pick a target for incoming copies
 * (completed trades, product adds) share this so the rows read identically.
 * @returns The radio group element.
 */
export function CollectionRadioPicker({
  collections,
  selectedId,
  onSelectedIdChange,
  newName,
  onNewNameChange,
  idPrefix,
}: CollectionRadioPickerProps) {
  return (
    <>
      <RadioGroup value={selectedId} onValueChange={(value) => onSelectedIdChange(String(value))}>
        {collections.map((collection) => {
          const inputId = `${idPrefix}-${collection.id}`;
          return (
            <label
              key={collection.id}
              htmlFor={inputId}
              className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
            >
              <RadioGroupItem id={inputId} value={collection.id} />
              <span className="min-w-0 flex-1 truncate font-medium">{collection.name}</span>
              {collection.isInbox ? (
                <Badge variant="secondary" className="shrink-0">
                  Inbox
                </Badge>
              ) : null}
              {collection.groupName ? (
                // Group-shared: adding here makes the cards visible to that group.
                <Badge variant="outline" className="max-w-32 shrink-0 truncate">
                  {collection.groupName}
                </Badge>
              ) : null}
              <span className="text-muted-foreground shrink-0 text-xs">
                {collection.copyCount} {collection.copyCount === 1 ? "card" : "cards"}
              </span>
            </label>
          );
        })}
        <label
          htmlFor={`${idPrefix}-new`}
          className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2"
        >
          <RadioGroupItem id={`${idPrefix}-new`} value={NEW_COLLECTION_OPTION} />
          <span className="flex-1 font-medium">New collection</span>
          <PlusSquareIcon className="text-muted-foreground size-4 shrink-0" />
        </label>
      </RadioGroup>

      {selectedId === NEW_COLLECTION_OPTION ? (
        <Input
          value={newName}
          onChange={(event) => onNewNameChange(event.target.value)}
          placeholder="Collection name"
          aria-label="New collection name"
        />
      ) : null}
    </>
  );
}
