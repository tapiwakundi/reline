"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { captureClientException } from "@/lib/posthog";
import { shouldCaptureClientException } from "@/lib/posthog-config";

export function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!shouldCaptureClientException(error)) return;
    captureClientException(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-lg font-medium">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Reline hit an unexpected error. Try again, or go back home.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">
          Reference {error.digest}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Go home
        </Button>
      </div>
    </div>
  );
}
