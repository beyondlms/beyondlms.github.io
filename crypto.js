// ── Config ──
const CORS_PROXIES = [
  url => url,
  url => 'https://corsproxy.io/?' + encodeURIComponent(url),
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
];

const APIS = [
  { name: 'Gate.io',  price: s => `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${s}_USDT`, parse: d => { const v = Array.isArray(d)?d[0]:null; return v ? {p:parseFloat(v.last),h:parseFloat(v.high_24h)||0,l:parseFloat(v.low_24h)||0,v:parseFloat(v.quote_volume_24h)||0,c:parseFloat(v.change_percentage)||0} : null; } },
  { name: 'Binance',  price: s => `https://api.binance.com/api/v3/ticker/24hr?symbol=${s}USDT`, parse: d => d?.lastPrice ? {p:parseFloat(d.lastPrice),h:parseFloat(d.highPrice)||0,l:parseFloat(d.lowPrice)||0,v:parseFloat(d.quoteVolume)||0,c:parseFloat(d.priceChangePercent)||0} : null },
  { name: 'OKX',      price: s => `https://www.okx.com/api/v5/market/ticker?instId=${s}-USDT`, parse: d => { const v=d?.data?.[0]; if(!v)return null; const l=parseFloat(v.last),o=parseFloat(v.open24h); return {p:l,h:parseFloat(v.high24h)||0,l:parseFloat(v.low24h)||0,v:parseFloat(v.volCcy24h)||0,c:o?((l-o)/o*100):0}; } },
  { name: 'MEXC',     price: s => `https://api.mexc.com/api/v3/ticker/24hr?symbol=${s}USDT`, parse: d => d?.lastPrice ? {p:parseFloat(d.lastPrice),h:parseFloat(d.highPrice)||0,l:parseFloat(d.lowPrice)||0,v:parseFloat(d.quoteVolume)||0,c:parseFloat(d.priceChangePercent)||0} : null },
  { name: 'Bitget',   price: s => `https://api.bitget.com/api/v2/spot/market/tickers?symbol=${s}USDT`, parse: d => { const v=d?.data?.[0]; return v ? {p:parseFloat(v.lastPr),h:parseFloat(v.high24h)||0,l:parseFloat(v.low24h)||0,v:parseFloat(v.usdtVolume)||0,c:parseFloat(v.change24h)||0} : null; } },
  { name: 'HTX',      price: s => `https://api.huobi.pro/market/detail/merged?symbol=${s.toLowerCase()}usdt`, parse: d => { const v=d?.tick; if(!v)return null; return {p:v.close,h:v.high||0,l:v.low||0,v:v.vol||0,c:v.open?((v.close-v.open)/v.open*100):0}; } },
];

const DEFAULT_COINS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'WLFI', name: 'World Liberty Financial' },
];

// ── State ──
let coins = loadCoins();
let activeApi = parseInt(localStorage.getItem('crypto_api') || '-1');
let coinApiMap = loadCoinApiMap();
let refreshSec = parseInt(localStorage.getItem('crypto_refresh') || '5');
let timer = null;
let currency = localStorage.getItem('crypto_currency') || 'USD';
let currencyRates = { USD: 1, CNY: 7.25, EUR: 0.92 };
let alerts = loadAlerts();
let sortState = { key: null, asc: true };
let cardView = localStorage.getItem('crypto_card_view') === '1';
let priceHistory = {}; // { 'BTC': [p1, p2, ...] } for sparklines
let prevPrices = {};   // { 'BTC': lastPrice } for flash animation
let soundEnabled = localStorage.getItem('crypto_sound') !== '0'; // default on
let voiceEnabled = localStorage.getItem('crypto_voice') === '1'; // default off (user opt-in)
let spellSymbols = localStorage.getItem('crypto_spell') === '1'; // default off: Chinese name → letter-by-letter
// audioCtx defined in Sound Engine section below
let isLightTheme = localStorage.getItem('crypto_theme') === 'light';
let colorInverted = localStorage.getItem('crypto_color_invert') === '1';

// ── WebSocket State ──
const WS_MAJOR_SYMBOLS = new Set([
  'BTC','ETH','BNB','SOL','XRP','ADA','DOGE','TRX','AVAX','DOT',
  'LINK','MATIC','UNI','SHIB','LTC','BCH','ATOM','XLM','NEAR','APT',
  'ARB','OP','FIL','INJ','SUI','PEPE','SEI','WLD','TIA','ORDI',
  'AAVE','MKR','SNX','COMP','CRV','LDO','STX','IMX','RNDR','FET',
]);
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws/';
const BINANCE_WS_COMBINED = 'wss://stream.binance.com:9443/stream?streams=';
const OKX_WS_URL = 'wss://ws.okx.com:8443/ws/v5/public';
const WS_BATCH_SIZE = 30; // Binance combined stream limit
const WS_OKX_BATCH_SIZE = 50; // OKX can handle more per connection
let wsConnections = [];    // active WebSocket instances { ws, provider, batchIdx, symbols }
let wsManagedSymbols = new Set(); // symbols currently on WS
let wsProviderOf = {};    // { 'BTC': 'binance' | 'okx' } — which provider each symbol uses
let wsReconnectTimers = {};
let wsRetryCount = {};  // { connKey: consecutiveRetryCount }

function isWsEligible(sym) { return WS_MAJOR_SYMBOLS.has(sym); }

function wsGetBackoffDelay(connKey, baseMs) {
  wsRetryCount[connKey] = (wsRetryCount[connKey] || 0) + 1;
  const exp = Math.min(baseMs * Math.pow(2, wsRetryCount[connKey] - 1), 30000);
  const jitter = Math.random() * baseMs * 0.5;
  return Math.round(exp + jitter);
}

// ── Persistence ──
function loadCoins() {
  let raw;
  try { const s = localStorage.getItem('crypto_coins_v4'); if (s) raw = JSON.parse(s); } catch {}
  if (!raw) return DEFAULT_COINS.map(c => ({...c}));
  // Deduplicate by symbol (keep first occurrence) — localStorage can get dupes from older versions or cross-tab writes
  const seen = new Set();
  return raw.filter(c => {
    const sym = (c.symbol || '').toUpperCase();
    if (!sym || seen.has(sym)) return false;
    seen.add(sym);
    return true;
  });
}
function saveCoins() { localStorage.setItem('crypto_coins_v4', JSON.stringify(coins)); }
function loadCoinApiMap() { try { const s=localStorage.getItem('crypto_coin_api'); if(s)return JSON.parse(s); } catch{} return {}; }
function saveCoinApiMap() { localStorage.setItem('crypto_coin_api', JSON.stringify(coinApiMap)); }
function loadAlerts() { try { const s=localStorage.getItem('crypto_alerts'); if(s)return JSON.parse(s); } catch{} return []; }
function saveAlerts() { localStorage.setItem('crypto_alerts', JSON.stringify(alerts)); }

// ── Formatting ──
function fmt(n) {
  if (n==null||isNaN(n)) return '—';
  const r = currency !== 'USD' ? n * currencyRates[currency] : n;
  const prefix = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : '€';
  return prefix + (r >= 1000 ? r.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    : r >= 1 ? r.toFixed(2)
    : r >= 0.01 ? r.toFixed(4)
    : r.toFixed(8));
}
function fmtRaw(n) {
  if (n==null||isNaN(n)) return '—';
  return n >= 1 ? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    : n < 0.01 ? n.toFixed(8) : n.toFixed(4);
}
function fmtVol(n) {
  if (n==null||isNaN(n)||n===0) return '—';
  if (n >= 1e8) return (n/1e8).toFixed(2) + '亿 USDT';
  if (n >= 1e4) return (n/1e4).toFixed(2) + '万 USDT';
  return n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}) + ' USDT';
}

// ── CORS-aware fetch ──
async function fetchWithCors(url, ms = 6000) {
  for (const makeUrl of CORS_PROXIES) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(makeUrl(url), { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return await r.json();
    } catch { clearTimeout(t); }
  }
  throw new Error('all proxies failed');
}

// ── Concurrency limiter ──
async function limitPool(tasks, max = 6) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]().catch(e => ({ error: e }));
    }
  }
  await Promise.all(Array.from({ length: Math.min(max, tasks.length) }, () => worker()));
  return results;
}

// ── Init selects ──
function initSelects() {
  const apiSelect = document.getElementById('apiSelect');
  APIS.forEach((api, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = api.name;
    apiSelect.appendChild(opt);
  });
  apiSelect.value = activeApi;
  document.getElementById('refreshSelect').value = refreshSec;
  document.getElementById('currencySelect').value = currency;
}

function pickApi(i) {
  activeApi = parseInt(i);
  localStorage.setItem('crypto_api', activeApi);
  if (activeApi >= 0) { coins.forEach(c => { coinApiMap[c.symbol] = activeApi; }); saveCoinApiMap(); }
  fetchPrices();
}

function setCurrency(c) {
  currency = c;
  localStorage.setItem('crypto_currency', c);
  fetchPrices();
}

function setInterval_(sec) {
  refreshSec = sec;
  localStorage.setItem('crypto_refresh', sec);
  clearInterval(timer);
  timer = setInterval(fetchPrices, sec * 1000);
  updateWsStatus();
  fetchPrices();
}

// ── Sorting ──
function sortBy(key) {
  document.querySelectorAll('.table-head span').forEach(s => s.classList.remove('sort-active'));
  if (sortState.key === key) {
    sortState.asc = !sortState.asc;
  } else {
    sortState.key = key;
    sortState.asc = key === 'change' ? false : true; // default: change desc
  }
  const el = document.getElementById('sort-' + key);
  if (el) {
    el.classList.add('sort-active');
    el.querySelector('.sort-arrow').textContent = sortState.asc ? '▲' : '▼';
  }
  render();
}

function getSortedCoins() {
  if (!sortState.key) return [...coins];
  const k = sortState.key;
  const dir = sortState.asc ? 1 : -1;
  return [...coins].sort((a, b) => {
    const va = priceHistory[a.symbol] ? getSortVal(a.symbol, k) : -Infinity;
    const vb = priceHistory[b.symbol] ? getSortVal(b.symbol, k) : -Infinity;
    return (va - vb) * dir;
  });
}

function getSortVal(sym, key) {
  const ph = priceHistory[sym];
  if (!ph || !ph.length) return 0;
  const last = ph[ph.length - 1];
  switch (key) {
    case 'price': return last.p || 0;
    case 'high': return last.h || 0;
    case 'low': return last.l || 0;
    case 'vol': return last.v || 0;
    case 'change': return last.c || 0;
    default: return 0;
  }
}

// ── View toggle ──
function toggleView() {
  cardView = !cardView;
  localStorage.setItem('crypto_card_view', cardView ? '1' : '0');
  document.getElementById('tableContainer').classList.toggle('view-cards', cardView);
}

