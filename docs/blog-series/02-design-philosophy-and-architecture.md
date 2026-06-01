# 我为什么不做一个 AI 聊天工具，而是做 Agent Pipeline 编排

> 标签建议：`AI Agent` `产品设计` `工作流` `Pipeline as Code` `自动化` `Next.js` `SQLite`

## 开篇：聊天框解决不了“每天都要跑”的流程

如果一个产品的入口是聊天框，它很容易变成：什么都能问，但什么都不会自动发生。

这不是聊天工具不好。聊天非常适合探索问题、临时问答、写一段文案、生成一段代码。但公司里真正消耗时间的东西，很多不是临时问题，而是每天、每周、每次事件发生后都要跑的固定流程。

比如：

- 每天早上汇总昨天的任务和提交，写日报发飞书。
- 收到客户反馈后分类、建 GitHub Issue、通知负责人。
- 每周从多个系统里拼周报。
- 内容团队每天找热点、写文案、配图、发布。
- PR 提交后自动做代码审查，整理风险点。

这些流程里有些步骤需要 AI，比如总结、分类、生成文案；也有很多步骤根本不需要 AI，比如调用飞书 API、发邮件、创建 Issue、上传图片。

所以我做 Agent-Hub 时，第一天就不想做另一个 AI Chat。

我想做的是：把业务 SOP 翻译成 Pipeline，让 AI Agent 成为流程里的一个节点，而不是产品的全部。

## 产品愿景：把重复业务流程配置化

Agent-Hub 的一句话愿景是：让中小公司的重复性业务流程，像写配置文件一样简单地自动化。

这句话里有几个关键词。

第一，重复性业务流程。

我不想解决所有问题。Agent-Hub 适合的是“步骤相对固定、每次输入不同、部分环节需要理解或生成”的流程。

第二，配置文件。

我希望一个流程不是散落在 UI 状态里的东西，而是能被保存、diff、复制、导入、导出、版本管理的资产。

第三，自动化。

最终结果不是“AI 给了建议”，而是“流程跑完了，结果已经发到目标系统”。

这也是为什么 Agent-Hub 的核心概念不是 conversation，而是 pipeline run。

## 总体架构：触发层、编排层、执行层

Agent-Hub 的系统拆成三层会更容易理解。

```text
┌──────────────────────────────────────────────┐
│ Trigger Layer                                │
│ Cron / Webhook / Manual API                  │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│ Orchestration Layer                           │
│ Pipeline DAG / dependsOn / retry / condition │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│ Execution Layer                               │
│ AI Agent Provider / Tool Provider             │
└─────────────────────┬────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│ Output Layer                                  │
│ Feishu / GitHub / Email / WeChat / Files      │
└──────────────────────────────────────────────┘
```

触发层回答“什么时候开始”。

编排层回答“步骤之间怎么走”。

执行层回答“每一步由谁来做”。

输出层回答“结果交付到哪里”。

把这几个问题拆开之后，设计会变得清楚很多。Cron 不需要知道 Claude 怎么运行；Claude 不需要知道微信图片怎么上传；微信 Provider 也不需要知道这个标题是哪个 Agent 写的。

## 核心抽象一：Agent Provider

AI Agent 不是直接调用某个 SDK，而是通过 Provider 抽象接入。

当前接口长这样：

```typescript
export interface AgentProvider {
  readonly name: string
  buildCommand(options: CommandOptions): CommandResult
  parseOutputLine(line: string): ProviderEvent[]
}

export interface CommandOptions {
  prompt: string
  systemPrompt?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  workDir?: string
  sessionId?: string
}

export interface CommandResult {
  command: string
  args: string[]
  stdin?: string
  env: Record<string, string>
}
```

为什么是 `buildCommand`，而不是 `complete()`？

因为 Agent-Hub 的核心场景是本地运行 Claude/Codex CLI。它要在用户工作目录里读文件、写文件、跑工具、保留 session。直接用 CLI 子进程更贴近真实开发者工作流。

Provider 输出统一转成事件：

