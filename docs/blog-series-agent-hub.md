# Agent-Hub 四期博客系列稿

> 系列定位：从一个能跑的 Agent Pipeline Demo 出发，逐步讲清 Agent-Hub 的产品理念、Pipeline 协议、导入导出机制，以及最终为什么要做成 CLI + 桌面端。

---

# 第一期：我用 5 个 AI Agent 搭了一条流水线，每天自动生成热梗漫画发公众号

> 标签建议：`AI Agent` `自动化` `Pipeline` `GPT Image` `微信公众号` `Next.js`

## 开篇

做公众号最难的不是写一篇文章。

难的是每天都写。

尤其是热梗漫画这种内容：你要刷热点，判断哪个梗今天还热，想四格漫画脚本，生成图片，排版成公众号图文，再把图片上传到微信素材库。整套流程很固定，但人工做起来很碎，一天 2 小时很正常。

所以我做了一个实验：能不能把这条链路拆成 5 个 Agent，让它们自动跑完？

结果是可以的。现在 Agent-Hub 里已经有一条完整的“热梗漫画 Pipeline”：从收集热梗到公众号草稿箱，全流程自动完成。

## 这条 Pipeline 长什么样

它不是一个大模型从头写到尾，而是 5 个节点串起来：

```text
[收集热梗] -> [策划脚本] -> [生成漫画] -> [排版文案] -> [发布草稿箱]
  Claude       Claude       GPT Image      Claude       微信 API
  AI Agent     AI Agent     Tool Agent     AI Agent     Tool Agent
```

这里有一个很重要的分工：

AI Agent 负责“需要判断和创作”的部分，比如分析热点、写脚本、组织文案。

Tool Agent 负责“必须确定执行”的部分，比如生成图片、上传素材、创建公众号草稿。

我不希望 AI 自己“猜”怎么调用微信 API。微信接口的字段、素材上传顺序、错误处理，都应该由确定性代码处理。AI 只要输出结构化内容。

## Pipeline 配置是一段 JSON

Agent-Hub 的 Pipeline 是声明式配置，不是手写流程代码。简化后大概是这样：

```json
{
  "version": "1",
  "input": {
    "TOPIC_HINT": {
      "type": "string",
      "required": false,
      "default": "",
      "description": "可选：指定搜索方向"
    }
  },
  "steps": [
    {
      "id": "collect",
      "type": "single",
      "agentId": "agent-meme-collector",
      "prompt": "搜索今天的网络热梗。{{TOPIC_HINT}}",
      "output": { "tag": "data", "parseJson": true }
    },
    {
      "id": "plan",
      "type": "single",
      "agentId": "agent-meme-planner",
      "prompt": "从以下热梗中选择最适合做漫画的，写出四格漫画脚本：\n\n{{STEP_COLLECT_DATA}}",
      "dependsOn": ["collect"],
      "output": { "tag": "data", "parseJson": true }
    },
    {
      "id": "generate_images",
      "type": "single",
      "agentId": "agent-image-gen",
      "promptArgs": {
        "PROMPT": "{{STEP_PLAN_DATA.combined_image_prompt}}"
      },
      "dependsOn": ["plan"],
      "onFailure": "retry",
      "maxRetries": 2
    }
  ],
  "git": { "enabled": false, "baseBranch": "main", "autoMerge": false }
}
```

几个关键点：

- `dependsOn` 定义步骤依赖。
- `output.tag` 告诉引擎从 AI 输出里提取 `<data>...</data>`。
- `parseJson` 会把提取结果解析成结构化数据。
- `{{STEP_PLAN_DATA.combined_image_prompt}}` 可以直接引用上游 JSON 字段。
- `onFailure: "retry"` 让图片生成失败时只重试这一段，不用整条链路重跑。

## 为什么要 structuredOutput

我踩过一个坑：不要把 AI 的自由文本直接交给下游系统。

如果上游 Agent 输出一段散文，下游要靠正则猜字段，流程很快就会变脆。Agent-Hub 里我用了一个简单但有效的约束：让 AI 把关键输出包在 XML tag 里。

```xml
<data>
{
  "title": "今天最适合画成漫画的热梗",
  "combined_image_prompt": "四格漫画，2x2 布局...",
  "digest": "一句话摘要"
}
</data>
```

Runner 只做两件事：提取 tag，解析 JSON。

这让每一步的输出都能稳定变成下一步的输入。

