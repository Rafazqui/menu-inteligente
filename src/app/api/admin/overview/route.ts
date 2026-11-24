import { overview, requireStaff } from "@/lib/admin";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireStaff(null);
  if (user instanceof Response) return user;
  return ok(overview(user.restaurant_id));
}
