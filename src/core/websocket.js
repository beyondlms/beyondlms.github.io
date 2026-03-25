/**
 * WebSocket 服务
 */
import { API_CONFIG, KEEPALIVE_CONFIG } from '../config/constants.js';

class WebSocketService {
  constructor() {
    this.connections = [];
    this.reconnectTimers = {};
    this.lastDataTime = {};
    this._wsBinanceLastDataTime = {}; // 独立追踪 Binance 数据
  }

  /**
   * 创建 WebSocket 连接
   * @param {string} url - WebSocket URL
   * @param {string[]} symbols - 币种符号数组
   * @param {Function} onMessage - 消息处理函数
   * @param {string} connKey - 连接标识
   * @returns {WebSocket}
   */
  createConnection(url, symbols, onMessage, connKey) {
    const conn = {
      url,
      symbols,
      connKey,
      ws: null,
      _pingInterval: null,
      _reconnectCount: 0,
    };

    try {
      conn.ws = new WebSocket(url);

      conn.ws.onopen = () => {
        console.log(`[WS] ${connKey} 连接已建立`);
        conn._reconnectCount = 0;

        // 发送订阅消息 (Binance 格式)
        if (url.includes('binance')) {
          const streams = symbols.map(s => `${s.toLowerCase()}usdt@ticker`).join('/');
          conn.ws.send(JSON.stringify({
            method: 'SUBSCRIBE',
            params: streams.split('/'),
            id: Date.now(),
          }));
        }

        // 启动心跳
        conn._pingInterval = setInterval(() => {
          if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            // Binance 不需要 ping，由服务器推送
          }
        }, 30000);
      };

      // 包装 onmessage 以追踪 Binance 数据
      const origOnMessage = conn.ws.onmessage;
      conn.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.data && data.data.s) {
            const sym = data.data.s.replace('USDT', '');
            this._wsBinanceLastDataTime[sym] = Date.now();
          }
        } catch {}
        onMessage(event);
      };

      conn.ws.onerror = (err) => {
        console.warn(`[WS] ${connKey} 错误:`, err);
      };

      conn.ws.onclose = (event) => {
        console.log(`[WS] ${connKey} 连接关闭 (code: ${event.code})`);
        if (conn._pingInterval) clearInterval(conn._pingInterval);

        // 自动重连
        if (!event.wasClean && conn._reconnectCount < 5) {
          const delay = Math.min(1000 * Math.pow(2, conn._reconnectCount), 30000);
          console.log(`[WS] ${connKey} ${delay/1000}s 后重连...`);
          this.reconnectTimers[connKey] = setTimeout(() => {
            conn._reconnectCount++;
            this.createConnection(url, symbols, onMessage, connKey);
          }, delay);
        }
      };

    } catch (err) {
      console.error(`[WS] ${connKey} 创建失败:`, err);
    }

    this.connections.push(conn);
    return conn;
  }

  /**
   * 检查 Binance 连接是否活跃
   * @param {string} sym - 币种符号
   * @returns {boolean}
   */
  isBinanceStale(sym) {
    const lastTs = this._wsBinanceLastDataTime[sym] || 0;
    return (Date.now() - lastTs) > 15000;
  }

  /**
   * 关闭所有连接
   */
  closeAll() {
    this.connections.forEach(conn => {
      if (conn.ws) conn.ws.close();
      if (conn._pingInterval) clearInterval(conn._pingInterval);
    });
    this.connections = [];
    Object.values(this.reconnectTimers).forEach(t => clearTimeout(t));
    this.reconnectTimers = {};
  }

  /**
   * 更新保活数据时间
   * @param {string} connKey - 连接标识
   */
  updateDataTime(connKey) {
    this.lastDataTime[connKey] = Date.now();
  }

  /**
   * 检查连接健康状态
   * @returns {object}
   */
  getHealthStatus() {
    const now = Date.now();
    let healthyCount = 0;
    let staleCount = 0;

    this.connections.forEach(conn => {
      const lastData = this.lastDataTime[conn.connKey] || 0;
      if ((now - lastData) < KEEPALIVE_CONFIG.WS_STALE_THRESHOLD) {
        healthyCount++;
      } else {
        staleCount++;
      }
    });

    return {
      total: this.connections.length,
      healthy: healthyCount,
      stale: staleCount,
      allDead: staleCount > 0 && staleCount === this.connections.length,
    };
  }
}

export const wsService = new WebSocketService();
export default wsService;
