import { redirect } from "next/navigation";
import { getSession, homeBoardPath } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(await homeBoardPath(session.user.id));
}
