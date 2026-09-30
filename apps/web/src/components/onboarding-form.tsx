"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorkspace } from "@/lib/api/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { wsPath } from "@/lib/workspace-paths";

export function OnboardingForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <form
      className="flex w-full flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        setPending(true);
        try {
          const { slug } = await createWorkspace(formData);
          router.push(wsPath(slug, "/board"));
          router.refresh();
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not create workspace"
          );
          setPending(false);
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Acme Inc"
          required
          autoFocus
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prefix">Issue prefix</Label>
        <Input
          id="prefix"
          name="prefix"
          placeholder="ACM"
          maxLength={5}
          className="uppercase"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Used in issue IDs, e.g. ACM-42. Defaults to the first 3 letters.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