// ── Sparkline SVG ──
function sparklineSvg(sym) {
  const hist = priceHistory[sym];
  if (!hist || hist.length < 2) return '';
  const prices = hist.map(h => h.p).filter(p => p > 0);
  if (prices.length < 2) return '';
  const w = 70, h = 22;
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = prices[prices.length - 1];
  const first = prices[0];
  const color = last >= first ? 'var(--green)' : 'var(--red)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${w}" cy="${h - ((last - min) / range) * h}" r="2" fill="${color}"/>
  </svg>`;
}

// ── Render ──
function render() {
  const el = document.getElementById('rows');
  const emp = document.getElementById('empty');
  const sorted = getSortedCoins();
  if (!sorted.length) { el.innerHTML = ''; emp.style.display = ''; return; }
  emp.style.display = 'none';

  el.innerHTML = sorted.map((c, i) => {
    const sym = c.symbol;
    const origIdx = coins.findIndex(x => x.symbol === sym);
    const apiIdx = coinApiMap[sym];
    const apiTag = apiIdx != null && APIS[apiIdx]
      ? `<span class="api-badge" data-api="${sym}">${APIS[apiIdx].name}</span>`
      : `<span class="api-badge api-probing" data-api="${sym}">探测中…</span>`;
    const hasAlert = alerts.some(a => a.symbol === sym);
    const alertTag = hasAlert ? `<span class="alert-indicator" title="已设置预警">🔔</span>` : '';
    const pnlTag = portfolio.some(p => p.symbol === sym) ? getPnlHtml(sym) : '';
    const ph = priceHistory[sym];
    const last = ph && ph.length ? ph[ph.length - 1] : null;

    return `<div class="table-row" id="row-${sym}" data-sym="${sym}">
      <button class="remove-btn" onclick="removeCoin(${origIdx})" title="移除">✕</button>
      <div class="coin-info">
        <span class="coin-sym">${sym}${apiTag}${alertTag}</span>
        <span class="coin-name">${escapeHtml(c.name||'')} ${pnlTag}</span>
      </div>
      <div class="coin-price" id="p-${sym}"><span class="card-label">最新价</span><span class="card-value">${last ? fmt(last.p) : '—'}</span></div>
      <div class="coin-high" id="h-${sym}"><span class="card-label">24h最高</span><span class="card-value">${last && last.h ? fmt(last.h) : '—'}</span></div>
      <div class="coin-low" id="l-${sym}"><span class="card-label">24h最低</span><span class="card-value">${last && last.l ? fmt(last.l) : '—'}</span></div>
      <div class="coin-vol" id="v-${sym}"><span class="card-label">24h成交额</span><span class="card-value">${last ? fmtVol(last.v) : '—'}</span></div>
      <div class="coin-change" id="c-${sym}" style="${last ? 'color:' + (last.c >= 0 ? 'var(--green)' : 'var(--red)') : ''}"><span class="card-label">涨跌幅</span><span class="card-value">${last ? (last.c>=0?'+':'')+last.c.toFixed(2)+'%' : '—'}</span></div>
      <div class="sparkline-cell" id="sp-${sym}">${sparklineSvg(sym)}</div>
    </div>`;
  }).join('');

  document.getElementById('tableContainer').classList.toggle('view-cards', cardView);
}

// ── Coin CRUD ──
function addCoin(sym, name) {
  sym = sym.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!sym || coins.find(c=>c.symbol===sym)) return;
  coins.push({symbol:sym, name:name||sym}); saveCoins();
  if (activeApi >= 0) { coinApiMap[sym] = activeApi; saveCoinApiMap(); }
  render();
  if (isWsEligible(sym)) { wsResync(); fetchPrices(); } else { fetchPrices(); }
}
function removeCoin(i) {
  const sym = coins[i].symbol;
  delete coinApiMap[sym]; saveCoinApiMap();
  delete priceHistory[sym];
  delete prevPrices[sym];
  delete wsProviderOf[sym];
  wsManagedSymbols.delete(sym);
  // Remove ALL entries with this symbol (defensive against dupes)
  coins = coins.filter(c => c.symbol !== sym); saveCoins();
  render();
  wsResync();
  fetchPrices();
}
function addFromInput() {
  const v = document.getElementById('input').value.trim();
  if (v) { addCoin(v); document.getElementById('input').value=''; }
}
document.getElementById('input').addEventListener('keydown', e => { if(e.key==='Enter') addFromInput(); });

// ── Apply coin data (shared by WS + polling) ──
function applyCoinData(sym, data, sourceLabel) {
  const { p, h, l, v, c: ch } = data;

  // Update price history (keep last 200 for RSI etc.)
  if (!priceHistory[sym]) priceHistory[sym] = [];
  priceHistory[sym].push({ p, h, l, v, c: ch, t: Date.now() });
  if (priceHistory[sym].length > 200) priceHistory[sym].shift();

  // Flash animation
  const prev = prevPrices[sym];
  let flashClass = '';
  if (prev != null && prev !== p) {
    flashClass = p > prev ? 'flash-up' : 'flash-down';
  }
  prevPrices[sym] = p;

  // DOM update
  const pEl = document.getElementById('p-' + sym);
  const hEl = document.getElementById('h-' + sym);
  const lEl = document.getElementById('l-' + sym);
  const vEl = document.getElementById('v-' + sym);
  const cEl = document.getElementById('c-' + sym);
  const spEl = document.getElementById('sp-' + sym);
  const row = document.getElementById('row-' + sym);

  if (pEl) { const pv = pEl.querySelector('.card-value') || pEl; pv.textContent = fmt(p); if (flashClass) { pEl.classList.remove('flash-up', 'flash-down'); void pEl.offsetWidth; pEl.classList.add(flashClass); } }
  if (hEl) { const hv = hEl.querySelector('.card-value') || hEl; hv.textContent = h ? fmt(h) : '—'; }
  if (lEl) { const lv = lEl.querySelector('.card-value') || lEl; lv.textContent = l ? fmt(l) : '—'; }
  if (vEl) { const vv = vEl.querySelector('.card-value') || vEl; vv.textContent = fmtVol(v); }
  if (cEl) { const cv = cEl.querySelector('.card-value') || cEl; cv.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%'; cEl.style.color = ch >= 0 ? 'var(--green)' : 'var(--red)'; }
  if (row) { row.className = 'table-row ' + (ch >= 0 ? 'up' : 'down'); }
  if (spEl) spEl.innerHTML = sparklineSvg(sym);

  // Source badge
  const badge = document.querySelector('[data-api="' + sym + '"]');
  if (badge && sourceLabel) {
    badge.textContent = sourceLabel;
    if (sourceLabel === 'Binance WS') {
      badge.className = 'api-badge ws-badge ws-binance';
    } else if (sourceLabel === 'OKX WS') {
      badge.className = 'api-badge ws-badge ws-okx';
    } else {
      badge.className = 'api-badge';
    }
  }

  // Check alerts
  checkAlerts(sym, p);
}

// ── Multi-Provider WebSocket Manager (Binance primary → OKX fallback) ──
function getWsSymbols() {
  return coins.filter(c => isWsEligible(c.symbol)).map(c => c.symbol);
}

function getPollSymbols() {
  return coins.filter(c => !isWsEligible(c.symbol)).map(c => c.symbol);
}

function wsCloseAll() {
  wsConnections.forEach(conn => {
    clearInterval(conn._pingInterval);
    try { conn.ws.close(); } catch {}
  });
  wsConnections = [];
  Object.values(wsReconnectTimers).forEach(t => clearTimeout(t));
  wsReconnectTimers = {};
  wsRetryCount = {};
  wsManagedSymbols.clear();
  wsProviderOf = {};
}

function binanceWsConnect() {
  wsCloseAll();

  const symbols = getWsSymbols();
  if (!symbols.length) { updateWsStatus(); return; }

  // Batch for Binance
  const batches = [];
  for (let i = 0; i < symbols.length; i += WS_BATCH_SIZE) {
    batches.push(symbols.slice(i, i + WS_BATCH_SIZE));
  }

  // Connect Binance primary
  batches.forEach((batch, idx) => {
    wsConnectBinanceBatch(batch, 'b' + idx);
  });

  // Connect OKX as fallback (all symbols in one or two connections)
  const okxBatches = [];
  for (let i = 0; i < symbols.length; i += WS_OKX_BATCH_SIZE) {
    okxBatches.push(symbols.slice(i, i + WS_OKX_BATCH_SIZE));
  }
  okxBatches.forEach((batch, idx) => {
    wsConnectOkxBatch(batch, 'o' + idx);
  });

  // Initially mark all as Binance (primary); OKX data will override if Binance is late
  symbols.forEach(s => { wsProviderOf[s] = 'binance'; });
  wsManagedSymbols = new Set(symbols);
  updateWsStatus();
}

// ── Binance WS ──
function wsConnectBinanceBatch(symbols, connKey) {
  const streams = symbols.map(s => s.toLowerCase() + 'usdt@ticker').join('/');
  const url = BINANCE_WS_BASE + streams;

  try {
    const ws = new WebSocket(url);
    const conn = { ws, provider: 'binance', connKey, symbols };
    ws._conn = conn;

    ws.onopen = () => {
      wsRetryCount[connKey] = 0;
      updateWsStatus();
      // ── Binance WS 保活: 发送 JSON ping 每 3 分钟 ──
      // Binance stream API 支持 {"method":"ping"} 来检测连接活性
      conn._pingInterval = setInterval(() => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
          }
        } catch {}
      }, 180000); // 3 分钟（Binance 建议的 ping 间隔）
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const d = msg.data || msg;
        const sym = (d.s || '').replace('USDT', '');
        if (!sym) return;

        const p = parseFloat(d.c), h = parseFloat(d.h), l = parseFloat(d.l);
        const v = parseFloat(d.q), ch = parseFloat(d.P);
        if (isNaN(p)) return;

        // Binance is primary — always accept
        wsProviderOf[sym] = 'binance';
        wsManagedSymbols.add(sym);
        applyCoinData(sym, { p, h, l, v, c: ch }, 'Binance WS');
      } catch {}
    };

    ws.onerror = () => ws.close();
    ws.onclose = () => {
      clearInterval(conn._pingInterval);
      updateWsStatus();
      const delay = wsGetBackoffDelay(connKey, 2000);
      clearTimeout(wsReconnectTimers[connKey]);
      wsReconnectTimers[connKey] = setTimeout(() => {
        wsConnectBinanceBatch(symbols, connKey);
      }, delay);
    };

    wsConnections.push(conn);
  } catch {}
}

// ── OKX WS (fallback) ──
function wsConnectOkxBatch(symbols, connKey) {
  try {
    const ws = new WebSocket(OKX_WS_URL);
    const conn = { ws, provider: 'okx', connKey, symbols };
    ws._conn = conn;

    ws.onopen = () => {
      wsRetryCount[connKey] = 0;
      // Subscribe to tickers
      const args = symbols.map(s => ({
        channel: 'tickers',
        instId: s.toUpperCase() + '-USDT'
      }));
      ws.send(JSON.stringify({ op: 'subscribe', args }));
      updateWsStatus();

      // OKX requires ping every 30s to keep alive
      conn._pingInterval = setInterval(() => {
        try { ws.send('ping'); } catch {}
      }, 25000);
    };

    ws.onmessage = (event) => {
      // OKX sends 'pong' responses
      if (event.data === 'pong') return;

      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'subscribe' || msg.arg) return; // subscription ack

        const arr = msg.data;
        if (!Array.isArray(arr)) return;

        arr.forEach(d => {
          const instId = d.instId || '';
          const sym = instId.replace('-USDT', '').replace('-usdt', '');
          if (!sym) return;

          const p = parseFloat(d.last);
          const h = parseFloat(d.high24h);
          const l = parseFloat(d.low24h);
          const v = parseFloat(d.volCcy24h);
          const o = parseFloat(d.open24h);
          const ch = o ? ((p - o) / o * 100) : 0;

          if (isNaN(p)) return;

          // OKX is fallback — only accept if Binance hasn't provided data recently
          // or if this is the first data for this symbol
          const existing = priceHistory[sym];
          const lastTs = existing && existing.length ? existing[existing.length - 1].t : 0;
          const binanceStale = (Date.now() - lastTs) > 15000; // Binance data > 15s old

          if (!wsProviderOf[sym] || wsProviderOf[sym] === 'okx' || binanceStale) {
            wsProviderOf[sym] = 'okx';
            wsManagedSymbols.add(sym);
            applyCoinData(sym, { p, h, l, v, c: ch }, 'OKX WS');
          }
        });
      } catch {}
    };

    ws.onerror = () => ws.close();
    ws.onclose = () => {
      clearInterval(conn._pingInterval);
      updateWsStatus();
      const delay = wsGetBackoffDelay(connKey, 3000);
      clearTimeout(wsReconnectTimers[connKey]);
      wsReconnectTimers[connKey] = setTimeout(() => {
        wsConnectOkxBatch(symbols, connKey);
      }, delay);
    };

    wsConnections.push(conn);
  } catch {}
}

// ── Shared ──
function wsResync() {
  const needed = new Set(getWsSymbols());
  const same = needed.size === wsManagedSymbols.size && [...needed].every(s => wsManagedSymbols.has(s));
  if (!same) {
    binanceWsConnect(); // reconnect both providers
  }
}

function updateWsStatus() {
  const wsCount = [...wsManagedSymbols].filter(s => coins.some(c => c.symbol === s)).length;
  const pollCount = coins.length - wsCount;
  const interval = refreshSec >= 60 ? `${refreshSec / 60}分钟` : `${refreshSec}秒`;

  if (wsCount > 0 && pollCount > 0) {
    document.getElementById('subText').textContent = `⚡${wsCount}实时 + 🔄${pollCount}轮询`;
  } else if (wsCount > 0) {
    document.getElementById('subText').textContent = 'WebSocket 实时推送中';
  } else {
    document.getElementById('subText').textContent = `每${interval}自动刷新`;
  }
}

// ── Fetch Prices (polling for non-WS coins only) ──
async function tryApi(api, sym) {
  const d = await fetchWithCors(api.price(sym), 6000);
  const res = api.parse(d);
  if (!res) throw new Error('no data');
  return res;
}

async function fetchPrices() {
  if (!coins.length) { setStatus('live', '无币种'); return; }

  // Only poll coins not managed by WebSocket
  const pollCoins = coins.filter(c => !wsManagedSymbols.has(c.symbol));

  if (!pollCoins.length && wsManagedSymbols.size > 0) {
    // All coins on WS, nothing to poll
    const binanceCount = Object.values(wsProviderOf).filter(p => p === 'binance').length;
    const okxCount = Object.values(wsProviderOf).filter(p => p === 'okx').length;
    const parts = [];
    if (binanceCount) parts.push(`Binance⚡${binanceCount}`);
    if (okxCount) parts.push(`OKX⚡${okxCount}`);
    setStatus('live', `${parts.join(' · ')} · ${new Date().toLocaleTimeString('zh-CN')}`);
    updateTabBadge();
    return;
  }

  const tasks = (pollCoins.length ? pollCoins : coins).map(c => async () => {
    let list;
    const prefIdx = coinApiMap[c.symbol];
    if (activeApi >= 0) {
      list = [APIS[activeApi], ...APIS.filter((_,i) => i !== activeApi)];
    } else if (prefIdx != null && APIS[prefIdx]) {
      list = [APIS[prefIdx], ...APIS.filter((_,i) => i !== prefIdx)];
    } else {
      list = [...APIS];
    }

    for (const api of list) {
      try {
        const res = await tryApi(api, c.symbol);
        const apiIdx = APIS.indexOf(api);

        applyCoinData(c.symbol, res, api.name);

        if (coinApiMap[c.symbol] !== apiIdx) {
          coinApiMap[c.symbol] = apiIdx;
          saveCoinApiMap();
        }

        return { api: api.name };
      } catch {}
    }
    // All failed
    const cEl = document.getElementById('c-'+c.symbol);
    if (cEl) { const cv = cEl.querySelector('.card-value') || cEl; cv.textContent = '失败'; cEl.style.color = 'var(--muted)'; }
    const badge = document.querySelector('[data-api="'+c.symbol+'"]');
    if (badge) { badge.textContent = '无数据'; badge.className = 'api-badge api-probing'; }
    return null;
  });

  const results = await limitPool(tasks, 6);
  const usedApis = new Set();
  let ok = 0;
  results.forEach(r => { if (r && r.api) { usedApis.add(r.api); ok++; } });

  const apiNames = [...usedApis].join(' / ');
  const wsCount = wsManagedSymbols.size;
  const total = coins.length;
  const pollOk = ok;
  const allOk = pollOk + wsCount;

  if (allOk > 0 || pollOk > 0) {
    const parts = [];
    if (wsCount > 0) {
      const bn = Object.values(wsProviderOf).filter(p => p === 'binance').length;
      const ox = Object.values(wsProviderOf).filter(p => p === 'okx').length;
      const wsParts = [];
      if (bn) wsParts.push(`Binance⚡${bn}`);
      if (ox) wsParts.push(`OKX⚡${ox}`);
      parts.push(wsParts.join('+'));
    }
    if (pollOk > 0) parts.push(`${apiNames || 'OK'}·${pollOk}poll`);
    parts.push(`${allOk}/${total}`);
    parts.push(new Date().toLocaleTimeString('zh-CN'));
    setStatus('live', parts.join(' · '));
  } else {
    setStatus('error', '全部失败 — ' + refreshSec + 's 后重试');
  }
  updateTabBadge();
}

function setStatus(t,m) { document.getElementById('dot').className='dot '+t; document.getElementById('status').textContent=m; }

// ── Sound Engine (Web Audio API) ──
let audioCtx = null; // lazy init AudioContext
let audioUnlocked = false; // iOS requires user gesture to unlock

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // iOS: may be suspended after background — resume on demand
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  // iOS: context may have been closed entirely — recreate
  if (audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// iOS: unlock audio on first user gesture (required for PWA)
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    // Play a silent buffer to fully unlock
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    src.stop(0.001);
  } catch {}
  // Remove listeners after first unlock
  document.removeEventListener('touchstart', unlockAudio);
  document.removeEventListener('touchend', unlockAudio);
  document.removeEventListener('click', unlockAudio);
}

// Register unlock on first interaction
document.addEventListener('touchstart', unlockAudio, { once: false, passive: true });
document.addEventListener('touchend', unlockAudio, { once: false, passive: true });
document.addEventListener('click', unlockAudio, { once: false });

// ── AudioContext Health Recovery ──
// Browsers suspend/close AudioContext on lock screen, backgrounding, or memory pressure.
// We need aggressive recovery to keep sound working.

function recoverAudioContext() {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = null; // force recreate on next getAudioCtx()
      audioUnlocked = false;
      // Re-register unlock listeners
      document.addEventListener('touchstart', unlockAudio, { once: false, passive: true });
      document.addEventListener('touchend', unlockAudio, { once: false, passive: true });
      document.addEventListener('click', unlockAudio, { once: false });
      return;
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  } catch {
    audioCtx = null;
  }
}

// Aggressive recovery: check every 2 seconds whether AudioContext is alive
let _audioHealthTimer = setInterval(() => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}, 2000);

// visibilitychange: resume on foreground
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Aggressive recovery on every foreground return
    recoverAudioContext();
    // Double-tap: resume again after a short delay (iOS sometimes needs this)
    setTimeout(recoverAudioContext, 300);
    setTimeout(recoverAudioContext, 1000);
  }
});

// pageshow (back/forward cache restore on iOS/Safari)
window.addEventListener('pageshow', (e) => {
  recoverAudioContext();
  setTimeout(recoverAudioContext, 500);
  // Restore notification toggle state on bfcache restore
  restoreNotifyToggleState();
});

// pagehide (iOS freezes page — prepare for recovery)
window.addEventListener('pagehide', () => {
  // Nothing to do here; recovery happens on pageshow
});

// freeze event (Chrome background freezing)
document.addEventListener('freeze', () => {
  // Will be unfrozen later; recoverAudioContext handles it
});

document.addEventListener('resume', () => {
  recoverAudioContext();
  setTimeout(recoverAudioContext, 500);
});

// ── HTML5 Audio Fallback ──
// When AudioContext is suspended (lock screen), HTML5 <audio> elements
// with user gesture history can still play. We use this as a fallback.
let _audioFallbackReady = false;
let _fallbackAudioEl = null;

// Pre-encoded tiny beep sounds as base64 data URIs (short WAV)
const _BEEP_URGENT_DATA = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='; // placeholder — we generate dynamically
const _BEEP_NORMAL_DATA = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function initFallbackAudio() {
  if (_audioFallbackReady) return;
  _audioFallbackReady = true;
  try {
    _fallbackAudioEl = new Audio();
    _fallbackAudioEl.preload = 'auto';
    _fallbackAudioEl.volume = 0.5;
    // Generate a short beep WAV inline
    const sampleRate = 22050;
    const duration = 0.15;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    // WAV header
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    // Fill with a sine wave beep (1047Hz)
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.max(0, 1 - t / duration);
      const sample = Math.sin(2 * Math.PI * 1047 * t) * envelope * 0.5;
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
    }
    const blob = new Blob([buffer], { type: 'audio/wav' });
    _fallbackAudioEl.src = URL.createObjectURL(blob);
  } catch {}
}

// Initialize fallback audio on first user gesture
document.addEventListener('touchstart', () => initFallbackAudio(), { once: true, passive: true });
document.addEventListener('click', () => initFallbackAudio(), { once: true });

function playFallbackBeep() {
  if (!_audioFallbackReady) initFallbackAudio();
  if (!_fallbackAudioEl) return;
  try {
    _fallbackAudioEl.currentTime = 0;
    _fallbackAudioEl.play().catch(() => {});
  } catch {}
}

// 小爱风格清脆提示音：两个快速上升音阶 + 余韵
function playAlertSound() {
  if (!soundEnabled) return;
  let played = false;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    // 音符序列：模仿小爱的 "叮-叮-叮~" 风格
    const notes = [
      { freq: 880, start: 0,     dur: 0.12, vol: 0.35 },  // A5
      { freq: 1109, start: 0.14, dur: 0.12, vol: 0.35 },  // C#6
      { freq: 1319, start: 0.28, dur: 0.25, vol: 0.30 },  // E6 (尾音拉长)
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.start);

      // 轻微滑音增加灵动感
      osc.frequency.linearRampToValueAtTime(n.freq * 1.02, now + n.start + n.dur * 0.3);
      osc.frequency.linearRampToValueAtTime(n.freq, now + n.start + n.dur);

      // 包络：快速起音 + 柔和衰减
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(n.vol, now + n.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

      // 柔化高频，让声音更像语音助手
      filter.type = 'lowpass';
      filter.frequency.value = 3000;
      filter.Q.value = 0.5;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    });
    played = true;
  } catch {}
  // Fallback: if AudioContext failed or is suspended, use HTML5 Audio
  if (!played) playFallbackBeep();
}

// 普通通知音（较短）
function playNotifySound() {
  if (!soundEnabled) return;
  let played = false;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1047, now); // C6
    osc.frequency.linearRampToValueAtTime(1319, now + 0.08); // slide up to E6
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
    played = true;
  } catch {}
  if (!played) playFallbackBeep();
}

// 价格突破时的紧急提示音（循环 2 次）
function playUrgentSound() {
  if (!soundEnabled) return;
  let played = false;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    for (let rep = 0; rep < 2; rep++) {
      const offset = rep * 0.4;
      [880, 1175, 1319].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + offset + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.3, now + offset + i * 0.1 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + i * 0.1 + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset + i * 0.1);
        osc.stop(now + offset + i * 0.1 + 0.15);
      });
    }
    played = true;
  } catch {}
  if (!played) { playFallbackBeep(); setTimeout(playFallbackBeep, 250); }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('crypto_sound', soundEnabled ? '1' : '0');
  document.getElementById('soundToggle').textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) playNotifySound(); // test sound
}

function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem('crypto_voice', voiceEnabled ? '1' : '0');
  document.getElementById('voiceToggle').textContent = voiceEnabled ? '🗣️' : '🔇';
  if (voiceEnabled) {
    initSpeechEngine();
    speakAlert('语音播报已开启');
  }
}

function toggleSpell() {
  spellSymbols = !spellSymbols;
  localStorage.setItem('crypto_spell', spellSymbols ? '1' : '0');
  document.getElementById('spellToggle').textContent = spellSymbols ? '🔤' : '🀄';
  document.getElementById('spellToggle').title = spellSymbols ? '币种名称读法：逐字母拼读' : '币种名称读法：中文名称';
  showToast(spellSymbols ? '币种将逐字母拼读 (如 B-T-C)' : '常见币种使用中文名称 (如 比特币)');
}

// ── 语音播报引擎 (v2 - 防静默失效) ──
// Web Speech API 有多个已知致命问题:
// 1. Chrome 后台挂起: speechSynthesis 被浏览器暂停但状态不变
// 2. iOS Safari 15秒bug: 播放约15秒后无声停止
// 3. 引擎卡在 paused 状态: resume() 无效
// 4. onend/onerror 都不触发 → 队列永久阻塞
// 5. 语音列表为空直到 voiceschanged 触发(但该事件有时也不触发)

let zhVoice = null;           // 缓存选中的中文语音
let speechReady = false;      // 引擎是否已预热
let pendingSpeech = [];       // 预热前的待播报队列
let speechQueue = [];         // 播报队列（确保依次播放不中断）
let speechPlaying = false;    // 当前是否正在播报中
let speechWatchdog = null;    // 当前播报的 watchdog 定时器
let speechKeepalive = null;   // 防挂起的 keepalive 定时器
let speechFailCount = 0;      // 连续失败次数（用于触发引擎重置）
let speechEngineResetting = false; // 正在重置引擎
const SPEECH_MAX_FAIL = 3;    // 连续失败 3 次触发引擎硬重置

// ─── 初始化 ───
function initSpeechEngine() {
  if (!('speechSynthesis' in window)) return;
  pickZhVoice();
  startSpeechKeepalive();

  if (!speechReady) {
    try {
      // 预热：用极短文本激活引擎
      speechSynthesis.cancel(); // 清空残留状态
      const warmUp = new SpeechSynthesisUtterance('.');
      warmUp.volume = 0.01;
      warmUp.rate = 10;
      const warmDone = () => { speechReady = true; flushPendingSpeech(); };
      warmUp.onend = warmDone;
      warmUp.onerror = warmDone;
      speechSynthesis.speak(warmUp);
      // 双重保险：如果 onend 不触发
      setTimeout(warmDone, 800);
    } catch {
      speechReady = true;
    }
  }
}

// ─── 语音选择 ───
function pickZhVoice() {
  if (!('speechSynthesis' in window)) return;
  const all = speechSynthesis.getVoices();
  if (!all.length) return;
  zhVoice = all.find(v => v.lang === 'zh-CN')
    || all.find(v => v.lang.startsWith('zh'))
    || all.find(v => v.lang.startsWith('cmn'))
    || null;
}

if ('speechSynthesis' in window) {
  pickZhVoice();
  speechSynthesis.onvoiceschanged = () => pickZhVoice();
  // iOS 有时不触发 onvoiceschanged，反复尝试
  setTimeout(pickZhVoice, 500);
  setTimeout(pickZhVoice, 1500);
  setTimeout(pickZhVoice, 3000);
  setTimeout(pickZhVoice, 5000);
}

// ─── Keepalive: 防止浏览器挂起 speechSynthesis ───
// Chrome/iOS 会在后台冻结 speechSynthesis，导致后续播报无声。
// 每 5 秒检查一次状态并恢复。
function startSpeechKeepalive() {
  if (speechKeepalive) return;
  speechKeepalive = setInterval(() => {
    if (!('speechSynthesis' in window)) return;
    // 如果引擎被暂停，立即恢复
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
    }
    // 如果引擎"卡住"了（没在播放但 speechPlaying=true），检测恢复
    if (speechPlaying && !speechSynthesis.speaking && !speechSynthesis.pending) {
      // 引擎没有在说话也没有待说话，但标记为 playing → 说明 onend 没触发
      recoverStalledSpeech('keepalive检测到卡住');
    }
  }, 5000);
}

// ─── 前台恢复 ───
// 页面从后台/冻结恢复时，彻底重启语音引擎
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recoverSpeechEngine('页面恢复前台');
});
document.addEventListener('resume', () => recoverSpeechEngine('页面resume'));
window.addEventListener('pageshow', () => recoverSpeechEngine('pageshow'));
window.addEventListener('focus', () => recoverSpeechEngine('focus'));

function recoverSpeechEngine(reason) {
  if (!('speechSynthesis' in window)) return;
  console.log(`[Speech] 恢复引擎: ${reason}`);
  // 重启 keepalive
  if (speechKeepalive) { clearInterval(speechKeepalive); speechKeepalive = null; }
  startSpeechKeepalive();
  // 确保引擎不在 paused 状态
  if (speechSynthesis.paused) {
    speechSynthesis.cancel(); // cancel 比 resume 更可靠
  }
  // 重新加载语音列表
  pickZhVoice();
  setTimeout(pickZhVoice, 500);
  // 如果有播报卡住，立即恢复
  if (speechPlaying) {
    recoverStalledSpeech(reason);
  }
}

// ─── 卡住恢复 ───
function recoverStalledSpeech(reason) {
  console.warn(`[Speech] 恢复卡住的播报: ${reason}`);
  if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
  speechPlaying = false;
  speechFailCount++;
  if (speechFailCount >= SPEECH_MAX_FAIL) {
    hardResetSpeechEngine('连续失败' + speechFailCount + '次');
    return;
  }
  // 短延迟后继续队列
  setTimeout(() => processSpeechQueue(), 500);
}

// ─── 引擎硬重置 ───
// 当连续失败过多时，完全重建 speechSynthesis 状态
function hardResetSpeechEngine(reason) {
  if (speechEngineResetting) return;
  speechEngineResetting = true;
  console.warn(`[Speech] 硬重置引擎: ${reason}`);
  try { speechSynthesis.cancel(); } catch {}
  speechFailCount = 0;
  speechPlaying = false;
  if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
  // 保存未播放的队列
  const remaining = [...speechQueue];
  speechQueue = [];
  // 短暂延迟后重新预热并恢复队列
  setTimeout(() => {
    speechEngineResetting = false;
    speechReady = false;
    speechQueue = remaining;
    pendingSpeech = [];
    initSpeechEngine();
  }, 1000);
}

// ─── 核心播放 ───
function doSpeak(text) {
  if (!('speechSynthesis' in window)) { speechPlaying = false; processSpeechQueue(); return; }

  // 先清理旧的 watchdog
  if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }

  try {
    // 确保引擎不卡在 paused
    if (speechSynthesis.paused) {
      speechSynthesis.cancel();
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    if (zhVoice) utter.voice = zhVoice;

    let finished = false;
    const finish = (reason) => {
      if (finished) return;
      finished = true;
      speechFailCount = 0; // 成功播放，重置失败计数
      if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
      speechPlaying = false;
      setTimeout(() => processSpeechQueue(), 200);
    };

    utter.onend = () => finish('onend');
    utter.onerror = (e) => {
      console.warn('[Speech] error:', e.error);
      // 某些错误应该跳过这条继续（如 'canceled'）
      if (e.error === 'canceled' || e.error === 'interrupted') {
        finish('onerror:' + e.error);
      } else {
        speechFailCount++;
        finish('onerror:' + e.error);
      }
    };

    // ─── Watchdog: 如果 onend 不触发，用超时兜底 ───
    // 估算正常播放时长: 中文约 3-4 字/秒, rate=1.0
    // 加 2 倍缓冲作为安全上限, 最少 3 秒, 最多 15 秒
    const charCount = text.replace(/\s/g, '').length;
    const estDurationMs = Math.min(Math.max(charCount * 250, 3000), 12000);
    const watchdogMs = estDurationMs + 3000;

    speechWatchdog = setTimeout(() => {
      if (!finished) {
        console.warn(`[Speech] watchdog 超时 (${watchdogMs}ms), 强制回收`);
        // 尝试 cancel 后重新播放这条（可能是 iOS 15秒bug）
        try { speechSynthesis.cancel(); } catch {}
        finish('watchdog');
      }
    }, watchdogMs);

    speechSynthesis.speak(utter);

    // 额外保险：speak 后 500ms 检查是否真的开始说了
    setTimeout(() => {
      if (!finished && !speechSynthesis.speaking && !speechSynthesis.pending) {
        console.warn('[Speech] speak() 后未开始，尝试 resume');
        try { speechSynthesis.resume(); } catch {}
        // 再等 1 秒，如果还是没开始就回收
        setTimeout(() => {
          if (!finished && !speechSynthesis.speaking) {
            console.warn('[Speech] resume 无效，强制回收');
            try { speechSynthesis.cancel(); } catch {}
            finish('stuck-recovery');
          }
        }, 1000);
      }
    }, 500);

  } catch (e) {
    console.warn('[Speak] exception:', e);
    speechPlaying = false;
    speechFailCount++;
    if (speechFailCount >= SPEECH_MAX_FAIL) {
      hardResetSpeechEngine('exception');
    } else {
      setTimeout(() => processSpeechQueue(), 500);
    }
  }
}

// ─── 队列处理 ───
function processSpeechQueue() {
  if (speechEngineResetting) return; // 正在重置，等重置完
  if (speechPlaying) return;         // 正在播放中，等回调
  if (!speechQueue.length) return;   // 队列空了

  const next = speechQueue.shift();
  speechPlaying = true;
  doSpeak(next);
}

// ─── 外部接口 ───
function speakAlert(msg) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  const cleanMsg = msg.replace(/\$/g, ' 美元 ');
  if (!speechReady) {
    initSpeechEngine();
    pendingSpeech.push(cleanMsg);
    return;
  }
  speechQueue.push(cleanMsg);
  if (!speechPlaying) processSpeechQueue();
}

function flushPendingSpeech() {
  while (pendingSpeech.length) speechQueue.push(pendingSpeech.shift());
  if (!speechPlaying) processSpeechQueue();
}

// 币种名称映射：常见币种用中文名，其余逐字母拼读
const COIN_NAME_MAP = {
  BTC: '比特币', ETH: '以太坊', BNB: '币安币', SOL: 'Solana', XRP: '瑞波币',
  ADA: '艾达币', DOGE: '狗狗币', TRX: '波场', AVAX: '雪崩', DOT: '波卡',
  LINK: 'Chainlink', MATIC: 'Polygon', UNI: 'Uniswap', SHIB: 'Shib',
  LTC: '莱特币', BCH: '比特现金', ATOM: 'Cosmos', XLM: '恒星币',
  NEAR: 'Near', APT: 'Aptos', ARB: 'Arbitrum', OP: 'Optimism',
  FIL: 'Filecoin', INJ: 'Injective', SUI: 'Sui', PEPE: 'Pepe',
  SEI: 'Sei', WLD: 'Worldcoin', TIA: 'Celestia', ORDI: 'ORDI',
  AAVE: 'Aave', MKR: 'Maker', SNX: 'Synthetix', COMP: 'Compound',
  CRV: 'Curve', LDO: 'Lido', STX: 'Stacks', IMX: 'Immutable',
  RNDR: 'Render', FET: 'Fetch', USDT: 'USDT', USDC: 'USDC',
};

// 把币种符号逐字母拼读（如 BTC → B T C）
function spellSymbol(sym) {
  return sym.split('').join(' ');
}

// 获取币种的播报名称
// spellSymbols=true → 全部逐字母拼读
// spellSymbols=false → 有中文名用中文，无则逐字母拼读
function getCoinSpeechName(sym) {
  if (spellSymbols) return spellSymbol(sym);
  if (COIN_NAME_MAP[sym]) return COIN_NAME_MAP[sym];
  if (/^[A-Z0-9]{2,8}$/.test(sym)) return spellSymbol(sym);
  return sym;
}

// ── Theme Toggle (Dark / Light) ──
function toggleTheme() {
  isLightTheme = !isLightTheme;
  localStorage.setItem('crypto_theme', isLightTheme ? 'light' : 'dark');
  applyTheme();
}

function applyTheme() {
  document.body.classList.toggle('light-theme', isLightTheme);
  document.getElementById('themeToggle').textContent = isLightTheme ? '☀️' : '🌙';
  document.getElementById('themeToggle').title = isLightTheme ? '切换到深色主题' : '切换到浅色主题';
}

// ── Color Inversion (Green/Red swap) ──
function toggleColorInvert() {
  colorInverted = !colorInverted;
  localStorage.setItem('crypto_color_invert', colorInverted ? '1' : '0');
  applyColorInvert();
}

function applyColorInvert() {
  const root = document.documentElement;
  if (colorInverted) {
    root.style.setProperty('--green', isLightTheme ? '#d63858' : '#ff416c');
    root.style.setProperty('--red', isLightTheme ? '#00a86b' : '#00ff88');
    document.getElementById('colorInvertToggle').textContent = '🔃';
    document.getElementById('colorInvertToggle').title = '恢复默认涨跌颜色';
  } else {
    root.style.removeProperty('--green');
    root.style.removeProperty('--red');
    document.getElementById('colorInvertToggle').textContent = '🔄';
    document.getElementById('colorInvertToggle').title = '涨跌颜色反转';
  }
  // Re-render sparklines with correct colors
  coins.forEach(c => {
    const spEl = document.getElementById('sp-' + c.symbol);
    if (spEl) spEl.innerHTML = sparklineSvg(c.symbol);
  });
}

// ── Device Vibration + Haptic Feedback (mobile) ──
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function vibrateDevice(pattern) {
  if ('vibrate' in navigator && !isIOS) {
    try { navigator.vibrate(pattern); } catch {}
  }
  // iOS fallback: visual haptic — screen flash + badge pulse
  if (isIOS) {
    doVisualHaptic();
  }
}

// iOS has no vibration API, so we simulate "haptic feedback" with visual cues
function doVisualHaptic() {
  // Brief full-screen flash overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;pointer-events:none;
    background:rgba(255,65,108,0.18);
    animation: hapticFlash 0.4s ease-out forwards;
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 500);

  // Pulse the alert badge bell icon
  const bell = document.querySelector('[onclick="openAlertModal()"]');
  if (bell) {
    bell.style.animation = 'none';
    void bell.offsetWidth;
    bell.style.animation = 'bellShake 0.5s ease-in-out 3';
    setTimeout(() => { bell.style.animation = ''; }, 1600);
  }
}

// ── Enhanced Browser Notification + Vibration ──
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    // On iOS, don't auto-prompt — wait for user to explicitly enable via the notify modal
    // iOS shows a system dialog that blocks the page, which is bad UX if it pops up randomly
    if (!isIOS) {
      Notification.requestPermission();
    }
  }
  // Try registering SW for better notification support
  if ('serviceWorker' in navigator) {
    registerServiceWorker().catch(() => {});
  }
}

function sendBrowserNotification(title, body, tag) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const opts = {
      body: body,
      tag: tag || 'crypto-alert',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>',
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      data: { url: '/' },
    };

    // Try Service Worker first (better iOS lock screen support — SW notifications persist)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, opts);
      }).catch(() => {
        new Notification(title, opts);
      });
    } else if ('serviceWorker' in navigator) {
      // No controller yet — try registering SW then show notification
      registerServiceWorker().then(ok => {
        if (ok && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, opts);
          });
        } else {
          new Notification(title, opts);
        }
      }).catch(() => {
        new Notification(title, opts);
      });
    } else {
      new Notification(title, opts);
    }

    // iOS visual haptic as extra feedback
    if (isIOS) doVisualHaptic();
  } catch (e) {
    console.warn('Notification failed:', e);
    try { new Notification(title, { body: body }); } catch {}
  }
}

// ── Alerts ──
function openAlertModal() {
  // 首次交互时初始化 AudioContext（浏览器要求用户手势）
  getAudioCtx();
  unlockAudio();
  const sel = document.getElementById('alertCoin');
  sel.innerHTML = coins.map(c => `<option value="${c.symbol}">${escapeHtml(c.symbol)} - ${escapeHtml(c.name)}</option>`).join('');
  renderAlertList();
  // Show iOS hint if on iOS
  document.getElementById('iosAlertHint').style.display = isIOS ? 'block' : 'none';
  document.getElementById('alertModalOverlay').classList.add('active');
}

function testAlertSound() {
  getAudioCtx();
  unlockAudio();
  // Play all three sound types sequentially so user can hear the difference
  playAlertSound();
  setTimeout(() => playNotifySound(), 500);
  setTimeout(() => playUrgentSound(), 1100);
  // iOS: also trigger visual haptic
  if (isIOS) doVisualHaptic();
  showToast('🔊 播放测试声音' + (isIOS ? '（iOS 无振动，已使用视觉反馈代替）' : ''));
}

function testVoiceAlert() {
  // 强制开启语音（用户主动点击，允许覆盖开关）
  const wasOff = !voiceEnabled;
  if (wasOff) {
    voiceEnabled = true;
    localStorage.setItem('crypto_voice', '1');
    document.getElementById('voiceToggle').textContent = '🗣️';
  }
  initSpeechEngine();
  // 直接在用户手势内调用 doSpeak（iOS 必须在 click 栈内调用）
  const testCoinName = getCoinSpeechName('BTC');
  doSpeak(`语音测试，${testCoinName}当前价格八万八千美元，预警已触发！`);
  if (isIOS) {
    showToast('🗣️ iOS 语音测试中…\n⚠️ iOS 自动预警时语音可能无法触发，建议开启通知渠道作为备用');
  } else {
    showToast('🗣️ 语音测试中…');
  }
}
function closeAlertModal() {
  document.getElementById('alertModalOverlay').classList.remove('active');
}
function addAlert() {
  const sym = document.getElementById('alertCoin').value;
  const dir = document.getElementById('alertDir').value;
  const price = parseFloat(document.getElementById('alertPrice').value);
  if (!sym || isNaN(price) || price <= 0) { showToast('请输入有效价格', 'error'); return; }

  // Read reminder interval
  let intervalVal = parseInt(document.getElementById('alertInterval').value) || 30;
  const intervalUnit = document.getElementById('alertIntervalUnit').value;
  if (intervalVal < 1) intervalVal = 1;
  const cooldownMs = intervalUnit === 'm' ? intervalVal * 60000 : intervalVal * 1000;

  if (alerts.some(a => a.symbol === sym && a.dir === dir && a.price === price)) { showToast('预警已存在', 'error'); return; }
  alerts.push({ symbol: sym, dir, price, lastNotified: 0, cooldownMs });
  saveAlerts();
  document.getElementById('alertPrice').value = '';
  document.getElementById('alertInterval').value = '30';
  document.getElementById('alertIntervalUnit').value = 's';
  renderAlertList();
  render();
  playNotifySound();
  const intervalText = cooldownMs >= 60000 ? (cooldownMs / 60000) + '分钟' : (cooldownMs / 1000) + '秒';
  showToast(`已添加 ${sym} ${dir === 'above' ? '>' : '<'} ${fmtRaw(price)} 预警（间隔 ${intervalText}）`);
}
function removeAlert(idx) {
  alerts.splice(idx, 1);
  saveAlerts();
  renderAlertList();
  render();
}
function renderAlertList() {
  const wrap = document.getElementById('alertListWrap');
  if (!alerts.length) { wrap.innerHTML = '<div class="alert-empty">暂无预警，添加一个吧 👆</div>'; return; }
  wrap.innerHTML = alerts.map((a, i) => {
    const dirText = a.dir === 'above' ? '高于 ▲' : '低于 ▼';
    const cd = a.cooldownMs || ALERT_COOLDOWN_DEFAULT_MS;
    const intervalText = cd >= 60000 ? (cd / 60000) + 'min' : (cd / 1000) + 's';
    return `<div class="alert-item">
      <span class="alert-sym">${a.symbol}</span>
      <span class="alert-cond">${dirText} ${fmtRaw(a.price)} <span style="color:var(--muted);font-size:0.68rem;">⏱${intervalText}</span></span>
      <button class="alert-del" onclick="removeAlert(${i})" title="删除">✕</button>
    </div>`;
  }).join('');
}

const ALERT_COOLDOWN_DEFAULT_MS = 5000; // 默认 5 秒冷却

function applyAlertPreset(val) {
  if (!val) return;
  const m = val.match(/^(\d+)(s|m)$/);
  if (!m) return;
  document.getElementById('alertInterval').value = m[1];
  document.getElementById('alertIntervalUnit').value = m[2];
  document.getElementById('alertIntervalPreset').value = '';
}

function checkAlerts(sym, currentPrice) {
  const now = Date.now();
  let hasUrgent = false;
  let hasAlert = false;

  alerts.forEach(a => {
    if (a.symbol !== sym) return;
    const hit = (a.dir === 'above' && currentPrice >= a.price) ||
                (a.dir === 'below' && currentPrice <= a.price);
    if (hit) {
      // Use per-alert cooldown (fallback to default)
      const cooldown = a.cooldownMs || ALERT_COOLDOWN_DEFAULT_MS;
      if (now - (a.lastNotified || 0) < cooldown) return;

      a.lastNotified = now;
      saveAlerts();
      hasAlert = true;

      const msg = `${sym} 当前 $${fmtRaw(currentPrice)} 已${a.dir === 'above' ? '突破' : '跌破'} ${fmtRaw(a.price)}!`;

      // 首次触发用紧急音，后续持续触发用普通预警音
      if (!a._everTriggered) {
        a._everTriggered = true;
        hasUrgent = true;
      }

      showToast(msg, 'alert');

      // 语音播报（单独构造更口语化的文案，币种逐字母拼读）
      const coinName = getCoinSpeechName(sym);
      const voiceMsg = `${coinName}预警！当前价格${fmtRaw(currentPrice)}美元，已${a.dir === 'above' ? '涨破' : '跌穿'}${fmtRaw(a.price)}美元！`;
      speakAlert(voiceMsg);

      // External notifications (WeChat / Email)
      sendExternalNotification(
        `🔔 Crypto Alert — ${sym}`,
        `${msg}\n\n当前价格: $${fmtRaw(currentPrice)}\n预警条件: ${a.dir === 'above' ? '高于' : '低于'} $${fmtRaw(a.price)}\n触发时间: ${new Date().toLocaleString('zh-CN')}`
      );

      // 浏览器弹窗通知
      sendBrowserNotification('🔔 Crypto Alert — ' + sym, msg, 'crypto-' + sym + '-' + a.dir);

      // 手机震动（短-长-短 紧急模式）
      vibrateDevice([100, 50, 200, 50, 100]);
    } else {
      // 价格回到正常范围，重置冷却和触发标记，下次突破会立即重新通知
      a._everTriggered = false;
      if (a.lastNotified) {
        a.lastNotified = 0;
        saveAlerts();
      }
    }
  });

  if (hasUrgent) {
    playUrgentSound();
  } else if (hasAlert) {
    playAlertSound();
  }
}

// ── Toast ──
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'alert' ? ' alert-toast' : '');
  const title = type === 'alert' ? '⚠️ 价格预警触发' : type === 'error' ? '❌ 错误' : '✅ 提示';
  el.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${escapeHtml(String(msg))}</div>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('toast-exit'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ── Export / Import ──
function exportData() {
  const data = {
    version: 4,
    coins,
    alerts,
    portfolio,
    coinApiMap,
    activeApi,
    refreshSec,
    currency,
    cardView,
    soundEnabled,
    spellSymbols,
    isLightTheme,
    colorInverted,
    notifyConfig,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crypto-monitor-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('数据已导出');
}
function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.coins) {
        // Deduplicate imported coins and validate structure
        const seen = new Set();
        coins = data.coins.filter(c => {
          const sym = (c.symbol || '').toUpperCase();
          if (!sym || seen.has(sym)) return false;
          seen.add(sym);
          return true;
        });
        saveCoins();
      }
      if (data.alerts) {
        alerts = data.alerts.map(a => ({ ...a, lastNotified: a.lastNotified || 0 }));
        saveAlerts();
      }
      if (data.portfolio) { portfolio = data.portfolio; savePortfolio(); }
      if (data.soundEnabled != null) { soundEnabled = data.soundEnabled; localStorage.setItem('crypto_sound', soundEnabled ? '1' : '0'); document.getElementById('soundToggle').textContent = soundEnabled ? '🔊' : '🔇'; }
      if (data.spellSymbols != null) { spellSymbols = data.spellSymbols; localStorage.setItem('crypto_spell', spellSymbols ? '1' : '0'); document.getElementById('spellToggle').textContent = spellSymbols ? '🔤' : '🀄'; }
      if (data.notifyConfig) { notifyConfig = data.notifyConfig; localStorage.setItem('crypto_notify', JSON.stringify(notifyConfig)); }
      if (data.coinApiMap) { coinApiMap = data.coinApiMap; saveCoinApiMap(); }
      if (data.activeApi != null) { activeApi = data.activeApi; localStorage.setItem('crypto_api', activeApi); }
      if (data.refreshSec) { refreshSec = data.refreshSec; localStorage.setItem('crypto_refresh', refreshSec); }
      if (data.currency) { currency = data.currency; localStorage.setItem('crypto_currency', currency); document.getElementById('currencySelect').value = currency; }
      if (data.cardView != null) { cardView = data.cardView; localStorage.setItem('crypto_card_view', cardView ? '1' : '0'); }
      if (data.isLightTheme != null) { isLightTheme = data.isLightTheme; localStorage.setItem('crypto_theme', isLightTheme ? 'light' : 'dark'); applyTheme(); }
      if (data.colorInverted != null) { colorInverted = data.colorInverted; localStorage.setItem('crypto_color_invert', colorInverted ? '1' : '0'); applyColorInvert(); }
      priceHistory = {};
      prevPrices = {};
      initSelects();
      render();
      wsResync();
      fetchPrices();
      showToast('数据导入成功！');
    } catch { showToast('导入失败：文件格式无效', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ── Trending ──
let trendingCoins = [];

async function fetchTrending() {
  const groupsEl = document.getElementById('trendingGroups');
  groupsEl.innerHTML = '<div class="trending-loading"><span class="spinner"></span>加载热搜榜…</div>';
  document.getElementById('trendingCount').textContent = '--';

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const seen = new Set();
  trendingCoins = [];

  try {
    // 串行请求，每个间隔 800ms 避免触发 CoinGecko 限流
    let trendingData = null, topData = null, gainersData = null;

    try {
      trendingData = await fetchJson('https://api.coingecko.com/api/v3/search/trending', 10000);
    } catch {}
    await delay(800);

    try {
      topData = await fetchJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1', 10000);
    } catch {}
    await delay(800);

    try {
      gainersData = await fetchJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=price_change_percentage_24h_desc&per_page=10&page=1', 10000);
    } catch {}

    // 解析热搜
    if (trendingData?.coins) {
      trendingData.coins.forEach((item, i) => {
        const c = item.item;
        const sym = (c.symbol || '').toUpperCase();
        if (!sym || seen.has(sym)) return;
        seen.add(sym);
        trendingCoins.push({
          symbol: sym,
          name: c.name || '',
          rank: c.market_cap_rank || (i + 1),
          change24h: c.data?.price_change_percentage_24h?.usd ?? null,
          group: 'hot',
        });
      });
    }

    // 解析市值头部
    if (Array.isArray(topData)) {
      topData.forEach(c => {
        const sym = (c.symbol || '').toUpperCase();
        if (!sym || seen.has(sym)) return;
        seen.add(sym);
        trendingCoins.push({
          symbol: sym, name: c.name || '',
          rank: c.market_cap_rank || null,
          change24h: c.price_change_percentage_24h ?? null,
          group: 'top',
        });
      });
    }

    // 解析涨幅榜
    if (Array.isArray(gainersData)) {
      gainersData.forEach(c => {
        const sym = (c.symbol || '').toUpperCase();
        if (!sym || seen.has(sym)) return;
        seen.add(sym);
        trendingCoins.push({
          symbol: sym, name: c.name || '',
          rank: c.market_cap_rank || null,
          change24h: c.price_change_percentage_24h ?? null,
          group: 'gainers',
        });
      });
    }

    // 有数据就缓存，下次请求失败时可以兜底
    if (trendingCoins.length) {
      localStorage.setItem('crypto_trending_cache', JSON.stringify({
        data: trendingCoins,
        ts: Date.now(),
      }));
    }

    document.getElementById('trendingCount').textContent = trendingCoins.length + ' 个';

  } catch (e) {}

  // 如果本次请求无数据，尝试用本地缓存兜底
  if (!trendingCoins.length) {
    try {
      const cached = JSON.parse(localStorage.getItem('crypto_trending_cache') || 'null');
      if (cached?.data?.length) {
        trendingCoins = cached.data;
        const ageMin = Math.round((Date.now() - cached.ts) / 60000);
        document.getElementById('trendingCount').textContent = trendingCoins.length + ' 个（缓存' + (ageMin < 1 ? '<1' : ageMin) + '分钟前）';
      }
    } catch {}
  }

  if (!trendingCoins.length) {
    groupsEl.innerHTML = '<div class="trending-err">⚠️ 热搜加载失败，请稍后重试</div>';
  } else {
    renderTrending();
  }
}

async function fetchJson(url, ms) {
  try { return await fetchWithCors(url, ms); }
  catch {
    // fallback direct
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }
}

function renderTrending() {
  const groupsEl = document.getElementById('trendingGroups');
  if (!trendingCoins.length) { groupsEl.innerHTML = '<div class="trending-err">暂无热搜数据</div>'; return; }

  const groups = {
    hot: { label: '🔥 实时热搜', items: [] },
    top: { label: '💎 市值头部', items: [] },
    gainers: { label: '📈 24h 涨幅榜', items: [] },
  };
  trendingCoins.forEach(tc => { if (groups[tc.group]) groups[tc.group].items.push(tc); });

  let html = '';
  for (const [key, g] of Object.entries(groups)) {
    if (!g.items.length) continue;
    html += `<div class="trending-group ${key}">
      <div class="trending-group-label">${g.label}</div>
      <div class="trending-tags">`;
    g.items.forEach(tc => {
      const alreadyAdded = coins.some(c => c.symbol === tc.symbol);
      const cls = alreadyAdded ? 'trending-tag added' : 'trending-tag';
      let changeHtml = '';
      if (tc.change24h != null) {
        const sign = tc.change24h >= 0 ? '+' : '';
        const dir = tc.change24h >= 0 ? 'up' : 'down';
        changeHtml = `<span class="tag-change ${dir}">${sign}${tc.change24h.toFixed(1)}%</span>`;
      }
      const rankHtml = tc.rank ? `<span class="tag-rank">#${tc.rank}</span>` : '';
      const nameShort = tc.name.length > 10 ? tc.name.slice(0, 10) + '…' : tc.name;
      const actionIcon = alreadyAdded
        ? `<span class="tag-action remove-icon" title="移除">✕</span>`
        : `<span class="tag-action add-icon" title="添加">＋</span>`;

      html += `<span class="${cls}" data-tsym="${escapeAttr(tc.symbol)}" data-tname="${escapeAttr(tc.name)}" title="${escapeAttr(tc.name)}" onclick="toggleTrendingFromEl(this)">
        ${rankHtml}
        <span class="tag-sym">${escapeHtml(tc.symbol)}</span>
        <span class="tag-name">${escapeHtml(nameShort)}</span>
        ${changeHtml}
        ${actionIcon}
      </span>`;
    });
    html += '</div></div>';
  }
  groupsEl.innerHTML = html;
}

