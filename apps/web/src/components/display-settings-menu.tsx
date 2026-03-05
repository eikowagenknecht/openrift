import { RefreshCw, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import changelogMd from "@/CHANGELOG.md?raw";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSWUpdate } from "@/hooks/use-sw-update";
import type { CardFields } from "@/lib/card-fields";
import { parseChangelog } from "@/lib/changelog";

const changelogGroups = parseChangelog(changelogMd);

interface DisplaySettingsMenuProps {
  showImages: boolean;
  onShowImagesChange: (show: boolean) => void;
  richEffects: boolean;
  onRichEffectsChange: (value: boolean) => void;
  cardFields: CardFields;
  onCardFieldsChange: (update: Partial<CardFields>) => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
}

export function DisplaySettingsMenu({
  showImages,
  onShowImagesChange,
  richEffects,
  onRichEffectsChange,
  cardFields,
  onCardFieldsChange,
  darkMode,
  onDarkModeChange,
}: DisplaySettingsMenuProps) {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { needRefresh, applyUpdate, checkForUpdate } = useSWUpdate();
  const [checking, setChecking] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Display settings" />}
        >
          <Settings className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem checked={showImages} onCheckedChange={onShowImagesChange}>
            Show card images
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={richEffects} onCheckedChange={onRichEffectsChange}>
            Rich effects
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={cardFields.number}
            onCheckedChange={(v) => onCardFieldsChange({ number: v })}
          >
            Show ID
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.title}
            onCheckedChange={(v) => onCardFieldsChange({ title: v })}
          >
            Show title
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.type}
            onCheckedChange={(v) => onCardFieldsChange({ type: v })}
          >
            Show type
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.rarity}
            onCheckedChange={(v) => onCardFieldsChange({ rarity: v })}
          >
            Show rarity
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={cardFields.price}
            onCheckedChange={(v) => onCardFieldsChange({ price: v })}
          >
            Show price
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={darkMode} onCheckedChange={onDarkModeChange}>
            Dark mode
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {needRefresh ? (
            <DropdownMenuItem
              onClick={() => applyUpdate()}
              className="text-xs font-medium text-blue-600 dark:text-blue-400"
            >
              Update available — tap to reload
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={async (e) => {
                e.preventDefault();
                setChecking(true);
                const updateAvailable = await checkForUpdate();
                setChecking(false);
                if (!updateAvailable) {
                  toast("You're on the latest version");
                }
              }}
              className="text-xs text-muted-foreground"
            >
              <RefreshCw className={`size-3 ${checking ? "animate-spin" : ""}`} />
              Check for updates
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setChangelogOpen(true)}
            className="flex justify-between text-xs text-muted-foreground"
          >
            <span>v{__COMMIT_HASH__}</span>
            <span>What&apos;s new</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Drawer swipeDirection="right" open={changelogOpen} onOpenChange={setChangelogOpen}>
        <DrawerContent className="flex flex-col gap-0 overflow-hidden">
          <DrawerHeader className="pb-4">
            <DrawerTitle>What&apos;s new</DrawerTitle>
            <DrawerDescription>Recent changes and improvements to OpenRift.</DrawerDescription>
          </DrawerHeader>
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
        </DrawerContent>
      </Drawer>
    </>
  );
}
