import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;

  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  const initials = (user?.name ?? user?.email ?? "?")
    .split(/[\s@]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const createdAt = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to update name");
      return;
    }
    toast.success("Name updated");
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Avatar size="lg">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-xl">{user.name || user.email}</CardTitle>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          {createdAt && <p className="text-xs text-muted-foreground">Joined {createdAt}</p>}
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <form key={user.id} onSubmit={handleSave} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
            <Button type="submit" disabled={saving || name.trim() === (user.name ?? "")}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
