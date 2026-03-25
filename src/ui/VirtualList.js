/**
 * 虚拟列表组件
 * 用于高效渲染大量数据行
 */

export class VirtualList {
  constructor(options = {}) {
    this.container = options.container;
    this.itemHeight = options.itemHeight || 48;
    this.bufferSize = options.bufferSize || 5;
    this.items = [];
    this.renderItem = options.renderItem || (() => '');
    this.onScroll = options.onScroll || null;

    this._scrollTop = 0;
    this._visibleStart = 0;
    this._visibleEnd = 0;

    this._init();
  }

  _init() {
    if (!this.container) return;

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'virtual-list-content';
    this.contentEl.style.cssText = 'position:relative;';

    this.spacerStart = document.createElement('div');
    this.spacerStart.className = 'virtual-list-spacer';

    this.itemsContainer = document.createElement('div');
    this.itemsContainer.className = 'virtual-list-items';

    this.spacerEnd = document.createElement('div');
    this.spacerEnd.className = 'virtual-list-spacer';

    this.contentEl.appendChild(this.spacerStart);
    this.contentEl.appendChild(this.itemsContainer);
    this.contentEl.appendChild(this.spacerEnd);

    this.container.style.overflow = 'auto';
    this.container.appendChild(this.contentEl);

    this.container.addEventListener('scroll', this._onScroll.bind(this), { passive: true });

    this._update();
  }

  _onScroll() {
    this._scrollTop = this.container.scrollTop;
    this._update();
    this.onScroll?.(this._scrollTop);
  }

  _update() {
    const containerHeight = this.container.clientHeight;
    const totalHeight = this.items.length * this.itemHeight;

    // 计算可见范围
    this._visibleStart = Math.max(0, Math.floor(this._scrollTop / this.itemHeight) - this.bufferSize);
    this._visibleEnd = Math.min(
      this.items.length,
      Math.ceil((this._scrollTop + containerHeight) / this.itemHeight) + this.bufferSize
    );

    // 更新 spacer
    this.spacerStart.style.height = `${this._visibleStart * this.itemHeight}px`;
    this.spacerEnd.style.height = `${Math.max(0, totalHeight - this._visibleEnd * this.itemHeight)}px`;

    // 更新内容高度
    this.contentEl.style.height = `${totalHeight}px`;

    // 渲染可见项
    this._renderVisibleItems();
  }

  _renderVisibleItems() {
    this.itemsContainer.innerHTML = '';

    const visibleItems = this.items.slice(this._visibleStart, this._visibleEnd);
    visibleItems.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'virtual-list-item';
      el.style.cssText = `position:absolute;top:${(this._visibleStart + index) * this.itemHeight}px;left:0;right:0;height:${this.itemHeight}px;`;
      el.innerHTML = this.renderItem(item, this._visibleStart + index);
      this.itemsContainer.appendChild(el);
    });
  }

  /**
   * 设置数据
   */
  setItems(items) {
    this.items = items || [];
    this._scrollTop = 0;
    this.container.scrollTop = 0;
    this._update();
  }

  /**
   * 滚动到指定索引
   */
  scrollToIndex(index) {
    const targetScroll = index * this.itemHeight;
    this.container.scrollTop = targetScroll;
  }

  /**
   * 滚动到顶部
   */
  scrollToTop() {
    this.container.scrollTop = 0;
  }

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    this.container.scrollTop = this.items.length * this.itemHeight - this.container.clientHeight;
  }

  /**
   * 获取当前可见范围
   */
  getVisibleRange() {
    return { start: this._visibleStart, end: this._visibleEnd };
  }

  /**
   * 刷新
   */
  refresh() {
    this._update();
  }

  /**
   * 销毁
   */
  destroy() {
    this.container.removeEventListener('scroll', this._onScroll.bind(this));
    this.container.innerHTML = '';
    this.items = [];
  }
}

export default VirtualList;
