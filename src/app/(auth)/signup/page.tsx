"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invite = searchParams.get("invite");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Could not create account");
      return;
    }
    router.push(invite ? `/invite/${invite}` : "/onboarding");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <Logo className="size-12 rounded-xl" />
      <h1 className="text-lg font-medium">Create your account</h1>
      <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
        <Input name="name" placeholder="Full name" required autoFocus />
        <Input
          name="email"
          type="email"
          placeholder="Email address"
          required
          autoComplete="email"
        />
        <Input
          name="password"
          type="password"
          placeholder="Password (8+ characters)"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" disabled={loading} className="mt-1 w-full">
          {loading ? "Creating account…" : "Continue"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
