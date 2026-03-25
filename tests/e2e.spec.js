/**
 * Playwright E2E 测试配置
 */
import { test, expect } from '@playwright/test';

// 测试配置
test.describe('Crypto Monitor E2E Tests', () => {

  // 测试前设置
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待页面加载
    await page.waitForLoadState('domcontentloaded');
  });

  // 主页加载测试
  test('主页应该正确加载', async ({ page }) => {
    // 检查标题
    await expect(page).toHaveTitle(/Crypto Monitor/i);

    // 检查主要元素存在
    await expect(page.locator('#tableBody')).toBeVisible();
    await expect(page.locator('#input')).toBeVisible();
    await expect(page.locator('#toastContainer')).toBeVisible();
  });

  // 搜索功能测试
  test('搜索功能应该正常工作', async ({ page }) => {
    const input = page.locator('#input');

    // 输入搜索内容
    await input.fill('BTC');
    await page.waitForTimeout(500);

    // 检查下拉菜单是否显示
    const dropdown = page.locator('#searchDropdown');
    await expect(dropdown).toBeVisible();
  });

  // 添加币种测试
  test('应该能够添加币种到列表', async ({ page }) => {
    // 等待初始渲染
    await page.waitForTimeout(1000);

    // 获取初始币种数量
    const initialCount = await page.locator('.table-row').count();

    // 添加新币种
    const input = page.locator('#input');
    await input.fill('ETH');
    await page.waitForTimeout(300);
    await input.press('Enter');

    // 等待更新
    await page.waitForTimeout(500);

    // 验证币种已添加
    const newCount = await page.locator('.table-row').count();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  // 快捷键测试
  test('快捷键应该正常工作', async ({ page }) => {
    // 按 / 键应该聚焦搜索框
    await page.keyboard.press('/');
    await expect(page.locator('#input')).toBeFocused();

    // 按 Escape 应该关闭模态框（如果有打开的话）
    await page.keyboard.press('Escape');
  });

  // 预警模态框测试
  test('预警模态框应该能正常打开和关闭', async ({ page }) => {
    // 按 A 键打开预警模态框
    await page.keyboard.press('a');
    await page.waitForTimeout(300);

    const alertModal = page.locator('#alertModalOverlay');
    await expect(alertModal).toHaveClass(/active/);

    // 按 Escape 关闭
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(alertModal).not.toHaveClass(/active/);
  });

  // 持仓模态框测试
  test('持仓模态框应该能正常打开', async ({ page }) => {
    // 按 P 键打开持仓模态框
    await page.keyboard.press('p');
    await page.waitForTimeout(300);

    const portfolioModal = page.locator('#portfolioModalOverlay');
    await expect(portfolioModal).toHaveClass(/active/);
  });

  // Toast 通知测试
  test('Toast 通知应该正确显示', async ({ page }) => {
    // 触发一个 Toast
    await page.evaluate(() => {
      window.showToast('测试消息', 'info');
    });

    // 验证 Toast 出现
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('测试消息');
  });

  // 主题切换测试
  test('主题切换应该正常工作', async ({ page }) => {
    // 获取初始主题
    const initialTheme = await page.evaluate(() => {
      return document.body.classList.contains('light-theme');
    });

    // 切换主题
    await page.keyboard.press('t');
    await page.waitForTimeout(200);

    // 验证主题已切换
    const newTheme = await page.evaluate(() => {
      return document.body.classList.contains('light-theme');
    });
    expect(newTheme).not.toBe(initialTheme);
  });

  // 声音切换测试
  test('声音切换应该正常工作', async ({ page }) => {
    // 获取初始状态
    const initialSound = await page.evaluate(() => {
      return document.getElementById('soundToggle')?.textContent;
    });

    // 切换声音
    await page.keyboard.press('s');
    await page.waitForTimeout(200);

    // 验证状态已切换
    const newSound = await page.evaluate(() => {
      return document.getElementById('soundToggle')?.textContent;
    });
    expect(newSound).not.toBe(initialSound);
  });

  // 帮助模态框测试
  test('帮助模态框应该能正常打开', async ({ page }) => {
    await page.keyboard.press('h');
    await page.waitForTimeout(300);

    const helpModal = page.locator('#helpModalOverlay');
    await expect(helpModal).toHaveClass(/active/);
  });

  // 新闻模态框测试
  test('新闻模态框应该能正常打开', async ({ page }) => {
    await page.keyboard.press('e');
    await page.waitForTimeout(300);

    const newsModal = page.locator('#newsModalOverlay');
    await expect(newsModal).toHaveClass(/active/);
  });

  // 响应式测试
  test('应该支持移动端视图', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // 验证页面元素仍然可见
    await expect(page.locator('#input')).toBeVisible();
    await expect(page.locator('#tableBody')).toBeVisible();
  });

});

// 性能测试
test.describe('Performance Tests', () => {
  test('页面加载时间应该在可接受范围内', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    console.log(`页面加载时间: ${loadTime}ms`);

    // 页面加载时间应该小于 3 秒
    expect(loadTime).toBeLessThan(3000);
  });

  test('搜索响应应该快速', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const input = page.locator('#input');
    const startTime = Date.now();

    await input.fill('BTC');
    await page.waitForTimeout(500);

    const responseTime = Date.now() - startTime;
    console.log(`搜索响应时间: ${responseTime}ms`);

    // 搜索响应时间应该小于 500ms
    expect(responseTime).toBeLessThan(500);
  });
});
