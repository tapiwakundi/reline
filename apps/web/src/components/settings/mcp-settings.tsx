"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson, jsonBody } from "@/lib/fetch-json";

type McpToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: "read";
  createdAt: string;
  lastUsedAt: string | null;
};

type CreatedToken = McpToken & { secret: string };

function cursorConfig(url: string, secret: string) {
  return JSON.stringify(
    {
      mcpServers: {
        reline: {
          url,
          headers: {
            Authorization: `Bearer ${secret}`,
          },
        },
      },
    },
    null,
    2
  );
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function McpSettings() {
  const [origin, setOrigin] = useState("");
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [name, setName] = useState("Cursor");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedToken | null>(null);

  const mcpUrl = origin ? `${origin}/api/mcp` : "";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ tokens: McpToken[] }>("/api/mcp/tokens")
      .then((data) => {
        if (!cancelled) setTokens(data.tokens);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTokens([]);
          toast.error(error instanceof Error ? error.message : "Could not load tokens");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createToken(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const data = await fetchJson<{ token: CreatedToken }>(
        "/api/mcp/tokens",
        jsonBody({ name })
      );
      setCreated(data.token);
      setTokens((current) => [data.token, ...(current ?? [])]);
      toast.success("Read-only token created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(token: McpToken) {
    if (revoking) return;
    if (!window.confirm(`Revoke “${token.name}”? Cursor will stop being able to read issues with this token.`)) {
      return;
    }
    setRevoking(token.id);
    try {
      await fetchJson(`/api/mcp/tokens/${token.id}`, { method: "DELETE" });
      setTokens((current) => (current ?? []).filter((item) => item.id !== token.id));
      if (created?.id === token.id) setCreated(null);
      toast.success("Token revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke token");
    } finally {
      setRevoking(null);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">Cursor</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Cursor with read-only access. Paste a ticket link in chat and
          Cursor can read the issue, its description, and its attachments.
          Tokens cannot create or change anything, and they only see workspaces
          you belong to.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <div className="text-sm font-medium">Server URL</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Add this in Cursor under MCP as a remote server. The web app
            forwards it to the API.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="flex min-w-0 flex-1 items-center overflow-x-auto rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[13px]">
            {mcpUrl || "/api/mcp"}
          </code>
          <Button
            type="button"
            variant="outline"
            disabled={!mcpUrl}
            onClick={() => copy(mcpUrl, "Server URL")}
          >
            Copy
          </Button>
        </div>
      </div>

      <form
        onSubmit={createToken}
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
      >
        <div>
          <div className="text-sm font-medium">Read-only token</div>
          <p className="mt-1 text-sm text-muted-foreground">
            The secret is shown once. Put it in the Authorization header as{" "}
            <span className="font-mono text-xs">Bearer rel_…</span>.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="mcp-token-name">Name</Label>
            <Input
              id="mcp-token-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Cursor on my laptop"
              maxLength={64}
              required
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create token"}
          </Button>
        </div>
      </form>

      {created && mcpUrl && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <div className="text-sm font-medium">Token created</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Copy this into <span className="font-mono text-xs">~/.cursor/mcp.json</span>{" "}
              or Cursor’s MCP settings. It will not be shown again.
            </p>
          </div>
          <code className="overflow-x-auto rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px]">
            {created.secret}
          </code>
          <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 text-[12px] leading-relaxed">
            {cursorConfig(mcpUrl, created.secret)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => copy(created.secret, "Token")}>
              Copy token
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => copy(cursorConfig(mcpUrl, created.secret), "Config")}
            >
              Copy config
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Active tokens</h3>
        {tokens === null ? (
          <p className="text-sm text-muted-foreground">Loading tokens…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tokens yet. Create one to connect Cursor.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{token.name}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Read-only
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {token.tokenPrefix}…
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Created {formatWhen(token.createdAt)}
                    {" · "}
                    {token.lastUsedAt
                      ? `Last used ${formatWhen(token.lastUsedAt)}`
                      : "Never used"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={revoking === token.id}
                  onClick={() => revoke(token)}
                >
                  {revoking === token.id ? "Revoking…" : "Revoke"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
