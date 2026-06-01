# 为什么 Agent-Hub 要同时做 npm CLI 和桌面端

> 标签建议：`CLI` `Tauri` `Next.js` `本地优先` `桌面应用` `AI Agent` `产品化`

## 开篇：Agent Pipeline 的执行环境，天然在本地

Agent-Hub 的核心能力必须运行在用户本地。

这不是一个口号，而是由能力边界决定的。

Agent-Hub 要做这些事：

- spawn Claude/Codex CLI 子进程。
- 读写用户本地工作目录。
- 对代码仓库执行 Git 操作。
- 调用本机环境变量和本地配置。
- 把 Pipeline run 的数据存到本地 SQLite。

如果把这些都放到云端，体验会变复杂：代码要上传，密钥要托管，文件权限要开放，Git 操作也会变得敏感。

所以我对 Agent-Hub 的产品形态判断是：先本地优先，再考虑云端协作。

本地优先对应两种入口：

```text
npm CLI：给开发者，npx agent-hub 一键启动
桌面应用：给非开发者，安装后系统托盘常驻
```

两种形态不拆成两个项目，而是共享同一套业务代码。

## 为什么 CLI 是第一入口

Agent-Hub 的第一批用户大概率是开发者。

开发者对命令行天然熟悉，也更能接受“本地 server + 浏览器 UI”的形态。

理想入口应该很短：

```bash
npx agent-hub
```

或者全局安装：

```bash
npm install -g agent-hub
agent-hub start --port 3939
```

启动后，本地运行 Next.js server，浏览器打开：

```text
http://127.0.0.1:3939
```

这个体验和很多开发工具类似：Jupyter、Vite dev server、Prisma Studio、n8n 本地版，本质都是“本地进程 + Web UI”。

## CLI 需要负责什么

CLI 看起来只是启动 server，其实要处理几个细节。

```text
agent-hub start
  -> 解析参数
  -> 选择端口
  -> 初始化数据目录
  -> 设置环境变量
  -> 找到 standalone server
  -> 启动 Node 进程
  -> 写入 pid 状态
  -> 打开浏览器
  -> 处理退出信号
```

这次新增的入口是：

```text
bin/agent-hub.js
```

支持的命令：

```bash
agent-hub                    # 默认 start
agent-hub start --port 3939
agent-hub start --no-open
agent-hub start --data-dir ~/.agent-hub
agent-hub status
agent-hub stop
agent-hub version
```

参数解析没有引入额外依赖，直接手写。原因是目前参数很少，引入 commander/yargs 反而增加发布体积和复杂度。

```javascript
function parseArgs(argv) {
  const args = { command: 'start', noOpen: false, port: undefined, dataDir: undefined }
  const list = [...argv]
  if (list.includes('--help') || list.includes('-h')) return { ...args, command: 'help' }
  if (list.includes('--version') || list.includes('-v')) return { ...args, command: 'version' }
  if (list[0] && !list[0].startsWith('-')) {
    args.command = list.shift()
  }

  for (let i = 0; i < list.length; i++) {
    const arg = list[i]
    if (arg === '--no-open') args.noOpen = true
    else if (arg === '--port') args.port = list[++i]
    else if (arg.startsWith('--port=')) args.port = arg.slice('--port='.length)
    else if (arg === '--data-dir') args.dataDir = list[++i]
    else if (arg.startsWith('--data-dir=')) args.dataDir = arg.slice('--data-dir='.length)
    else throw new Error(`未知参数: ${arg}`)
  }
  return args
}
```

## 端口选择：不要一上来就撞车

默认端口是 `3939`。

但用户机器上可能已经有进程占用了这个端口。所以 CLI 会从请求端口开始，向后找 50 个可用端口：

```javascript
async function resolvePort(port) {
  if (!Number.isInteger(port) || port <= 0) throw new Error(`无效端口: ${port}`)
  for (let current = port; current < port + 50; current++) {
    if (await isPortAvailable(current)) return current
  }
  throw new Error(`端口 ${port}-${port + 49} 均不可用`)
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}
```

这个逻辑不复杂，但能避免很多第一次启动失败。

## 数据目录：从项目目录迁到用户目录

开发阶段，数据库放在项目目录里没问题：

```text
./data/agent-hub.db
```

但发布成 CLI 或桌面应用后，数据不能依赖当前工作目录。

用户数据应该放在用户目录下：

```text
~/.agent-hub/
  data/
    agent-hub.db
  logs/
  agent-hub.pid
```

所以 CLI 里先确定 `dataDir`：

```javascript
const dataDir = path.resolve(
  args.dataDir ||
  process.env.AGENT_HUB_DATA_DIR ||
  path.join(os.homedir(), '.agent-hub')
)

const dbDataDir = path.join(dataDir, 'data')
fs.mkdirSync(dbDataDir, { recursive: true })
fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true })
```

再传给 server：

```javascript
const env = {
  ...process.env,
  PORT: String(port),
  HOSTNAME: process.env.HOSTNAME || '127.0.0.1',
  AGENT_HUB_DATA_DIR: dbDataDir,
}
```