// ── Coin Descriptions ──
var COIN_DESCRIPTIONS = {
  'BTC': '比特币，首个去中心化加密货币，由中本聪于2009年创建。采用工作量证明(PoW)共识机制，总量2100万枚，被誉为"数字黄金"，是整个加密市场的风向标。',
  'ETH': '以太坊，Vitalik Buterin于2015年推出的智能合约平台。支持DeFi、NFT、DAO等应用生态，2022年完成从PoW到PoS的合并升级，是最大的可编程区块链。',
  'BNB': '币安币，币安交易所原生代币。最初基于以太坊ERC-20，后迁移至BNB Chain。用于交易手续费折扣、Launchpad参与及链上Gas费支付。',
  'SOL': 'Solana，高性能Layer 1公链，以高TPS和低交易费著称。采用PoH(历史证明)+PoS混合共识，在DeFi和NFT领域快速发展。',
  'XRP': '瑞波币，Ripple Labs开发，专注于跨境支付和银行间结算。交易速度快、费用低，与全球多家金融机构建立合作关系。',
  'ADA': 'Cardano，由以太坊联合创始人Charles Hoskinson创建。采用学术研究驱动的Ouroboros PoS协议，强调安全性和可扩展性。',
  'DOGE': '狗狗币，2013年作为玩笑币诞生，基于Litecoin分叉。因Elon Musk力挺和社区文化走红，从Meme币逐渐获得实际支付场景。',
  'AVAX': 'Avalanche，主打高吞吐量和快速确认的Layer 1平台。支持子网(Subnet)架构，兼容EVM，在DeFi和企业级应用中表现活跃。',
  'DOT': 'Polkadot，Gavin Wood(以太坊联合创始人)创建的多链互操作协议。通过中继链和平行链架构实现跨链通信和共享安全。',
  'MATIC': 'Polygon，以太坊的Layer 2扩容方案。提供侧链和ZK Rollup解决方案，大幅降低Gas费用，是以太坊生态最重要的扩容网络之一。',
  'LINK': 'Chainlink，去中心化预言机网络。为智能合约提供链下数据(价格、天气、体育赛事等)，是DeFi基础设施的关键组件。',
  'UNI': 'Uniswap，以太坊上最大的去中心化交易所(DEX)。采用自动做市商(AMM)模式，UNI是其治理代币，持有者可参与协议决策。',
  'SHIB': 'Shiba Inu，自称"狗狗币杀手"的Meme代币。生态包含ShibaSwap DEX、LEASH和BONE代币，拥有活跃的社区驱动生态。',
  'LTC': '莱特币，2011年Charlie Lee基于比特币分叉创建。出块更快(2.5分钟)、总量8400万枚，被称为"数字白银"。',
  'TRX': '波场TRON，孙宇晨创建的区块链平台。专注于去中心化内容娱乐和稳定币(USDT-TRC20)转账，链上USDT流通量领先。',
  'ATOM': 'Cosmos，"区块链互联网"。通过IBC协议实现不同区块链间的互操作，采用Tendermint共识，生态包含众多独立区块链。',
  'XLM': '恒星币，Jed McCaleb(Ripple联合创始人)创建。专注于普惠金融和跨境汇款，与IBM等企业合作推进银行间结算。',
  'FIL': 'Filecoin，去中心化存储网络。基于IPFS协议，激励用户提供存储空间，旨在构建去中心化的数据存储市场。',
  'NEAR': 'NEAR Protocol，主打用户体验的Layer 1公链。采用分片技术(Nightshade)实现扩展，支持账户抽象，降低用户使用门槛。',
  'APT': 'Aptos，由前Meta(Diem)工程师创建的Layer 1公链。使用Move编程语言，强调安全性和并行执行，实现高吞吐量。',
  'OP': 'Optimism，以太坊Layer 2扩容方案，采用Optimistic Rollup技术。OP代币用于治理，是Superchain生态的核心。',
  'ARB': 'Arbitrum，以太坊上TVL最高的Layer 2网络。采用Optimistic Rollup技术，提供更低的Gas费和更快的确认速度。',
  'SUI': 'Sui，由前Meta团队(Mysten Labs)开发的Layer 1公链。使用Move语言，支持对象并行处理，面向游戏和社交应用。',
  'PEPE': 'Pepe the Frog Meme代币，2023年爆红的纯社区驱动Meme币。无预挖、无团队份额，完全由社区共识推动。',
  'WIF': 'dogwifhat，Solana生态的Meme代币，以"戴帽子的柴犬"形象走红。2024年快速崛起，成为Solana上最具代表性的Meme币之一。',
  'TON': 'The Open Network，由Telegram团队最初设计的区块链。后由社区接管开发，与Telegram深度整合，拥有庞大的潜在用户基础。',
  'RENDER': 'Render Network，去中心化GPU渲染网络。连接需要渲染的创作者和闲置GPU提供者，应用于影视、游戏和AI计算。',
  'STX': 'Stacks，比特币智能合约层。通过Proof of Transfer(PoX)与比特币锚定，为比特币生态带来DeFi和NFT等可编程性。',
  'FET': 'Fetch.ai，AI与区块链融合项目。构建自主经济代理(AEA)框架，用于优化交通、能源和供应链等场景。现为ASI联盟成员。',
  'INJ': 'Injective，去中心化衍生品交易平台Layer 1。支持永续合约、期权和现货交易，采用Tendermint共识，完全去中心化订单簿。',
  'MKR': 'MakerDAO治理代币。Maker是以太坊上最早的DeFi协议之一，发行超额抵押稳定币DAI，MKR持有者参与协议治理。',
  'AAVE': 'Aave，领先的去中心化借贷协议。支持多种资产的存款和借款，首创闪电贷(Flash Loan)功能，是DeFi蓝筹项目。',
  'CRV': 'Curve Finance治理代币。Curve是稳定币和同类资产交换的DEX，以低滑点和低费用著称，是稳定币交易的核心基础设施。',
  'WLFI': 'World Liberty Financial，与特朗普家族相关的DeFi项目。旨在推动加密货币采用和去中心化金融服务的普及。',
  'TRUMP': 'Official Trump Meme代币，Solana上的政治主题Meme币。以美国前总统特朗普为主题，由社区驱动的投机性代币。',
  'GT': 'Gate.io交易所平台代币。持有GT可享受交易手续费折扣、参与Startup首发项目投票及空投等权益。',
  'BGB': 'Bitget交易所平台代币。用于手续费抵扣、Launchpad参与和VIP等级提升，是Bitget生态的核心权益凭证。',
  'KCS': 'KuCoin交易所平台代币。持有KCS可获交易手续费折扣和每日分红，是KuCoin生态的激励和治理代币。',
  'LEO': 'UNUS SED LEO，Bitfinex交易所平台代币。用于降低交易费用，iFinex公司承诺用收入回购销毁LEO代币。',
  'CRO': 'Cronos，Crypto.com生态的原生代币。驱动Crypto.org Chain和Cronos EVM链，用于支付、DeFi和NFT等场景。',
  'OKB': 'OKX交易所平台代币。用于手续费折扣、Jumpstart参与和OKX Chain生态，是OKX平台的核心权益代币。',
  'HT': 'Huobi Token(HTX)，火币(HTX)交易所平台代币。用于交易费折扣、投票上币和生态治理。',
};

