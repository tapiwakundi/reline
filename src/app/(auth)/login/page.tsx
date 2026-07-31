"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import {
  AuthDivider,
  GoogleSignInButton,
} from "@/components/google-sign-in-button";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Invalid email or password");
      return;
    }
    router.push("/board");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <Logo className="size-12 rounded-xl" />
      <h1 className="text-lg font-medium">Log in to Reline</h1>
      <div className="flex w-full flex-col gap-3">
        <GoogleSignInButton callbackURL="/board" />
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
      </div>
      <p className="text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
