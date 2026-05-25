# Agent-Hub 高/中优先级功能优化方案

## Context

MVP 已完成：Pipeline 编排（串行/并行/条件分支/失败策略）、触发层（Webhook/Cron）、Tool Agent（feishu/email/github-issue/image-gen/wechat-mp）、Prompt 模板变量、Pipeline Input 参数注入、执行统计等。

本文档覆盖 5 个待完成项的实现方案。

---

## 一、Pipeline 导入/导出

### 导出格式（Pipeline Bundle）

```json
{
  "$schema": "./pipeline.schema.json",
  "version": "1",
  "name": "热梗漫画自动化",
  "description": "收集热梗 → 生成漫画 → 发布公众号",
  "input": {
    "TOPIC": { "type": "string", "required": true, "description": "主题关键词" }
  },
  "steps": [ ... ],
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

- `agents` 内嵌该 pipeline 依赖的 agent 定义（**不含** apiKey/appSecret 等敏感字段）
- 导入时按 `refId` 或 `name` 匹配已有 agent，不存在则创建
- step 中的 `agentId` 在导出时替换为 `agentRef`（指向 agents 数组的 refId）

### API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/pipelines/[id]/export` | GET | 导出为 JSON（Content-Disposition: attachment） |
| `/api/pipelines/import` | POST | 接收 JSON body，校验 → 创建 agents → 创建 pipeline |

### 实现要点

1. **`src/lib/pipeline/bundle.ts`**
   - `exportBundle(pipelineId)` — 查 pipeline + 关联 agents，组装 bundle
   - `importBundle(bundle)` — schema 校验 → agent 去重/创建 → pipeline 入库
   - 敏感字段白名单过滤

2. **前端**
   - pipeline-editor.tsx 添加"导出 JSON"按钮（触发下载）
   - 添加"导入 Pipeline"按钮（文件选择 → POST /api/pipelines/import）

---

## 二、Pipeline JSON Schema 发布

### 目标

生成独立 `public/pipeline.schema.json`，供编辑器 IntelliSense 和第三方工具校验。

### Schema 结构

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "pipeline.schema.json",
  "title": "Agent-Hub Pipeline Config",
  "type": "object",
  "required": ["version", "steps", "git"],
  "properties": {
    "version": { "const": "1" },
    "input": { ... },
    "steps": {
      "type": "array",
      "items": { "$ref": "#/$defs/PipelineStep" }
    },
    "git": { "$ref": "#/$defs/GitConfig" }
  },
  "$defs": {
    "PipelineStep": { "oneOf": ["SingleStep", "ParallelStep", "ConditionStep"] },
    "SingleStep": { ... },
    "ParallelStep": { ... },
    "ConditionStep": { ... },
    "OutputExtraction": { ... },
    "GitConfig": { ... }
  }
}
```

### 实现要点

1. 手写 `public/pipeline.schema.json`（基于 `src/lib/pipeline/types.ts`）
2. pipeline-editor.tsx 的 JSON 编辑器可用 ajv 做实时校验
3. 导出 bundle 自动附带 `$schema` 字段

---

## 三、Agent 配置导入/导出

### 导出格式

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
      "config": {}
    }
  ]
}
```

- 不含 `apiKey`、`baseUrl` 等环境相关字段
- `skills` 为 skill name 数组（导入时按 name 匹配）

### API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agents/export` | GET | 导出全部或指定 agents（?ids=a,b,c） |
| `/api/agents/import` | POST | 批量导入，按 name 去重 |

### 实现要点

- `src/lib/agent-bundle.ts` — exportAgents / importAgents
- 导入时如果 skill 不存在，仅记录 warning 不阻断

---

## 四、实时 SSE 推送

### 架构

```
Browser (EventSource)
    ↑ SSE
/api/pipelines/[id]/runs/[runId]/events
    ↑ emit
EventEmitter (pipelineEvents)
    ↑ callback
runner.onStepStart / onStepComplete
```

### 事件类型

```typescript
type PipelineSSEEvent =
  | { type: 'step_start'; stepId: string; agentId: string; timestamp: number }
  | { type: 'step_complete'; stepId: string; status: string; output?: string; usage?: { input: number; output: number }; timestamp: number }
  | { type: 'run_complete'; status: string; error?: string; timestamp: number }
```

### 实现要点

1. **`src/lib/pipeline/events.ts`** — 全局 EventEmitter，key = runId
2. **修改 run route** — runPipeline 时传入 onStepStart/onStepComplete 回调，回调内 emit 事件
3. **新建 SSE route** — `src/app/api/pipelines/[id]/runs/[runId]/events/route.ts`
   - 返回 ReadableStream，Content-Type: text/event-stream
   - 监听对应 runId 的事件，写入 stream
   - 参考现有 `src/app/api/chat/route.ts` 的 SSE 模式
4. **前端 pipeline-run-view.tsx**
   - 运行中时建立 EventSource
   - 实时更新 step 状态，run 完成后关闭连接

---

## 五、Token Usage 追踪

### DB Schema 变更

`pipelineStepRuns` 表新增：
```sql
ALTER TABLE pipeline_step_runs ADD COLUMN input_tokens INTEGER;
ALTER TABLE pipeline_step_runs ADD COLUMN output_tokens INTEGER;
```

### 类型变更

```typescript
// StepResult 扩展
interface StepResult {
  // ...existing
  usage?: { inputTokens: number; outputTokens: number }
}

// IterationResult 扩展
interface IterationResult {
  // ...existing
  usage?: { inputTokens: number; outputTokens: number }
}
```

### 实现要点

1. **runner.ts `executeOnce()`** — handleEvent 中累加 usage：
   ```typescript
   let totalInput = 0, totalOutput = 0
   case 'usage':
     totalInput += evt.inputTokens
     totalOutput += evt.outputTokens
   ```
   返回时附带 usage

2. **runner.ts `executeAIStep()`** — 汇总多轮 iteration 的 usage，写入 DB

3. **stats API 扩展** — `/api/pipelines/stats` 返回 token 汇总：
   - 每个 pipeline 的总 token
   - 每个 step 的平均 token
   - 按天的 token 趋势

4. **前端展示**
   - pipeline-run-view 每个 step 显示 token 用量标签
   - stats 面板增加 token 成本图表

---

## 实施优先级建议

| 顺序 | 功能 | 理由 |
|------|------|------|
| 1 | Token Usage 追踪 | 改动最小（3个文件），立即可用 |
| 2 | Pipeline 导入/导出 + JSON Schema | 核心可移植性，模板市场的前置依赖 |
| 3 | Agent 配置导入/导出 | 复用 pipeline bundle 的模式 |
| 4 | SSE 推送 | 体验提升，需要 EventEmitter 基础设施 |

---

## 验证清单

- [x] 导出 pipeline → 删除 → 重新导入 → 配置一致
- [x] 导入含未知 agent 的 bundle → 自动创建 agent
- [x] JSON Schema 校验：合法/非法 config 各一例
- [x] 触发 pipeline → EventSource 连接 → 实时收到 step 事件
- [x] 运行 AI step → stats API 返回 token 数据