function getCoinDesc(sym) {
  return COIN_DESCRIPTIONS[sym] || '';
}

// ── Coin Hover Card ──
(function() {
  var card = document.createElement('div');
  card.className = 'coin-hover-card';
  document.body.appendChild(card);
  var hideT = null;
  var curSym = null;
  var hoverEl = null;  // current element being hovered (.coin-info or .trending-tag)

  function hashColor(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return '#' + ((h >>> 0) & 0xFFFFFF).toString(16).padStart(6, '0');
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function show(sym, name, rank, chg, el) {
    clearTimeout(hideT);
    if (sym === curSym && card.classList.contains('visible')) return;
    curSym = sym;
    hoverEl = el;
    var ph = priceHistory[sym];
    var last = ph && ph.length ? ph[ph.length - 1] : null;
    var col = hashColor(sym);
    var ini = sym.length > 4 ? sym.slice(0, 3) : sym;
    var html = '<div class="hover-card-header">' +
      '<div class="hover-card-icon" style="background:' + col + '">' + esc(ini) + '</div>' +
      '<div class="hover-card-title"><span class="hover-card-sym">' + esc(sym) + '</span>' +
      '<span class="hover-card-name">' + esc(name || sym) + '</span></div>' +
      (rank ? '<span class="hover-card-rank">TOP ' + rank + '</span>' : '') +
      '</div><div class="hover-card-grid">';
    if (last) {
      var d = last.c >= 0;
      html += '<div class="hover-card-stat"><span class="hover-card-stat-label">最新价</span><span class="hover-card-stat-value">' + fmt(last.p) + '</span></div>';
      html += '<div class="hover-card-stat"><span class="hover-card-stat-label">涨跌幅</span><span class="hover-card-stat-value ' + (d ? 'up' : 'down') + '">' + (d ? '+' : '') + last.c.toFixed(2) + '%</span></div>';
      html += '<div class="hover-card-stat"><span class="hover-card-stat-label">24h最高</span><span class="hover-card-stat-value">' + (last.h ? fmt(last.h) : '—') + '</span></div>';
      html += '<div class="hover-card-stat"><span class="hover-card-stat-label">24h最低</span><span class="hover-card-stat-value">' + (last.l ? fmt(last.l) : '—') + '</span></div>';
      html += '<div class="hover-card-stat hover-card-full"><span class="hover-card-stat-label">24h成交额</span><span class="hover-card-stat-value">' + fmtVol(last.v) + '</span></div>';
    } else if (chg != null) {
      var d2 = chg >= 0;
      html += '<div class="hover-card-stat hover-card-full"><span class="hover-card-stat-label">24h涨跌幅</span><span class="hover-card-stat-value ' + (d2 ? 'up' : 'down') + '">' + (d2 ? '+' : '') + chg.toFixed(2) + '%</span></div>';
    } else {
      html += '<div class="hover-card-stat hover-card-full"><span class="hover-card-stat-value" style="color:var(--muted);font-size:.72rem">暂无行情数据</span></div>';
    }
    html += '</div>';
    var desc = getCoinDesc(sym);
    if (desc) {
      html += '<div class="hover-card-desc"><div class="hover-card-desc-label">📖 币种简介</div><div class="hover-card-desc-text">' + esc(desc) + '</div></div>';
    }
    html += '<div class="hover-card-hint">币种信息卡片</div>';
    card.innerHTML = html;
    card.style.display = 'block';
    void card.offsetHeight;
    var r = el.getBoundingClientRect();
    var cw = card.offsetWidth, ch2 = card.offsetHeight;
    var x = r.left + r.width / 2 - cw / 2;
    var y = r.bottom + 10;
    if (x < 8) x = 8;
    if (x + cw > innerWidth - 8) x = innerWidth - cw - 8;
    if (y + ch2 > innerHeight - 8) y = r.top - ch2 - 10;
    if (y < 8) y = 8;
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.classList.add('visible');
  }

  function doHide() {
    card.classList.remove('visible');
    curSym = null;
    hoverEl = null;
    setTimeout(function() { if (!card.classList.contains('visible')) card.style.display = 'none'; }, 250);
  }

  function hide() {
    clearTimeout(hideT);
    hideT = setTimeout(doHide, 120);
  }

  // ── Delegation via mouseover/mouseout (these bubble!) ──
  document.addEventListener('mouseover', function(e) {
    var t = e.target;
    if (!t.closest) return;
    var info = t.closest('.coin-info');
    var tag = t.closest('.trending-tag');
    var hit = info || tag;
    if (!hit) return;
    clearTimeout(hideT);  // cancel pending hide
    if (hit === hoverEl && card.classList.contains('visible')) return;  // already showing for this
    hoverEl = hit;
    if (info) {
      var row = info.closest('.table-row');
      if (!row || !row.dataset.sym) return;
      var sym = row.dataset.sym;
      var c = coins.find(function(x) { return x.symbol === sym; });
      show(sym, c ? c.name : sym, null, null, row);
    } else {
      var sym2 = tag.dataset.tsym;
      var nm = tag.dataset.tname;
      var tc = trendingCoins.find(function(x) { return x.symbol === sym2; });
      show(sym2, nm || sym2, tc ? tc.rank : null, tc ? tc.change24h : null, tag);
    }
  });

  document.addEventListener('mouseout', function(e) {
    var t = e.target;
    if (!t.closest) return;
    var info = t.closest('.coin-info');
    var tag = t.closest('.trending-tag');
    var hit = info || tag;
    if (!hit) return;
    var related = e.relatedTarget;
    // Still inside same target? Don't hide.
    if (related && hit.contains(related)) return;
    // Moved to the hover card itself? Don't hide.
    if (related && card.contains(related)) return;
    hide();
  });
})();

function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escapeAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function toggleTrendingFromEl(el) {
  const sym = el.dataset.tsym;
  const name = el.dataset.tname;
  const idx = coins.findIndex(c => c.symbol === sym);
  if (idx >= 0) {
    // Remove ALL entries for this symbol (defensive against dupes)
    coins = coins.filter(c => c.symbol !== sym);
    delete coinApiMap[sym]; saveCoinApiMap();
    saveCoins();
  } else {
    if (activeApi >= 0) { coinApiMap[sym] = activeApi; saveCoinApiMap(); }
    coins.push({ symbol: sym, name: name || sym }); saveCoins();
  }
  render(); fetchPrices(); renderTrending();
}

// ── Fetch currency rates (best effort) ──
async function fetchCurrencyRates() {
  try {
    const d = await fetchWithCors('https://api.exchangerate-api.com/v4/latest/USD', 8000);
    if (d?.rates) {
      currencyRates.CNY = d.rates.CNY || 7.25;
      currencyRates.EUR = d.rates.EUR || 0.92;
    }
  } catch {}
}

// ════════════════════════════════════════
//  NEW FEATURES
// ════════════════════════════════════════

// ── Coin Search Autocomplete ──
let searchTimer = null;
let searchResults = [];
let searchIdx = -1;

function onSearchInput(val) {
  clearTimeout(searchTimer);
  const q = val.trim().toUpperCase();
  const dd = document.getElementById('searchDropdown');
  if (q.length < 1) { dd.classList.remove('open'); return; }

  // Quick local match first
  const localMatch = coins.filter(c => c.symbol.startsWith(q) || c.name.toUpperCase().includes(q));
  if (localMatch.length) {
    renderSearchResults(localMatch.map(c => ({
      symbol: c.symbol, name: c.name, rank: null, added: true
    })));
  }

  // Debounced API search
  searchTimer = setTimeout(async () => {
    if (q.length < 2) return;
    try {
      const data = await fetchWithCors('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q), 8000);
      if (data?.coins) {
        const apiResults = data.coins.slice(0, 15).map(c => ({
          symbol: (c.symbol || '').toUpperCase(),
          name: c.name || '',
          rank: c.market_cap_rank,
          added: coins.some(x => x.symbol === (c.symbol || '').toUpperCase()),
        }));
        // Merge: local matches first, then API
        const seen = new Set(localMatch.map(c => c.symbol));
        const merged = [...localMatch.map(c => ({ symbol: c.symbol, name: c.name, rank: null, added: true })),
          ...apiResults.filter(r => !seen.has(r.symbol))];
        renderSearchResults(merged.slice(0, 20));
      }
    } catch {}
  }, 350);
}

function renderSearchResults(results) {
  searchResults = results;
  searchIdx = -1;
  const dd = document.getElementById('searchDropdown');
  if (!results.length) { dd.classList.remove('open'); return; }
  dd.innerHTML = results.map((r, i) => {
    const rankBadge = r.rank ? `<span class="search-item-rank">#${r.rank}</span>` : '';
    const addedTag = r.added ? `<span class="search-item-added">✓ 已添加</span>` : '';
    return `<div class="search-item" data-idx="${i}" onclick="selectSearchResult(${i})">
      <span class="search-item-sym">${escapeHtml(r.symbol)}</span>
      <span class="search-item-name">${escapeHtml(r.name)}</span>
      ${rankBadge}${addedTag}
    </div>`;
  }).join('');
  dd.classList.add('open');
}

function onSearchKey(e) {
  const dd = document.getElementById('searchDropdown');
  if (!dd.classList.contains('open')) {
    if (e.key === 'Enter') addFromInput();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchIdx = Math.min(searchIdx + 1, searchResults.length - 1);
    highlightSearch();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchIdx = Math.max(searchIdx - 1, 0);
    highlightSearch();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (searchIdx >= 0 && searchIdx < searchResults.length) {
      selectSearchResult(searchIdx);
    } else if (searchResults.length) {
      selectSearchResult(0);
    } else {
      addFromInput();
    }
  } else if (e.key === 'Escape') {
    dd.classList.remove('open');
  }
}

function highlightSearch() {
  document.querySelectorAll('.search-item').forEach((el, i) => {
    el.classList.toggle('active', i === searchIdx);
  });
}

function selectSearchResult(idx) {
  const r = searchResults[idx];
  if (!r) return;
  addCoin(r.symbol, r.name);
  document.getElementById('input').value = '';
  document.getElementById('searchDropdown').classList.remove('open');
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('addBar').contains(e.target)) {
    document.getElementById('searchDropdown').classList.remove('open');
  }
});

