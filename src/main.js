/**
 * Crypto Monitor - 主入口文件
 * 模块化重构版本
 */

// ── 导入模块 ──
import { API_CONFIG, REFRESH_CONFIG, UI_CONFIG, CACHE_CONFIG, COIN_ID_MAP } from './config/constants.js';
import { storageService } from './core/storage.js';
import { apiService } from './core/api.js';
import { wsService } from './core/websocket.js';
import { audioService } from './features/audio.js';
import { notificationService } from './features/notifications.js';
import { alertsFeature } from './features/alerts.js';
import { newsFeature } from './features/news.js';
import { VirtualList } from './ui/VirtualList.js';
import {
  fmt, fmtRaw, fmtVol, fmtCompact, hashColor,
  escapeHtml, escapeAttr, throttle, debounce,
  relativeTime, extractSymbols, getCoinUrl, fmtUnlockAmount
} from './utils/format.js';

// ── 状态管理 ──
const state = {
  coins: [],
  coinApiMap: {},
  activeApi: 0,
  refreshSec: REFRESH_CONFIG.DEFAULT_REFRESH_SEC,
  currency: 'USD',
  currencyRates: { CNY: 7.25, EUR: 0.92 },
  soundEnabled: true,
  voiceEnabled: false,
  spellSymbols: false,
  isLightTheme: false,
  colorInverted: false,
  screenAlertEnabled: false,
  priceHistory: {},
  prevPrices: {},
  portfolio: [],
  timer: null,
  priceCache: {},
};

// ── 辅助函数 ──

// 货币转换
function convertCurrency(priceUSD) {
  if (state.currency === 'CNY') return priceUSD * state.currencyRates.CNY;
  if (state.currency === 'EUR') return priceUSD * state.currencyRates.EUR;
  return priceUSD;
}

// 获取币种朗读名称
function getCoinSpeechName(sym) {
  if (state.spellSymbols) {
    return sym.split('').join(' ');
  }
  const names = {
    BTC: '比特币', ETH: '以太坊', BNB: '币安币', SOL: '索拉纳',
    XRP: '瑞波币', ADA: '艾达币', DOGE: '狗狗币', AVAX: '雪崩币',
    DOT: '波卡', LINK: '链link', MATIC: '马蒂奇', UNI: 'uniswap',
    SHIB: '屎币', LTC: '莱特币', TRX: '波场', ATOM: '原子币',
  };
  return names[sym] || sym;
}

// ── 核心功能 ──

// 初始化
function init() {
  // 加载数据
  state.coins = storageService.getCoins();
  state.coinApiMap = storageService.getCoinApiMap();
  state.portfolio = storageService.getPortfolio();
  state.activeApi = parseInt(localStorage.getItem('crypto_api') || '0');
  state.refreshSec = storageService.getNumber('crypto_refresh', REFRESH_CONFIG.DEFAULT_REFRESH_SEC);
  state.currency = localStorage.getItem('crypto_currency') || 'USD';
  state.soundEnabled = storageService.getBool('crypto_sound', true);
  state.voiceEnabled = storageService.getBool('crypto_voice', false);
  state.spellSymbols = storageService.getBool('crypto_spell', false);
  state.isLightTheme = localStorage.getItem('crypto_theme') === 'light';
  state.colorInverted = storageService.getBool('crypto_color_invert', false);
  state.screenAlertEnabled = storageService.getBool('crypto_screen_alert', false);

  // 初始化预警模块
  alertsFeature.init(storageService);

  // 绑定事件
  bindEvents();

  // 应用主题
  applyTheme();
  applyColorInvert();

  // 渲染
  initSelects();
  render();

  // 启动 WebSocket
  binanceWsConnect();

  // 启动轮询
  fetchPrices();
  state.timer = setInterval(fetchPrices, state.refreshSec * 1000);

  // 启动后台任务
  fetchTrending();
  fetchCurrencyRates();
  fetchMarketOverview();
  setInterval(fetchMarketOverview, CACHE_CONFIG.MARKET_OVERVIEW_INTERVAL);

  // 同步强制预警
  alertsFeature.syncForceMonitors({ storageService, priceHistory: state.priceHistory });

  // 启动保活系统
  startKeepaliveSystem();

  // 延迟初始化
  setTimeout(showOnboarding, 1500);
  setTimeout(() => notificationService.requestPermission(), 3000);

  console.log('[Crypto Monitor] 模块化版本已初始化');
}

