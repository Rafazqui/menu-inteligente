import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTableContext, TABLE_COOKIE } from "@/lib/auth";
import { buildMesaState } from "@/lib/repo";
import { MesaProvider } from "@/components/mesa/MesaProvider";

export const dynamic = "force-dynamic";

export default async function MesaLayout({ children }: LayoutProps<"/mesa">) {
  const ctx = await getTableContext();
  if (!ctx) {
    const hadCookie = (await cookies()).has(TABLE_COOKIE);
    redirect(hadCookie ? "/?aviso=fin" : "/");
  }
  return (
    <MesaProvider initial={await buildMesaState(ctx)}>
      <div className="glow-top min-h-dvh">
        <div className="mx-auto max-w-md px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">{children}</div>
      </div>
    </MesaProvider>
  );
}