// ── Market Overview ──
async function fetchMarketOverview() {
  try {
    const [globalRes, fgRes] = await Promise.allSettled([
      fetchWithCors('https://api.coingecko.com/api/v3/global', 10000),
      fetchWithCors('https://api.alternative.me/fng/?limit=1', 8000),
    ]);

    const overview = document.getElementById('marketOverview');
    overview.style.display = 'flex';

    if (globalRes.status === 'fulfilled' && globalRes.value?.data) {
      const d = globalRes.value.data;
      const cap = d.total_market_cap?.usd;
      const chg = d.market_cap_change_percentage_24h_usd;
      const btcD = d.market_cap_percentage?.btc;

      document.getElementById('mktCap').textContent = cap ? fmtCompact(cap) : '--';
      if (chg != null) {
        const el = document.getElementById('mktCapChg');
        el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
        el.className = 'market-stat-change ' + (chg >= 0 ? 'up' : 'down');
      }
      document.getElementById('btcDom').textContent = btcD != null ? btcD.toFixed(1) + '%' : '--';
      document.getElementById('mktChange').textContent = chg != null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : '--';
      document.getElementById('mktChange').className = 'market-stat-value ' + (chg >= 0 ? 'up' : 'down');
      document.getElementById('mktChange').style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
    }

    if (fgRes.status === 'fulfilled' && fgRes.value?.data?.[0]) {
      const fg = fgRes.value.data[0];
      const val = parseInt(fg.value);
      const label = fg.value_classification;
      const fgEl = document.getElementById('fearGreed');
      fgEl.textContent = val + ' ' + label;
      fgEl.style.color = val <= 25 ? 'var(--red)' : val <= 50 ? '#ffaa00' : val <= 75 ? 'var(--accent)' : 'var(--green)';
    }
  } catch {}
}