// ── WebSocket 连接 ──

function binanceWsConnect() {
  if (!state.coins.length) return;

  const majorCoins = state.coins.filter(c =>
    ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK'].includes(c.symbol)
  );

  if (!majorCoins.length) return;

  const symbols = majorCoins.map(c => c.symbol);
  const streams = symbols.map(s => `${s.toLowerCase()}usdt@ticker`).join('/');

  wsService.createConnection(
    `${API_CONFIG.BINANCE_WS_URL}/${streams}`,
    symbols,
    handleWsMessage,
    'binance_major'
  );
}

function handleWsMessage(event) {
  try {
    const data = JSON.parse(event.data);
    if (!data.data) return;

    const sym = data.data.s?.replace('USDT', '');
    if (!sym) return;

    const price = parseFloat(data.data.c);
    const change = parseFloat(data.data.P);
    const high = parseFloat(data.data.h);
    const low = parseFloat(data.data.l);
    const volume = parseFloat(data.data.q);

    if (!price || isNaN(price)) return;

    // 更新价格历史
    if (!state.priceHistory[sym]) state.priceHistory[sym] = [];

    const prev = state.priceHistory[sym][state.priceHistory[sym].length - 1];
    state.priceHistory[sym].push({
      p: price,
      c: change,
      h: high,
      l: low,
      v: volume,
      t: Date.now(),
    });

    // 限制历史长度
    if (state.priceHistory[sym].length > 500) {
      state.priceHistory[sym] = state.priceHistory[sym].slice(-500);
    }

    // 检查预警
    alertsFeature.recordForceSnapshot(sym, price);

    // 触发更新
    updateCoinRow(sym);
    checkAlertsThrottled(sym, price);

  } catch (e) {
    // 忽略解析错误
  }
}

// ── 价格获取 ──

async function fetchPrices() {
  if (!state.coins.length) return;

  const symbols = state.coins.map(c => c.symbol.toLowerCase()).join(',');

  try {
    const data = await apiService.fetchWithCors(
      `${API_CONFIG.BINANCE_REST_URL}/ticker/24hr?symbols=["${symbols.map(s => s.toUpperCase() + 'USDT').join('","')}"]`
    );

    if (Array.isArray(data)) {
      data.forEach(item => {
        const sym = item.symbol.replace('USDT', '');
        const price = parseFloat(item.lastPrice);
        const change = parseFloat(item.priceChangePercent);
        const high = parseFloat(item.highPrice);
        const low = parseFloat(item.lowPrice);
        const volume = parseFloat(item.quoteVolume);

        applyCoinData(sym, { p: price, c: change, h: high, l: low, v: volume }, 'fetch');
      });
    }

  } catch (e) {
    console.warn('[Fetch] 价格获取失败:', e);
  }
}

function applyCoinData(sym, data, sourceLabel) {
  if (!sym || !data) return;

  // 更新价格历史
  if (!state.priceHistory[sym]) state.priceHistory[sym] = [];

  const prev = state.priceHistory[sym][state.priceHistory[sym].length - 1];
  state.priceHistory[sym].push({
    p: data.p,
    c: data.c ?? (prev ? ((data.p - prev.p) / prev.p * 100) : 0),
    h: data.h,
    l: data.l,
    v: data.v,
    t: Date.now(),
  });

  if (state.priceHistory[sym].length > 500) {
    state.priceHistory[sym] = state.priceHistory[sym].slice(-500);
  }

  // 记录预警快照
  alertsFeature.recordForceSnapshot(sym, data.p);

  // 更新连接数据时间
  wsService.updateDataTime(sourceLabel);
}