```typescript
export type ProviderEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; name: string; input: string }
  | { type: 'tool_result'; name: string; output: string; error?: string }
  | { type: 'result'; content: string }
  | { type: 'error'; message: string }
  | { type: 'session_id'; id: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
```

这一步很关键。

Claude 和 Codex 的 CLI 输出格式不一样，但 Runner 不应该关心差异。Runner 只关心事件流里有没有文本、session id、usage。

## 核心抽象二：Tool Provider

Tool Agent 更简单：输入、配置、输出。

```typescript
export interface ToolProvider {
  readonly name: string
  execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  output: string
  error?: string
}
```

这个接口故意很窄。

因为 Tool Agent 做的是确定性动作：发飞书、建 Issue、发邮件、调图片生成、发公众号。它不需要多轮思考，也不应该偷偷改上下文。

输入来自 Pipeline 模板变量，配置来自 Agent 静态配置。

比如图片生成节点的输入是：

```json
{
  "PROMPT": "四格漫画，2x2布局...",
  "SIZE": "1024x1024"
}
```

配置是：

```json
{
  "apiKey": "...",
  "baseUrl": "https://.../v1",
  "model": "gpt-image-2",
  "quality": "high"
}
```

这样的分层让流程更容易测试，也更容易定位问题。

## 核心抽象三：PipelineConfig

Pipeline 是整个产品的中心。

类型定义很克制：

```typescript
export interface PipelineConfig {
  version: '1'
  input?: Record<string, PipelineInputParam>
  steps: PipelineStep[]
  git: GitConfig
}
```

Step 当前分三类：

```typescript
export type PipelineStep = SingleStep | ParallelStep | ConditionStep
```

`SingleStep` 是最常见的节点：

```typescript
export interface SingleStep {
  id: string
  type: 'single'
  agentId: string
  prompt: string
  promptArgs?: Record<string, string>
  dependsOn?: string[]
  onFailure?: 'stop' | 'skip' | 'retry'
  maxRetries?: number
  resumeFrom?: string
  maxIterations?: number
  completionSignal?: string
  output?: OutputExtraction
}
```

这些字段对应的是执行引擎里的真实能力：依赖、失败策略、session 恢复、多轮迭代、结构化输出。

我没有一开始就做一个很复杂的 workflow schema。原因是：协议越早复杂，越难演进。先把最常见的自动化流程跑通，再逐步增加表达能力。

## Runner 的核心循环

Runner 的职责是把 PipelineConfig 变成一次实际执行。

主流程可以概括成：

```typescript
export async function runPipeline(options: RunPipelineOptions): Promise<string> {
  const runId = generateId()

  await db.insert(pipelineRuns).values({
    id: runId,
    pipelineId,
    status: 'running',
    startedAt: new Date(),
  })

  const results = new Map<string, StepResult>()
  const sortedSteps = topologicalSort(config.steps)

  for (const step of sortedSteps) {
    // 检查 condition、dependsOn、abort signal
    // 按 step.type 分派执行
    // 写入 step run 结果
    // 根据 onFailure 决定是否中断
  }

  await db.update(pipelineRuns).set({ status: 'completed' })
  return runId
}
```

真正有意思的是几个细节。

### 1. Pipeline input 合并

Pipeline 可以定义输入参数和默认值：

```typescript
const pipelineInput: Record<string, string> = {}
if (config.input) {
  for (const [key, param] of Object.entries(config.input)) {
    if (param.default !== undefined) pipelineInput[key] = param.default
  }
}
if (input) {
  Object.assign(pipelineInput, input)
}
```

这让同一个 Pipeline 可以在不同触发场景下复用。手动运行可以传一个 `TOPIC_HINT`，Cron 可以用默认值，Webhook 可以从 payload 里提取输入。

### 2. 条件分支不是 if/else 代码，而是数据路由

Condition step 会读取一个输入，解析字段，然后激活对应 step：

