import type { OverlayChannelResponse } from "@openrift/shared/contracts/overlay";
import type { StagePreset } from "@openrift/shared/contracts/stage-presets";
import {
  BookmarkPlusIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StagePresetNameDialog } from "@/features/stage/components/stage-preset-name-dialog";
import { useUpdateOverlaySettings } from "@/features/stage/hooks/use-overlay";
import {
  useCreateStagePreset,
  useDeleteStagePreset,
  useStagePresets,
  useUpdateStagePreset,
} from "@/features/stage/hooks/use-stage-presets";
import {
  captureOverlayPreset,
  presetToOverlaySettings,
} from "@/features/stage/lib/stage-preset-apply";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { getSiteUrl } from "@/lib/site-config";

/** URL pinned to one preset; a source added with it ignores the live dashboard settings. */
function presetSourceUrl(token: string, presetId: string): string {
  return `${getSiteUrl()}/stage/source/${token}?preset=${presetId}`;
}

export function OverlayPresetsSection({ channel }: { channel: OverlayChannelResponse }) {
  const { data: presets } = useStagePresets();
  const createPreset = useCreateStagePreset();
  const updateSettings = useUpdateOverlaySettings();
  const [saveOpen, setSaveOpen] = useState(false);

  const save = (name: string) => {
    createPreset.mutate(
      { name, config: captureOverlayPreset(channel.payload) },
      {
        onSuccess: () => setSaveOpen(false),
      },
    );
  };

  const items = presets ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">Presets</h2>
        <Button variant="outline" onClick={() => setSaveOpen(true)}>
          <BookmarkPlusIcon />
          Save current
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        A saved scene. Apply one, or point a second browser source at its own link.
      </p>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing saved yet. Dress the scene the way you want it, then save it.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((preset) => (
            <OverlayPresetRow
              key={preset.id}
              preset={preset}
              token={channel.token}
              applying={updateSettings.isPending}
              onApply={() => updateSettings.mutate(presetToOverlaySettings(preset.config))}
            />
          ))}
        </ul>
      )}

      <StagePresetNameDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save as preset"
        description="Keeps the scene as it is dressed right now. The card on screen is not part of it."
        confirmLabel="Save"
        pending={createPreset.isPending}
        onConfirm={save}
      />
    </section>
  );
}

function OverlayPresetRow({
  preset,
  token,
  applying,
  onApply,
}: {
  preset: StagePreset;
  token: string;
  applying: boolean;
  onApply: () => void;
}) {
  const updatePreset = useUpdateStagePreset();
  const deletePreset = useDeleteStagePreset();
  const { copy } = useCopyToClipboard();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const copyLink = async () => {
    const ok = await copy(presetSourceUrl(token, preset.id));
    if (ok) {
      toast.success("Source URL copied.");
      return;
    }
    toast.error("Could not copy the URL.");
  };

  const rename = (name: string) => {
    updatePreset.mutate({ id: preset.id, name }, { onSuccess: () => setRenameOpen(false) });
  };

  return (
    <li className="flex items-center gap-1">
      <Button
        variant="ghost"
        className="flex-1 justify-start"
        disabled={applying}
        onClick={onApply}
      >
        {preset.name}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`${preset.name} options`} />}
        >
          <EllipsisVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void copyLink()}>
            <LinkIcon />
            Copy source URL
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StagePresetNameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename preset"
        description="Only the name changes. The saved scene stays as it is."
        confirmLabel="Rename"
        initialName={preset.name}
        pending={updatePreset.isPending}
        onConfirm={rename}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this preset?</AlertDialogTitle>
            <AlertDialogDescription>
              {preset.name} is gone for good, and any browser source pinned to it falls back to the
              channel&apos;s own dressing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePreset.mutate(preset.id)}
              disabled={deletePreset.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
