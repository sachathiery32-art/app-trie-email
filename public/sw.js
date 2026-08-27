self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Email Organizer AI", {
      body: data.body || "Un email important demande votre attention.",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.messageId || "email-organizer-notification",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      return existing ? existing.focus() : self.clients.openWindow(event.notification.data?.url || "/");
    }),
  );
});