```typescript
function executeCondition(step, results, pipelineInput): StepResult {
  const args = buildTemplateArgs(results, pipelineInput, '')
  const resolved = resolvePrompt(step.input, args)

  let fieldValue: string
  try {
    const parsed = JSON.parse(resolved)
    fieldValue = String(parsed[step.field] ?? '')
  } catch {
    fieldValue = resolved
  }

  const activatedSteps = step.branches[fieldValue] || []
  return {
    stepId: step.id,
    status: 'completed',
    structuredOutput: activatedSteps,
    output: `route: ${fieldValue} -> [${activatedSteps.join(', ')}]`,
    commits: [],
  }
}
```

这让 Pipeline 可以表达“如果分类结果是 bug，就建 GitHub Issue；如果是咨询，就发客服群”。

### 3. parallel 用 Promise.allSettled

并行节点不能因为某个子任务失败就把其他子任务结果丢掉。

所以这里用的是 `Promise.allSettled`：

```typescript
const subResults = await Promise.allSettled(
  step.steps.map(sub => executeStep(...))
)
```

每个子 step 都会记录自己的结果。父 step 再根据所有子 step 是否完成来判断状态。

### 4. retry 是 step 级别的，不是 pipeline 级别的

失败重试放在 `executeStepWithRetry`：

```typescript
const maxRetries = step.onFailure === 'retry' ? (step.maxRetries ?? 2) : 0

for (let attempt = 0; attempt <= maxRetries; attempt++) {
  lastResult = await executeStep(...)
  if (lastResult.status === 'completed') return lastResult
}
```

这很重要。真实业务里经常只有某个外部 API 抖了一下。如果整条 Pipeline 重跑，成本高，还可能产生重复副作用。

## 为什么要 Git 分支策略

Agent-Hub 不只是内容自动化，它也会跑代码类任务。

当 Pipeline 会修改本地仓库时，直接在主分支上跑很危险。所以 config 里有 Git 配置：

```json
{
  "git": {
    "enabled": true,
    "baseBranch": "main",
    "autoMerge": false
  }
}
```

Runner 开始时可以创建临时分支：

```text
main
  -> agent-hub/run-xxx
```

Pipeline 成功后再根据配置决定是否合并回去。

这不是所有场景都需要，但它让 Agent-Hub 可以覆盖“让 Agent 修改代码”的工作流。

## 为什么选 Next.js + SQLite，而不是一开始上重型架构

Agent-Hub 现在是本地优先产品。

本地优先意味着几个约束：

- 安装要轻。
- 数据要在用户机器上。
- 不依赖一堆中间件。
- 能通过 CLI 和桌面端启动。

所以我选了 Next.js + SQLite + Drizzle。

Next.js 同时承担 UI 和 API routes。SQLite 存本地状态。Drizzle 提供类型化 schema。

这套组合的好处是：启动成本很低，部署也简单。

当然，它不是最终形态的全部。如果将来要做大规模多租户 SaaS，可能会引入 PostgreSQL、队列、分布式 runner。但在产品早期，最重要的是让真实流程先跑起来。

## 设计理念总结

Agent-Hub 目前有几条明确原则。

第一，AI 是节点，不是全部。

AI 很强，但流程的可靠性不能完全建立在概率输出上。

第二，确定性动作交给 Tool Agent。

发消息、建 Issue、调 API、上传图片，都应该是可测试的程序逻辑。

第三，Pipeline 必须可观察。

每一步要有输入、输出、状态、错误、token usage。否则自动化越多，黑盒越大。

第四，配置优先于 UI 状态。

Pipeline 先是一份协议，再是一个界面。这样它才能被导入导出、被 Git 管理、被模板市场分发。

第五，本地优先。

读写文件、跑 git、spawn Claude/Codex CLI，这些能力天然属于用户本地环境。云端可以作为协作和市场层，但执行能力先在本地跑稳。

## 结尾：从聊天到流程

我不认为未来所有 AI 产品都会停留在聊天框里。

聊天是很好的入口，但很多时候，用户真正想要的是“这件事帮我跑完”。

跑完一件事，需要触发器、编排、上下文传递、外部系统调用、失败恢复和执行日志。

这就是 Agent-Hub 想做的东西：把 AI Agent 放进真实业务流程里，让它和工具、API、文件系统、Git 一起协作。

不是更会说话，而是更能干活。
