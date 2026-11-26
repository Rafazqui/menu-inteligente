// Service worker del panel: recibe las notificaciones push y abre el panel al tocarlas.
// No intercepta peticiones (no hay "fetch"), así no afecta a la app de las mesas.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Nueva alerta", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Nueva alerta", {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: false,
      data: { url: data.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).pathname.startsWith("/admin") && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