// ── 渲染 ──

function render() {
  const tableBody = document.getElementById('tableBody');
  if (!tableBody) return;

  const rows = state.coins.map(coin => {
    const ph = state.priceHistory[coin.symbol];
    const last = ph?.[ph.length - 1];
    const prev = ph?.[ph.length - 2];

    const price = last ? convertCurrency(last.p) : 0;
    const change = last?.c ?? 0;
    const high = last ? convertCurrency(last.h) : 0;
    const low = last ? convertCurrency(last.l) : 0;
    const volume = last?.v ?? 0;

    const color = hashColor(coin.symbol);
    const ini = coin.symbol.slice(0, 3);

    const hasAlert = state.alerts?.some(a => a.symbol === coin.symbol);
    const hasForceAlert = state.forceAlerts?.some(f => f.symbol === coin.symbol && f.enabled);

    return `
      <div class="table-row" data-sym="${escapeAttr(coin.symbol)}">
        <div class="coin-cell">
          <div class="coin-icon" style="background:${color}">${escapeHtml(ini)}</div>
          <div class="coin-info">
            <span class="coin-sym">${escapeHtml(coin.symbol)}</span>
            <span class="coin-name">${escapeHtml(coin.name || coin.symbol)}</span>
          </div>
          ${hasAlert ? '<span class="alert-indicator" title="已设置预警">🔔</span>' : ''}
          ${hasForceAlert ? '<span class="force-alert-indicator" title="强制预警">🚨</span>' : ''}
        </div>
        <div class="price-cell">
          <span class="price">${fmt(price)}</span>
          ${change !== 0 ? `<span class="change ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>` : ''}
        </div>
        <div class="range-cell">
          <span class="range-high">${fmt(high)}</span>
          <span class="range-low">${fmt(low)}</span>
        </div>
        <div class="volume-cell">
          <span>${fmtVol(volume)}</span>
        </div>
      </div>
    `;
  }).join('');

  tableBody.innerHTML = rows;
}

function updateCoinRow(sym) {
  const row = document.querySelector(`[data-sym="${sym}"]`);
  if (!row) return;

  const ph = state.priceHistory[sym];
  const last = ph?.[ph.length - 1];
  if (!last) return;

  const price = convertCurrency(last.p);
  const priceEl = row.querySelector('.price');
  const changeEl = row.querySelector('.change');

  if (priceEl) {
    const oldPrice = priceEl.textContent;
    const newPrice = fmt(price);
    if (oldPrice !== newPrice) {
      priceEl.textContent = newPrice;
      priceEl.classList.add('price-flash');
      setTimeout(() => priceEl.classList.remove('price-flash'), 300);
    }
  }

  if (changeEl) {
    changeEl.textContent = `${last.c >= 0 ? '+' : ''}${last.c.toFixed(2)}%`;
    changeEl.className = `change ${last.c >= 0 ? 'up' : 'down'}`;
  }
}

// ── 事件绑定 ──

function bindEvents() {
  // 搜索输入
  const inputEl = document.getElementById('input');
  if (inputEl) {
    inputEl.addEventListener('input', debounce(e => onSearchInput(e.target.value), 300));
    inputEl.addEventListener('keydown', onSearchKey);
  }

  // 添加按钮
  const addBtn = document.getElementById('addBtn');
  if (addBtn) {
    addBtn.addEventListener('click', addFromInput);
  }

  // 快捷键
  document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
  const tag = e.target.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    return;
  }

  if (isInput) return;

  const shortcuts = {
    '/': () => document.getElementById('input')?.focus(),
    'a': () => openAlertModal(),
    'p': () => openPortfolioModal(),
    'h': () => openHelpModal(),
    's': () => toggleSound(),
    't': () => toggleTheme(),
    'e': () => openNewsModal(),
    'u': () => openUnlockModal(),
    'f': () => openForceAlertModal(),
  };

  shortcuts[e.key]?.();
}

// ── 搜索 ──

let searchResults = [];
let searchIdx = -1;

function onSearchInput(val) {
  const q = val.trim().toUpperCase();
  const dd = document.getElementById('searchDropdown');
  if (q.length < 1) { dd?.classList.remove('open'); return; }

  const localMatch = state.coins.filter(c =>
    c.symbol.startsWith(q) || c.name.toUpperCase().includes(q)
  );

  if (localMatch.length) {
    renderSearchResults(localMatch.map(c => ({
      symbol: c.symbol, name: c.name, rank: null, added: true
    })));
  }

  // API 搜索
  setTimeout(async () => {
    if (q.length < 2) return;
    try {
      const data = await apiService.cgFetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`
      );
      if (data?.coins) {
        const apiResults = data.coins.slice(0, 15).map(c => ({
          symbol: (c.symbol || '').toUpperCase(),
          name: c.name || '',
          rank: c.market_cap_rank,
          added: state.coins.some(x => x.symbol === (c.symbol || '').toUpperCase()),
        }));
        renderSearchResults([...localMatch.map(c => ({ symbol: c.symbol, name: c.name, rank: null, added: true })),
          ...apiResults.filter(r => !localMatch.some(l => l.symbol === r.symbol))].slice(0, 20));
      }
    } catch {}
  }, 350);
}

