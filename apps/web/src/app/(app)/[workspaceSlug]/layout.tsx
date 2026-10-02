import { PostHogWorkspace } from "@/components/posthog-workspace";
import { QueryProvider } from "@/components/query-provider";
import { GlobalShortcuts } from "@/components/global-shortcuts";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { serverApi } from "@/lib/server-api";
import type { WorkspaceBootstrap } from "@/lib/types";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const data = await serverApi<WorkspaceBootstrap>(
    `/api/workspaces/${encodeURIComponent(workspaceSlug)}/bootstrap`,
    { workspaceSlug }
  );

  return (
    <QueryProvider>
      <WorkspaceProvider
        value={{
          workspace: data.workspace,
          workspaces: data.workspaces,
          me: data.me,
          members: data.members,
          statuses: data.statuses,
          labels: data.labels,
          cycles: data.cycles,
        }}
      >
        <PostHogWorkspace user={data.me} workspace={data.workspace} />
        <GlobalShortcuts>
          <div className="flex h-dvh overflow-hidden bg-sidebar">
            <AppSidebar initialUnread={data.unread} />
            <div className="flex min-w-0 flex-1 flex-col py-2 pr-2 max-md:p-2">
              <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                {children}
              </main>
            </div>
          </div>
        </GlobalShortcuts>
      </WorkspaceProvider>
    </QueryProvider>
  );
}
