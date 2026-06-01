# 我用 5 个 AI Agent 搭了一条流水线，每天自动生成热梗漫画发公众号

> 标签建议：`AI Agent` `自动化` `Pipeline` `GPT Image` `微信公众号` `Next.js` `Tool Agent`

## 开篇：日更这件小事，最消耗人

做公众号最难的不是写一篇文章。

难的是每天都写。

尤其是热梗漫画这种内容。它看起来轻巧，实际每一步都很碎：刷热点，判断哪个梗还热，想四格漫画脚本，生成图片，排版成公众号图文，上传图片素材，创建草稿，最后再人工检查。

这套流程如果人工做，一天 2 小时很正常。更麻烦的是它有时效性。昨天的梗，今天可能就凉了。

所以我做了一个实验：能不能把这条内容生产链拆成一条 Agent Pipeline，让多个 Agent 分工跑完？

最后跑通的版本是 5 步：

```text
[收集热梗] -> [策划脚本] -> [生成漫画] -> [排版文案] -> [发布草稿箱]
  Claude       Claude       GPT Image      Claude       微信 API
  AI Agent     AI Agent     Tool Agent     AI Agent     Tool Agent
```

它不是“一个大模型从头写到尾”。相反，每个节点只负责一件事。需要判断和创作的地方交给 AI Agent；需要稳定调用外部 API 的地方交给 Tool Agent。

这就是 Agent-Hub 第一个跑通的完整 Demo。

## 为什么不是一个 Agent 全包

一开始很容易有一个冲动：让一个 Agent 自己搜索、自己策划、自己生成图片、自己发公众号。

听起来智能，实际很难稳定。

原因有三个。

第一，AI 输出天然有概率性。它适合分析热点、组织文案、生成创意脚本，但不适合负责“微信图片必须先上传到哪个接口”这种确定性细节。

第二，外部 API 的错误处理需要工程逻辑。比如图片生成偶发失败时，只应该重试图片生成这一步，而不是从头重新收集热梗。

第三，流程要可观察。拆成多个 step 后，哪一步失败、输入是什么、输出是什么、耗了多少 token，都能记录下来。

所以我在 Agent-Hub 里把 Agent 分成两类。

| 类型 | 职责 | 示例 |
|------|------|------|
| AI Agent | 需要理解、判断、生成内容的环节 | 热点分析、漫画脚本、公众号文案 |
| Tool Agent | 确定性 API 调用和副作用操作 | 图片生成、微信发布、飞书通知、GitHub Issue |

这个分层看起来朴素，但它决定了整个系统能不能长期跑。

## Pipeline 配置长什么样

Agent-Hub 的 Pipeline 是一段 JSON DSL。它描述步骤、依赖、失败策略、输入参数和 Git 策略。

