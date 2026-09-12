// Service worker do Evoluo.
//
// Existe por um motivo só: receber Web Push. Notificação de navegador só
// chega através de um service worker — não há como o app receber push com a
// aba fechada sem ele, e é justamente com a aba fechada que o lembrete
// importa (antes da meia-noite, quando a pessoa esqueceu do check-in).
//
// Deliberadamente NÃO faz cache offline: o Evoluo lê dados que mudam o dia
// inteiro (streak, ranking, quem fez check-in), e servir isso de cache
// mostraria um placar errado. Offline aqui seria pior que a tela de erro.

self.addEventListener("install", () => {
  // Assume o controle sem esperar a aba antiga fechar — senão a primeira
  // inscrição só passaria a valer no próximo carregamento.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // Push sem corpo JSON (teste manual, ping do navegador): ainda mostra
    // algo em vez de engolir o evento em silêncio.
    payload = {};
  }

  const title = payload.title || "Evoluo";
  const options = {
    body: payload.body || "Você ainda não fez o check-in de hoje.",
    icon: "/icon",
    badge: "/icon",
    // Uma notificação de lembrete substitui a anterior em vez de empilhar:
    // duas cobranças do mesmo dia é ruído, não insistência.
    tag: "evoluo-checkin",
    renotify: true,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  // Se o app já estiver aberto numa aba, foca nela em vez de abrir outra.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
