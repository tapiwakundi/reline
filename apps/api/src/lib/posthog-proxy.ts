import {
  normalizePostHogHost,
  posthogProxyTarget,
} from "@reline/shared";

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-encoding",
  "accept-language",
  "content-encoding",
  "content-type",
  "user-agent",
];

const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-encoding",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "vary",
];

export async function proxyPostHogRequest(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = posthogProxyTarget(
    incoming.pathname,
    incoming.search,
    normalizePostHogHost(process.env.POSTHOG_HOST)
  );
  if (!target) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("host", new URL(target).host);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      // Node's fetch requires this when the body is a stream.
      duplex: "half",
    } as RequestInit);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch {
    return Response.json({ error: "Analytics proxy failed" }, { status: 502 });
  }
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
