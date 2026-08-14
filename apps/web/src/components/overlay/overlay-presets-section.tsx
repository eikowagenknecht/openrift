import type { OverlayChannelResponse, StagePreset } from "@openrift/shared";
import {
  BookmarkPlusIcon,
  EllipsisVerticalIcon,
  LinkIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StagePresetNameDialog } from "@/components/present/stage-preset-name-dialog";
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
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useUpdateOverlaySettings } from "@/hooks/use-overlay";
import {
  useCreateStagePreset,
  useDeleteStagePreset,
  useStagePresets,
  useUpdateStagePreset,
} from "@/hooks/use-stage-presets";
import { getSiteUrl } from "@/lib/site-config";
import { captureOverlayPreset, presetToOverlaySettings } from "@/lib/stage-preset-apply";

/**
 * The browser-source URL pinned to one preset. A source added with this link
 * paints that scene's dressing regardless of what the dashboard is set to, so a
 * creator can keep two OBS scenes on the same channel.
 *
 * @returns The pinned source URL.
 */
function presetSourceUrl(token: string, presetId: string): string {
  return `${getSiteUrl()}/stage/source/${token}?preset=${presetId}`;
}

/**
 * Saved scene dressing for the stream overlay: apply one to the live channel,
 * keep the current setup as a new one, or copy a source URL pinned to one.
 *
 * The same presets the presentation stage keeps — one creator dresses one
 * stage, and each surface applies the half it can render. Applying here writes
 * the overlay's switches through the ordinary settings mutation, so the browser
 * source picks the change up on its next poll like any other.
 *
 * @returns The presets section.
 */
export function OverlayPresetsSection({ channel }: { channel: OverlayChannelResponse }) {
  const { data: presets } = useStagePresets();
  const createPreset = useCreateStagePreset();
  const updateSettings = useUpdateOverlaySettings();
  const [saveOpen, setSaveOpen] = useState(false);

  const save = (name: string) => {
    createPreset.mutate(
      { name, config: captureOverlayPreset(channel.payload) },
      {
        // Only closed on success: a duplicate name (or the preset cap) comes
        // back as a 409 the global mutation toast reports, and the dialog stays
        // up with the typed name to be corrected.
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
        A saved scene: the corner, the size, the plate and the QR link. Apply one to change what is
        on stream now, or point a second browser source at a preset&apos;s own link to pin it.
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

/**
 * One saved scene: its name applies it, and the menu holds the things that
 * aren't applying it.
 *
 * @returns The preset row.
 */
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
    // A clipboard write is not a mutation, so the global mutation toast never
    // sees this one — it reports itself.
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