function fmtCompact(n) {
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  return '$' + (n / 1e6).toFixed(2) + 'M';
}

// ── Portfolio / P&L ──
let portfolio = loadPortfolio();
function loadPortfolio() { try { const s = localStorage.getItem('crypto_portfolio'); if (s) return JSON.parse(s); } catch {} return []; }
function savePortfolio() { localStorage.setItem('crypto_portfolio', JSON.stringify(portfolio)); }

function openPortfolioModal() {
  const sel = document.getElementById('portfolioCoin');
  sel.innerHTML = coins.map(c => `<option value="${c.symbol}">${escapeHtml(c.symbol)} - ${escapeHtml(c.name)}</option>`).join('');
  renderPortfolioModal();
  document.getElementById('portfolioModalOverlay').classList.add('active');
}
function closePortfolioModal() { document.getElementById('portfolioModalOverlay').classList.remove('active'); }

function addPortfolioEntry() {
  const sym = document.getElementById('portfolioCoin').value;
  const buyPrice = parseFloat(document.getElementById('portfolioBuyPrice').value);
  const qty = parseFloat(document.getElementById('portfolioQty').value);
  if (!sym || isNaN(buyPrice) || buyPrice <= 0 || isNaN(qty) || qty <= 0) {
    showToast('请填写有效的买入价和数量', 'error'); return;
  }
  portfolio.push({ symbol: sym, buyPrice, qty, ts: Date.now() });
  savePortfolio();
  document.getElementById('portfolioBuyPrice').value = '';
  document.getElementById('portfolioQty').value = '';
  renderPortfolioModal();
  render();
  playNotifySound();
  showToast(`已添加 ${sym} 持仓：${qty} @ $${fmtRaw(buyPrice)}`);
}

function removePortfolioEntry(idx) {
  portfolio.splice(idx, 1);
  savePortfolio();
  renderPortfolioModal();
  render();
}

function renderPortfolioModal() {
  const summaryEl = document.getElementById('portfolioSummary');
  const listEl = document.getElementById('portfolioList');

  if (!portfolio.length) {
    summaryEl.innerHTML = '<div class="portfolio-total-label">暂无持仓记录</div>';
    listEl.innerHTML = '<div class="alert-empty">在下方添加你的持仓信息 👇</div>';
    return;
  }

  let totalCost = 0, totalValue = 0;
  const rows = portfolio.map((p, i) => {
    const ph = priceHistory[p.symbol];
    const last = ph && ph.length ? ph[ph.length - 1] : null;
    const currentPrice = last ? last.p : null;
    const cost = p.buyPrice * p.qty;
    const value = currentPrice ? currentPrice * p.qty : null;
    totalCost += cost;
    if (value != null) totalValue += value;

    const pnl = value != null ? value - cost : null;
    const pnlPct = value != null ? ((value - cost) / cost * 100) : null;
    const pnlClass = pnl != null ? (pnl >= 0 ? 'profit' : 'loss') : 'none';
    const pnlText = pnl != null ? `${pnl >= 0 ? '+' : ''}${fmt(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)` : '等待数据';

    return `<div class="portfolio-row">
      <span class="portfolio-row-sym">${escapeHtml(p.symbol)}</span>
      <span class="portfolio-row-detail">${p.qty} @ $${fmtRaw(p.buyPrice)}</span>
      <span class="portfolio-row-pnl ${pnlClass}">${pnlText}</span>
      <div class="portfolio-row-actions">
        <button class="del" onclick="removePortfolioEntry(${i})" title="删除">✕</button>
      </div>
    </div>`;
  }).join('');

  const totalPnl = totalValue > 0 ? totalValue - totalCost : null;
  const totalPnlPct = totalPnl != null && totalCost > 0 ? (totalPnl / totalCost * 100) : null;
  summaryEl.innerHTML = `
    <div class="portfolio-total-label">总成本 / 当前市值</div>
    <div class="portfolio-total-value">${fmt(totalCost)} ${totalValue > 0 ? '/ ' + fmt(totalValue) : ''}</div>
    ${totalPnl != null ? `<div class="portfolio-total-pnl" style="color:${totalPnl >= 0 ? 'var(--green)' : 'var(--red)'}">
      ${totalPnl >= 0 ? '+' : ''}${fmt(totalPnl)} (${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%)
    </div>` : ''}
  `;
  listEl.innerHTML = rows;
}

// P&L for table row
function getPnlHtml(sym) {
  const entries = portfolio.filter(p => p.symbol === sym);
  if (!entries.length) return '<span class="coin-pnl none">—</span>';
  const ph = priceHistory[sym];
  const last = ph && ph.length ? ph[ph.length - 1] : null;
  if (!last) return '<span class="coin-pnl none">--</span>';
  let totalCost = 0, totalValue = 0;
  entries.forEach(p => { totalCost += p.buyPrice * p.qty; totalValue += last.p * p.qty; });
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost * 100) : 0;
  const cls = pnl >= 0 ? 'profit' : 'loss';
  return `<span class="coin-pnl ${cls}">${pnl >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%</span>`;
}

