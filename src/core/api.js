/**
 * API 服务
 */
import { API_CONFIG } from '../config/constants.js';

class ApiService {
  constructor() {
    this._cgThrottleMs = API_CONFIG.CG_THROTTLE_MS;
    this._lastCgFetch = 0;
  }

  /**
   * 带 CORS 代理的 fetch
   */
  async fetchWithCors(url, timeout = API_CONFIG.REQUEST_TIMEOUT) {
    for (const makeUrl of API_CONFIG.CORS_PROXIES) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(makeUrl(url), { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch {
        clearTimeout(t);
      }
    }
    throw new Error('Fetch failed');
  }

  /**
   * CoinGecko 节流请求
   */
  async cgFetch(url, timeout = API_CONFIG.REQUEST_TIMEOUT) {
    const now = Date.now();
    const elapsed = now - this._lastCgFetch;
    if (elapsed < this._cgThrottleMs) {
      await new Promise(r => setTimeout(r, this._cgThrottleMs - elapsed));
    }
    this._lastCgFetch = Date.now();
    return this.fetchWithCors(url, timeout);
  }

  /**
   * 通用 JSON fetch
   */
  async fetchJson(url, timeout = API_CONFIG.REQUEST_TIMEOUT) {
    try {
      return await this.fetchWithCors(url, timeout);
    } catch {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(res.status);
        return await res.json();
      } catch (err) {
        clearTimeout(t);
        throw err;
      }
    }
  }

  /**
   * 发送 Server 酱通知
   */
  async sendServerChan(key, title, body) {
    const url = `https://sctapi.ftqq.com/${key}.send`;
    for (const makeUrl of API_CONFIG.CORS_PROXIES) {
      try {
        const res = await fetch(makeUrl(url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `title=${encodeURIComponent(title)}&desp=${encodeURIComponent(body)}`,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.code === 0) return true;
        }
      } catch {}
    }
    throw new Error('Server酱发送失败');
  }

  /**
   * 发送 PushPlus 通知
   */
  async sendPushPlus(token, title, body) {
    const url = 'https://www.pushplus.plus/send';
    for (const makeUrl of API_CONFIG.CORS_PROXIES) {
      try {
        const res = await fetch(makeUrl(url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, title, content: body, template: 'txt' }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.code === 200) return true;
        }
      } catch {}
    }
    throw new Error('PushPlus发送失败');
  }

  /**
   * 发送 Email 通知
   */
  async sendEmail(cfg, title, body) {
    const url = 'https://api.emailjs.com/api/v1.0/email/send';
    const payload = {
      service_id: cfg.serviceId,
      template_id: cfg.templateId,
      user_id: cfg.publicKey,
      template_params: {
        subject: title,
        message: body,
        to_email: cfg.to,
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return true;
    throw new Error('Email发送失败');
  }

  /**
   * 获取 RSS Feed
   */
  async fetchRssFeed(url, sourceName, maxItems, parseRssItems) {
    for (const makeUrl of API_CONFIG.CORS_PROXIES) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        const r = await fetch(makeUrl(url), { signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const xml = await r.text();
        if (!xml.includes('<item')) continue;
        return parseRssItems(xml, sourceName, maxItems);
      } catch {
        clearTimeout(t);
      }
    }
    return [];
  }
}

export const apiService = new ApiService();
export default apiService;
