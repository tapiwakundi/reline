"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import {
  googleLinkStep,
  isGoogleLinkError,
  oauthErrorMessage,
  safeInternalPath,
  type GoogleLinkStep,
} from "@/lib/auth-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import {
  AuthDivider,
  GoogleSignInButton,
  confirmGoogleLink,
  linkGoogleAccount,
  signInWithGoogle,
} from "@/components/google-sign-in-button";

function connectCopy(
  step: GoogleLinkStep,
  error: string | null,
  email: string | undefined
): string {
  if (step === "link") {
    return "This email already has a password account. Link Google to it?";
  }
  if (step === "conflict") {
    return "That Google account is already connected to a different user. Continue into the app with this login, or try another Google account.";
  }
  if (error === "email_doesn't_match") {
    return `That Google account uses a different email. Choose the Google account for ${email ?? "the email you signed in with"}.`;
  }
  return `Signed in as ${email ?? "your account"}. Confirm that Google account to finish connecting it.`;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(false);
  const toasted = useRef<string | null>(null);

  const error = searchParams.get("error");
  const destination = safeInternalPath(searchParams.get("next"));
  const hasSession = Boolean(session?.user);
  const step = googleLinkStep(error, hasSession);

  useEffect(() => {
    if (isPending || !error || step) return;
    if (toasted.current === error) return;
    toasted.current = error;
    toast.error(oauthErrorMessage(error));
  }, [error, isPending, step]);

  async function finishWithGoogle() {
    setLoading(true);
    const { error: linkError } = await linkGoogleAccount(destination);
    if (linkError) {
      setLoading(false);
      toast.error(linkError.message ?? "Could not connect Google");
    }
  }

  async function linkExistingAccount() {
    setLoading(true);
    const { error: linkError } = await confirmGoogleLink();
    if (linkError) {
      setLoading(false);
      toast.error(linkError.message ?? "Could not connect Google");
      return;
    }
    router.push(destination);
    router.refresh();
  }

  async function tryDifferentGoogle() {
    setLoading(true);
    const { error: googleError } = await signInWithGoogle(destination);
    if (googleError) {
      setLoading(false);
      toast.error(googleError.message ?? "Google sign-in failed");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    const { error: signInError } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (signInError) {
      setLoading(false);
      toast.error(signInError.message ?? "Invalid email or password");
      return;
    }
    router.push(destination);
    router.refresh();
  }

  async function signInAsDifferentAccount() {
    setLoading(true);
    await signOut();
    const params = new URLSearchParams();
    if (destination !== "/") params.set("next", destination);
    params.set("error", "account_not_linked");
    router.replace(`/login?${params.toString()}`);
    router.refresh();
    setLoading(false);
  }

  if (isPending && isGoogleLinkError(error)) {
    return (
      <div className="flex flex-col items-center gap-6">
        <Logo className="size-12 rounded-xl" />
        <h1 className="text-lg font-medium">Connect Google</h1>
      </div>
    );
  }

  const title =
    step === "conflict"
      ? "Google account already used"
      : step
        ? "Connect Google"
        : "Log in to Reline";

  return (
    <div className="flex flex-col items-center gap-6">
      <Logo className="size-12 rounded-xl" />
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-lg font-medium">{title}</h1>
        {step ? (
          <p className="text-sm text-muted-foreground">
            {connectCopy(step, error, session?.user.email)}
          </p>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-3">
        {step === "link" ? (
          <>
            <Button
              type="button"
              className="w-full"
              disabled={loading}
              onClick={() => {
                void linkExistingAccount();
              }}
            >
              {loading ? "Linking…" : "Link and continue"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() => {
                const params = new URLSearchParams();
                if (destination !== "/") params.set("next", destination);
                router.replace(params.size ? `/login?${params.toString()}` : "/login");
              }}
            >
              Sign in with email instead
            </Button>
          </>
        ) : step === "confirm" || step === "conflict" ? (
          <>
            {step === "confirm" ? (
              <Button
                type="button"
                className="w-full"
                disabled={loading}
                onClick={finishWithGoogle}
              >
                {loading ? "Redirecting…" : "Continue with Google"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant={step === "confirm" ? "outline" : "default"}
              className="w-full"
              disabled={loading}
              onClick={() => {
                router.push(destination);
                router.refresh();
              }}
            >
              Continue to the app
            </Button>
            {step === "conflict" ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={finishWithGoogle}
              >
                {loading ? "Redirecting…" : "Try another Google account"}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <GoogleSignInButton callbackURL={destination} />
            <AuthDivider />
            <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
              <Input
                name="email"
                type="email"
                placeholder="Email address"
                required
                autoFocus
                autoComplete="email"
              />
              <Input
                name="password"
                type="password"
                placeholder="Password"
                required
                autoComplete="current-password"
              />
              <Button type="submit" disabled={loading} className="mt-1 w-full">
                {loading ? "Logging in…" : "Continue"}
              </Button>
            </form>
          </>
        )}
      </div>
      {step === "link" ? (
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          disabled={loading}
          onClick={() => {
            void tryDifferentGoogle();
          }}
        >
          Try a different Google account
        </button>
      ) : null}
      {step === "confirm" || step === "conflict" ? (
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          disabled={loading}
          onClick={() => {
            void signInAsDifferentAccount();
          }}
        >
          Use a different account
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-foreground hover:underline">
            Sign up
          </Link>
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-6">
          <Logo className="size-12 rounded-xl" />
          <h1 className="text-lg font-medium">Log in to Reline</h1>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
