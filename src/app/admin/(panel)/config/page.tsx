import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { ConfigApp } from "@/components/admin/config/ConfigApp";

export default async function ConfigPage() {
  const user = await getStaff();
  if (user?.role !== "owner") redirect("/admin");
  return <ConfigApp />;
}
