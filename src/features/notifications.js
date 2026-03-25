/**
 * 通知服务
 */
import { apiService } from '../core/api.js';

class NotificationService {
  constructor() {
    this.config = this._loadConfig();
    this._swRegistered = false;
  }

  _loadConfig() {
    const fallback = {
      serverchan: { enabled: false, key: '' },
      pushplus: { enabled: false, token: '' },
      email: { enabled: false, to: '', serviceId: '', templateId: '', publicKey: '' },
      iosPush: { enabled: false },
    };

    for (const storage of [localStorage, sessionStorage]) {
      try {
        const s = storage.getItem('crypto_notify');
        if (s) {
          const cfg = JSON.parse(s);
          if (!cfg.iosPush) cfg.iosPush = { enabled: false };
          return cfg;
        }
      } catch {}
    }
    return fallback;
  }

  saveConfig() {
    const json = JSON.stringify(this.config);
    try { localStorage.setItem('crypto_notify', json); } catch {}
    try { sessionStorage.setItem('crypto_notify', json); } catch {}
  }

  /**
   * 发送所有启用的通知
   */
  async send(title, body) {
    const promises = [];
    const sc = this.config.serverchan;
    const pp = this.config.pushplus;
    const em = this.config.email;
    const iosP = this.config.iosPush;

    if (sc.enabled && sc.key) {
      promises.push(
        apiService.sendServerChan(sc.key, title, body)
          .catch(e => console.warn('Server酱发送失败:', e))
      );
    }
    if (pp.enabled && pp.token) {
      promises.push(
        apiService.sendPushPlus(pp.token, title, body)
          .catch(e => console.warn('PushPlus发送失败:', e))
      );
    }
    if (em.enabled && em.to && em.serviceId && em.templateId && em.publicKey) {
      promises.push(
        apiService.sendEmail(em, title, body)
          .catch(e => console.warn('Email发送失败:', e))
      );
    }
    if (iosP?.enabled) {
      promises.push(Promise.resolve(this._sendBrowserNotification(title, body)));
    }

    await Promise.allSettled(promises);
  }

  /**
   * 发送浏览器通知
   */
  _sendBrowserNotification(title, body, tag = 'crypto-alert') {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const opts = {
        body,
        tag,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
        requireInteraction: true,
        silent: false,
        timestamp: Date.now(),
        data: { url: '/' },
      };

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts))
          .catch(() => new Notification(title, opts));
      } else {
        new Notification(title, opts);
      }
    } catch (e) {
      console.warn('Notification failed:', e);
    }
  }

  /**
   * 请求通知权限
   */
  async requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        await Notification.requestPermission();
      }
    }
    if ('serviceWorker' in navigator) {
      await this._registerServiceWorker();
    }
  }

  /**
   * 注册 Service Worker
   */
  async _registerServiceWorker() {
    if (this._swRegistered || !('serviceWorker' in navigator)) return false;

    const swCode = `
var CACHE_NAME = 'crypto-monitor-v1';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE_NAME).map(caches.delete))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(a => { for (let c of a) if ('focus' in c) return c.focus(); return self.clients.openWindow('/'); }));
});
`;

    // 尝试多种注册策略
    try {
      const blob = new Blob([swCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(blob);
      await navigator.serviceWorker.register(swUrl, { scope: '/' });
      this._swRegistered = true;
      return true;
    } catch {}

    try {
      for (const path of ['./sw.js', '/sw.js']) {
        try {
          await navigator.serviceWorker.register(path, { scope: '/' });
          this._swRegistered = true;
          return true;
        } catch {}
      }
    } catch {}

    return false;
  }
}

export const notificationService = new NotificationService();
export default notificationService;
