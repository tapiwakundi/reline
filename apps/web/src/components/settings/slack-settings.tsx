"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/fetch-json";
import { useWorkspace } from "@/lib/workspace-context";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";

type SlackStatus = {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  linked: boolean;
  postsAsUser: boolean;
  canInstall: boolean;
  linkPreviews: boolean;
};

function slackStartUrl(kind: "install" | "user") {
  const slug = workspaceSlugFromPath();
  const path = kind === "install" ? "/api/slack/oauth/start" : "/api/slack/user/start";
  return slug ? `${path}?workspace=${encodeURIComponent(slug)}` : path;
}

export function SlackSettings() {
  const { workspace } = useWorkspace();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("installed") === "1") toast.success("Slack connected");
    if (params.get("linked") === "1") toast.success("Slack account linked");
    if (params.get("error") === "1") toast.error("Could not connect Slack");
    if (params.size) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchJson<SlackStatus>("/api/slack", { workspaceSlug: workspace.slug })
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            configured: false,
            connected: false,
            teamName: null,
            linked: false,
            postsAsUser: false,
            canInstall: false,
            linkPreviews: false,
          });
          toast.error(error instanceof Error ? error.message : "Could not load Slack");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.slug]);

  async function disconnect() {
    if (disconnecting) return;
    if (!window.confirm("Disconnect Slack from this workspace?")) return;
    setDisconnecting(true);
    try {
      await fetchJson("/api/slack", {
        method: "DELETE",
        workspaceSlug: workspace.slug,
      });
      setStatus((current) =>
        current
          ? {
              ...current,
              connected: false,
              teamName: null,
              linked: false,
              postsAsUser: false,
              linkPreviews: false,
            }
          : current
      );
      toast.success("Slack disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect Slack");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Slack</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a private Slack channel the first time someone is @mentioned on a
          ticket. Replies in that channel become comments here. In a connected
          Slack workspace, shared ticket links show the ticket instead of the
          login page.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <div className="text-sm font-medium">Workspace</div>
          <p className="mt-1 text-sm text-muted-foreground">
            The workspace owner installs the Slack app once. Mentions and
            comments then mirror into a channel named from the issue key. Shared
            ticket links show the title, status, and assignee.
          </p>
        </div>
        {status === null ? (
          <p className="text-sm text-muted-foreground">Loading Slack…</p>
        ) : !status.configured ? (
          <p className="text-sm text-muted-foreground">
            Slack is not configured on this server.
          </p>
        ) : status.connected ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm">
                Connected to <span className="font-medium">{status.teamName}</span>
              </p>
              {status.canInstall ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disconnecting}
                  onClick={disconnect}
                >
                  {disconnecting ? "Disconnecting…" : "Disconnect"}
                </Button>
              ) : null}
            </div>
            {status.linkPreviews ? null : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                  Ticket links still show the login page.{" "}
                  {status.canInstall
                    ? "Reconnect Slack to show the title, status, and assignee."
                    : "Ask the workspace owner to reconnect Slack."}
                </p>
                {status.canInstall ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={disconnecting}
                    onClick={() => {
                      window.location.href = slackStartUrl("install");
                    }}
                  >
                    Enable previews
                  </Button>
                ) : null}
              </div>
            )}
          </>
        ) : status.canInstall ? (
          <Button type="button" onClick={() => {
            window.location.href = slackStartUrl("install");
          }}>
            Add to Slack
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask the workspace owner to connect Slack.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <div className="text-sm font-medium">Your account</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Slack so comments you write in Reline show up as you, not
            as the Reline app. Slack replies still come back as comments.
          </p>
        </div>
        {status === null ? (
          <p className="text-sm text-muted-foreground">Loading Slack…</p>
        ) : !status.configured || !status.connected ? (
          <p className="text-sm text-muted-foreground">
            Connect Slack to this workspace first.
          </p>
        ) : status.postsAsUser ? (
          <p className="text-sm">
            Comments you write in Reline are posted to Slack as you.
          </p>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.location.href = slackStartUrl("user");
            }}
          >
            {status.linked ? "Reconnect Slack" : "Connect Slack"}
          </Button>
        )}
      </div>
    </div>
  );
}
