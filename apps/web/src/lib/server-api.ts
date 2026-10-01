import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

export function apiInternalUrl() {
  const raw = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4001";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }
  return `http://${raw}`;
}

function fetchErrorMessage(url: string, err: unknown) {
  const cause =
    err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : err;
  const detail =
    cause instanceof Error
      ? cause.message
      : err instanceof Error
        ? err.message
        : "fetch failed";
  return `Could not reach the API at ${url} (${detail}). Start it with npm run dev — it listens on port 4001.`;
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
  const url = `${apiInternalUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers,
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(fetchErrorMessage(url, err));
  }

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
