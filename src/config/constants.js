/**
 * 配置常量
 */

// API 配置
export const API_CONFIG = {
  // Binance WebSocket
  BINANCE_WS_URL: 'wss://stream.binance.com:9443/ws',
  BINANCE_REST_URL: 'https://api.binance.com/api/v3',

  // OKX WebSocket (备用)
  OKX_WS_URL: 'wss://ws.okx.com:8443/ws/v5/public',

  // CoinGecko API
  COINGECKO_URL: 'https://api.coingecko.com/api/v3',

  // 其他 API
  EXCHANGERATE_URL: 'https://api.exchangerate-api.com/v4/latest/USD',
  FEARGREED_URL: 'https://api.alternative.me/fng/?limit=1',

  // CORS 代理
  CORS_PROXIES: [
    u => u,
    u => 'https://corsproxy.io/?' + encodeURIComponent(u),
  ],

  // 请求超时 (ms)
  REQUEST_TIMEOUT: 10000,
  CG_THROTTLE_MS: 1500,
};

// 刷新配置
export const REFRESH_CONFIG = {
  DEFAULT_REFRESH_SEC: 30,
  MIN_REFRESH_SEC: 5,
  MAX_REFRESH_SEC: 300,
};

// 缓存配置
export const CACHE_CONFIG = {
  TRENDING_COOLDOWN: 300000,    // 5分钟 - 热搜
  NEWS_COOLDOWN: 300000,       // 5分钟 - 新闻
  UNLOCK_COOLDOWN: 120000,     // 2分钟 - 解锁数据
  MARKET_OVERVIEW_INTERVAL: 120000, // 2分钟 - 市场概览
};

// 强制预警配置
export const FORCE_ALERT_CONFIG = {
  SNAPSHOT_INTERVAL_MS: 5000,
  SNAPSHOT_MAX_AGE_MS: 600000, // 10分钟
  DEFAULT_COOLDOWN_MS: 300000, // 5分钟
};

// 保活系统配置
export const KEEPALIVE_CONFIG = {
  WS_STALE_THRESHOLD: 30000,    // WS 超过 30s 没收到数据视为断开
  TIMER_DRIFT_THRESHOLD: 15000, // setInterval 漂移超过 15s 说明被暂停过
  RECOVER_COOLDOWN: 5000,      // 恢复冷却时间
};

// UI 配置
export const UI_CONFIG = {
  MAX_TOASTS: 5,
  TOAST_DURATION: 4000,
  ALERT_COOLDOWN_DEFAULT_MS: 5000,
  RENDER_THROTTLE_MS: 100,
};

// RSS 源定义
export const RSS_FEEDS = [
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss',      maxItems: 15 },
  { name: 'The Block',     url: 'https://www.theblock.co/rss.xml',    maxItems: 10 },
  { name: 'CryptoNews',    url: 'https://cryptonews.com/news/feed/',  maxItems: 10 },
];

// 已知币种符号
export const KNOWN_SYMBOLS = [
  'BTC','ETH','BNB','SOL','XRP','ADA','DOGE','TRX','AVAX','DOT',
  'LINK','MATIC','UNI','SHIB','LTC','BCH','ATOM','XLM','NEAR','APT',
  'ARB','OP','FIL','INJ','SUI','PEPE','SEI','WLD','TIA','AAVE',
  'MKR','CRV','LDO','STX','RENDER','FET','TON','WIF','JUP','ENA',
  'PYTH','JTO','ALT','DYM','ONDO','WLFI','TRUMP','GT','BGB','KCS',
  'LEO','CRO','OKB','HT'
];

// CoinGecko ID 映射
export const COIN_ID_MAP = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binance-coin', SOL: 'solana', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', TRX: 'tron', AVAX: 'avalanche', DOT: 'polkadot',
  LINK: 'chainlink', MATIC: 'matic-network', UNI: 'uniswap', SHIB: 'shiba-inu',
  LTC: 'litecoin', BCH: 'bitcoin-cash', ATOM: 'cosmos', XLM: 'stellar',
  NEAR: 'near-protocol', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism',
  FIL: 'filecoin', INJ: 'injective', SUI: 'sui', PEPE: 'pepe',
  SEI: 'sei', WLD: 'worldcoin-wlfi', TIA: 'celestia', ORDI: 'ordinals',
  AAVE: 'aave', MKR: 'maker', CRV: 'curve-dao-token', LDO: 'lido-dao',
  STX: 'stacks', RENDER: 'render-token', FET: 'fetch-ai',
  WLFI: 'world-liberty-financial', TON: 'the-open-network',
  WIF: 'dogwifcoin', JUP: 'jupiter-exchange-solana',
};