## 微信公众号发布里最麻烦的部分

最后一步是微信公众号草稿箱。它看起来只是“发一篇文章”，实际有几个细节：

```text
获取 access_token
  -> 上传正文图片，拿到微信域名图片 URL
  -> 上传封面图为永久素材，拿到 media_id
  -> 创建草稿
```

正文图片不能直接用外部 URL，必须先上传到微信，拿到 `mmbiz.qpic.cn` 域名。封面图也不能用临时素材，要走永久素材接口。

这类事情很适合 Tool Agent：输入明确，输出明确，失败能重试，日志能追踪。

## 结果

一次运行大概 3-5 分钟，主要时间花在热点分析和图片生成上。跑完之后，公众号后台草稿箱里会出现一篇完整图文：标题、摘要、封面、正文图片、排版都已经准备好。

这不是为了证明“AI 可以替代运营”。它验证的是另一个判断：很多重复业务流程，其实可以拆成“AI 判断 + 确定性执行”的 Pipeline。

热梗漫画只是第一个例子。同样的结构可以换成：日报生成、GitHub Issue 分诊、客户反馈分类、竞品监控、内容分发。

Agent-Hub 的核心不是某个 Agent 很聪明，而是多个 Agent 终于能被稳定编排起来。

---

# 第二期：我为什么不做一个 AI 聊天工具，而是做 Agent Pipeline 编排

> 标签建议：`AI Agent` `产品设计` `自动化` `工作流` `SaaS` `Pipeline as Code`

## 开篇

如果一个产品的入口是聊天框，它很容易变成“什么都能问，但什么都不会自动发生”。

我一开始做 Agent-Hub，就不想做另一个聊天工具。

聊天适合探索问题，但不适合承载稳定的业务流程。真正困扰团队的，往往不是“不会问 AI”，而是每天都有大量固定 SOP 要跑：汇总、分类、生成、通知、发布、归档。

这些流程不复杂，但很消耗人。

Agent-Hub 的产品判断是：把业务 SOP 翻译成 Pipeline，让 AI 处理需要判断和创作的节点，让程序处理确定性节点。

## 产品愿景

一句话：让中小公司的重复性业务流程，像写配置文件一样简单地自动化。

公司里的“人肉流程”很多：

- 每天早上汇总昨天的提交和任务进展。
- 收到客户反馈后分类、建 issue、通知负责人。
- 每周从多个系统里拼周报。
- 内容团队每天找热点、写文案、配图、发布。

传统自动化工具能把 API 连起来，但处理不了“理解”和“创作”。大模型能理解和创作，但无法稳定触发、编排和交付结果。

Agent-Hub 要补的是中间这层。

## 三层设计：触发、编排、执行

整个系统可以拆成三层：

```text
Trigger（Cron / Webhook / 手动）
  -> Pipeline DAG（顺序 / 并行 / 条件 / 失败策略）
  -> Agent 执行（AI Agent / Tool Agent）
  -> 输出到外部系统
```

触发层解决“什么时候开始”。

编排层解决“步骤之间怎么走”。

执行层解决“每一步由谁做”。

这三个问题拆开之后，系统会清晰很多。

## Agent 为什么要分两类

Agent-Hub 里有两类 Agent：AI Agent 和 Tool Agent。

| 类型 | 适合做什么 | 特点 |
|------|------------|------|
| AI Agent | 分析、归纳、写作、策划、代码审查 | 有创造力，但有概率性 |
| Tool Agent | 发飞书、建 GitHub Issue、发邮件、调微信 API、生成图片 | 行为确定，容易测试 |

这个分层是产品里最重要的设计之一。

不要让 AI 做所有事情。AI 擅长判断和表达，但不应该负责拼 multipart 表单、管理 access token、决定 HTTP 重试策略。

确定性的事情交给确定性代码。这样成本低、稳定、可调试。

## Pipeline as Code

我选择让 Pipeline 先以 JSON DSL 存在，而不是一开始就做复杂拖拽画布。

原因很简单：配置文件有几个天然优势。

- 可以被 Git 管理。
- 可以 diff。
- 可以导入导出。
- 可以作为模板分发。
- 可以由 AI 或脚本生成。

一个 Pipeline 不是一坨 UI 状态，而是一份协议化配置。

这对后面的模板市场很关键。只有当 Pipeline 能被复制、校验、升级、分享，它才可能变成生态里的“资产”。

