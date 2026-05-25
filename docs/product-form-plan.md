# Agent-Hub 产品形态方案：npm CLI + 桌面应用

## Context

Agent-Hub 是一个 AI Agent Pipeline 编排工具，计划开源发布。核心能力是本地 CLI 编排（spawn claude/codex 进程、读写本地文件、git 操作），因此必须运行在用户本地环境。

同步推进两种分发形态：
1. **npm CLI** — 开发者主力，`npx agent-hub` 一键启动
2. **桌面应用 (Tauri)** — 覆盖非开发者用户，系统托盘常驻

不拆 monorepo，整体包装。

---

## 一、npm CLI 分发

### 目标

用户通过 `npx agent-hub` 或 `npm i -g agent-hub` 一键启动，本地运行 Next.js server + 浏览器访问。

### 改造要点

**1. 新建 CLI 入口 `bin/agent-hub.js`**

```javascript
#!/usr/bin/env node
// 启动 Next.js standalone server
// 处理：端口选择、数据目录初始化、打开浏览器
```

职责：
- 解析命令行参数（`--port`, `--no-open`, `--data-dir`）
- 确保数据目录存在（默认 `~/.agent-hub/`）
- 运行 DB migration（首次启动自动建表）
- 启动 Next.js standalone server
- 自动打开浏览器（可通过 `--no-open` 禁用）
- 优雅退出（SIGINT/SIGTERM 处理）

**2. 修改 `package.json`**

```json
{
  "name": "agent-hub",
  "version": "0.1.0",
  "private": false,
  "bin": {
    "agent-hub": "./bin/agent-hub.js"
  },
  "files": [
    "bin/",
    ".next/standalone/",
    ".next/static/",
    "public/",
    "src/db/migrations/"
  ],
  "scripts": {
    "prepublishOnly": "next build"
  }
}
```

**3. 修改 `next.config.ts`**

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',  // 生成独立部署包
  serverExternalPackages: ['better-sqlite3', 'node-cron', 'nodemailer'],
}
```

`output: 'standalone'` 让 Next.js 生成一个最小化的 server，不依赖 node_modules。

**4. 数据目录策略**

```
~/.agent-hub/
├── data/
│   └── agent-hub.db      # SQLite 数据库
├── config.json            # 用户配置（端口、marketplace token 等）
└── logs/                  # 运行日志
```

当前代码中 DB 路径硬编码为 `./data/agent-hub.db`，需要改为可配置：
- 环境变量 `AGENT_HUB_DATA_DIR` 优先
- 默认 `~/.agent-hub/data/`
- CLI 参数 `--data-dir` 覆盖

**5. 命令行接口设计**

```bash
agent-hub                    # 启动 server（默认 port 3939）
agent-hub start              # 同上
agent-hub start --port 8080  # 指定端口
agent-hub start --no-open    # 不自动打开浏览器
agent-hub stop               # 停止后台运行的实例
agent-hub status             # 查看运行状态
agent-hub version            # 版本信息
```

### 关键文件变更

| 文件 | 变更 |
|------|------|
| `bin/agent-hub.js` | 新建，CLI 入口 |
| `package.json` | 添加 bin、files、修改 private |
| `next.config.ts` | 添加 `output: 'standalone'` |
| `drizzle.config.ts` | DB 路径改为可配置 |
| `src/db/index.ts` | DB 路径改为读取环境变量 |

---

## 二、桌面应用 (Tauri)

### 目标

提供原生桌面体验：系统托盘常驻、原生通知、自动更新、一键安装（.dmg / .exe / .AppImage）。

### 为什么选 Tauri

| 维度 | Tauri | Electron |
|------|-------|----------|
| 包体积 | ~10-15MB | ~150MB |
| 内存占用 | 低（系统 WebView） | 高（自带 Chromium） |
| 后端语言 | Rust（可调用系统 CLI） | Node.js |
| 协议 | MIT | MIT |
| Node.js 集成 | 通过 sidecar 运行 | 原生支持 |

### 架构

```
┌─────────────────────────────────────────────┐
│  Tauri 桌面壳                                │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  WebView (系统自带)                   │    │
│  │  加载 http://localhost:3939          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Sidecar: Node.js server             │    │
│  │  (Next.js standalone build)          │    │
│  │  - API routes                        │    │
│  │  - Pipeline runner                   │    │
│  │  - Scheduler                         │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Rust 后端                            │    │
│  │  - 系统托盘                           │    │
│  │  - 原生通知                           │    │
│  │  - 自动更新                           │    │
│  │  - Sidecar 生命周期管理               │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

