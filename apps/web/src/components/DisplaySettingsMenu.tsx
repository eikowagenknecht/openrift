import { Settings } from "lucide-react";
import { useState } from "react";

import changelogMd from "@/CHANGELOG.md?raw";
import type { CardFields } from "@/components/cards/CardThumbnail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSWUpdate } from "@/hooks/use-sw-update";
import { parseChangelog } from "@/lib/changelog";

const changelogGroups = parseChangelog(changelogMd);

interface DisplaySettingsMenuProps {
  showImages: boolean;
  onShowImagesChange: (show: boolean) => void;
  cardFields: CardFields;
  onCardFieldsChange: (update: Partial<CardFields>) => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
}

export function DisplaySettingsMenu({
  showImages,
  onShowImagesChange,
  cardFields,
  onCardFieldsChange,
  darkMode,
  onDarkModeChange,
}: DisplaySettingsMenuProps) {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { needRefresh, applyUpdate } = useSWUpdate();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Display settings">
            <Settings className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            checked={showImages}
            onCheckedChange={onShowImagesChange}
            onSelect={(e) => e.preventDefault()}
          >
            Show card images
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.number}
            onCheckedChange={(v) => onCardFieldsChange({ number: v })}
            onSelect={(e) => e.preventDefault()}
          >
            Show ID
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.title}
            onCheckedChange={(v) => onCardFieldsChange({ title: v })}
            onSelect={(e) => e.preventDefault()}
          >
            Show title
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.type}
            onCheckedChange={(v) => onCardFieldsChange({ type: v })}
            onSelect={(e) => e.preventDefault()}
          >
            Show type
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.supertype}
            onCheckedChange={(v) => onCardFieldsChange({ supertype: v })}
            onSelect={(e) => e.preventDefault()}
          >
            Show supertype
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.rarity}
            onCheckedChange={(v) => onCardFieldsChange({ rarity: v })}
            onSelect={(e) => e.preventDefault()}
          >
            Show rarity
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={darkMode}
            onCheckedChange={onDarkModeChange}
            onSelect={(e) => e.preventDefault()}
          >
            Dark mode
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {needRefresh && (
            <DropdownMenuItem
              onSelect={() => applyUpdate()}
              className="text-xs font-medium text-blue-600 dark:text-blue-400"
            >
              Update available — tap to reload
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => setChangelogOpen(true)}
            className="flex justify-between text-xs text-muted-foreground"
          >
            <span>v{__COMMIT_HASH__}</span>
            <span>What's new</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={changelogOpen} onOpenChange={setChangelogOpen}>
        <SheetContent className="flex flex-col gap-0 overflow-hidden">
          <SheetHeader className="pb-4">
            <SheetTitle>What's new</SheetTitle>
            <SheetDescription>Recent changes and improvements to OpenRift.</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">
            {changelogGroups.map((group) => (
              <div key={group.date} className="mb-6">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{group.date}</p>
                <ul className="space-y-2">
                  {group.entries.map((entry, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium uppercase leading-none ${
                          entry.type === "feat"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}
                      >
                        {entry.type}
                      </span>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
