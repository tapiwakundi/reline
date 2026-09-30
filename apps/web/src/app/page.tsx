import { redirect } from "next/navigation";
import { serverApi } from "@/lib/server-api";
import type { MeResponse } from "@/lib/types";

export default async function Home() {
  const me = await serverApi<MeResponse>("/api/me");
  redirect(me.homePath);
}