热梗漫画的核心配置可以简化成这样：

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
      "prompt": "{{STEP_PLAN_DATA.combined_image_prompt}}",
      "promptArgs": {
        "PROMPT": "{{STEP_PLAN_DATA.combined_image_prompt}}"
      },
      "dependsOn": ["plan"],
      "onFailure": "retry",
      "maxRetries": 2
    },
    {
      "id": "format",
      "type": "single",
      "agentId": "agent-meme-formatter",
      "prompt": "漫画脚本：{{STEP_PLAN_DATA}}\n\n生成的图片：{{STEP_GENERATE_IMAGES_OUTPUT}}\n\n请排版成公众号图文。",
      "dependsOn": ["generate_images"],
      "output": { "tag": "data", "parseJson": true }
    },
    {
      "id": "publish",
      "type": "single",
      "agentId": "agent-wechat-mp",
      "prompt": "发布到公众号草稿箱",
      "promptArgs": {
        "TITLE": "{{STEP_FORMAT_DATA.title}}",
        "CONTENT": "{{STEP_FORMAT_DATA.content}}",
        "THUMB_BASE64": "{{STEP_GENERATE_IMAGES_DATA.b64_json}}",
        "IMAGE_BASE64": "{{STEP_GENERATE_IMAGES_DATA.b64_json}}",
        "DIGEST": "{{STEP_FORMAT_DATA.digest}}"
      },
      "dependsOn": ["format"]
    }
  ],
  "git": { "enabled": false, "baseBranch": "main", "autoMerge": false }
}
```

这段 JSON 里最关键的不是字段多，而是几个设计点：

- `dependsOn` 定义 DAG 依赖。
- `output.tag` 告诉 Runner 从 AI 输出里提取结构化数据。
- `promptArgs` 把模板变量映射为 Tool Agent 的确定性入参。
- `onFailure: "retry"` 让某个节点局部重试。
- `{{STEP_PLAN_DATA.combined_image_prompt}}` 让下游直接引用上游 JSON 字段。

## structuredOutput：让 AI 输出可以被下游稳定消费

Agent Pipeline 最容易崩的地方，是把 AI 的自由文本直接传给下游。

比如策划 Agent 如果输出：

```text
我觉得今天可以画“程序员看到 AI 代码”的梗。标题可以叫……
```

这对人类可读，但对下游不稳定。图片生成节点到底该拿哪一句做 prompt？公众号标题在哪？摘要在哪？

所以我要求 AI Agent 用 XML tag 包住 JSON：

```xml
<data>
{
  "selected_meme": "程序员看到 AI 写的代码",
  "title": "当程序员看到 AI 写的代码...",
  "digest": "AI 写代码翻车现场",
  "combined_image_prompt": "四格漫画，2x2布局，中文气泡文字..."
}
</data>
```

Runner 里做的事情很简单：

```typescript
function extractStructuredOutput(output: string, extraction: OutputExtraction): unknown {
  const { tag, parseJson } = extraction
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const match = output.match(regex)
  if (!match) return undefined

  const content = match[1].trim()
  if (parseJson) {
    try { return JSON.parse(content) } catch { return content }
  }
  return content
}
```

这个实现不复杂，但很有效。

AI 还是可以自由思考，但最后必须把可消费的数据放进约定格式里。下游不再读散文，而是读结构化结果。

## 模板变量：Pipeline 里的数据总线

每个 step 跑完后，Runner 会把结果注册成模板变量。

核心逻辑大概是这样：

```typescript
function buildTemplateArgs(
  results: Map<string, StepResult>,
  pipelineInput: Record<string, string>,
  workDir: string,
): Record<string, string> {
  const args: Record<string, string> = { ...pipelineInput }
  if (workDir) args.WORK_DIR = workDir
  for (const [id, result] of results) {
    args[`STEP_${id.toUpperCase()}_OUTPUT`] = result.output || ''
    if (result.structuredOutput) {
      args[`STEP_${id.toUpperCase()}_DATA`] = JSON.stringify(result.structuredOutput)
    }
  }
  return args
}
```

所以 `collect` step 会生成：

```text
STEP_COLLECT_OUTPUT
STEP_COLLECT_DATA
```

如果 `STEP_COLLECT_DATA` 是 JSON，还支持点号访问：

```typescript
export function resolvePrompt(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, key: string) => {
    if (key in args) return args[key]

    const dotIndex = key.indexOf('.')
    if (dotIndex > 0) {
      const base = key.substring(0, dotIndex)
      const field = key.substring(dotIndex + 1)
      const baseValue = args[base]
      if (baseValue) {
        try {
          const parsed = JSON.parse(baseValue)
          if (parsed && typeof parsed === 'object' && field in parsed) {
            const val = parsed[field]
            return typeof val === 'string' ? val : JSON.stringify(val)
          }
        } catch {}
      }
    }

    return match
  })
}
```

这就是为什么配置里可以写：

```text
{{STEP_PLAN_DATA.combined_image_prompt}}
```

它让 Pipeline 的数据流是声明式的，不需要为每条工作流写胶水代码。

## ToolProvider：确定性执行的抽象

Tool Agent 的接口只有一个：

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

`input` 是运行时参数，比如 `PROMPT`、`TITLE`、`CONTENT`。

`config` 是 Agent 静态配置，比如 API Key、baseUrl、model。

图片生成 Tool Provider 的核心逻辑就是调用 OpenAI Images API：

```typescript
const resp = await fetch(`${baseUrl}/images/generations`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model,
    prompt,
    n: 1,
    size,
    quality,
  }),
})
```

返回结果再统一变成 JSON 字符串：

```typescript
const result = {
  url: image.url || '',
  b64_json: image.b64_json || '',
  revised_prompt: image.revised_prompt || '',
}