## 为什么选 Next.js + SQLite

Agent-Hub 目前不是一个重型分布式平台。它首先要在本地和小团队服务器上跑起来。

所以技术栈很克制：

- Next.js 提供 Web UI 和 API routes。
- SQLite 存 agents、pipelines、runs、logs。
- Drizzle ORM 管 schema。
- Runner 通过 `spawn` 调 Claude/Codex CLI。

这套架构不需要 Redis、Kafka、PostgreSQL，也不需要一套复杂运维系统。

先把单机自动化做稳，再考虑分布式执行。

## 设计上的取舍

Agent-Hub 当前做了几个明确取舍。

第一，不追求“全自动智能体幻觉”。

我更关心流程是否可追踪、可恢复、可复用。

第二，不把 AI 包成黑盒。

每一步都有 prompt、output、status、error、token usage，失败时知道是哪一步坏了。

第三，不一开始做大平台。

本地 CLI 和桌面端优先，因为核心能力要读写用户本地文件、跑 git 操作、调用本地 Claude/Codex CLI。这些能力天然适合本地环境。

## 现阶段已经验证了什么

目前 Agent-Hub 已经跑通：

- Claude/Codex Provider 抽象。
- Pipeline 编排：串行、并行、条件分支。
- Git 分支策略。
- Cron 和 Webhook 触发。
- Tool Agent：飞书、邮件、GitHub Issue、图片生成、微信公众号。
- structuredOutput、模板变量、multi-iteration、session 恢复。
- 热梗漫画自动发布 demo。

这些不是为了堆功能，而是在验证一个核心假设：AI Agent 可以成为业务流程里的一个节点，而不是产品的全部。

## 结尾

我越来越相信，下一阶段的 AI 产品不会只有“聊天”。

聊天是入口，但流程才是结果。

一个真正能帮团队省时间的系统，必须能被触发，能编排，能调用外部系统，能记录执行过程，能失败重试，能复用和分享。

这就是 Agent-Hub 的方向：不是做一个更会说话的 AI，而是做一个能把事情跑完的 Agent Pipeline 引擎。

---

# 第三期：给 Agent Pipeline 定一个协议：导入导出、JSON Schema 和可移植工作流

> 标签建议：`JSON Schema` `Pipeline` `AI Agent` `协议设计` `工作流` `开源`

## 开篇

一个 Pipeline 如果只能存在数据库里，它就不是资产。

它只是某个实例上的一条记录。

我希望 Agent-Hub 里的 Pipeline 能被导出、提交到 Git、发给别人、从模板市场安装、在另一个环境里重新导入。

这意味着它必须有协议。

所以这一阶段我给 Agent-Hub 补了三件事：Pipeline Bundle、JSON Schema、Agent 配置导入导出。

## Pipeline Bundle 是什么

一个可移植 Pipeline 不能只导出 steps。

因为 step 里引用了 Agent。如果只导出 `agentId`，换一个数据库后这个 id 就失效了。

所以导出格式需要把 Pipeline 依赖的 Agent 定义一起打包进去。

简化后格式是这样：

```json
{
  "$schema": "./pipeline.schema.json",
  "version": "1",
  "name": "热梗漫画自动化",
  "description": "收集热梗 -> 生成漫画 -> 发布公众号",
  "input": {
    "TOPIC": { "type": "string", "required": true, "description": "主题关键词" }
  },
  "steps": [
    {
      "id": "collect",
      "type": "single",
      "agentRef": "meme-collector",
      "prompt": "搜索今天的网络热梗",
      "output": { "tag": "data", "parseJson": true }
    }
  ],
  "git": { "enabled": false, "baseBranch": "main", "autoMerge": false },
  "agents": [
    {
      "refId": "meme-collector",
      "name": "热梗收集器",
      "type": "ai",
      "provider": "claude",
      "role": "内容采集",
      "personality": "高效精准",
      "systemPrompt": "..."
    }
  ]
}
```

导出时，系统会把 step 里的 `agentId` 替换成 `agentRef`。

导入时，再根据 `agentRef` 或 `name` 匹配已有 Agent。找不到就自动创建。

## 敏感字段不能导出

这里有一个边界必须守住：导出的 Agent 不能包含环境敏感信息。

比如：

- `apiKey`
- `baseUrl`
- `workDir`
- 微信 `appSecret`

这些字段属于运行环境，不属于模板本身。

