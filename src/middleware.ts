import { NextResponse, type NextRequest } from "next/server";
import {
  RESERVED_SLUGS,
  WORKSPACE_SLUG_COOKIE,
} from "@/lib/workspace-paths";

const APP_SEGMENTS = new Set([
  "board",
  "issues",
  "issue",
  "backlog",
  "cycles",
  "inbox",
  "my-issues",
  "settings",
]);

/**
 * Sync last-used workspace slug cookie from URL so server actions / APIs
 * that call requireWorkspace() resolve the same workspace as the page.
 */
export function middleware(request: NextRequest) {
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const slug = segments[0];
  const page = segments[1];

  if (!slug || RESERVED_SLUGS.has(slug) || !page || !APP_SEGMENTS.has(page)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const current = request.cookies.get(WORKSPACE_SLUG_COOKIE)?.value;
  if (current !== slug) {
    response.cookies.set(WORKSPACE_SLUG_COOKIE, slug, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|login|signup|onboarding|invite).*)",
  ],
};
