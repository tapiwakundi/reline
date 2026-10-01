import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { setSessionCookie } from "better-auth/cookies";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { account, verification } from "@/db/schema";

export const GOOGLE_LINK_PENDING_COOKIE = "google_link_pending";
const PENDING_TTL_MS = 10 * 60 * 1000;

export type GoogleLinkAccountInput = {
  userId: string;
  providerId: string;
  accountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  accessTokenExpiresAt?: Date | string | null;
  refreshTokenExpiresAt?: Date | string | null;
  scope?: string | null;
};

type HookContext = {
  path?: string;
  request?: Request;
  setCookie?: (
    key: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      path?: string;
      maxAge?: number;
      secure?: boolean;
    }
  ) => void;
  context?: {
    session?: { user?: { id?: string } } | null;
    internalAdapter?: {
      createAccount: (data: Record<string, unknown>) => Promise<unknown>;
      createSession: (userId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null;
        userAgent?: string | null;
      } | null>;
      findUserById: (userId: string) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string;
        emailVerified: boolean;
        name: string;
        image?: string | null;
      } | null>;
    };
  };
} | null;

export type PendingGoogleLink = {
  userId: string;
  accountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  scope: string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pendingFromAccount(data: GoogleLinkAccountInput): PendingGoogleLink {
  return {
    userId: data.userId,
    accountId: data.accountId,
    accessToken: data.accessToken ?? null,
    refreshToken: data.refreshToken ?? null,
    idToken: data.idToken ?? null,
    accessTokenExpiresAt: toIso(data.accessTokenExpiresAt),
    refreshTokenExpiresAt: toIso(data.refreshTokenExpiresAt),
    scope: data.scope ?? null,
  };
}

export function parsePendingGoogleLink(value: string): PendingGoogleLink | null {
  try {
    const parsed = JSON.parse(value) as Partial<PendingGoogleLink>;
    if (!parsed.userId || !parsed.accountId) return null;
    return {
      userId: parsed.userId,
      accountId: parsed.accountId,
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
      idToken: parsed.idToken ?? null,
      accessTokenExpiresAt: parsed.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: parsed.refreshTokenExpiresAt ?? null,
      scope: parsed.scope ?? null,
    };
  } catch {
    return null;
  }
}

/** Logged-out Google sign-in against a password account waits for a confirm. */
export function shouldHoldGoogleLink(input: {
  providerId: string;
  path?: string;
  hasSessionCookie: boolean;
  hasPasswordAccount: boolean;
}): boolean {
  if (input.providerId !== "google") return false;
  if (input.path?.endsWith("/google-link-confirm")) return false;
  if (input.hasSessionCookie) return false;
  return input.hasPasswordAccount;
}

export function hasSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const name = part.trim().split("=")[0];
    return (
      name === "better-auth.session_token" ||
      name === "__Secure-better-auth.session_token"
    );
  });
}

function pendingCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge,
    secure: process.env.BETTER_AUTH_URL?.startsWith("https://") ?? false,
  };
}

/**
 * Save the Google sign-in that just succeeded and stop before it is linked,
 * so the login page can finish it without another Google login.
 */
export async function holdGoogleLinkForPasswordUser(
  data: GoogleLinkAccountInput,
  ctx: unknown
): Promise<void> {
  const hook = ctx as HookContext;
  const cookieHeader = hook?.request?.headers.get("cookie") ?? undefined;
  const credential = shouldHoldGoogleLink({
    providerId: data.providerId,
    path: hook?.path,
    hasSessionCookie: hasSessionCookie(cookieHeader),
    hasPasswordAccount: true,
  })
    ? await db.query.account.findFirst({
        where: and(
          eq(account.userId, data.userId),
          eq(account.providerId, "credential")
        ),
      })
    : null;
  if (
    !credential ||
    !shouldHoldGoogleLink({
      providerId: data.providerId,
      path: hook?.path,
      hasSessionCookie: hasSessionCookie(cookieHeader),
      hasPasswordAccount: true,
    }) ||
    !hook?.setCookie
  ) {
    return;
  }

  const id = nanoid();
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
  await db.insert(verification).values({
    id,
    identifier: `google-link:${id}`,
    value: JSON.stringify(pendingFromAccount(data)),
    expiresAt,
  });
  hook.setCookie(GOOGLE_LINK_PENDING_COOKIE, id, pendingCookieOptions(600));
  throw new Error("google link needs confirmation");
}

function allowedOrigin(): string | null {
  const base = process.env.BETTER_AUTH_URL;
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

export function googleLinkPlugin() {
  return {
    id: "google-link",
    endpoints: {
      confirmGoogleLink: createAuthEndpoint(
        "/google-link-confirm",
        { method: "POST" },
        async (ctx) => {
          const origin = ctx.request?.headers.get("origin");
          const allowed = allowedOrigin();
          if (!allowed || origin !== allowed) {
            throw new APIError("FORBIDDEN", { message: "Forbidden" });
          }
          const id = ctx.getCookie(GOOGLE_LINK_PENDING_COOKIE);
          if (!id) {
            throw new APIError("BAD_REQUEST", {
              message: "Google link expired. Try signing in again.",
            });
          }
          const row = await db.query.verification.findFirst({
            where: eq(verification.id, id),
          });
          const pending =
            row && row.expiresAt > new Date()
              ? parsePendingGoogleLink(row.value)
              : null;
          if (!row || !pending || !row.identifier.startsWith("google-link:")) {
            throw new APIError("BAD_REQUEST", {
              message: "Google link expired. Try signing in again.",
            });
          }

          const existing = await db.query.account.findFirst({
            where: and(
              eq(account.providerId, "google"),
              eq(account.accountId, pending.accountId)
            ),
          });
          if (existing && existing.userId !== pending.userId) {
            throw new APIError("BAD_REQUEST", {
              message: "That Google account is already connected to a different user.",
            });
          }
          if (!existing) {
            await ctx.context.internalAdapter.createAccount({
              userId: pending.userId,
              providerId: "google",
              accountId: pending.accountId,
              accessToken: pending.accessToken,
              refreshToken: pending.refreshToken,
              idToken: pending.idToken,
              accessTokenExpiresAt: toDate(pending.accessTokenExpiresAt),
              refreshTokenExpiresAt: toDate(pending.refreshTokenExpiresAt),
              scope: pending.scope,
            });
          }

          const user = await ctx.context.internalAdapter.findUserById(pending.userId);
          const session = user
            ? await ctx.context.internalAdapter.createSession(pending.userId)
            : null;
          if (!user || !session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Could not connect Google.",
            });
          }
          await setSessionCookie(ctx, { session, user });
          await db.delete(verification).where(eq(verification.id, id));
          ctx.setCookie(GOOGLE_LINK_PENDING_COOKIE, "", pendingCookieOptions(0));
          return { ok: true as const };
        }
      ),
    },
  };
}
