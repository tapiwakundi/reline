export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { workspaceSlug?: string }
): Promise<T> {
  const headers = new Headers(init?.headers);
  const { workspaceSlug, ...rest } = init ?? {};
  if (workspaceSlug) {
    headers.set("x-workspace-slug", workspaceSlug);
  }
  const res = await fetch(url, { ...rest, headers, credentials: "include" });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function jsonBody(data: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
