import { requireWorkspace } from "@/lib/session";
import { getInbox } from "@/lib/queries";
import { InboxList } from "@/components/inbox/inbox-list";

export default async function InboxPage() {
  const { user, workspace } = await requireWorkspace();
  const notifications = await getInbox(user.id, workspace.prefix);
  return <InboxList notifications={notifications} />;
}
