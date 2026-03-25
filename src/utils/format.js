/**
 * 格式化工具函数
 */

/**
 * 格式化价格显示
 * @param {number} p - 价格
 * @returns {string}
 */
export function fmt(p) {
  if (p == null || isNaN(p)) return '--';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return '$' + p.toFixed(4);
  if (p >= 0.001) return '$' + p.toFixed(6);
  return '$' + p.toFixed(8);
}

/**
 * 格式化原始价格（不含 $ 符号）
 * @param {number} p - 价格
 * @returns {string}
 */
export function fmtRaw(p) {
  if (p == null || isNaN(p)) return '--';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.001) return p.toFixed(6);
  return p.toFixed(8);
}

/**
 * 格式化交易量
 * @param {number} v - 交易量
 * @returns {string}
 */
export function fmtVol(v) {
  if (v == null || isNaN(v)) return '--';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
  return '$' + v.toFixed(2);
}

/**
 * 格式化解锁数量
 * @param {number} n - 数量
 * @returns {string}
 */
export function fmtUnlockAmount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toLocaleString();
}

/**
 * 格式化紧凑数字
 * @param {number} n - 数字
 * @returns {string}
 */
export function fmtCompact(n) {
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  return '$' + (n / 1e6).toFixed(2) + 'M';
}

/**
 * 根据符号生成颜色
 * @param {string} s - 符号
 * @returns {string} - 十六进制颜色
 */
export function hashColor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  const c = (h >>> 0) & 0xFFFFFF;
  return '#' + c.toString(16).padStart(6, '0');
}

/**
 * HTML 转义
 * @param {string} s - 字符串
 * @returns {string}
 */
export function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/**
 * 属性转义
 * @param {string} s - 字符串
 * @returns {string}
 */
export function escapeAttr(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 获取相对时间文本
 * @param {number} ts - 时间戳
 * @returns {string}
 */
export function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return '刚刚';
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return '刚刚';
  if (sec < 60) return sec + '秒前';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + '分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + '小时前';
  return Math.floor(hr / 24) + '天前';
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} wait - 等待时间(ms)
 * @returns {Function}
 */
export function throttle(func, wait) {
  let timeout = null;
  let previous = 0;
  return function(...args) {
    const now = Date.now();
    const remaining = wait - (now - previous);
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间(ms)
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout = null;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * 解析 URL 参数
 * @param {string} url - URL
 * @returns {object}
 */
export function parseUrlParams(url) {
  const params = {};
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch {}
  return params;
}

/**
 * 深拷贝
 * @param {any} obj - 要拷贝的对象
 * @returns {any}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (obj instanceof Object) {
    const copy = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        copy[key] = deepClone(obj[key]);
      }
    }
    return copy;
  }
  return obj;
}

/**
 * 从文本中提取已知币种符号
 * @param {string} text - 文本
 * @param {string[]} knownSymbols - 已知符号列表
 * @returns {string[]}
 */
export function extractSymbols(text, knownSymbols) {
  const upper = text.toUpperCase();
  const found = [];
  for (const sym of knownSymbols) {
    const re = new RegExp('(?:^|[\\s$¥€,，。])' + sym + '(?:[\\s$¥€,，。：:]|$)', 'i');
    if (re.test(upper) || upper.includes(sym + '/') || upper.includes(sym + 'USDT') || upper.includes(sym + '-USDT')) {
      if (!found.includes(sym)) found.push(sym);
    }
  }
  return found;
}

/**
 * 获取 CoinGecko URL
 * @param {string} sym - 符号
 * @param {object} coinIdMap - ID 映射表
 * @returns {string}
 */
export function getCoinUrl(sym, coinIdMap) {
  const id = coinIdMap[sym] || sym.toLowerCase();
  return `https://www.coingecko.com/en/coins/${id}`;
}
