"use client";

import { useEffect } from "react";
import { groupWorkspace, identifyUser } from "@/lib/posthog";

export function PostHogWorkspace({
  user,
  workspace,
}: {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; slug: string };
}) {
  useEffect(() => {
    identifyUser(user);
    groupWorkspace(workspace);
  }, [user, workspace]);

  return null;
}
