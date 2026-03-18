import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateFeatureFlag,
  useDeleteFeatureFlag,
  useFeatureFlags,
  useToggleFeatureFlag,
} from "@/hooks/use-feature-flags";

export function FeatureFlagsPage() {
  const { data } = useFeatureFlags();
  const toggleMutation = useToggleFeatureFlag();
  const createMutation = useCreateFeatureFlag();
  const deleteMutation = useDeleteFeatureFlag();
  const { flags } = data;

  const [adding, setAdding] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: "", description: "" });
  const [createError, setCreateError] = useState("");

  function handleCreate() {
    setCreateError("");
    const key = newFlag.key.trim();
    if (!key) {
      setCreateError("Key is required");
      return;
    }
    if (!/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/.test(key)) {
      setCreateError("Key must be kebab-case (e.g. deck-builder)");
      return;
    }
    createMutation.mutate(
      { key, description: newFlag.description.trim() || null },
      {
        onSuccess: () => {
          setAdding(false);
          setNewFlag({ key: "", description: "" });
        },
        onError: (err) => setCreateError(err.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Feature flags take effect on the next page load for all users.
        </p>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add Flag
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24 text-center">Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adding && (
              <TableRow>
                <TableCell>
                  <Input
                    value={newFlag.key}
                    onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value.toLowerCase() })}
                    placeholder="deck-builder"
                    className="h-8 w-48 font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newFlag.description}
                    onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                    placeholder="What this flag controls"
                    className="h-8"
                  />
                </TableCell>
                <TableCell />
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdding(false);
                        setNewFlag({ key: "", description: "" });
                        setCreateError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {createError && <p className="mt-1 text-xs text-destructive">{createError}</p>}
                </TableCell>
              </TableRow>
            )}
            {flags.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                  No feature flags yet.
                </TableCell>
              </TableRow>
            )}
            {flags.map((flag) => (
              <TableRow key={flag.key}>
                <TableCell className="font-mono text-sm">{flag.key}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {flag.description || <span className="italic">No description</span>}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={(checked: boolean) =>
                        toggleMutation.mutate({ key: flag.key, enabled: checked })
                      }
                      disabled={toggleMutation.isPending}
                    />
                    <Badge variant={flag.enabled ? "default" : "secondary"}>
                      {flag.enabled ? "On" : "Off"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(flag.key)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
