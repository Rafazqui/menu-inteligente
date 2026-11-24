import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { getRestaurant } from "@/lib/repo";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const user = await getStaff();
  if (!user) redirect("/admin/login");
  const restaurant = getRestaurant(user.restaurant_id)!;
  return (
    <div className="print-bg-white min-h-dvh bg-ink">
      <AdminNav name={user.name} role={user.role} restaurant={restaurant.name} />
      <div className="mx-auto max-w-7xl px-4 py-5">{children}</div>
    </div>
  );
}
