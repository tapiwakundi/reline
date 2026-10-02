"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { identifyUser, isPostHogEnabled } from "@/lib/posthog";

/** Link the browser session to the signed-in user once auth has resolved. */
export function PostHogIdentify() {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  useEffect(() => {
    if (!isPostHogEnabled() || isPending || !user?.id) return;
    identifyUser({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  }, [isPending, user?.id, user?.email, user?.name]);

  return null;
}
