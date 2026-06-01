# 给 Agent Pipeline 定一个协议：导入导出、JSON Schema 和可移植工作流

> 标签建议：`AI Agent` `Pipeline` `JSON Schema` `协议设计` `工作流` `模板市场` `SSE`

## 开篇：只能存在数据库里的 Pipeline，不是资产

一个 Pipeline 如果只能存在某个数据库里，它就不是资产。

它只是某台机器上的一条记录。

我希望 Agent-Hub 里的 Pipeline 能被导出、提交到 Git、发给别人、从模板市场安装、在另一个环境里重新导入。

这意味着它必须有协议。

这次我给 Agent-Hub 补了几块能力：

- Pipeline 导入导出。
- Pipeline JSON Schema。
- Agent 配置导入导出。
- Token Usage 追踪。
- SSE 实时事件推送。

表面看这些功能有点分散，其实它们都指向同一个目标：让 Pipeline 从“能跑”变成“可流通、可校验、可观察的工作流资产”。

## 问题一：为什么不能只导出 steps

最直觉的导出方式是把 pipeline.config 原样导出。

但很快会遇到一个问题：step 里引用的是 `agentId`。

```json
{
  "id": "collect",
  "type": "single",
  "agentId": "agent-meme-collector",
  "prompt": "搜索今天的网络热梗"
}
```

这个 id 只在当前数据库里有意义。

如果把这份 JSON 发给别人，对方的数据库里没有 `agent-meme-collector`，导入后就跑不起来。

所以导出格式必须同时包含 Pipeline 本身和它依赖的 Agent 定义。

这就是 Pipeline Bundle。

## Pipeline Bundle 的格式

Bundle 的结构大概是这样：

```json
{
  "$schema": "./pipeline.schema.json",
  "version": "1",
  "name": "热梗漫画自动化",
  "description": "收集热梗 -> 生成漫画 -> 发布公众号",
  "input": {
    "TOPIC": {
      "type": "string",
      "required": true,
      "description": "主题关键词"
    }
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
  "git": {
    "enabled": false,
    "baseBranch": "main",
    "autoMerge": false
  },
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

核心变化是：导出时不再暴露 `agentId`，而是替换成 `agentRef`。

`agentRef` 是 bundle 内部引用。导入时系统根据它找到或创建真实 Agent，再还原成当前数据库里的 `agentId`。

这一步让 Pipeline 脱离了原数据库。

## 敏感字段必须过滤

Agent 定义里有一些字段不能导出。

比如：

- `apiKey`
- `baseUrl`
- `workDir`
- 微信 `appSecret`
- 本地文件路径

这些字段不是模板的一部分，而是运行环境的一部分。

如果导出的 bundle 带着密钥，它就不能安全分享。模板市场也无从谈起。

所以 Pipeline Bundle 里的 Agent 只保留这些字段：

```typescript
export interface PipelineBundleAgent {
  refId: string
  name: string
  type: 'ai' | 'tool'
  provider: string
  role: string
  personality: string
  systemPrompt: string
  modelId?: string
  config?: string
}
```

这里的 `config` 当前仍是一个需要继续收敛的点。对于不同 Tool Provider，config 里可能有敏感字段。长期看更好的方式是按 provider 定义白名单，而不是整体透传。

这是协议设计里必须持续收紧的边界。

## 导出实现：agentId -> agentRef

导出逻辑在 `src/lib/pipeline/bundle.ts`。

第一步，查 Pipeline：

```typescript
const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, pipelineId))
if (!pipeline) return null