DB 层也改成同一套规则：

```typescript
function getDataDir(): string {
  if (process.env.AGENT_HUB_DATA_DIR) return process.env.AGENT_HUB_DATA_DIR
  return path.join(os.homedir(), '.agent-hub', 'data')
}

const dbPath = process.env.AGENT_HUB_DB_PATH || path.join(getDataDir(), 'agent-hub.db')
```

这样 CLI 和桌面端后续可以共享同一个数据目录。

用户不用关心自己是从 CLI 启动，还是从桌面应用启动。数据都在同一个地方。

## Next.js standalone：让 npm 包能独立启动

Agent-Hub 是 Next.js 应用。如果直接发布源码，用户还需要完整 node_modules 和构建步骤，体验很差。

Next.js 提供了 standalone 输出：

```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'node-cron', 'nodemailer'],
  output: 'standalone',
}
```

构建后会生成：

```text
.next/standalone/server.js
```

CLI 启动时会找这个 server：

```javascript
function resolveServerPath() {
  const candidates = [
    path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
    path.join(__dirname, '..', 'server.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('未找到 Next.js standalone server，请先运行 pnpm build。')
}
```

然后用当前 Node 启动它：

```javascript
const server = spawn(process.execPath, [serverPath], {
  cwd: path.dirname(serverPath),
  env,
  stdio: 'inherit',
})
```

这里用 `process.execPath`，可以确保使用当前运行 CLI 的 Node，而不是依赖 PATH 里的 `node`。

## standalone 静态资源复制的坑

Next standalone server 有个细节：`server.js` 会把工作目录切到 `.next/standalone`。

这意味着静态资源也要在 standalone 目录里。

否则 server 能启动，但页面可能缺 `_next/static` 或 `public` 资源。

所以我加了一个 postbuild 脚本：

```json
{
  "scripts": {
    "build": "next build",
    "postbuild": "node scripts/prepare-standalone.js"
  }
}
```

脚本逻辑是：

```javascript
const standaloneDir = path.join(root, '.next', 'standalone')

copyIfExists(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'))
copyIfExists(path.join(root, 'public'), path.join(standaloneDir, 'public'))

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
}
```

这个脚本很小，但对 npm 分发很关键。

## package.json 的发布配置

为了让 `npx agent-hub` 能找到 CLI，需要配置 `bin`：

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
    "prepublishOnly": "pnpm build"
  }
}
```

`files` 控制 npm 包里包含什么。否则很容易把无关开发文件也打进去，或者漏掉 standalone 产物。

`prepublishOnly` 确保发布前先构建。

## status/stop：先做前台进程的基本状态管理

当前 CLI 还不是完整 daemon，但可以记录启动出来的 server pid。

启动后写状态文件：

```javascript
writeState(dataDir, {
  pid: server.pid,
  port,
  startedAt: new Date().toISOString()
})
```

状态文件路径：

```javascript
function getStatePath(dataDir) {
  return path.join(dataDir, 'agent-hub.pid')
}
```

`status` 读取 pid 并检查进程是否存在：

```javascript
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
```

`stop` 则发送 SIGTERM：

```javascript
function stopServer(dataDir) {
  const state = readState(dataDir)
  if (!state || !state.pid || !isProcessAlive(state.pid)) {
    console.log('Agent-Hub 未运行')
    removeState(dataDir)
    return
  }
  process.kill(state.pid, 'SIGTERM')
  removeState(dataDir)
  console.log(`已停止 Agent-Hub (pid ${state.pid})`)
}
```

这不是最终后台服务方案，但已经能覆盖基础使用。

后续如果要真正 daemon 化，可以再加：后台启动、日志重定向、崩溃自动拉起、系统服务集成。

## 为什么还要桌面端

CLI 对开发者友好，但对非开发者不够友好。

如果目标用户包括运营、产品、内容团队，他们不一定想打开终端。

他们更熟悉的是桌面应用：

- 下载 dmg/exe。
- 双击打开。
- 窗口里配置 Pipeline。
- 关闭窗口后托盘常驻。
- 有任务完成时发系统通知。
- 后续自动更新。

所以 Agent-Hub 需要桌面端。

但桌面端不应该重写业务逻辑。它只是另一个启动壳。

## 为什么选 Tauri，而不是 Electron

Electron 最大的问题是重。

它自带 Chromium，包体积和内存占用都不小。Agent-Hub 本身还要跑 Node sidecar，如果再带一个完整 Chromium，会显得很笨重。

Tauri 使用系统 WebView，Rust 负责系统集成，更适合“本地工具 + Web UI”的形态。

| 维度 | Tauri | Electron |
|------|-------|----------|
| WebView | 系统 WebView | 自带 Chromium |
| 包体积 | 更小 | 更大 |
| 系统集成 | Rust 后端 | Node 主进程 |
| 适合场景 | 轻量本地工具 | 重型桌面应用 |

Agent-Hub 的桌面架构计划是：

```text
Tauri 桌面壳
  -> Rust 管窗口、托盘、通知、更新
  -> Node sidecar 跑 Next.js standalone server
  -> WebView 加载 http://localhost:3939
