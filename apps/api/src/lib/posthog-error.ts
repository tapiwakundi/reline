import { HTTPException } from "hono/http-exception";
import { HttpError } from "@/lib/context";

/** Expected 4xx responses are not product failures. Unexpected throws are. */
export function isReportableApiError(err: unknown): boolean {
  if (err instanceof HttpError) return err.status >= 500;
  if (err instanceof HTTPException) return err.status >= 500;
  return true;
}