// ── Help Modal ──
function openHelpModal() { document.getElementById('helpModalOverlay').classList.add('active'); }
function closeHelpModal() { document.getElementById('helpModalOverlay').classList.remove('active'); }

// ── Keyboard Shortcuts ──
function isAnyModalOpen() {
  return document.querySelector('.modal-overlay.active') !== null;
}

document.addEventListener('keydown', e => {
  // Don't trigger in inputs
  const tag = e.target.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.getElementById('searchDropdown').classList.remove('open');
    return;
  }

  if (isInput || isAnyModalOpen()) return;

  switch (e.key) {
    case '/':
      e.preventDefault();
      document.getElementById('input').focus();
      break;
    case 'n': case 'N':
      e.preventDefault();
      document.getElementById('input').focus();
      break;
    case 'a': case 'A':
      e.preventDefault();
      openAlertModal();
      break;
    case 'p': case 'P':
      e.preventDefault();
      openPortfolioModal();
      break;
    case 'h': case 'H':
      e.preventDefault();
      openHelpModal();
      break;
    case 'm': case 'M':
      e.preventDefault();
      openNotifyModal();
      break;
    case 'v': case 'V':
      e.preventDefault();
      toggleView();
      break;
    case 's': case 'S':
      e.preventDefault();
      toggleSound();
      break;
    case 't': case 'T':
      e.preventDefault();
      toggleTheme();
      break;
    case 'c': case 'C':
      e.preventDefault();
      toggleColorInvert();
      break;
    case 'l': case 'L':
      e.preventDefault();
      toggleSpell();
      break;
  }
});

// ── Tab Title Alert Badge ──
function updateTabBadge() {
  const activeAlerts = alerts.filter(a => {
    const ph = priceHistory[a.symbol];
    const last = ph && ph.length ? ph[ph.length - 1] : null;
    if (!last) return false;
    return (a.dir === 'above' && last.p >= a.price) || (a.dir === 'below' && last.p <= a.price);
  });
  const base = 'Crypto Monitor';
  if (activeAlerts.length) {
    document.title = `🔴 (${activeAlerts.length}) ${base}`;
  } else {
    document.title = base;
  }
  // Update badge on bell icon
  const badge = document.getElementById('alertBadge');
  if (activeAlerts.length) {
    badge.style.display = 'flex';
    badge.textContent = activeAlerts.length;
  } else {
    badge.style.display = 'none';
  }
}

// ── Onboarding ──
function showOnboarding() {
  if (localStorage.getItem('crypto_onboarded')) return;
  const tip = document.createElement('div');
  tip.className = 'onboarding-tip';
  tip.innerHTML = `
    <p>🎉 欢迎使用 <strong>Crypto Monitor</strong>！<br>
    顶部搜索框可以搜索并添加币种，点击 🔔 设置价格预警，📱 配置微信/邮件推送，💰 追踪持仓盈亏。</p>
    <div class="tip-keys">
      <span class="tip-key"><kbd>/</kbd> 搜索</span>
      <span class="tip-key"><kbd>A</kbd> 预警</span>
      <span class="tip-key"><kbd>P</kbd> 持仓</span>
      <span class="tip-key"><kbd>H</kbd> 帮助</span>
    </div>
    <button onclick="this.parentElement.remove();localStorage.setItem('crypto_onboarded','1')">开始使用 →</button>
  `;
  document.body.appendChild(tip);
}

// ── External Notification System ──
let notifyConfig = loadNotifyConfig();

function loadNotifyConfig() {
  const fallback = {
    serverchan: { enabled: false, key: '' },
    pushplus: { enabled: false, token: '' },
    email: { enabled: false, to: '', serviceId: '', templateId: '', publicKey: '' },
    iosPush: { enabled: false },
  };
  // Try localStorage first, then sessionStorage backup (iOS may clear localStorage under memory pressure)
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const s = storage.getItem('crypto_notify');
      if (s) {
        const cfg = JSON.parse(s);
        // Ensure iosPush field exists (for older saved configs)
        if (!cfg.iosPush) cfg.iosPush = { enabled: false };
        return cfg;
      }
    } catch {}
  }
  return fallback;
}
function saveNotifyConfig() {
  // Read from DOM
  notifyConfig.serverchan.key = document.getElementById('serverchanKey')?.value || notifyConfig.serverchan.key;
  notifyConfig.pushplus.token = document.getElementById('pushplusToken')?.value || notifyConfig.pushplus.token;
  notifyConfig.email.to = document.getElementById('emailTo')?.value || notifyConfig.email.to;
  notifyConfig.email.serviceId = document.getElementById('emailServiceId')?.value || notifyConfig.email.serviceId;
  notifyConfig.email.templateId = document.getElementById('emailTemplateId')?.value || notifyConfig.email.templateId;
  notifyConfig.email.publicKey = document.getElementById('emailPublicKey')?.value || notifyConfig.email.publicKey;
  const json = JSON.stringify(notifyConfig);
  try { localStorage.setItem('crypto_notify', json); } catch {}
  try { sessionStorage.setItem('crypto_notify', json); } catch {}
}

// Restore iOS push toggle state from persisted config — called on visibilitychange/pageshow
// to handle iOS bfcache restores where the DOM checkbox may have reverted
function restoreNotifyToggleState() {
  try {
    const s = localStorage.getItem('crypto_notify') || sessionStorage.getItem('crypto_notify');
    if (s) {
      const cfg = JSON.parse(s);
      if (cfg.iosPush?.enabled && notifyConfig.iosPush) {
        notifyConfig.iosPush.enabled = true;
      }
    }
  } catch {}
  // Sync checkbox if modal is currently open
  const el = document.getElementById('notifyIosPush');
  if (el) el.checked = !!(notifyConfig.iosPush?.enabled);
}

function toggleNotifyChannel(ch) {
  const idMap = { serverchan: 'notifyServerChan', pushplus: 'notifyPushplus', email: 'notifyEmail', iosPush: 'notifyIosPush' };
  const el = document.getElementById(idMap[ch]);
  notifyConfig[ch].enabled = el?.checked || false;
  saveNotifyConfig();
  // For iOS push: if enabling, proactively request notification permission
  if (ch === 'iosPush' && notifyConfig.iosPush.enabled) {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        updateIosPushBtn();
        if (perm === 'granted') {
          registerServiceWorker().catch(() => {});
        }
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      registerServiceWorker().catch(() => {});
    }
  }
}

// ── iOS Push Notification ──
function updateIosPushBtn() {
  const btn = document.getElementById('iosPushEnableBtn');
  const status = document.getElementById('iosPushStatus');
  if (!btn) return;
  if (!('Notification' in window)) {
    btn.textContent = '此浏览器不支持';
    btn.disabled = true;
    status.textContent = '❌ 当前 iOS 版本不支持 Web 通知，请升级到 iOS 16.4+';
    status.className = 'notify-status err';
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    btn.textContent = '✅ 已授权';
    btn.disabled = true;
    if (isIOS) {
      status.innerHTML = '✅ 通知权限已开启<br><span style="font-size:0.62rem;color:var(--muted)">⚠️ iOS 限制：Safari 在后台时无法推送。请保持页面在前台或添加到主屏幕以获得最佳体验</span>';
    } else {
      status.textContent = '✅ 通知权限已开启，预警触发时会弹出通知';
    }
    status.className = 'notify-status ok';
  } else if (perm === 'denied') {
    btn.textContent = '已拒绝（需去设置开启）';
    btn.disabled = true;
    status.textContent = '❌ 通知权限被拒绝，请到 iPhone 设置 → Safari → 通知 中开启';
    status.className = 'notify-status err';
  } else {
    btn.textContent = '开启通知权限';
    btn.disabled = false;
    status.textContent = '';
    status.className = 'notify-status';
  }
}

async function enableIosPush() {
  if (!('Notification' in window)) {
    showToast('当前 iOS 版本不支持 Web 通知，请升级到 iOS 16.4+', 'error');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    updateIosPushBtn();
    if (perm === 'granted') {
      // Register service worker for better background handling
      await registerServiceWorker();
      // Ensure the toggle is ON and persisted
      notifyConfig.iosPush.enabled = true;
      const el = document.getElementById('notifyIosPush');
      if (el) el.checked = true;
      saveNotifyConfig();
      showToast('✅ 通知权限已开启');
      // Send a test notification
      setTimeout(() => {
        sendBrowserNotification('🎉 Crypto Monitor', '通知已就绪！价格预警触发时会在锁屏弹出通知。', 'crypto-test');
      }, 500);
    } else if (perm === 'denied') {
      showToast('通知权限被拒绝，请到 iPhone 设置中手动开启', 'error');
    }
  } catch (e) {
    showToast('开启通知失败: ' + e.message, 'error');
  }
}

// Register a minimal service worker for iOS background notification support
let swRegistered = false;
async function registerServiceWorker() {
  if (swRegistered || !('serviceWorker' in navigator)) return false;
  // Already has a controller — good enough
  if (navigator.serviceWorker.controller) { swRegistered = true; return true; }
  const swCode = `
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(arr => {
    for (const c of arr) { if ('focus' in c) return c.focus(); }
    if (clients.openWindow) return clients.openWindow('/');
  }));
});
`;
  // Strategy 1: Blob URL (works on Android Chrome, not on iOS Safari)
  try {
    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);
    await navigator.serviceWorker.register(swUrl, { scope: '/' });
    swRegistered = true;
    await navigator.serviceWorker.ready;
    return true;
  } catch {}
  // Strategy 2: Register relative to current page path (works if served from same origin)
  try {
    // Try common SW file paths
    for (const path of ['./sw.js', '/sw.js', 'sw-crypto.js']) {
      try {
        const reg = await navigator.serviceWorker.register(path, { scope: '/' });
        swRegistered = true;
        await navigator.serviceWorker.ready;
        return true;
      } catch {}
    }
  } catch {}
  // Strategy 3: data: URL (limited browser support, but worth trying)
  try {
    const dataUrl = 'data:application/javascript;base64,' + btoa(swCode);
    await navigator.serviceWorker.register(dataUrl, { scope: '/' });
    swRegistered = true;
    await navigator.serviceWorker.ready;
    return true;
  } catch {}
  console.warn('All SW registration strategies failed — using direct Notification API');
  return false;
}

function openNotifyModal() {
  // Re-sync notifyConfig from storage in case it was updated in another tab or by lifecycle events
  try {
    const s = localStorage.getItem('crypto_notify') || sessionStorage.getItem('crypto_notify');
    if (s) {
      const cfg = JSON.parse(s);
      if (cfg.iosPush?.enabled && notifyConfig.iosPush) {
        notifyConfig.iosPush.enabled = true;
      }
    }
  } catch {}

  // Populate from saved config
  const sc = notifyConfig.serverchan;
  const pp = notifyConfig.pushplus;
  const em = notifyConfig.email;
  document.getElementById('notifyServerChan').checked = sc.enabled;
  document.getElementById('serverchanKey').value = sc.key || '';
  document.getElementById('notifyPushplus').checked = pp.enabled;
  document.getElementById('pushplusToken').value = pp.token || '';
  document.getElementById('notifyEmail').checked = em.enabled;
  document.getElementById('emailTo').value = em.to || '';
  document.getElementById('emailServiceId').value = em.serviceId || '';
  document.getElementById('emailTemplateId').value = em.templateId || '';
  document.getElementById('emailPublicKey').value = em.publicKey || '';

  // iOS Push section — show on iOS or if previously enabled (handles iPadOS/desktop Safari with Notification support)
  const iosSection = document.getElementById('iosPushChannel');
  const hasNotificationApi = 'Notification' in window;
  const iosPushWasEnabled = notifyConfig.iosPush?.enabled;
  if (isIOS || (hasNotificationApi && iosPushWasEnabled)) {
    iosSection.style.display = '';
    document.getElementById('notifyIosPush').checked = !!(notifyConfig.iosPush?.enabled);
    updateIosPushBtn();
  } else if (hasNotificationApi) {
    // Show on any browser that supports Notification API
    iosSection.style.display = '';
    document.getElementById('notifyIosPush').checked = false;
    updateIosPushBtn();
  } else {
    iosSection.style.display = 'none';
  }

  // Clear status
  ['serverchanStatus','pushplusStatus','emailStatus','iosPushStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.className = 'notify-status'; }
  });
  document.getElementById('notifyModalOverlay').classList.add('active');
}
function closeNotifyModal() {
  saveNotifyConfig();
  document.getElementById('notifyModalOverlay').classList.remove('active');
}

// Send notification to all enabled channels
async function sendExternalNotification(title, body) {
  const promises = [];
  const sc = notifyConfig.serverchan;
  const pp = notifyConfig.pushplus;
  const em = notifyConfig.email;
  const iosP = notifyConfig.iosPush;

  if (sc.enabled && sc.key) {
    promises.push(sendServerChan(sc.key, title, body).catch(e => console.warn('Server酱发送失败:', e)));
  }
  if (pp.enabled && pp.token) {
    promises.push(sendPushPlus(pp.token, title, body).catch(e => console.warn('PushPlus发送失败:', e)));
  }
  if (em.enabled && em.to && em.serviceId && em.templateId && em.publicKey) {
    promises.push(sendEmail(em, title, body).catch(e => console.warn('Email发送失败:', e)));
  }
  // iOS Push (enhanced browser notification)
  if (iosP?.enabled) {
    promises.push(Promise.resolve(sendBrowserNotification(title, body, 'crypto-push-' + Date.now())));
  }
  await Promise.allSettled(promises);
}

