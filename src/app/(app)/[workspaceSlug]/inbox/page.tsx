import type { Metadata } from "next";
import { requireWorkspaceBySlug } from "@/lib/session";
import { getInbox } from "@/lib/queries";
import { InboxList } from "@/components/inbox/inbox-list";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { user, workspace } = await requireWorkspaceBySlug(workspaceSlug);
  const notifications = await getInbox(
    user.id,
    workspace.id,
    workspace.prefix
  );
  return <InboxList notifications={notifications} />;
}
