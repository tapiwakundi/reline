import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

export function apiInternalUrl() {
  const raw = process.env.API_INTERNAL_URL ?? "http://localhost:4001";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }
  return `http://${raw}`;
}

export async function serverApi<T>(
  path: string,
  init?: RequestInit & { workspaceSlug?: string; optionalAuth?: boolean }
): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const headers = new Headers(init?.headers);
  if (cookieHeader) headers.set("cookie", cookieHeader);
  const { workspaceSlug, optionalAuth, ...rest } = init ?? {};
  if (workspaceSlug) {
    headers.set("x-workspace-slug", workspaceSlug);
  }
  const res = await fetch(`${apiInternalUrl()}${path}`, {
    ...rest,
    headers,
    cache: "no-store",
  });

  if (res.status === 401) {
    if (optionalAuth) {
      return { user: null } as T;
    }
    redirect("/login");
  }
  if (res.status === 404) notFound();
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