// Server酱 Turbo
async function sendServerChan(key, title, body) {
  const url = `https://sctapi.ftqq.com/${key}.send`;
  // Try direct first, then CORS proxy
  for (const makeUrl of [
    u => u,
    u => 'https://corsproxy.io/?' + encodeURIComponent(u),
  ]) {
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

// PushPlus
async function sendPushPlus(token, title, body) {
  const url = 'https://www.pushplus.plus/send';
  for (const makeUrl of [
    u => u,
    u => 'https://corsproxy.io/?' + encodeURIComponent(u),
  ]) {
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

// Email via EmailJS REST API
async function sendEmail(cfg, title, body) {
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
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return true;
  } catch {}
  throw new Error('Email发送失败');
}

// Test notification
async function testNotify(ch) {
  const statusEl = document.getElementById(ch + 'Status');
  if (statusEl) { statusEl.textContent = '发送中…'; statusEl.className = 'notify-status'; }
  saveNotifyConfig();

  const testTitle = '🧪 Crypto Monitor 测试通知';
  const testBody = `这是一条测试消息，发送时间: ${new Date().toLocaleString('zh-CN')}\n\n如果你收到这条消息，说明通知渠道配置成功！✅`;

  try {
    if (ch === 'serverchan') {
      await sendServerChan(notifyConfig.serverchan.key, testTitle, testBody);
    } else if (ch === 'pushplus') {
      await sendPushPlus(notifyConfig.pushplus.token, testTitle, testBody);
    } else if (ch === 'email') {
      await sendEmail(notifyConfig.email, testTitle, testBody);
    } else if (ch === 'iosPush') {
      if (!('Notification' in window)) throw new Error('当前 iOS 版本不支持 Web 通知，请升级到 iOS 16.4+');
      if (Notification.permission !== 'granted') throw new Error('请先点击「开启通知权限」');
      sendBrowserNotification(testTitle, testBody, 'crypto-test-' + Date.now());
      if (statusEl) { statusEl.textContent = '✅ 通知已发送，请查看锁屏/通知中心'; statusEl.className = 'notify-status ok'; }
      playNotifySound();
      return;
    }
    if (statusEl) { statusEl.textContent = '✅ 发送成功，请检查接收端'; statusEl.className = 'notify-status ok'; }
    playNotifySound();
  } catch (e) {
    if (statusEl) { statusEl.textContent = '❌ ' + (e.message || '发送失败，请检查配置'); statusEl.className = 'notify-status err'; }
  }
}

// ── Modal Scroll Detection ──
function updateModalScrollState(modal) {
  if (!modal) return;
  const canScroll = modal.scrollHeight > modal.clientHeight + 5;
  modal.classList.toggle('modal-can-scroll', canScroll);
}

// Observe modals for scroll state changes
document.querySelectorAll('.modal').forEach(modal => {
  const observer = new MutationObserver(() => updateModalScrollState(modal));
  observer.observe(modal, { childList: true, subtree: true, characterData: true });
  modal.addEventListener('scroll', () => updateModalScrollState(modal));
});

// Update scroll state when modals open
const origOpenAlert = openAlertModal;
openAlertModal = function() { origOpenAlert(); setTimeout(() => updateModalScrollState(document.querySelector('#alertModalOverlay .modal')), 50); };
const origOpenNotify = openNotifyModal;
openNotifyModal = function() { origOpenNotify(); setTimeout(() => updateModalScrollState(document.querySelector('#notifyModalOverlay .modal')), 50); };
const origOpenPortfolio = openPortfolioModal;
openPortfolioModal = function() { origOpenPortfolio(); setTimeout(() => updateModalScrollState(document.querySelector('#portfolioModalOverlay .modal')), 50); };

// ══════════════════════════════════════════════════════════════
// ── Edge Keepalive System ──
// 解决 Edge「休眠标签页」(Sleeping Tabs) 导致的问题:
//   1. WebSocket 静默断开，不触发 onclose
//   2. setInterval 被暂停
//   3. 标签恢复前台后 WS 不自动重连
//   4. AudioContext / speechSynthesis 被冻结
// ══════════════════════════════════════════════════════════════

const KEEPALIVE = {
  wsHealthTimer: null,        // WS 健康检查定时器
  driftTimer: null,           // 计时漂移检测定时器
  lastDriftCheck: 0,          // 上次漂移检测时间戳
  lastDataReceived: {},       // { connKey: timestamp } — 每个 WS 连接最后收到数据的时间
  wsStaleThreshold: 30000,    // WS 超过 30s 没收到数据视为断开
  timerDriftThreshold: 15000, // setInterval 漂移超过 15s 说明被暂停过
  lastFetchTs: 0,             // 上次成功 fetch 的时间
  lastForegroundTs: 0,        // 上次进入前台的时间
  isEdge: /Edg\//.test(navigator.userAgent),
  edgeSleepRecoveryCount: 0,  // Edge 休眠恢复次数
};

// ── WS 健康检查: 每 10s 检查所有 WS 连接的数据新鲜度 ──
// 如果某个连接超过 30s 没收到数据，主动关闭并触发重连
function startWsHealthMonitor() {
  if (KEEPALIVE.wsHealthTimer) clearInterval(KEEPALIVE.wsHealthTimer);
  KEEPALIVE.wsHealthTimer = setInterval(() => {
    const now = Date.now();
    let deadCount = 0;

    wsConnections.forEach(conn => {
      if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
        deadCount++;
        return;
      }
      const lastData = KEEPALIVE.lastDataReceived[conn.connKey] || 0;
      if (lastData && (now - lastData) > KEEPALIVE.wsStaleThreshold) {
        console.warn(`[Keepalive] WS ${conn.connKey} 数据停滞 ${(now - lastData) / 1000}s，主动重连`);
        updateKeepaliveUI('recovering', '🔄 WS 重连…', `${conn.connKey} 停滞 ${(now - lastData) / 1000}s`);
        conn.ws.close(); // 触发 onclose → 自动重连
        deadCount++;
      }
    });

    // 如果所有 WS 都挂了，立即触发重连（不等 onclose）
    if (deadCount > 0 && deadCount === wsConnections.length && wsConnections.length > 0) {
      console.warn('[Keepalive] 所有 WS 连接均异常，强制重连');
      updateKeepaliveUI('recovering', '🔄 全量重连…', '所有连接异常');
      binanceWsConnect();
    }

    // 常态 UI 更新: 显示 WS 连接数和最后数据时间
    if (deadCount === 0 && wsConnections.length > 0) {
      const lastAny = Math.max(...wsConnections.map(c => KEEPALIVE.lastDataReceived[c.connKey] || 0));
      const secs = lastAny ? Math.round((now - lastAny) / 1000) : null;
      const wsOk = wsConnections.filter(c => c.ws && c.ws.readyState === WebSocket.OPEN).length;
      const detail = secs != null ? `${wsOk} 连接 · ${secs}s前` : `${wsOk} 连接`;
      updateKeepaliveUI('healthy', '保活就绪', detail);
    } else if (wsConnections.length === 0) {
      updateKeepaliveUI('healthy', '保活就绪', '轮询模式');
    }
  }, 10000);
}

// ── 在 applyCoinData 中记录数据接收时间 ──
// 包装原始的 applyCoinData，增加时间戳记录
const _origApplyCoinData = applyCoinData;
applyCoinData = function(sym, data, sourceLabel) {
  // 记录数据接收时间（用于 WS 健康检查）
  if (sourceLabel && sourceLabel.includes('WS')) {
    // 找到这个 symbol 对应的连接
    wsConnections.forEach(conn => {
      if (conn.symbols && conn.symbols.includes(sym)) {
        KEEPALIVE.lastDataReceived[conn.connKey] = Date.now();
      }
    });
  }
  KEEPALIVE.lastFetchTs = Date.now();
  return _origApplyCoinData(sym, data, sourceLabel);
};

// ── 计时漂移检测: 检测 setInterval 是否被 Edge 暂停 ──
// 原理: 用 performance.now() 检测实际经过的时间是否远超预期
function startDriftMonitor() {
  KEEPALIVE.lastDriftCheck = Date.now();
  if (KEEPALIVE.driftTimer) clearInterval(KEEPALIVE.driftTimer);
  KEEPALIVE.driftTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = now - KEEPALIVE.lastDriftCheck;
    KEEPALIVE.lastDriftCheck = now;

    // 正常间隔 ~5000ms（我们设的 5s 定时器），如果超过 15s 说明被 Edge 暂停过
    if (elapsed > KEEPALIVE.timerDriftThreshold) {
      console.warn(`[Keepalive] 检测到计时漂移: ${(elapsed / 1000).toFixed(1)}s (Edge 休眠标签?)`);
      updateKeepaliveUI('recovering', '🔄 计时恢复…', `漂移 ${(elapsed / 1000).toFixed(1)}s`);
      recoverFromSleep('计时漂移检测');
    }
  }, 5000);
}

// ── Edge 休眠恢复: 标签从休眠中唤醒时的全面恢复 ──
function recoverFromSleep(reason) {
  KEEPALIVE.edgeSleepRecoveryCount++;
  console.log(`[Keepalive] Edge 休眠恢复 #${KEEPALIVE.edgeSleepRecoveryCount}: ${reason}`);

  // 1. 重建 fetch timer（Edge 可能已暂停 setInterval）
  if (timer) clearInterval(timer);
  timer = setInterval(fetchPrices, refreshSec * 1000);

  // 2. 立即拉取价格
  fetchPrices();

  // 3. 检查 WS 连接状态，强制重连不健康的连接
  const now = Date.now();
  let needsReconnect = false;
  wsConnections.forEach(conn => {
    if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) {
      needsReconnect = true;
    }
    // 检查数据新鲜度
    const lastData = KEEPALIVE.lastDataReceived[conn.connKey] || 0;
    if (lastData && (now - lastData) > KEEPALIVE.wsStaleThreshold) {
      needsReconnect = true;
    }
  });

  if (needsReconnect || wsConnections.length === 0) {
    console.warn('[Keepalive] WS 需要重连');
    binanceWsConnect();
  }

  // 4. 恢复 AudioContext
  recoverAudioContext();
  setTimeout(recoverAudioContext, 500);

  // 5. 恢复语音引擎
  recoverSpeechEngine('Edge休眠恢复');

  // 6. 重新请求 Wake Lock
  requestWakeLock();

  // 7. 恢复通知状态
  restoreNotifyToggleState();

  // 8. 拉取市场数据
  fetchMarketOverview();
  fetchTrending();

  // 9. 更新状态显示
  updateWsStatus();
}

// ── 增强的 visibilitychange 处理（Edge 专用）──
// Edge 的 Sleeping Tabs 可能在标签仍处于"非活动"状态时就开始冻结
// 我们需要在每次重新可见时做更彻底的恢复
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    KEEPALIVE.lastForegroundTs = Date.now();

    // Edge 特殊处理：检测长时间后台（Edge 休眠标签特征）
    const timeSinceForeground = KEEPALIVE.lastForegroundTs ? (Date.now() - KEEPALIVE.lastForegroundTs) : 0;
    const wasSleeping = timeSinceForeground > 30000; // 后台超过 30s

    if (KEEPALIVE.isEdge || wasSleeping) {
      console.log(`[Keepalive] Edge 标签恢复 (后台 ${(timeSinceForeground/1000).toFixed(0)}s)`);
      // 三段式恢复: 立即 + 300ms + 1000ms（Edge 有时需要多次尝试）
      recoverFromSleep('Edge visibilitychange');
      setTimeout(() => recoverFromSleep('Edge 延迟恢复 1'), 300);
      setTimeout(() => recoverFromSleep('Edge 延迟恢复 2'), 1000);
    }
  }
});

// ── 额外的 Edge 专用事件监听 ──
if (KEEPALIVE.isEdge) {
  // Edge 的 "freeze" 事件（Chrome 同源，但 Edge 的行为更激进）
  document.addEventListener('freeze', () => {
    console.log('[Keepalive] Edge freeze 事件');
  });

  document.addEventListener('resume', () => {
    console.log('[Keepalive] Edge resume 事件');
    recoverFromSleep('Edge resume');
    setTimeout(() => recoverFromSleep('Edge resume 延迟'), 500);
  });

  // Edge 的 "focus" 事件（点击地址栏后回来）
  window.addEventListener('focus', () => {
    console.log('[Keepalive] Edge window focus');
    if (Date.now() - KEEPALIVE.lastForegroundTs > 10000) {
      recoverFromSleep('Edge focus 恢复');
    }
  });
}

// ── 保活状态 UI 更新 ──
function updateKeepaliveUI(state, text, detail) {
  const bar = document.getElementById('keepaliveBar');
  const icon = document.getElementById('kaIcon');
  const textEl = document.getElementById('kaText');
  const detailEl = document.getElementById('kaDetail');
  if (!bar) return;
  bar.className = 'keepalive-bar ' + state;
  textEl.textContent = text || '';
  detailEl.textContent = detail || '';
  // 恢复状态时自动在 4s 后回到健康态
  if (state === 'recovering') {
    clearTimeout(bar._resetTimer);
    bar._resetTimer = setTimeout(() => {
      updateKeepaliveUI('healthy', '保活就绪', '');
    }, 4000);
  }
}

// 在 recoverFromSleep 中插入 UI 更新
const _origRecoverFromSleep = recoverFromSleep;
recoverFromSleep = function(reason) {
  updateKeepaliveUI('recovering', '🔄 恢复中…', reason);
  _origRecoverFromSleep(reason);
};

// 初始状态
setTimeout(() => updateKeepaliveUI('healthy', '保活就绪', KEEPALIVE.isEdge ? 'Edge 增强模式' : ''), 1000);

// ── 启动保活系统 ──
startWsHealthMonitor();
startDriftMonitor();
console.log(`[Keepalive] Edge 保活系统启动 (Edge=${KEEPALIVE.isEdge})`);

// ══════════════════════════════════════════════════════════════
// ── Boot ──
// ══════════════════════════════════════════════════════════════
initSelects();
document.getElementById('soundToggle').textContent = soundEnabled ? '🔊' : '🔇';
document.getElementById('voiceToggle').textContent = voiceEnabled ? '🗣️' : '🔇';
document.getElementById('spellToggle').textContent = spellSymbols ? '🔤' : '🀄';
document.getElementById('spellToggle').title = spellSymbols ? '币种名称读法：逐字母拼读' : '币种名称读法：中文名称';
applyTheme();
applyColorInvert();
render();
binanceWsConnect();       // init WebSocket for major coins
fetchPrices();            // poll non-WS coins
timer = setInterval(fetchPrices, refreshSec * 1000);
fetchTrending();
fetchCurrencyRates();
fetchMarketOverview();
setInterval(fetchMarketOverview, 120000);
// Restore notification toggle state on boot (handles iOS bfcache / page restore)
restoreNotifyToggleState();

// ── Wake Lock + Timer Recovery ──
// Prevent page from being fully frozen in background (critical for notification reliability)
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}

// Request wake lock on load & on foreground return
requestWakeLock();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    requestWakeLock();
    // Re-ensure the fetch timer is running (browsers may pause setInterval in background)
    if (timer) clearInterval(timer);
    timer = setInterval(fetchPrices, refreshSec * 1000);
    // Immediate fetch on foreground
    fetchPrices();
    // Reconnect WebSocket if any connections are dead
    const hasLiveWs = wsConnections.some(c => c.ws && c.ws.readyState === WebSocket.OPEN);
    if (!hasLiveWs) binanceWsConnect();
    // Restore notification toggle state (iOS bfcache may revert DOM checkboxes)
    restoreNotifyToggleState();
  }
});

// Page freeze/resume (Chrome bfcache)
document.addEventListener('freeze', () => {
  // Browser is freezing the page — nothing we can do, recovery on resume
});
document.addEventListener('resume', () => {
  requestWakeLock();
  if (timer) clearInterval(timer);
  timer = setInterval(fetchPrices, refreshSec * 1000);
  fetchPrices();
  restoreNotifyToggleState();
});
setTimeout(showOnboarding, 1500);
setTimeout(requestNotificationPermission, 3000);
