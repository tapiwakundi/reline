import { requireWorkspace } from "@/lib/session";
import { getUnreadCount, getWorkspaceData } from "@/lib/queries";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { QueryProvider } from "@/components/query-provider";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspace, user } = await requireWorkspace();
  const [data, unread] = await Promise.all([
    getWorkspaceData(
      { id: workspace.id, name: workspace.name, prefix: workspace.prefix },
      user.id
    ),
    getUnreadCount(user.id),
  ]);

  return (
    <QueryProvider>
      <WorkspaceProvider value={data}>
        <GlobalShortcuts>
          <div className="flex h-screen overflow-hidden">
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