模板应该描述“这个 Agent 是什么角色、用什么 provider、系统提示词是什么”。至于密钥和本地路径，导入后由用户自己配置。

这是模板市场能成立的前提。否则分享 Pipeline 就等于泄露配置。

## API 设计

这次加了几个很直接的 API：

```text
GET  /api/pipelines/[id]/export
POST /api/pipelines/import

GET  /api/agents/export
POST /api/agents/import
```

Pipeline 导出返回 JSON 文件，前端直接触发下载。

Pipeline 导入接收 JSON body，校验后创建 Agent 和 Pipeline。

Agent 导入导出是同一套思路：按 `name` 去重，skill 不存在时只记录 warning，不阻断导入。

## 为什么要 JSON Schema

只要 Pipeline 成为协议，就需要机器可读的约束。

我在 `public/pipeline.schema.json` 里发布了 schema，覆盖这些结构：

- `PipelineConfig`
- `SingleStep`
- `ParallelStep`
- `ConditionStep`
- `GitConfig`
- `OutputExtraction`
- `BundleAgent`

有了 schema 之后，至少能做三件事。

第一，编辑器 IntelliSense。

用户写 JSON 时可以自动提示字段、类型、枚举值。

第二，导入前校验。

非法 Pipeline 不应该进数据库。

第三，协议演进。

`version: "1"` 看起来只是一个字段，但它让后续升级有了落点。以后如果加新版 step 类型，可以做兼容转换。

## Token Usage 和 SSE 为什么也在这一期做

导入导出解决的是“可移植”。

但一个工作流真正要被别人使用，还需要“可观察”。

所以这次一起补了两块：Token Usage 和 SSE。

Token Usage 记录在 `pipeline_step_runs`：

```sql
input_tokens INTEGER
output_tokens INTEGER
```

Runner 执行 AI step 时，会从 provider event 里累加 usage，最后写入数据库。Stats API 再返回：

- 每个 Pipeline 的总 token。
- 每个 step 的平均 token。
- 按天的 token 趋势。

这对成本控制很重要。自动化流程跑起来以后，最怕的是“不知道钱花在哪一步”。

SSE 解决的是执行过程可见性：

```text
runner callback
  -> pipelineEvents.emit(runId, event)
  -> /api/pipelines/[id]/runs/[runId]/events
  -> EventSource
  -> 前端实时更新 step 状态
```

用户不需要每 3 秒刷新一次才能知道流程跑到哪了。

## 协议设计的底层判断

Pipeline 协议不是为了“导出一个 JSON”这么简单。

它背后对应的是产品形态：

- 本地创建的 Pipeline 可以发给别人。
- 官方可以发布模板库。
- 用户可以在 GitHub 里管理自己的自动化流程。
- 未来可以有模板市场。
- AI 也可以根据需求生成一份符合 schema 的 Pipeline。

这就是为什么我更愿意先把协议做扎实，而不是先做一个漂亮但不可移植的拖拽画布。

UI 可以换，协议最好别乱。

## 结尾

当 Pipeline 能导入导出、能校验、能追踪成本、能实时观察，它就从“一个功能”变成了“一个可流通的工作流资产”。

Agent-Hub 后面要做模板市场，前提就是这个资产格式足够稳定。

这一期做的事情不算炫，但它是产品从 demo 走向生态的基础。

---

# 第四期：为什么 Agent-Hub 要同时做 npm CLI 和桌面端

> 标签建议：`CLI` `Tauri` `桌面应用` `Next.js` `本地优先` `AI Agent`

## 开篇

Agent-Hub 的核心能力必须运行在用户本地。

原因很现实：它要 spawn Claude/Codex CLI，要读写本地文件，要执行 git 操作，要访问用户自己的工作目录。

如果把这些都塞到云端，体验会变复杂，权限会变敏感，安全边界也会变模糊。

所以产品形态上，我决定同步推进两条线：

```text
npm CLI：给开发者，npx agent-hub 一键启动
桌面应用：给非开发者，安装后系统托盘常驻
```

两者不拆 monorepo，共享同一套业务代码。

## npm CLI 的目标

开发者最舒服的入口是命令行。

理想使用方式应该是：

```bash
npx agent-hub
```

或者：

```bash
npm install -g agent-hub
agent-hub start --port 3939
```

启动后，本地跑一个 Next.js server，浏览器打开 `http://127.0.0.1:3939`。

