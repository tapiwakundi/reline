import { getSession } from "@/lib/session";
import { getUnreadCount } from "@/lib/queries";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ count: 0 }, { status: 401 });
  const count = await getUnreadCount(session.user.id);
  return Response.json({ count });
}