return { success: true, output: JSON.stringify(result) }
```

Runner 会尝试把 Tool Agent 的 `output` 解析成 JSON，自动作为 `structuredOutput`。这样图片生成的 `b64_json` 就能被发布节点引用。

## 微信公众号发布：最“脏”的确定性节点

微信公众号这一步最适合说明 Tool Agent 的价值。

它不是一句“帮我发公众号”能稳定解决的事情。实际顺序是：

```text
1. 获取 access_token
2. 如果正文里有图片，先调用 uploadimg 上传正文图片
3. 封面图调用 add_material 上传为永久素材
4. 调用 draft/add 创建草稿
```

还有两个坑：

正文图片必须是微信域名，否则文章里图片会裂。

封面图必须是永久素材，不能直接拿临时素材或外链糊弄。

这些东西一旦写成 Tool Provider，就变成稳定的“执行节点”。AI 不需要知道微信 API 的全部细节，它只要给出标题、正文、摘要和图片数据。

## Runner 怎么执行这条链路

Pipeline Runner 的主循环分几步。

第一步，创建 run 记录。

```typescript
await db.insert(pipelineRuns).values({
  id: runId,
  pipelineId,
  status: 'running',
  branch,
  baseSha,
  startedAt: new Date(),
})
```

第二步，对步骤做拓扑排序。

```typescript
function topologicalSort(steps: PipelineStep[]): PipelineStep[] {
  const sorted: PipelineStep[] = []
  const visited = new Set<string>()
  const stepMap = new Map(steps.map(s => [s.id, s]))

  function visit(step: PipelineStep) {
    if (visited.has(step.id)) return
    visited.add(step.id)
    const deps = step.dependsOn || []
    for (const depId of deps) {
      const dep = stepMap.get(depId)
      if (dep) visit(dep)
    }
    sorted.push(step)
  }

  for (const step of steps) visit(step)
  return sorted
}
```

第三步，按 step 类型执行：

```typescript
if (step.type === 'condition') {
  const condResult = executeCondition(step, results, pipelineInput)
  results.set(step.id, condResult)
} else if (step.type === 'parallel') {
  const subResults = await Promise.allSettled(
    step.steps.map(sub => executeStep(...))
  )
} else {
  const result = await executeStepWithRetry(...)
  results.set(step.id, result)
}
```

第四步，根据失败策略决定是否继续。

```typescript
if (result.status === 'failed' && (step.onFailure || 'stop') === 'stop') {
  throw new Error(`Step ${step.id} failed: ${result.error || 'unknown'}`)
}
```

对于图片生成这种偶发失败的节点，配置 `retry` 就够了：

```typescript
async function executeStepWithRetry(...) {
  const maxRetries = step.onFailure === 'retry' ? (step.maxRetries ?? 2) : 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await executeStep(...)
    if (result.status === 'completed') return result
  }

  if (step.onFailure === 'skip') return { ...lastResult, status: 'skipped' }
  return lastResult
}
```

## 这条 Demo 验证了什么

热梗漫画 Demo 跑通后，我确认了几个判断。

第一，AI + Tool 的混合架构是必要的。

纯 AI 太飘，纯 API 又不够聪明。两者串起来，刚好覆盖“理解”和“执行”。

第二，结构化输出不是锦上添花，是刚需。

只要有上下游依赖，就必须让 AI 输出可被机器消费。

第三，局部重试非常重要。

图片生成失败时，不能让整条链路重跑。Pipeline 必须知道失败发生在哪一步，以及这一步该怎么处理。

第四，公众号这种真实外部系统能暴露很多问题。

Demo 如果只停留在“生成一段文字”，很难验证工程完整性。真正接上微信 API 后，图片上传、素材类型、草稿格式、错误处理都会逼着系统变扎实。

## 可以迁移到哪些场景

热梗漫画只是一个样板。换掉 prompt 和 Tool Provider，它可以变成很多流程：

- 技术日报：抓取 Git 提交和 Issue，生成摘要，发飞书。
- 客户反馈：Webhook 接收反馈，AI 分类，自动建 GitHub Issue。
- 竞品监控：定时抓取更新，生成分析报告，邮件推送。
- 内容分发：一篇长文拆成 X、LinkedIn、公众号多平台版本。
- 代码审查：收到 PR 后触发 Codex/Claude 审查，输出评论或 Issue。

核心模式都是一样的：触发器启动 Pipeline，AI Agent 做判断，Tool Agent 做执行，输出结构化传递。

## 结尾

Agent-Hub 的第一个 Demo 不是为了证明“AI 可以自动做内容”。

它验证的是一个更底层的东西：业务流程可以被拆成一组可编排、可观察、可重试的 Agent 节点。

当这个模型成立后，AI 就不再只是聊天框里的回答者，而是流程里的一个工作节点。

这才是我想继续做 Agent-Hub 的原因。
