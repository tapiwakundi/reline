import type { Metadata } from "next";
import { InboxList } from "@/components/inbox/inbox-list";
import { serverApi } from "@/lib/server-api";
import type { InboxItem } from "@/lib/types";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { notifications } = await serverApi<{ notifications: InboxItem[] }>(
    "/api/inbox",
    { workspaceSlug }
  );
  return <InboxList notifications={notifications} />;
}
