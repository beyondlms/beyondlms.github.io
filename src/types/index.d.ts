/**
 * TypeScript 类型定义
 */

// ── 核心类型 ──

/** 币种信息 */
interface Coin {
  symbol: string;
  name: string;
}

/** 价格数据 */
interface PriceData {
  p: number;  // 价格
  c: number;  // 涨跌幅 %
  h: number;  // 最高价
  l: number;  // 最低价
  v: number;  // 交易量
  t: number;  // 时间戳
}

/** 价格历史 */
type PriceHistory = PriceData[];

/** 货币类型 */
type Currency = 'USD' | 'CNY' | 'EUR';

/** 主题类型 */
type Theme = 'dark' | 'light';

// ── 预警类型 ──

/** 预警方向 */
type AlertDirection = 'above' | 'below';

/** 普通预警 */
interface Alert {
  symbol: string;
  dir: AlertDirection;
  price: number;
  lastNotified: number;
  cooldownMs: number;
  _everTriggered?: boolean;
}

/** 强制预警 */
interface ForceAlert {
  symbol: string;
  dropPercent: number;
  windowMinutes: number;
  cooldownMs: number;
  enabled: boolean;
  lastTriggered: number;
}

/** 价格快照 */
interface PriceSnapshot {
  p: number;  // 价格
  t: number;  // 时间戳
}

/** 预警配置 */
interface AlertConfig {
  serverchan: { enabled: boolean; key: string };
  pushplus: { enabled: boolean; token: string };
  email: { enabled: boolean; to: string; serviceId: string; templateId: string; publicKey: string };
  iosPush: { enabled: boolean };
}

// ── 持仓类型 ──

/** 持仓记录 */
interface PortfolioEntry {
  symbol: string;
  buyPrice: number;
  qty: number;
  ts: number;
}

// ── 新闻类型 ──

/** 新闻类型 */
type NewsType = 'news' | 'alert' | 'announcement' | 'watchlist';

/** 新闻项 */
interface NewsItem {
  type: NewsType;
  title: string;
  desc: string;
  coins: string[];
  source: string;
  ts: number;
  url: string;
  isArticle: boolean;
  important: boolean;
}

// ── 解锁类型 ──

/** 代币解锁事件 */
interface UnlockEvent {
  symbol: string;
  name: string;
  date: string;
  amount: number;
  totalSupply: number;
  pct: number;
  cliff: string;
  unlockDate?: Date;
  daysUntil?: number;
  usdValue?: number | null;
  unlockedPct?: number;
  isWatchlist?: boolean;
}

// ── 热搜类型 ──

/** 热搜币种 */
interface TrendingCoin {
  symbol: string;
  name: string;
  rank: number | null;
  change24h: number | null;
  group: 'hot' | 'top' | 'gainers';
}

// ── API 类型 ──

/** API 响应类型 */
interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

/** Binance WebSocket 数据 */
interface BinanceTickerData {
  e: string;  // 事件类型
  s: string;  // 交易对
  c: string;  // 最新价格
  p: string;  // 24h 变化
  P: string;  // 24h 变化百分比
  h: string;  // 24h 最高价
  l: string;  // 24h 最低价
  v: string;  // 24h 交易量
  q: string;  // 24h 成交额
}

// ── 组件类型 ──

/** Toast 类型 */
type ToastType = 'info' | 'error' | 'alert';

/** Toast 配置 */
interface ToastConfig {
  message: string;
  type: ToastType;
  duration?: number;
}

// ── 服务类型 ──

/** WebSocket 连接 */
interface WSConnection {
  url: string;
  symbols: string[];
  connKey: string;
  ws: WebSocket | null;
  _pingInterval: number | null;
  _reconnectCount: number;
}

/** 保活状态 */
interface KeepaliveState {
  wsHealthTimer: number | null;
  driftTimer: number | null;
  lastDriftCheck: number;
  lastDataReceived: Record<string, number>;
  wsStaleThreshold: number;
  timerDriftThreshold: number;
  lastFetchTs: number;
  lastForegroundTs: number;
  isEdge: boolean;
  edgeSleepRecoveryCount: number;
}

// ── 计算类型 ──

/** RSI 计算结果 */
interface RSICalculation {
  rsi: number;
  avgGain: number;
  avgLoss: number;
  period: number;
}

/** 波动率计算结果 */
interface VolatilityCalculation {
  stdDev: number;
  annualizedVol: number;
  mean: number;
  variance: number;
  period: number;
}

/** 支撑/阻力位 */
interface SupportResistance {
  support: number[];
  resistance: number[];
  min: number;
  max: number;
  range: number;
}

/** 跌幅计算结果 */
interface WindowDropResult {
  drop: number;
  fromPrice: number;
  toPrice: number;
  windowActual: number;
  peakTime?: number;
  troughTime?: number;
}

// ── Worker 消息类型 ──

/** Worker 消息类型枚举 */
type WorkerMessageType =
  | 'calc_rsi'
  | 'calc_sma'
  | 'calc_window_drop'
  | 'calc_volatility'
  | 'calc_support_resistance'
  | 'batch_process';

/** Worker 消息 */
interface WorkerMessage {
  id: string | number;
  type: WorkerMessageType;
  data: any;
}

/** Worker 响应 */
interface WorkerResponse {
  id: string | number;
  type: WorkerMessageType;
  result?: any;
  error?: string;
  success: boolean;
}

// ── 事件类型 ──

/** 全局事件映射 */
interface GlobalEventMap extends WindowEventMap {
  'ws:price': CustomEvent<{ symbol: string; price: PriceData }>;
  'alert:trigger': CustomEvent<{ alert: Alert; price: number }>;
  'force:trigger': CustomEvent<{ alert: ForceAlert; result: WindowDropResult }>;
}

// ── 虚拟列表类型 ──

/** 虚拟列表配置 */
interface VirtualListConfig {
  container: HTMLElement;
  itemHeight: number;
  bufferSize?: number;
  renderItem: (item: any, index: number) => string;
  onScroll?: (scrollTop: number) => void;
}

/** 可见范围 */
interface VisibleRange {
  start: number;
  end: number;
}

// ── 状态类型 ──

/** 应用状态 */
interface AppState {
  coins: Coin[];
  coinApiMap: Record<string, number>;
  activeApi: number;
  refreshSec: number;
  currency: Currency;
  currencyRates: Record<Currency, number>;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  spellSymbols: boolean;
  isLightTheme: boolean;
  colorInverted: boolean;
  screenAlertEnabled: boolean;
  priceHistory: Record<string, PriceHistory>;
  prevPrices: Record<string, number>;
  portfolio: PortfolioEntry[];
  alerts: Alert[];
  forceAlerts: ForceAlert[];
  forceAlertSnapshots: Record<string, PriceSnapshot[]>;
  timer: number | null;
  priceCache: Record<string, any>;
}

// ── 函数类型 ──

/** 格式化函数 */
type FormatFunction = (value: number) => string;

/** 回调函数类型 */
type VoidCallback = () => void;
type AsyncCallback = () => Promise<void>;
type EventCallback<T = any> = (data: T) => void;
