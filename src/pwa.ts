import { registerSW } from 'virtual:pwa-register';

/**
 * Keep installed copies (e.g. added to an iPhone Home Screen) up to date.
 * iOS keeps home-screen apps suspended in memory and rarely re-checks the service worker on its own,
 * so check for a new version whenever the app comes back to the foreground, and hourly while open.
 * With registerType "autoUpdate" the new version activates straight away and the page reloads;
 * lists are saved on every change, so nothing is lost.
 */
export function setupUpdates() {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      let last = 0;
      const check = () => {
        if (!navigator.onLine || Date.now() - last < 60_000) return;
        last = Date.now();
        reg.update().catch(() => undefined);
      };
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      window.addEventListener('focus', check);
    },
  });
}