const config: PipelineConfig = JSON.parse(pipeline.config)
```

第二步，从 steps 里收集所有 Agent：

```typescript
function collectAgentIds(steps: PipelineStep[]): string[] {
  const ids = new Set<string>()
  for (const step of steps) {
    if (step.type === 'single') ids.add(step.agentId)
    if (step.type === 'parallel') step.steps.forEach(sub => ids.add(sub.agentId))
  }
  return Array.from(ids)
}
```

第三步，生成 `refId`：

```typescript
function toRefId(name: string, fallback: string) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || fallback
}
```

第四步，把 `agentId` 替换成 `agentRef`：

```typescript
function replaceAgentIds(steps: PipelineStep[], refByAgentId: Map<string, string>) {
  return steps.map(step => {
    if (step.type === 'single') {
      const { agentId, ...rest } = step
      return { ...rest, agentRef: refByAgentId.get(agentId) || agentId }
    }

    if (step.type === 'parallel') {
      return {
        ...step,
        steps: step.steps.map(sub => {
          const { agentId, ...rest } = sub
          return { ...rest, agentRef: refByAgentId.get(agentId) || agentId }
        }),
      }
    }

    return step
  })
}
```

最后组装 bundle：

```typescript
return {
  $schema: './pipeline.schema.json',
  version: '1',
  name: pipeline.name,
  description: pipeline.description,
  input: config.input,
  steps: replaceAgentIds(config.steps, refByAgentId),
  git: config.git,
  agents: existingAgents.map(agent => ({
    refId: refByAgentId.get(agent.id)!,
    name: agent.name,
    type: agent.type,
    provider: agent.provider,
    role: agent.role,
    personality: agent.personality,
    systemPrompt: agent.systemPrompt,
    modelId: agent.modelId || undefined,
    config: agent.config || '{}',
  })),
}
```

## 导入实现：agentRef -> agentId

导入时反过来。

先校验 bundle 的基本结构：

```typescript
function validateBundle(bundle: PipelineBundle) {
  if (!bundle || bundle.version !== '1') throw new Error('仅支持 version=1 的 pipeline bundle')
  if (!bundle.name) throw new Error('bundle.name required')
  if (!Array.isArray(bundle.steps)) throw new Error('bundle.steps required')
  if (!bundle.git || typeof bundle.git.enabled !== 'boolean') throw new Error('bundle.git required')
}
```

然后处理 Agent。

导入规则是：按 `name` 或 `refId` 匹配已有 Agent；如果不存在，就创建新 Agent。

```typescript
for (const agent of bundle.agents || []) {
  const [existing] = await db
    .select()
    .from(agents)
    .where(or(eq(agents.name, agent.name), eq(agents.id, agent.refId)))

  if (existing) {
    agentIdByRef.set(agent.refId, existing.id)
    continue
  }

  const id = generateId()
  await db.insert(agents).values({
    id,
    name: agent.name,
    type: agent.type,
    provider: agent.provider,
    role: agent.role,
    personality: agent.personality,
    systemPrompt: agent.systemPrompt || '',
    modelId: agent.modelId || '',
    config: agent.config || '{}',
    apiKey: '',
    baseUrl: '',
    workDir: '',
  })
  agentIdByRef.set(agent.refId, id)
}
```

最后把 steps 里的 `agentRef` 还原成真实 `agentId`：

```typescript
function restoreAgentIds(steps: PipelineBundleStep[], agentIdByRef: Map<string, string>) {
  return steps.map(step => {
    if (step.type === 'single') {
      const { agentRef, ...rest } = step
      const agentId = agentIdByRef.get(agentRef)
      if (!agentId) throw new Error(`未知 agentRef: ${agentRef}`)
      return { ...rest, agentId }
    }

    if (step.type === 'parallel') {
      return {
        ...step,
        steps: step.steps.map(sub => {
          const { agentRef, ...rest } = sub
          const agentId = agentIdByRef.get(agentRef)
          if (!agentId) throw new Error(`未知 agentRef: ${agentRef}`)
          return { ...rest, agentId }
        }),
      }
    }

    return step
  })
}
```

这个映射是导入导出的核心。

它解决了“配置跨环境后引用失效”的问题。

## API 层：保持简单

API 没有做复杂设计。

```text
GET  /api/pipelines/[id]/export
POST /api/pipelines/import
```

导出接口返回 JSON 文件：

```typescript
return new Response(JSON.stringify(bundle, null, 2), {
  headers: {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="pipeline-${id}.json"`,
  },
})
```

导入接口接收 JSON body：

```typescript
export async function POST(req: NextRequest) {
  try {
    const bundle = await req.json()
    const pipeline = await importBundle(bundle)
    return Response.json(pipeline, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 400 })
  }
}
```

这类接口越简单越好。复杂逻辑留在 `bundle.ts`，路由只做 HTTP 边界处理。

## Agent 配置导入导出

Pipeline Bundle 解决的是“流程连同依赖一起导出”。

但用户也可能只想迁移 Agent 配置，所以单独加了：

```text
GET  /api/agents/export
POST /api/agents/import
```

Agent Bundle 的结构是：

```json
{
  "agents": [
    {
      "name": "代码审查员",
      "type": "ai",
      "provider": "claude",
      "role": "Senior Code Reviewer",
      "personality": "严谨、注重细节",
      "systemPrompt": "...",
      "modelId": "claude-sonnet-4-6",
      "skills": ["code-review", "security-check"],
      "config": "{}"
    }
  ]
}
```

导入时按 `name` 去重。skill 如果不存在，只记录 warning，不阻断导入。

这是一个产品上的取舍：迁移 Agent 主体比恢复所有关联更重要。缺少 skill 可以后续补，但不能因为一个 skill 不存在导致整个导入失败。

## 为什么要发布 JSON Schema

协议不能只靠 TypeScript 类型。

TypeScript 类型只在项目内部有效。用户在外部编辑 JSON，AI 在外部生成 Pipeline，模板市场接收上传文件，都需要一个语言无关的校验标准。

所以我发布了：

```text
public/pipeline.schema.json
```

Schema 覆盖：

- `PipelineConfig`
- `PipelineInputParam`
- `SingleStep`
- `ParallelStep`
- `ConditionStep`
- `OutputExtraction`
- `GitConfig`
- `BundleAgent`

例如 SingleStep 的 schema 核心是：

```json
{
  "type": "object",
  "required": ["id", "type", "prompt"],
  "properties": {
    "id": { "type": "string" },
    "type": { "const": "single" },
    "agentId": { "type": "string" },
    "agentRef": { "type": "string" },
    "prompt": { "type": "string" },
    "dependsOn": { "type": "array", "items": { "type": "string" } },
    "onFailure": { "enum": ["stop", "skip", "retry"] },
    "maxRetries": { "type": "number" },
    "resumeFrom": { "type": "string" },
    "maxIterations": { "type": "number" },
    "completionSignal": { "type": "string" },
    "output": { "$ref": "#/$defs/OutputExtraction" }
  },
  "anyOf": [
    { "required": ["agentId"] },
    { "required": ["agentRef"] }
  ],
  "additionalProperties": false
}
```

这里允许 `agentId` 或 `agentRef`，是为了兼容两种场景：

- 系统内部 config 使用 `agentId`。
- 导出的 bundle 使用 `agentRef`。

## 版本号的意义

Bundle 里有一个字段：

```json
{ "version": "1" }
```

这个字段现在看起来没什么用，但它是协议演进的入口。

未来可能会有：

- 新的 step 类型。
- 更复杂的条件表达式。
- provider-specific config schema。
- secrets 引用机制。
- 模板变量作用域变化。

没有 version，升级时只能猜。加了 version，就可以做迁移器。

协议设计里，最重要的不是一开始就完美，而是给未来变化留出明确位置。

## Token Usage：协议之外的可观察性

当 Pipeline 可以被分享和复用后，用户会问一个很实际的问题：跑一次多少钱？

所以我给 `pipeline_step_runs` 加了两个字段：

```typescript
inputTokens: integer('input_tokens')
outputTokens: integer('output_tokens')
```

Provider 会把不同模型 CLI 输出解析成统一事件：

```typescript
| { type: 'usage'; inputTokens: number; outputTokens: number }
```

Runner 在执行单次 AI 调用时累加：

```typescript
let inputTokens = 0
let outputTokens = 0

function handleEvent(evt: ProviderEvent) {
  switch (evt.type) {
    case 'usage':
      inputTokens += evt.inputTokens
      outputTokens += evt.outputTokens
      break
  }
}
```

多轮 iteration 会继续汇总：

```typescript
totalInputTokens += iterResult.usage?.inputTokens || 0
totalOutputTokens += iterResult.usage?.outputTokens || 0
```

最后写入 step run：

```typescript
await db.update(pipelineStepRuns).set({
  status: finalStatus,
  output: totalOutput,
  inputTokens: totalInputTokens,
  outputTokens: totalOutputTokens,
  completedAt: new Date(),
})
```

Stats API 再聚合出：

- Pipeline 总 token。
- Step 平均 token。
- 按天 token 趋势。

这让用户知道成本花在哪个节点上。

## SSE：让执行过程实时可见

导入导出解决可移植性。Token usage 解决成本可观察性。SSE 解决运行过程可见性。

事件类型很简单：

```typescript
export type PipelineSSEEvent =
  | { type: 'step_start'; stepId: string; timestamp: number }
  | { type: 'step_complete'; stepId: string; status: string; output?: string; usage?: { inputTokens: number; outputTokens: number }; timestamp: number }
  | { type: 'run_complete'; status: string; error?: string; timestamp: number }
```

全局 EventEmitter 按 runId 分发：

```typescript
const pipelineEvents = new EventEmitter()

export function emitPipelineEvent(runId: string, event: PipelineSSEEvent) {
  pipelineEvents.emit(runId, event)
}

export function onPipelineEvent(runId: string, listener: (event: PipelineSSEEvent) => void) {
  pipelineEvents.on(runId, listener)
  return () => pipelineEvents.off(runId, listener)
}
```

Run route 里把 Runner callback 接到事件系统：

```typescript
onStepStart(stepId) {
  emitPipelineEvent(startedRunId, { type: 'step_start', stepId, timestamp: Date.now() })
},
onStepComplete(stepId, result) {
  emitPipelineEvent(startedRunId, {
    type: 'step_complete',
    stepId,
    status: result.status,
    output: result.output,
    usage: result.usage,
    timestamp: Date.now(),
  })
}
```

SSE route 返回 `text/event-stream`：

```typescript
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode(': connected\n\n'))

    off = onPipelineEvent(runId, event => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
    })
  },
  cancel() {
    off?.()
  },
})
```

前端用 EventSource 订阅：

```typescript
const source = new EventSource(`/api/pipelines/${pipelineId}/runs/${activeRunId}/events`)
source.onmessage = event => {
  const data = JSON.parse(event.data)
  applyPipelineEvent(activeRunId, data)
  if (data.type === 'run_complete') source.close()
}
```

用户看到的不再是“点了运行，然后等刷新”。而是每个 step 实时变成 running/completed/failed。

## 为什么这套东西是模板市场的基础

模板市场不是把 JSON 文件上传下载这么简单。

一个模板要能流通，至少需要几个条件：

- 格式稳定。
- 可以校验。
- 不含密钥。
- 能描述依赖 Agent。
- 导入后能自动匹配或创建依赖。
- 运行过程可观察。
- 成本可估算。

Pipeline Bundle 和 JSON Schema 解决前四个问题。

SSE 和 Token Usage 解决后两个问题。

这就是为什么我把它们放在同一个阶段做。

## 后续还要补什么

当前协议还只是第一版。后续我会继续补几块：

第一，provider config 白名单。

不同 Tool Provider 的 config 敏感字段不同，不能长期用一个粗粒度规则。

第二，secrets 引用。

模板里不应该有真实密钥，而应该引用类似 `{{SECRET.WECHAT_APP_SECRET}}` 的占位符，由导入环境绑定。

第三，schema 驱动 UI。

JSON Schema 不只用于校验，也可以驱动编辑器表单和提示。

第四，模板版本迁移。

当协议从 v1 到 v2 时，需要自动迁移旧模板。

第五，签名和可信来源。

模板市场里，用户需要知道一个 Pipeline 是否来自官方、是否被篡改。

## 结尾：协议先于生态

Agent-Hub 不是只想做一个本地工具。

如果 Pipeline 能成为一种可分享的工作流资产，它就会自然走向模板库、模板市场和社区生态。

但生态不能建立在一堆不可移植的数据库记录上。

所以这一阶段的重点不是“做一个导出按钮”，而是给 Agent Pipeline 定一个能演进的协议。

UI 可以慢慢打磨，模板市场可以后面上线。

协议要先稳。