核心思路：Tauri 的 Rust 后端负责系统集成（托盘、通知、更新），Node.js sidecar 运行完整的 agent-hub server。WebView 直接加载 localhost 页面。

### 目录结构

```
agent-hub/
├── src/                    # Next.js 应用（共享）
├── bin/                    # CLI 入口
├── src-tauri/              # Tauri 桌面应用
│   ├── Cargo.toml          # Rust 依赖
│   ├── tauri.conf.json     # Tauri 配置
│   ├── src/
│   │   └── main.rs         # Rust 入口
│   ├── icons/              # 应用图标
│   └── binaries/           # Node.js sidecar 打包位置
├── package.json
└── next.config.ts
```

### Tauri 配置要点

**`src-tauri/tauri.conf.json`**

```json
{
  "build": {
    "beforeBuildCommand": "pnpm build",
    "beforeDevCommand": "pnpm dev"
  },
  "app": {
    "windows": [{
      "title": "Agent Hub",
      "width": 1280,
      "height": 800,
      "url": "http://localhost:3939"
    }],
    "security": {
      "dangerousRemoteUrlAccess": ["http://localhost:3939"]
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "nsis", "appimage"],
    "identifier": "com.agent-hub.app",
    "icon": ["icons/icon.png"]
  },
  "plugins": {
    "updater": {
      "endpoints": ["https://releases.agent-hub.dev/{{target}}/{{arch}}/{{current_version}}"]
    }
  }
}
```

### Rust 后端功能

```rust
// src-tauri/src/main.rs 核心功能

// 1. Sidecar 管理 — 启动/停止 Node.js server
// 2. 系统托盘 — 显示运行状态、快捷操作
// 3. 原生通知 — Pipeline 完成/失败时推送
// 4. 自动更新 — 检查新版本、下载安装
// 5. 深度链接 — agent-hub:// 协议处理（marketplace 安装）
```

### Sidecar 打包策略

Tauri sidecar 需要把 Node.js runtime + Next.js standalone build 打包进去：

方案 A：**嵌入 Node.js 二进制**
- 使用 `pkg` 或 `nexe` 将 Node.js + server 打包为单个可执行文件
- 优点：用户无需安装 Node.js
- 缺点：包体积增大 ~50MB

方案 B：**依赖系统 Node.js**
- Sidecar 直接调用系统 `node` 命令
- 优点：包体积小
- 缺点：用户需要预装 Node.js

**推荐方案 A**（面向非开发者用户，不能假设有 Node.js 环境）。

### 桌面特有功能

| 功能 | 实现方式 |
|------|---------|
| 系统托盘 | Tauri SystemTray API |
| 原生通知 | Tauri Notification plugin |
| 开机自启 | Tauri Autostart plugin |
| 自动更新 | Tauri Updater plugin |
| 深度链接 | Tauri Deep Link plugin（`agent-hub://install/slug`） |
| 文件拖拽导入 | Tauri File Drop event |

---

## 三、共享层设计

### 核心原则

两种形态共享 100% 的业务代码，差异仅在启动方式和系统集成层。

```
┌──────────────────────────────────────────┐
│  共享层（不动）                             │
│  - src/app/          Next.js pages + API  │
│  - src/lib/          Pipeline engine      │
│  - src/components/   React UI             │
│  - src/db/           Database layer       │
│  - src/store/        Zustand stores       │
└──────────────────────────────────────────┘
         │                    │
    ┌────▼────┐         ┌────▼────┐
    │ CLI 壳   │         │ Tauri 壳 │
    │ bin/     │         │ src-tauri/│
    └─────────┘         └──────────┘
```

