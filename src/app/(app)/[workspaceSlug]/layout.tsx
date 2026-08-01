import { requireWorkspaceBySlug, getUserWorkspaces } from "@/lib/session";
import { getUnreadCount, getWorkspaceData } from "@/lib/queries";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { QueryProvider } from "@/components/query-provider";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { AppSidebar } from "@/components/app-sidebar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace, user } = await requireWorkspaceBySlug(workspaceSlug);
  const [data, unread, workspaces] = await Promise.all([
    getWorkspaceData(
      {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        prefix: workspace.prefix,
      },
      user.id
    ),
    getUnreadCount(user.id, workspace.id),
    getUserWorkspaces(user.id),
  ]);

  return (
    <QueryProvider>
      <WorkspaceProvider value={{ ...data, workspaces }}>
        <GlobalShortcuts>
          <div className="flex h-dvh overflow-hidden">
            <AppSidebar initialUnread={unread} />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </main>
          </div>
        </GlobalShortcuts>
      </WorkspaceProvider>
    </QueryProvider>
  );
}
