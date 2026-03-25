# Crypto Monitor - 模块化重构版本

## 项目概述

Crypto Monitor 是一个实时加密货币监控系统，采用模块化架构设计，支持多交易所数据源、实时预警、持仓追踪等功能。

## 模块化架构

```
crypto-monitor/
├── src/
│   ├── config/           # 配置常量
│   │   └── constants.js   # API、缓存、UI 配置
│   ├── core/             # 核心服务
│   │   ├── storage.js    # 存储服务
│   │   ├── api.js        # API 服务
│   │   └── websocket.js  # WebSocket 服务
│   ├── features/         # 功能模块
│   │   ├── audio.js      # 音频服务
│   │   ├── alerts.js     # 预警功能
│   │   ├── notifications.js # 通知服务
│   │   └── news.js       # 新闻聚合
│   ├── ui/               # UI 组件
│   │   └── VirtualList.js # 虚拟列表
│   ├── utils/            # 工具函数
│   │   └── format.js     # 格式化函数
│   ├── workers/          # Web Workers
│   │   └── compute.worker.js # 计算 Worker
│   ├── types/            # TypeScript 类型定义
│   │   └── index.d.ts
│   └── main.js           # 主入口
├── tests/                # 测试
│   └── e2e.spec.js       # Playwright E2E 测试
├── package.json
├── tsconfig.json
└── playwright.config.js
```

## 主要优化

### 1. ES6 模块化重构
- 将 4700+ 行单文件拆分为多个职责明确的模块
- 配置、核心服务、功能模块、UI 组件分离
- 提高代码可维护性和可测试性

### 2. TypeScript 类型定义
- 完整的类型定义文件 (`index.d.ts`)
- 涵盖所有核心接口和类型
- 支持 IDE 智能提示和类型检查

### 3. Web Worker 分离
- 计算密集型任务移至 Worker 线程
- 支持 RSI、波动率、支撑阻力位等计算
- 不阻塞主线程，提升 UI 响应

### 4. 虚拟列表
- `VirtualList` 组件支持大量数据高效渲染
- 仅渲染可见区域，减少 DOM 节点
- 提升大量币种时的渲染性能

### 5. E2E 测试
- Playwright 配置完整
- 覆盖主要功能测试
- 支持多浏览器和移动端测试

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 运行测试
npm run test:e2e

# 类型检查
npm run typecheck
```

## 快捷键

| 键 | 功能 |
|---|---|
| `/` | 聚焦搜索框 |
| `A` | 打开预警设置 |
| `P` | 打开持仓管理 |
| `H` | 打开帮助 |
| `S` | 切换声音 |
| `T` | 切换主题 |
| `E` | 打开新闻 |
| `U` | 打开解锁日历 |
| `F` | 打开强制预警 |
| `Escape` | 关闭模态框 |

## 技术栈

- **前端**: 原生 JavaScript (ES6+)
- **构建**: Vite
- **测试**: Playwright + Vitest
- **类型**: TypeScript
- **样式**: CSS3

## API 集成

- **Binance**: WebSocket 实时价格
- **CoinGecko**: 热搜、市场数据
- **RSS Feeds**: 新闻聚合

## 许可证

MIT
