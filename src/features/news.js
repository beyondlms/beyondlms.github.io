/**
 * 新闻聚合模块
 */
import { CACHE_CONFIG, RSS_FEEDS, KNOWN_SYMBOLS } from '../config/constants.js';
import { relativeTime, extractSymbols, escapeHtml, escapeAttr } from '../utils/format.js';
import { apiService } from '../core/api.js';

class NewsFeature {
  constructor() {
    this.newsData = [];
    this.filter = 'all';
    this._lastFetch = 0;
  }

  /**
   * 解析 RSS XML
   */
  _parseRssItems(xml, sourceName, maxItems) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match, count = 0;

    while ((match = itemRegex.exec(xml)) !== null && count < maxItems) {
      const block = match[1];
      const title = this._extractXmlTag(block, 'title');
      const link = this._extractXmlTag(block, 'link');
      const desc = this._extractXmlTag(block, 'description');
      const dateStr = this._extractXmlTag(block, 'pubDate');

      if (!title) continue;

      const ts = dateStr ? (new Date(dateStr).getTime() || Date.now()) : Date.now();
      const syms = extractSymbols(title + ' ' + (desc || ''), KNOWN_SYMBOLS);
      const cleanDesc = (desc || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z]+;/g, ' ')
        .trim();

      items.push({
        type: 'news',
        title: title.length > 90 ? title.slice(0, 90) + '…' : title,
        desc: cleanDesc.length > 200 ? cleanDesc.slice(0, 200) + '…' : cleanDesc,
        coins: syms,
        source: sourceName,
        ts,
        url: link || '',
        isArticle: true,
        important: false,
      });
      count++;
    }

    return items;
  }

  _extractXmlTag(xml, tag) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${tag}>`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : '';
  }

  /**
   * 获取新闻数据
   */
  async fetch(coins, priceHistory) {
    const now = Date.now();
    if (now - this._lastFetch < CACHE_CONFIG.NEWS_COOLDOWN && this.newsData.length) {
      return this.newsData;
    }
    this._lastFetch = now;

    const newItems = [];

    // 并行获取 RSS 源
    const rssResults = await Promise.allSettled(
      RSS_FEEDS.map(feed =>
        apiService.fetchRssFeed(feed.url, feed.name, feed.maxItems, this._parseRssItems.bind(this))
      )
    );

    rssResults.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value.length) {
        newItems.push(...res.value);
      }
    });

    // 添加行情异动提醒
    coins.forEach(c => {
      const ph = priceHistory[c.symbol];
      if (!ph || ph.length < 2) return;

      const last = ph[ph.length - 1];
      const prev = ph[Math.max(0, ph.length - 12)];
      if (!last || !prev) return;

      const pct = prev.p ? ((last.p - prev.p) / prev.p * 100) : 0;

      if (Math.abs(pct) >= 2) {
        newItems.push({
          type: pct > 0 ? 'news' : 'alert',
          title: `${c.symbol} ${pct > 0 ? '📈 强势拉升' : '📉 快速下挫'} ${Math.abs(pct).toFixed(2)}%`,
          desc: `${c.name} 短时间内${pct > 0 ? '大幅上涨' : '明显回落'}，当前价格 ${last.p}。`,
          coins: [c.symbol],
          source: '行情异动',
          ts: Date.now(),
          important: Math.abs(pct) > 5,
          url: '',
          isArticle: false,
        });
      }
    });

    // 去重排序
    const seen = new Set();
    const deduped = newItems.filter(item => {
      const key = item.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduped.sort((a, b) => {
      if (a.important !== b.important) return b.important ? 1 : -1;
      return b.ts - a.ts;
    });

    if (deduped.length) {
      this.newsData = deduped;
    }

    return this.newsData;
  }

  /**
   * 渲染新闻列表
   */
  render(coins) {
    const listEl = document.getElementById('newsList');
    if (!listEl) return;

    const watchlistSymbols = new Set(coins.map(c => c.symbol));

    let filtered = this.newsData;
    if (this.filter === 'watchlist') {
      filtered = this.newsData.filter(n => n.coins?.some(c => watchlistSymbols.has(c)));
    } else if (this.filter === 'important') {
      filtered = this.newsData.filter(n => n.important);
    }

    if (!filtered.length) {
      listEl.innerHTML = '<div class="alert-empty">没有符合条件的新闻</div>';
      return;
    }

    listEl.innerHTML = filtered.map(n => {
      const tagClass = n.type === 'alert' ? 'tag-alert' : 'tag-news';
      const tagText = n.type === 'alert' ? '⚠️ 重要' : '📰 新闻';

      const coinsHtml = (n.coins || []).map(s =>
        `<span class="news-card-coin${watchlistSymbols.has(s) ? ' in-watchlist' : ''}">${s}</span>`
      ).join('');

      const isArticle = n.isArticle || false;
      const linkLabel = isArticle ? '🔗 查看原文' : '📊 查看行情';

      if (n.url) {
        return `<a class="news-card-link-wrap" href="${escapeAttr(n.url)}" target="_blank" rel="noopener">
          <div class="news-card type-${n.type}${n.important ? ' important' : ''}">
            <div class="news-card-header">
              <span class="news-card-tag ${tagClass}">${tagText}</span>
              <div class="news-card-coins">${coinsHtml}</div>
            </div>
            <div class="news-card-title">${escapeHtml(n.title)}</div>
            <div class="news-card-desc">${escapeHtml(n.desc)}</div>
            <div class="news-card-meta">
              <span class="news-card-source">${escapeHtml(n.source)}</span>
              <span class="news-card-time">${relativeTime(n.ts)}</span>
              <span class="news-card-link">${linkLabel}</span>
            </div>
          </div>
        </a>`;
      }

      return `<div class="news-card type-${n.type}${n.important ? ' important' : ''}">
        <div class="news-card-header">
          <span class="news-card-tag ${tagClass}">${tagText}</span>
          <div class="news-card-coins">${coinsHtml}</div>
        </div>
        <div class="news-card-title">${escapeHtml(n.title)}</div>
        <div class="news-card-desc">${escapeHtml(n.desc)}</div>
        <div class="news-card-meta">
          <span class="news-card-source">${escapeHtml(n.source)}</span>
          <span class="news-card-time">${relativeTime(n.ts)}</span>
        </div>
      </div>`;
    }).join('');
  }

  setFilter(filter) {
    this.filter = filter;
  }
}

export const newsFeature = new NewsFeature();
export default newsFeature;
