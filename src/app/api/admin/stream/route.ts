import { requireStaff } from "@/lib/admin";
import { bus, ensureListener, type BusEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** Canal en tiempo real (Server-Sent Events) para el panel del personal. */
export async function GET(req: Request) {
  const user = await requireStaff(null);
  if (user instanceof Response) return user;
  ensureListener(); // escuchar los avisos de todos los servidores (LISTEN/NOTIFY)

  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const onEvt = (e: BusEvent) => {
        if (e.restaurantId === user.restaurant_id) send(`data: ${JSON.stringify(e)}\n\n`);
      };
      bus.on("evt", onEvt);
      const ping = setInterval(() => send(": ping\n\n"), 20_000);
      send(`retry: 3000\ndata: {"topic":"hello"}\n\n`);
      cleanup = () => {
        bus.off("evt", onEvt);
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
