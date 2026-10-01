import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { dash } from "@better-auth/infra";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  holdGoogleLinkForPasswordUser,
  googleLinkPlugin,
  type GoogleLinkAccountInput,
} from "@/lib/google-link";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const baseURL = process.env.BETTER_AUTH_URL;
const secret = process.env.BETTER_AUTH_SECRET;

export const auth = betterAuth({
  baseURL,
  secret,
  trustedOrigins: baseURL ? [baseURL] : [],
  onAPIError: {
    errorURL: "/login",
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Google may match an existing password account. The first sign-in is kept
  // and finished from /login, instead of sending the user through Google again.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: false,
    },
  },
  databaseHooks: {
    account: {
      create: {
        async before(account, context) {
          await holdGoogleLinkForPasswordUser(
            account as GoogleLinkAccountInput,
            context
          );
        },
      },
    },
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            prompt: "select_account" as const,
          },
        }
      : {}),
  },
  plugins: [
    googleLinkPlugin(),
    dash({
      apiKey: process.env.BETTER_AUTH_API_KEY,
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
