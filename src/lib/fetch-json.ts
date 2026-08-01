export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { workspaceSlug?: string }
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.workspaceSlug) {
    headers.set("x-workspace-slug", init.workspaceSlug);
  }
  const { workspaceSlug: _, ...rest } = init ?? {};
  const res = await fetch(url, { ...rest, headers });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
