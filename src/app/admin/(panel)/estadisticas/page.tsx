import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { getRestaurant } from "@/lib/repo";
import { StatsDashboard } from "@/components/admin/stats/StatsDashboard";

export default async function EstadisticasPage() {
  const user = await getStaff();
  if (user?.role !== "owner") redirect("/admin");
  const restaurant = await getRestaurant(user.restaurant_id);
  return <StatsDashboard businessName={restaurant?.name ?? ""} />;
}