// 币种描述
export const COIN_DESCRIPTIONS = {
  'BTC': '比特币，首个去中心化加密货币，采用工作量证明(PoW)共识机制，总量2100万枚，被誉为"数字黄金"。',
  'ETH': '以太坊，智能合约平台，支持DeFi、NFT、DAO等应用生态，2022年完成从PoW到PoS的合并升级。',
  'BNB': '币安币，币安交易所原生代币，用于交易手续费折扣、Launchpad参与及链上Gas费支付。',
  'SOL': 'Solana，高性能Layer 1公链，以高TPS和低交易费著称。',
  'XRP': '瑞波币，Ripple Labs开发，专注于跨境支付和银行间结算。',
  'ADA': 'Cardano，由以太坊联合创始人Charles Hoskinson创建，采用学术研究驱动的Ouroboros PoS协议。',
  'DOGE': '狗狗币，因Elon Musk力挺和社区文化走红的Meme币。',
  'AVAX': 'Avalanche，主打高吞吐量和快速确认的Layer 1平台。',
  'DOT': 'Polkadot，Gavin Wood创建的多链互操作协议。',
  'MATIC': 'Polygon，以太坊的Layer 2扩容方案。',
  'LINK': 'Chainlink，去中心化预言机网络。',
  'UNI': 'Uniswap，以太坊上最大的去中心化交易所(DEX)。',
  'SHIB': 'Shiba Inu，自称"狗狗币杀手"的Meme代币。',
  'LTC': '莱特币，被称为"数字白银"。',
  'TRX': '波场TRON，专注于去中心化内容娱乐和稳定币转账。',
  'ATOM': 'Cosmos，"区块链互联网"，通过IBC协议实现不同区块链间的互操作。',
  'XLM': '恒星币，专注于普惠金融和跨境汇款。',
  'FIL': 'Filecoin，去中心化存储网络。',
  'NEAR': 'NEAR Protocol，主打用户体验的Layer 1公链。',
  'APT': 'Aptos，由前Meta工程师创建的Layer 1公链。',
  'OP': 'Optimism，以太坊Layer 2扩容方案。',
  'ARB': 'Arbitrum，以太坊上TVL最高的Layer 2网络。',
  'SUI': 'Sui，由前Meta团队开发的Layer 1公链。',
  'PEPE': 'Pepe the Frog Meme代币，2023年爆红的纯社区驱动Meme币。',
  'WIF': 'dogwifhat，Solana生态的Meme代币。',
  'TON': 'The Open Network，由Telegram团队最初设计的区块链。',
  'RENDER': 'Render Network，去中心化GPU渲染网络。',
  'STX': 'Stacks，比特币智能合约层。',
  'FET': 'Fetch.ai，AI与区块链融合项目。',
  'INJ': 'Injective，去中心化衍生品交易平台Layer 1。',
  'MKR': 'MakerDAO治理代币。',
  'AAVE': 'Aave，领先的去中心化借贷协议。',
  'CRV': 'Curve Finance治理代币。',
  'WLFI': 'World Liberty Financial，与特朗普家族相关的DeFi项目。',
  'TRUMP': 'Official Trump Meme代币。',
  'GT': 'Gate.io交易所平台代币。',
  'BGB': 'Bitget交易所平台代币。',
  'KCS': 'KuCoin交易所平台代币。',
  'LEO': 'UNUS SED LEO，Bitfinex交易所平台代币。',
  'CRO': 'Cronos，Crypto.com生态的原生代币。',
  'OKB': 'OKX交易所平台代币。',
  'HT': 'Huobi Token(HTX)，火币交易所平台代币。',
};

// localStorage 键名
export const STORAGE_KEYS = {
  COINS: 'crypto_coins',
  ALERTS: 'crypto_alerts',
  FORCE_ALERTS: 'crypto_force_alerts',
  PORTFOLIO: 'crypto_portfolio',
  COIN_API_MAP: 'crypto_coin_api_map',
  SOUND_ENABLED: 'crypto_sound',
  VOICE_ENABLED: 'crypto_voice',
  SPELL_SYMBOLS: 'crypto_spell',
  REFRESH_SEC: 'crypto_refresh',
  CURRENCY: 'crypto_currency',
  THEME: 'crypto_theme',
  COLOR_INVERT: 'crypto_color_invert',
  SCREEN_ALERT: 'crypto_screen_alert',
  NOTIFY_CONFIG: 'crypto_notify',
  TRENDING_CACHE: 'crypto_trending_cache',
  NEWS_CACHE: 'crypto_news_cache',
  FORCE_SNAPSHOTS: 'crypto_force_snapshots',
  ONBOARDED: 'crypto_onboarded',
};