```

## 当前 Tauri 骨架

这次先搭了最基础的 Tauri 项目结构：

```text
src-tauri/
  Cargo.toml
  build.rs
  tauri.conf.json
  capabilities/default.json
  src/
    lib.rs
    main.rs
```

`tauri.conf.json` 里先让窗口加载本地地址：

```json
{
  "productName": "Agent-Hub",
  "version": "0.1.0",
  "identifier": "com.agent-hub.app",
  "build": {
    "beforeDevCommand": "pnpm dev -- --port 3939",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:3939",
    "frontendDist": "../.next/standalone"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Agent-Hub",
        "width": 1280,
        "height": 800,
        "url": "http://localhost:3939"
      }
    ]
  }
}
```

Rust 侧先做了基础托盘：

```rust
fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}
```

托盘现在只做两件事：显示窗口、退出。

下一步才是 sidecar 生命周期管理。

## sidecar 生命周期还要补什么

桌面端真正可用，需要 Rust 后端管理 Node sidecar。

至少要做这些：

```text
启动桌面应用
  -> 找空闲端口
  -> 设置 AGENT_HUB_DATA_DIR
  -> 启动 Node standalone server
  -> 等待健康检查通过
  -> WebView 加载 localhost
  -> 应用退出时关闭 sidecar
```

还要处理异常：

- sidecar 启动失败。
- 端口被占用。
- Node 二进制不存在。
- server 崩溃。
- 用户关闭窗口但不想退出进程。

这些东西如果处理不好，桌面应用就会很不稳定。

所以当前阶段只提交骨架，不假装桌面端已经完整可用。

## Node runtime 怎么打包

Tauri sidecar 有一个现实问题：用户机器上不一定有 Node.js。

有两种方案。

方案 A：依赖系统 Node。

优点是包小。缺点是非开发者可能没有 Node，或者版本不对。

方案 B：打包 Node runtime。

优点是用户无需安装 Node。缺点是包会变大。

对于面向非开发者的桌面端，我更倾向方案 B。

开发者用 CLI，可以默认有 Node 环境。非开发者用桌面端，就不应该再要求他们装 Node。

## 为什么不拆 monorepo

CLI 和桌面端看起来是两个产品，但它们不应该有两套业务逻辑。

Agent-Hub 的共享层是：

```text
src/app         Next.js 页面和 API
src/lib         Pipeline engine
src/components  React UI
src/db          SQLite / Drizzle
src/store       Zustand state
```

CLI 做启动。

Tauri 做桌面壳和系统集成。

Pipeline、Agent、Provider、DB、UI 都只有一份。

这能避免一个常见问题：CLI 支持某个功能，桌面端没有；桌面端修了某个 bug，CLI 忘了同步。

共享业务层，分离启动壳，是这次产品形态设计的核心。

## 验证情况

这一阶段做了这些验证：

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build
npm pack --dry-run
node bin/agent-hub.js --help
node bin/agent-hub.js version
pnpm tauri --version
```

通过的点：

- TypeScript 类型检查通过。
- Vitest 测试通过。
- Next standalone 构建通过。
- npm pack dry-run 能看到包内容。
- CLI help/version 可用。
- Tauri CLI 可用。

限制是：当前环境没有 `cargo`，所以 Rust/Tauri crate 没有完成本地编译验证。

这件事后续需要在安装 Rust 工具链的环境里补上。

## 接下来要做什么

CLI 侧下一步：

- 完整测试 `npx` 安装后的启动流程。
- 完善 daemon/background 模式。
- 把日志写到 `~/.agent-hub/logs`。
- 加健康检查和更好的错误提示。

桌面端下一步：

- 实现 Node sidecar 生命周期管理。
- 应用启动时自动分配端口。
- WebView 等待 server ready 后再加载。
- 系统通知：Pipeline 完成/失败。
- 开机自启。
- 自动更新。
- 应用图标和品牌视觉。

发布侧下一步：

- GitHub Actions 构建 npm 包。
- GitHub Actions 多平台构建 Tauri。
- GitHub Releases 自动上传 dmg/exe/AppImage。
- README 增加 CLI 和桌面端安装说明。

## 结尾：产品形态服务于执行边界

Agent-Hub 做 CLI 和桌面端，不是为了多做两个入口。

它背后的判断是：Agent Pipeline 的执行边界在本地。

开发者需要一个能快速启动、能接入本地仓库、能和 Claude/Codex CLI 协作的工具，所以需要 npm CLI。

非开发者需要一个安装后常驻、可视化管理、系统通知的工具，所以需要桌面端。

两者共享同一套 Pipeline 引擎和数据目录，避免产品分裂。

这就是 Agent-Hub 从 Demo 走向产品化时，必须补上的一层：不是再加一个 Agent，而是让用户能用最自然的方式把它跑起来。