CLI 要做的事情不复杂，但必须完整：

- 解析 `--port`、`--no-open`、`--data-dir`。
- 初始化数据目录。
- 设置数据库路径环境变量。
- 启动 Next.js standalone server。
- 自动打开浏览器。
- 支持 `status`、`stop`、`version`。

这次新增的入口是 `bin/agent-hub.js`。

## 数据目录为什么要统一

以前开发阶段，SQLite 默认放在项目目录的 `./data/agent-hub.db`。

这对开发没问题，但对发布不行。

用户通过 npm 或桌面应用安装后，数据应该进入用户目录：

```text
~/.agent-hub/
  data/
    agent-hub.db
  logs/
  agent-hub.pid
```

所以 DB 路径改成了：

```typescript
function getDataDir(): string {
  if (process.env.AGENT_HUB_DATA_DIR) return process.env.AGENT_HUB_DATA_DIR
  return path.join(os.homedir(), '.agent-hub', 'data')
}

const dbPath = process.env.AGENT_HUB_DB_PATH || path.join(getDataDir(), 'agent-hub.db')
```

CLI 的 `--data-dir` 会设置 `AGENT_HUB_DATA_DIR`。

桌面端后面也用同一个目录。这样用户从 CLI 切到桌面应用，数据仍然互通。

## Next.js standalone

为了让 npm 包能独立运行，我把 Next.js 配成了 standalone 输出：

```typescript
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'node-cron', 'nodemailer']
}
```

构建后会生成 `.next/standalone/server.js`。

这里还有一个细节：standalone server 会把工作目录切到 `.next/standalone`。所以构建后必须把静态资源复制进去。

因此加了一个 `postbuild`：

```bash
node scripts/prepare-standalone.js
```

它会复制：

```text
.next/static -> .next/standalone/.next/static
public       -> .next/standalone/public
```

否则页面能启动，但静态资源可能缺失。

## 桌面端为什么选 Tauri

CLI 对开发者友好，但对非开发者不够友好。

非开发者更需要一个普通桌面应用：安装、打开、托盘常驻、点击窗口、自动更新。

Electron 可以做，但包体积和内存占用偏大。Agent-Hub 本身已经有 Node.js sidecar，再塞一个完整 Chromium 不划算。

所以桌面端选 Tauri：

| 维度 | Tauri | Electron |
|------|-------|----------|
| WebView | 使用系统 WebView | 自带 Chromium |
| 包体积 | 更小 | 更大 |
| 系统集成 | Rust 后端 | Node 主进程 |
| 适合场景 | 本地工具、轻量桌面壳 | 复杂跨平台桌面应用 |

Agent-Hub 的桌面架构会是这样：

```text
Tauri 桌面壳
  -> Rust 管系统托盘、窗口、通知、更新
  -> Node sidecar 跑 Next.js standalone server
  -> WebView 加载 http://localhost:3939
```

这次先搭了基础骨架：

- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- Rust 入口
- WebView 指向本地服务
- 基础托盘：显示窗口、退出

sidecar 生命周期管理还没完全实现，这是下一步。

## 为什么不拆 monorepo

Agent-Hub 的核心业务代码只有一份：

```text
src/app         Next.js 页面和 API
src/lib         Pipeline engine
src/components  React UI
src/db          SQLite / Drizzle
src/store       Zustand state
```

CLI 和 Tauri 都只是启动壳。

这能避免两套产品越走越远。功能只实现一次，分发形态可以有多个。

## 当前验证情况

这一阶段已经验证：

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build
npm pack --dry-run
node bin/agent-hub.js --help
node bin/agent-hub.js version
pnpm tauri --version
```

这些都通过了。

当前环境没有 `cargo`，所以 Tauri Rust 编译还没验证。这个会放到后续有 Rust 工具链的环境里跑。

## 结尾

Agent-Hub 做 CLI 和桌面端，不是为了多做两个入口。

它背后的判断是：Agent Pipeline 的核心能力应该本地优先。

开发者用 `npx agent-hub` 快速启动。非开发者用桌面应用常驻运行。两者共享同一套 Pipeline、同一个数据库目录、同一个执行引擎。

这让 Agent-Hub 既能保持工程工具的开放性，也能走向更普适的产品形态。

下一步，就是把 Tauri sidecar 生命周期补齐，让桌面端真正做到“安装即运行”。
