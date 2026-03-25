/**
 * 预警功能模块
 */
import { FORCE_ALERT_CONFIG } from '../config/constants.js';
import { fmtRaw, escapeHtml } from '../utils/format.js';
import { audioService } from './audio.js';
import { notificationService } from './notifications.js';

class AlertsFeature {
  constructor() {
    this.alerts = [];
    this.forceAlerts = [];
    this.forceAlertSnapshots = {};
    this.forceMonitorTimer = null;
    this._lastScreenAlertTime = 0;
    this.SCREEN_ALERT_COOLDOWN = 5000;
  }

  /**
   * 初始化预警数据
   */
  init(storageService) {
    this.alerts = storageService.getAlerts();
    this.forceAlerts = storageService.getForceAlerts();
    this.forceAlertSnapshots = storageService.getForceSnapshots();
  }

  /**
   * 保存预警数据
   */
  saveAlerts(storageService) {
    storageService.saveAlerts(this.alerts);
  }

  saveForceAlerts(storageService) {
    storageService.saveForceAlerts(this.forceAlerts);
  }

  saveForceSnapshots(storageService) {
    storageService.saveForceSnapshots(this.forceAlertSnapshots);
  }

  /**
   * 检查普通预警
   */
  checkAlerts(sym, currentPrice, callbacks = {}) {
    const now = Date.now();
    let hasUrgent = false;
    let hasAlert = false;

    this.alerts.forEach(a => {
      if (a.symbol !== sym) return;

      const hit = (a.dir === 'above' && currentPrice >= a.price) ||
                  (a.dir === 'below' && currentPrice <= a.price);

      if (hit) {
        const cooldown = a.cooldownMs || 5000;
        if (now - (a.lastNotified || 0) < cooldown) return;

        a.lastNotified = now;
        this.saveAlerts(callbacks.storageService);
        hasAlert = true;

        if (!a._everTriggered) {
          a._everTriggered = true;
          hasUrgent = true;
        }

        callbacks.onToast?.(`预警触发: ${sym} $${fmtRaw(currentPrice)}`);
        callbacks.onSound?.(hasUrgent ? 'urgent' : 'alert');
        callbacks.onNotification?.(`🔔 ${sym} 预警`, `${sym} 当前 $${fmtRaw(currentPrice)}`);
      } else {
        a._everTriggered = false;
        if (a.lastNotified) {
          a.lastNotified = 0;
          this.saveAlerts(callbacks.storageService);
        }
      }
    });

    return { hasUrgent, hasAlert };
  }

  /**
   * 记录强制预警快照
   */
  recordForceSnapshot(sym, price) {
    if (!this.forceAlerts.some(f => f.enabled && f.symbol === sym)) return;

    const now = Date.now();
    if (!this.forceAlertSnapshots[sym]) {
      this.forceAlertSnapshots[sym] = [];
    }

    const snaps = this.forceAlertSnapshots[sym];
    if (snaps.length && snaps[snaps.length - 1].p === price) return;

    snaps.push({ p: price, t: now });

    // 清理过期快照
    const cutoff = now - FORCE_ALERT_CONFIG.SNAPSHOT_MAX_AGE_MS;
    while (snaps.length && snaps[0].t < cutoff) snaps.shift();
  }

  /**
   * 计算窗口跌幅
   */
  calcWindowDrop(sym, windowMinutes) {
    const snaps = this.forceAlertSnapshots[sym];
    if (!snaps || snaps.length < 2) {
      return { drop: 0, fromPrice: 0, toPrice: 0, windowActual: 0 };
    }

    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const cutoff = now - windowMs;

    const inWindow = snaps.filter(s => s.t >= cutoff);
    if (inWindow.length < 2) {
      return { drop: 0, fromPrice: 0, toPrice: 0, windowActual: 0 };
    }

    const peakPrice = Math.max(...inWindow.map(s => s.p));
    const currentPrice = inWindow[inWindow.length - 1].p;
    const dropPct = peakPrice > 0 ? ((peakPrice - currentPrice) / peakPrice * 100) : 0;
    const windowActual = (now - inWindow[0].t) / 60000;

    return { drop: dropPct, fromPrice: peakPrice, toPrice: currentPrice, windowActual };
  }

  /**
   * 检查所有强制预警
   */
  checkForceAlerts(callbacks = {}) {
    const now = Date.now();

    this.forceAlerts.forEach(fa => {
      if (!fa.enabled) return;

      const cooldown = fa.cooldownMs || FORCE_ALERT_CONFIG.DEFAULT_COOLDOWN_MS;
      if (now - (fa.lastTriggered || 0) < cooldown) return;

      const result = this.calcWindowDrop(fa.symbol, fa.windowMinutes);
      if (result.drop >= fa.dropPercent && result.fromPrice > 0) {
        fa.lastTriggered = now;
        this.saveForceAlerts(callbacks.storageService);

        callbacks.onToast?.(`🚨 ${fa.symbol} ${fa.windowMinutes}分钟内跌幅 ${result.drop.toFixed(2)}%！`);
        callbacks.onUrgent?.();
        callbacks.onNotification?.(`🚨 强制预警 — ${fa.symbol}`, `${fa.windowMinutes}min内跌${result.drop.toFixed(2)}%`);
      }
    });
  }

  /**
   * 同步强制预警监控器
   */
  syncForceMonitors(storageService) {
    const hasEnabled = this.forceAlerts.some(f => f.enabled);

    if (hasEnabled && !this.forceMonitorTimer) {
      // 初始化快照
      this.forceAlerts.filter(f => f.enabled).forEach(fa => {
        if (!this.forceAlertSnapshots[fa.symbol]?.length) {
          if (callbacks.priceHistory?.[fa.symbol]?.length) {
            const ph = callbacks.priceHistory[fa.symbol];
            this.forceAlertSnapshots[fa.symbol] = [{ p: ph[ph.length - 1].p, t: Date.now() }];
          }
        }
      });

      this.forceMonitorTimer = setInterval(() => {
        this.checkForceAlerts({ storageService });
      }, FORCE_ALERT_CONFIG.SNAPSHOT_INTERVAL_MS);

    } else if (!hasEnabled && this.forceMonitorTimer) {
      clearInterval(this.forceMonitorTimer);
      this.forceMonitorTimer = null;
    }
  }

  /**
   * 清理定时器
   */
  cleanup() {
    if (this.forceMonitorTimer) {
      clearInterval(this.forceMonitorTimer);
      this.forceMonitorTimer = null;
    }
  }
}

export const alertsFeature = new AlertsFeature();
export default alertsFeature;
