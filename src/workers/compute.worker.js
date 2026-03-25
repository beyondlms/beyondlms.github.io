/**
 * 计算 Web Worker
 * 处理 CPU 密集型计算任务，避免阻塞主线程
 */

// 消息类型
const MSG_TYPES = {
  CALC_RSI: 'calc_rsi',
  CALC_SMA: 'calc_sma',
  CALC_WINDOW_DROP: 'calc_window_drop',
  CALC_VOLATILITY: 'calc_volatility',
  CALC_SUPPORT_RESISTANCE: 'calc_support_resistance',
  BATCH_PROCESS: 'batch_process',
};

// 计算 RSI
function calcRSI(prices, period = 14) {
  if (!prices || prices.length < 2) return null;

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let gains = 0, losses = 0;
  for (let i = 0; i < Math.min(period, changes.length); i++) {
    if (changes[i] > 0) gains += changes[i];
    else losses += Math.abs(changes[i]);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return {
    rsi,
    avgGain,
    avgLoss,
    period,
  };
}

// 计算移动平均线
function calcSMA(prices, period) {
  if (!prices || prices.length < period) return null;

  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// 计算窗口内最大跌幅
function calcWindowDrop(snaps, windowMinutes) {
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

  return {
    drop: dropPct,
    fromPrice: peakPrice,
    toPrice: currentPrice,
    windowActual,
    peakTime: inWindow.find(s => s.p === peakPrice)?.t,
    troughTime: inWindow[inWindow.length - 1].t,
  };
}

// 计算波动率
function calcVolatility(prices, period = 20) {
  if (!prices || prices.length < period) return null;

  const recentPrices = prices.slice(-period);
  const returns = [];

  for (let i = 1; i < recentPrices.length; i++) {
    returns.push((recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1]);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const annualizedVol = stdDev * Math.sqrt(365 * 24 * 60 / period); // 假设 period 是分钟数

  return {
    stdDev,
    annualizedVol,
    mean,
    variance,
    period,
  };
}

// 计算支撑位和阻力位
function calcSupportResistance(prices, tolerance = 0.02) {
  if (!prices || prices.length < 5) return { support: [], resistance: [] };

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;

  const support = [];
  const resistance = [];

  // 基于价格分布识别支撑/阻力
  const bins = 10;
  const binSize = range / bins;
  const distribution = new Array(bins).fill(0);

  prices.forEach(p => {
    const binIndex = Math.min(Math.floor((p - min) / binSize), bins - 1);
    distribution[binIndex]++;
  });

  // 找到峰值（潜在阻力）
  for (let i = 1; i < bins - 1; i++) {
    if (distribution[i] > distribution[i - 1] && distribution[i] > distribution[i + 1]) {
      resistance.push(min + (i + 0.5) * binSize);
    }
  }

  // 找到谷值（潜在支撑）
  for (let i = 1; i < bins - 1; i++) {
    if (distribution[i] < distribution[i - 1] && distribution[i] < distribution[i + 1]) {
      support.push(min + (i + 0.5) * binSize);
    }
  }

  // 添加极端值
  support.push(min + range * tolerance);
  resistance.push(max - range * tolerance);

  return {
    support: support.slice(0, 3),
    resistance: resistance.slice(0, 3),
    min,
    max,
    range,
  };
}

// 批量处理
function batchProcess(tasks) {
  const results = [];

  tasks.forEach(task => {
    let result;
    switch (task.type) {
      case MSG_TYPES.CALC_RSI:
        result = calcRSI(task.prices, task.period);
        break;
      case MSG_TYPES.CALC_SMA:
        result = calcSMA(task.prices, task.period);
        break;
      case MSG_TYPES.CALC_WINDOW_DROP:
        result = calcWindowDrop(task.snaps, task.windowMinutes);
        break;
      case MSG_TYPES.CALC_VOLATILITY:
        result = calcVolatility(task.prices, task.period);
        break;
      case MSG_TYPES.CALC_SUPPORT_RESISTANCE:
        result = calcSupportResistance(task.prices, task.tolerance);
        break;
      default:
        result = null;
    }
    results.push({ id: task.id, result });
  });

  return results;
}

// 消息处理
self.onmessage = function(e) {
  const { type, id, data } = e.data;

  try {
    let result;

    switch (type) {
      case MSG_TYPES.CALC_RSI:
        result = calcRSI(data.prices, data.period);
        break;
      case MSG_TYPES.CALC_SMA:
        result = calcSMA(data.prices, data.period);
        break;
      case MSG_TYPES.CALC_WINDOW_DROP:
        result = calcWindowDrop(data.snaps, data.windowMinutes);
        break;
      case MSG_TYPES.CALC_VOLATILITY:
        result = calcVolatility(data.prices, data.period);
        break;
      case MSG_TYPES.CALC_SUPPORT_RESISTANCE:
        result = calcSupportResistance(data.prices, data.tolerance);
        break;
      case MSG_TYPES.BATCH_PROCESS:
        result = batchProcess(data.tasks);
        break;
      default:
        result = null;
    }

    self.postMessage({ id, type, result, success: true });

  } catch (error) {
    self.postMessage({ id, type, error: error.message, success: false });
  }
};

// 导出消息类型常量
self.MSG_TYPES = MSG_TYPES;
