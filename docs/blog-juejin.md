# 我用 5 个 AI Agent 搭了条流水线，每天自动生成热梗漫画发公众号

> 标签建议：`AI Agent` `自动化` `GPT Image` `微信公众号` `Pipeline` `Next.js`

## 前言：一个公众号运营者的痛

做过公众号的都知道，**日更是地狱**。

尤其是做热梗漫画这种内容——你得每天刷微博热搜、B站热门、抖音梗，挑一个有画面感的话题，构思四格漫画分镜，生成图片，排版成公众号格式，上传素材，创建草稿……

整套流程走下来，2 小时起步。而且你还得保证"热梗"真的热——昨天的梗今天就凉了。

所以我想：**能不能让 AI Agent 全自动跑完这条链路？**

答案是可以的。我用自己写的 Agent-Hub 系统，编排了一条 5 步 Pipeline，从搜索热梗到漫画出现在公众号草稿箱，全程零人工干预。

公众号「夜猫子agent工坊」的漫画内容，现在就是这条 Pipeline 在产出。

## 整体架构

Agent-Hub 是一个多 Agent 管理和编排系统，技术栈是 Next.js 15 + SQLite (Drizzle ORM) + TypeScript。核心思路很简单：

```
Trigger（cron/webhook/手动）
    ↓
Pipeline DAG 引擎（拓扑排序 → 顺序/并行/条件分支）
    ↓
Agent 执行（AI Agent 或 Tool Agent）
    ↓
输出（structuredOutput 提取 → 模板变量传递给下一步）
```

Agent 分两类：

| 类型 | 执行方式 | 典型场景 |
|------|----------|----------|
| AI Agent | spawn Claude/Codex CLI 子进程 | 搜索、分析、写作 |
| Tool Agent | 确定性 API 调用 | 图片生成、公众号发布 |

AI Agent 有创造力但不确定，Tool Agent 没创造力但稳定可靠。Pipeline 把两者串起来，各取所长。

## 热梗漫画 Pipeline 设计

这条 Pipeline 一共 5 步：

```
[收集热梗] → [策划脚本] → [生成漫画] → [排版文案] → [发布草稿箱]
  Claude       Claude       GPT Image 2    Claude       微信 API
 (AI Agent)  (AI Agent)   (Tool Agent)   (AI Agent)  (Tool Agent)
```

每一步的输出通过 `structuredOutput` 提取后，以模板变量 `{{STEP_XXX_DATA}}` 注入下一步的 prompt。这是整个 Pipeline 数据流转的核心机制。

## 核心实现

### 1. Pipeline 配置（JSON DSL）

Pipeline 的定义是一段声明式 JSON，描述步骤依赖关系和数据流：

```json
{
  "version": "1",
  "input": {
    "TOPIC_HINT": { "type": "string", "required": false, "default": "", "description": "可选：指定搜索方向" }
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
      "promptArgs": { "PROMPT": "{{STEP_PLAN_DATA.combined_image_prompt}}" },
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

几个设计要点：

- **`output.tag` + `parseJson`**：AI Agent 输出中用 `<data>JSON</data>` 包裹结构化数据，引擎自动提取并解析为 JSON
- **`{{STEP_PLAN_DATA.combined_image_prompt}}`**：支持点号语法访问 JSON 字段，直接把策划结果中的 prompt 喂给图片生成
- **`onFailure: "retry"`**：图片生成偶尔会 403，配置自动重试 2 次
- **`promptArgs`**：Tool Agent 不理解自然语言 prompt，用 promptArgs 把模板变量映射为具体的 API 参数

### 2. ToolProvider 接口

Tool Agent 的核心抽象只有一个接口：

```typescript
export interface ToolProvider {
  readonly name: string
  execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  output: string  // JSON 字符串，自动成为 structuredOutput
  error?: string
}
```

`input` 是运行时从模板变量解析出来的参数，`config` 是 Agent 创建时配置的静态参数（API Key 之类）。这个设计让每个 Tool Provider 都是纯函数——输入确定，输出确定，方便测试和重试。

注册也很简单：

```typescript
const toolProviders: Record<string, () => ToolProvider> = {
  feishu: createFeishuProvider,
  'github-issue': createGithubIssueProvider,
  email: createEmailProvider,
  'image-gen': createImageGenProvider,
  'wechat-mp': createWechatMpProvider,
}
```

想加新的 Tool Agent？写一个 `createXxxProvider()` 函数，注册进 map，完事。

### 3. 微信公众号发布（wechat-mp Provider）

这是整条 Pipeline 最"脏活累活"的部分。微信公众号 API 的坑不少，核心流程：

```
获取 access_token → 上传正文图片 → 上传封面（永久素材）→ 创建草稿
```

关键代码：

```typescript
export function createWechatMpProvider(): ToolProvider {
  return {
    name: 'wechat-mp',
    async execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult> {
      const { appId, appSecret } = config
      const accessToken = await getAccessToken(appId, appSecret)

      // 1. 上传正文图片（返回微信域名 URL）
      let finalContent = input.CONTENT
      if (input.IMAGE_BASE64) {
        const imgBuffer = Buffer.from(input.IMAGE_BASE64, 'base64')
        const contentImageUrl = await uploadContentImage(accessToken, imgBuffer, 'image/png')
        // 替换 HTML 中的占位符
        finalContent = finalContent.replace(/\{\{IMAGE_URL\}\}/g, contentImageUrl)
      }

      // 2. 上传封面图为永久素材
      const thumbBuffer = Buffer.from(input.THUMB_BASE64, 'base64')
      const thumbMediaId = await uploadThumbMaterial(accessToken, thumbBuffer, 'image/png')

      // 3. 创建草稿
      const mediaId = await createDraft(accessToken, {
        title: input.TITLE,
        content: finalContent,
        thumb_media_id: thumbMediaId,
        digest: input.DIGEST,
      })

      return {
        success: true,
        output: JSON.stringify({ media_id: mediaId, msg: '草稿已创建' }),
      }
    },
  }
}
```

几个踩坑点：

1. **正文图片必须用微信域名**：不能直接用外部 URL，必须先通过 `uploadimg` 接口上传，拿到 `mmbiz.qpic.cn` 域名的 URL
2. **封面图必须是永久素材**：用 `add_material` 接口上传，返回 `media_id`，不能用临时素材
3. **multipart/form-data 手动拼**：Node.js 原生 fetch 不支持 File 对象上传到微信 API，需要手动拼 boundary

### 4. 模板变量解析引擎

Pipeline 步骤间的数据传递靠模板变量，解析逻辑很精简：

```typescript
export function resolvePrompt(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (match, key: string) => {
    if (key in args) return args[key]

    // 点号解析：STEP_X_DATA.field → 从 JSON 中取字段
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
        } catch { /* 非 JSON，返回原始模板 */ }
      }
    }
    return match
  })
}
```

变量命名规则：
- `{{STEP_COLLECT_OUTPUT}}` — 步骤原始输出
- `{{STEP_COLLECT_DATA}}` — 步骤 structuredOutput（JSON 字符串）
- `{{STEP_COLLECT_DATA.title}}` — 从 JSON 中取具体字段

这套机制让 Pipeline 的数据流完全声明式，不需要写胶水代码。

### 5. Pipeline Runner 的执行策略

Runner 支持三种失败策略：

```typescript
type FailureStrategy = 'stop' | 'skip' | 'retry'
```

- **stop**：默认行为，某步失败整个 Pipeline 中断
- **skip**：标记为 skipped，后续步骤继续执行
- **retry**：自动重试 N 次（图片生成 API 偶尔抽风，这个很实用）

执行流程是拓扑排序后逐步执行，遇到 `parallel` 类型的步骤会 `Promise.allSettled` 并发：

```typescript
const sortedSteps = topologicalSort(config.steps)