function renderSearchResults(results) {
  searchResults = results;
  searchIdx = -1;
  const dd = document.getElementById('searchDropdown');
  if (!results.length) { dd?.classList.remove('open'); return; }

  dd.innerHTML = results.map((r, i) => `
    <div class="search-item" data-idx="${i}" onclick="selectSearchResult(${i})">
      <span class="search-item-sym">${escapeHtml(r.symbol)}</span>
      <span class="search-item-name">${escapeHtml(r.name)}</span>
      ${r.rank ? `<span class="search-item-rank">#${r.rank}</span>` : ''}
      ${r.added ? '<span class="search-item-added">✓ 已添加</span>' : ''}
    </div>
  `).join('');
  dd.classList.add('open');
}

function selectSearchResult(idx) {
  const r = searchResults[idx];
  if (!r) return;
  addCoin(r.symbol, r.name);
  document.getElementById('input').value = '';
  document.getElementById('searchDropdown')?.classList.remove('open');
}

function addFromInput() {
  const input = document.getElementById('input');
  const val = input?.value.trim().toUpperCase();
  if (!val) return;

  const existing = state.coins.find(c => c.symbol === val);
  if (existing) {
    showToast(`${val} 已在列表中`, 'info');
    return;
  }

  state.coins.push({ symbol: val, name: val });
  storageService.saveCoins(state.coins);

  if (state.activeApi >= 0) {
    state.coinApiMap[val] = state.activeApi;
    storageService.saveCoinApiMap(state.coinApiMap);
  }

  render();
  fetchPrices();
  showToast(`已添加 ${val}`);
  input.value = '';
}

// ── Toast ──

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const existingToasts = container.querySelectorAll('.toast:not(.toast-exit)');
  if (existingToasts.length >= UI_CONFIG.MAX_TOASTS) {
    const oldest = existingToasts[0];
    oldest.classList.add('toast-exit');
    setTimeout(() => oldest.remove(), 300);
  }

  const el = document.createElement('div');
  el.className = 'toast' + (type === 'alert' ? ' alert-toast' : '');
  const title = type === 'alert' ? '⚠️ 价格预警' : type === 'error' ? '❌ 错误' : '✅ 提示';
  el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${escapeHtml(String(msg))}</div>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-exit');
    setTimeout(() => el.remove(), 300);
  }, UI_CONFIG.TOAST_DURATION);
}

const checkAlertsThrottled = throttle((sym, price) => {
  const result = alertsFeature.checkAlerts(sym, price, {
    storageService,
    onToast: showToast,
    onSound: type => {
      if (state.soundEnabled) {
        if (type === 'urgent') audioService.playUrgentSound();
        else if (type === 'alert') audioService.playAlertSound();
        else audioService.playNotifySound();
      }
    },
    onNotification: (title, body) => notificationService.send(title, body),
  });

  if (result.hasUrgent) {
    playUrgentSound();
  } else if (result.hasAlert) {
    playAlertSound();
  }
}, 1000);

// ── 辅助功能 ──

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  storageService.setBool('crypto_sound', state.soundEnabled);
  document.getElementById('soundToggle').textContent = state.soundEnabled ? '🔊' : '🔇';
}

function toggleTheme() {
  state.isLightTheme = !state.isLightTheme;
  localStorage.setItem('crypto_theme', state.isLightTheme ? 'light' : 'dark');
  applyTheme();
}

function applyTheme() {
  document.body.classList.toggle('light-theme', state.isLightTheme);
}

function applyColorInvert() {
  document.body.classList.toggle('color-inverted', state.colorInverted);
}

function initSelects() {
  const sel = document.getElementById('alertCoin');
  if (sel) {
    sel.innerHTML = state.coins.map(c =>
      `<option value="${c.symbol}">${escapeHtml(c.symbol)} - ${escapeHtml(c.name)}</option>`
    ).join('');
  }
}

function openAlertModal() { document.getElementById('alertModalOverlay')?.classList.add('active'); }
function closeAlertModal() { document.getElementById('alertModalOverlay')?.classList.remove('active'); }
function openPortfolioModal() { document.getElementById('portfolioModalOverlay')?.classList.add('active'); }
function closePortfolioModal() { document.getElementById('portfolioModalOverlay')?.classList.remove('active'); }
function openHelpModal() { document.getElementById('helpModalOverlay')?.classList.add('active'); }
function closeHelpModal() { document.getElementById('helpModalOverlay')?.classList.remove('active'); }
function openNewsModal() { document.getElementById('newsModalOverlay')?.classList.add('active'); }
function closeNewsModal() { document.getElementById('newsModalOverlay')?.classList.remove('active'); }
function openUnlockModal() { document.getElementById('unlockModalOverlay')?.classList.add('active'); }
function closeUnlockModal() { document.getElementById('unlockModalOverlay')?.classList.remove('active'); }
function openForceAlertModal() { document.getElementById('forceAlertModalOverlay')?.classList.add('active'); }
function closeForceAlertModal() { document.getElementById('forceAlertModalOverlay')?.classList.remove('active'); }

function playAlertSound() { if (state.soundEnabled) audioService.playAlertSound(); }
function playNotifySound() { if (state.soundEnabled) audioService.playNotifySound(); }
function playUrgentSound() { if (state.soundEnabled) audioService.playUrgentSound(); }

// ── 数据获取 ──

async function fetchTrending() {
  try {
    const [trending, top] = await Promise.allSettled([
      apiService.cgFetch('https://api.coingecko.com/api/v3/search/trending', 10000),
      apiService.cgFetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20', 10000),
    ]);

    if (trending.status === 'fulfilled' && trending.value?.coins) {
      // 处理热搜数据
    }
  } catch {}
}

async function fetchCurrencyRates() {
  try {
    const d = await apiService.fetchWithCors(API_CONFIG.EXCHANGERATE_URL, 8000);
    if (d?.rates) {
      state.currencyRates.CNY = d.rates.CNY || 7.25;
      state.currencyRates.EUR = d.rates.EUR || 0.92;
    }
  } catch {}
}

async function fetchMarketOverview() {
  try {
    const [globalRes] = await Promise.allSettled([
      apiService.cgFetch('https://api.coingecko.com/api/v3/global', 10000),
    ]);

    if (globalRes.status === 'fulfilled' && globalRes.value?.data) {
      const d = globalRes.value.data;
      const cap = d.total_market_cap?.usd;
      const chg = d.market_cap_change_percentage_24h_usd;
      const btcD = d.market_cap_percentage?.btc;

      document.getElementById('mktCap').textContent = cap ? fmtCompact(cap) : '--';
      const mktChgEl = document.getElementById('mktCapChg');
      if (mktChgEl && chg != null) {
        mktChgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
        mktChgEl.className = 'market-stat-change ' + (chg >= 0 ? 'up' : 'down');
      }
      document.getElementById('btcDom').textContent = btcD != null ? `${btcD.toFixed(1)}%` : '--';
    }
  } catch {}
}

// ── 保活系统 ──

function startKeepaliveSystem() {
  const isEdge = /Edg\//.test(navigator.userAgent);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const now = Date.now();
      // 长时间离开后恢复
      fetchPrices();
    }
  });

  if (isEdge) {
    document.addEventListener('resume', () => {
      fetchPrices();
      wsService.closeAll();
      binanceWsConnect();
    });
  }
}

// ── 引导 ──

function showOnboarding() {
  if (localStorage.getItem('crypto_onboarded')) return;

  const tip = document.createElement('div');
  tip.className = 'onboarding-tip';
  tip.innerHTML = `
    <p>🎉 欢迎使用 <strong>Crypto Monitor</strong>！</p>
    <div class="tip-keys">
      <span class="tip-key"><kbd>/</kbd> 搜索</span>
      <span class="tip-key"><kbd>A</kbd> 预警</span>
      <span class="tip-key"><kbd>P</kbd> 持仓</span>
    </div>
    <button onclick="this.parentElement.remove();localStorage.setItem('crypto_onboarded','1')">开始使用 →</button>
  `;
  document.body.appendChild(tip);
}

// ── 导出 ──

function addCoin(sym, name) {
  if (state.coins.find(c => c.symbol === sym)) return;

  state.coins.push({ symbol: sym, name: name || sym });
  storageService.saveCoins(state.coins);

  if (state.activeApi >= 0) {
    state.coinApiMap[sym] = state.activeApi;
    storageService.saveCoinApiMap(state.coinApiMap);
  }

  render();
  fetchPrices();
}

// ── 清理 ──

window.addEventListener('beforeunload', () => {
  if (state.timer) clearInterval(state.timer);
  alertsFeature.cleanup();
  wsService.closeAll();
  audioService.close();
});

// ── 导出全局函数（兼容旧 HTML）──
window.addCoin = addCoin;
window.showToast = showToast;
window.openAlertModal = openAlertModal;
window.closeAlertModal = closeAlertModal;
window.openPortfolioModal = openPortfolioModal;
window.closePortfolioModal = closePortfolioModal;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.openNewsModal = openNewsModal;
window.closeNewsModal = closeNewsModal;
window.openUnlockModal = openUnlockModal;
window.closeUnlockModal = closeUnlockModal;
window.openForceAlertModal = openForceAlertModal;
window.closeForceAlertModal = closeForceAlertModal;
window.toggleSound = toggleSound;
window.toggleTheme = toggleTheme;
window.playAlertSound = playAlertSound;
window.playNotifySound = playNotifySound;
window.playUrgentSound = playUrgentSound;
window.selectSearchResult = selectSearchResult;
window.removeCoin = (idx) => {
  state.coins.splice(idx, 1);
  storageService.saveCoins(state.coins);
  render();
};
window.removeAlert = (idx) => {
  alertsFeature.alerts.splice(idx, 1);
  alertsFeature.saveAlerts(storageService);
};

// 初始化
document.addEventListener('DOMContentLoaded', init);
