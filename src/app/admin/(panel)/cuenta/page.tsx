import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { CuentaForm } from "@/components/admin/CuentaForm";

export default async function CuentaPage(props: PageProps<"/admin/cuenta">) {
  const user = await getStaff();
  if (!user) redirect("/admin/login");
  const sp = await props.searchParams;
  return (
    <CuentaForm
      name={user.name}
      username={user.username}
      role={user.role}
      forced={sp.cambiar === "1"}
    />
  );
}