for (const step of sortedSteps) {
  if (step.type === 'parallel') {
    await Promise.allSettled(step.steps.map(sub => executeStep(...)))
  } else {
    const result = await executeStepWithRetry(...)
    if (result.status === 'failed' && step.onFailure === 'stop') {
      throw new Error(`Step ${step.id} failed`)
    }
  }
}
```

## 效果展示

Pipeline 跑一次大约 3-5 分钟（主要时间花在 Claude 搜索和图片生成上），最终效果：

1. Claude Agent 联网搜索当天热梗，输出 5-10 个候选
2. 策划 Agent 挑选最有画面感的梗，写出四格漫画中文 prompt
3. GPT Image 2 生成一张 1024x1024 的四格漫画（2x2 布局，日系风格）
4. 排版 Agent 组织成公众号 HTML，图片用 `{{IMAGE_URL}}` 占位
5. 微信 API 上传图片、创建草稿，漫画出现在公众号草稿箱

打开公众号后台，草稿箱里已经躺好了一篇图文，标题带热梗关键词，封面是生成的漫画，正文排版完整。人工审核一下就能发布。

## 一些经验

**1. AI Agent 的输出必须结构化**

不要指望 AI 的自由文本能被下游稳定消费。用 XML tag 包裹 + JSON schema 约束，是目前最可靠的方案。Pipeline 引擎用正则 `<tag>...</tag>` 提取，简单粗暴但有效。

**2. Tool Agent 和 AI Agent 的边界要清晰**

图片生成、API 调用这种确定性操作，不要交给 AI Agent 去"理解"然后调用。直接写成 Tool Provider，输入输出明确，失败了能重试，日志能追踪。

**3. 图片生成的 prompt 用中文效果更好**

GPT Image 2 对中文 prompt 的理解比预期好很多。四格漫画直接用中文描述场景和对话气泡，生成效果比翻译成英文再生成更贴合语境。

**4. 微信公众号 API 的图片必须走微信域名**

这是个经典坑。正文里的 `<img src>` 如果不是 `mmbiz.qpic.cn` 域名，发布后图片会裂。所以 Pipeline 里专门有一步把图片上传到微信服务器，拿到合法 URL 再替换占位符。

**5. 失败重试是刚需**

图片生成 API 偶尔会 403 或超时，配置 `onFailure: "retry"` + `maxRetries: 2` 能覆盖大部分偶发故障。比起整条 Pipeline 重跑，局部重试成本低得多。

## 总结

Agent-Hub 的核心价值在于：**把 AI 的创造力和 API 的确定性用 Pipeline 串起来，形成可靠的自动化工作流**。

热梗漫画只是一个场景。同样的架构可以做：
- 每日技术资讯摘要 → 生成配图 → 发飞书/邮件
- GitHub Issue 分析 → 自动分类 → 指派处理人
- 竞品监控 → 生成分析报告 → 推送通知

关键不是某个 Agent 有多聪明，而是 Pipeline 让多个 Agent 协作时，数据流转是声明式的、失败处理是可配置的、执行过程是可追踪的。

---

项目地址：github.com/anthropic-lab/agent-hub（即将开源）

如果你也在做 AI Agent 编排相关的事情，欢迎交流。
