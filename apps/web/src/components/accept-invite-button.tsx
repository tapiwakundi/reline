"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptInvite } from "@/lib/api/workspace";
import { Button } from "@/components/ui/button";
import { wsPath } from "@/lib/workspace-paths";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const { slug } = await acceptInvite(token);
          router.push(wsPath(slug, "/board"));
          router.refresh();
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not accept invite"
          );
          setPending(false);
        }
      }}
    >
      {pending ? "Joining…" : "Accept invite"}
    </Button>
  );
}