### 需要抽象的配置

| 配置项 | CLI 模式 | 桌面模式 |
|--------|---------|---------|
| 数据目录 | `~/.agent-hub/` | `~/.agent-hub/`（相同） |
| 端口 | 命令行参数 | 自动分配空闲端口 |
| 打开浏览器 | 默认打开 | 不需要（WebView 内嵌） |
| 后台运行 | 用户手动 Ctrl+C | 系统托盘常驻 |
| 通知 | 无（或终端输出） | 系统原生通知 |

### DB 路径统一

修改 `src/db/index.ts`：

```typescript
import path from 'path'
import os from 'os'

function getDataDir(): string {
  if (process.env.AGENT_HUB_DATA_DIR) {
    return process.env.AGENT_HUB_DATA_DIR
  }
  return path.join(os.homedir(), '.agent-hub', 'data')
}

const dbPath = path.join(getDataDir(), 'agent-hub.db')
```

---

## 四、发布策略

### npm 发布

```bash
# 构建
pnpm build                    # Next.js standalone build

# 发布
npm publish                   # 发布到 npm registry
```

用户安装：
```bash
npx agent-hub                 # 临时运行
npm install -g agent-hub      # 全局安装
```

### 桌面应用发布

```bash
# 构建
pnpm build                    # Next.js build
pnpm tauri build              # Tauri 打包

# 产物
src-tauri/target/release/bundle/
├── dmg/Agent-Hub.dmg         # macOS
├── nsis/Agent-Hub-Setup.exe  # Windows
└── appimage/Agent-Hub.AppImage  # Linux
```

分发渠道：
- GitHub Releases（主要）
- 官网下载页
- Homebrew cask（macOS，后期）
- winget（Windows，后期）

### CI/CD 流程

```yaml
# GitHub Actions
on:
  push:
    tags: ['v*']

jobs:
  publish-npm:
    # npm publish

  build-desktop:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    steps:
      - pnpm build
      - pnpm tauri build
      - Upload to GitHub Releases
```

---

## 五、实施步骤

### Phase 1：CLI 分发（1-2 天）

1. [x] 修改 `next.config.ts` 添加 `output: 'standalone'`
2. [x] 抽象 DB 路径为可配置（环境变量）
3. [x] 新建 `bin/agent-hub.js` CLI 入口
4. [x] 修改 `package.json`（bin、files、private: false）
5. [x] 本地测试：`node bin/agent-hub.js --help` / `version` 验证
6. [x] npm publish 测试（`npm pack --dry-run` 检查产物）

### Phase 2：桌面应用基础（3-5 天）

1. [x] 初始化 Tauri 项目骨架
2. [ ] 配置 sidecar（Node.js standalone server）
3. [ ] 实现 Rust 端 sidecar 生命周期管理
4. [x] WebView 加载 localhost 页面
5. [x] 基础系统托盘（显示/隐藏窗口、退出）
6. [ ] 本地构建测试（当前环境缺少 `cargo`，暂无法验证）

### Phase 3：桌面增强功能（2-3 天）

1. 原生通知（Pipeline 完成/失败）
2. 开机自启选项
3. 自动更新集成
4. 深度链接（`agent-hub://` 协议）
5. 应用图标和品牌

### Phase 4：CI/CD + 发布（1-2 天）

1. GitHub Actions：npm publish workflow
2. GitHub Actions：Tauri 多平台构建
3. GitHub Releases 自动发布
4. README 安装说明

---

## 六、验证方式

1. **CLI**：`npm pack` → 解压 → `node bin/agent-hub.js` → 浏览器访问 → 创建 pipeline → 运行成功
2. **桌面应用**：`pnpm tauri dev` → 窗口打开 → 功能正常 → 托盘图标可见
3. **数据隔离**：CLI 和桌面应用使用相同 `~/.agent-hub/` 目录，数据互通
4. **跨平台**：macOS + Linux 构建通过（Windows 可后续验证）
