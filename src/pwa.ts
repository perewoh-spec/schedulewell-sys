// Guarded PWA service worker registration.
// Never registers in dev, inside an iframe, or when ?sw=off is present.

const SW_URL = "/sw.js";

function shouldSkip(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => r.active?.scriptURL?.endsWith(SW_URL) || r.installing?.scriptURL?.endsWith(SW_URL) || r.waiting?.scriptURL?.endsWith(SW_URL))
      .map((r) => r.unregister()),
  );
}

export async function registerPWA() {
  if (!("serviceWorker" in navigator)) return;
  if (shouldSkip()) {
    await unregisterMatching().catch(() => {});
    return;
  }
  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox(SW_URL);
    wb.addEventListener("waiting", () => wb.messageSkipWaiting());
    await wb.register();
  } catch {
    // ignore
  }
}
