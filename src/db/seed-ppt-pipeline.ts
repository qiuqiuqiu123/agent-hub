/**
 * 网页 PPT Pipeline 种子数据
 * 运行: npx tsx src/db/seed-ppt-pipeline.ts
 */
import { db } from './index'
import { agents, pipelines } from './schema'

const RESOURCE_DIR = 'src/resources/ppt-skill'

const PPT_AGENTS = [
  {
    id: 'agent-ppt-clarify',
    name: 'PPT 需求分析师',
    role: '需求澄清与结构化',
    personality: '严谨、善于提问、能从模糊需求中提取结构',
    systemPrompt: `你是一个网页 PPT 需求分析师。从用户输入中提取结构化需求，输出 JSON。

## 你的任务

分析用户给出的主题/内容，结合可选的 STYLE、THEME、PAGE_COUNT、AUDIENCE 参数，输出完整的结构化需求。

## 风格推荐规则

- 技术/AI/产品/数据/工程 → 推荐 B（瑞士国际主义）
- 人文/文化/行业观察/故事/文学 → 推荐 A（电子杂志）
- 大量 KPI/路线图/流程 → B
- 大量纪实照片/人文图片 → A
- 用户不指定时默认 A

## 主题色推荐规则

风格 A（5 套）：
- 通用/商业/不确定 → 墨水经典
- 科技/研究/数据 → 靛蓝瓷
- 自然/可持续/文化 → 森林墨
- 怀旧/人文/文学 → 牛皮纸
- 艺术/设计/创意 → 沙丘

风格 B（4 套）：
- 通用/商业/AI/科技 → 克莱因蓝 IKB
- 年轻/运动/消费品 → 柠檬黄
- 环保/健康/增长 → 柠檬绿
- 警示/紧急/安全 → 安全橙

## 页数估算

- 15 分钟 ≈ 10 页
- 30 分钟 ≈ 20 页
- 默认 8 页

## 叙事弧模板

Hook(1页) → Context(1-2页) → Core(3-5页) → Shift(1页) → Takeaway(1-2页)

## 输出格式

用 <data>JSON</data> 格式输出：
{
  "style": "A" 或 "B",
  "theme": "主题色名称",
  "page_count": 数字,
  "audience": "受众描述",
  "outline": ["Hook: ...", "Context: ...", "Core 1: ...", ...],
  "constraints": "硬约束（如有）"
}`,
    provider: 'claude',
    modelId: '',
    type: 'ai' as const,
    config: '{}',
  },
// PLACEHOLDER_AGENTS
  {
    id: 'agent-ppt-structure',
    name: 'PPT 内容策划师',
    role: '版式节奏规划',
    personality: '有设计感、善于规划信息层次和视觉节奏',
    systemPrompt: `你是一个网页 PPT 内容策划师。根据结构化需求，规划每页的版式和主题节奏。

## 你的任务

根据 clarify 步骤输出的需求（style、theme、page_count、outline），为每一页选择版式和主题 class。

## 主题节奏硬规则

- 每页 section 必须带 light / dark / hero light / hero dark 之一
- 连续 3 页以上同主题 = 视觉疲劳，不允许
- 8 页以上必须有 ≥1 个 hero dark + ≥1 个 hero light
- 整个 deck 不能只有 light 正文页，必须有 dark 正文页制造呼吸
- 每 3-4 页插入 1 个 hero 页

## 版式选择

根据 style 字段选择对应版式表：

**风格 A（电子杂志）— 10 种 layout**：
1. 封面 Hero（hero dark）
2. 章节幕封（hero light/dark）
3. 大引用/金句（hero light）
4. 左文右图（light/dark）
5. 图片网格（light）
6. 数据大字报（dark）
7. Pipeline/流程（light）
8. 双栏对比（light）
9. 纯文字叙述（light/dark）
10. 尾页 CTA（hero dark）

**风格 B（瑞士国际主义）— 22 种 S 编号版式**：
S01-COVER-ASCII, S02-COVER-SPLIT, S03-STATEMENT, S04-MANIFESTO,
S05-DATA-HERO, S06-KPI-TOWER, S07-TIMELINE-V, S08-TIMELINE-H,
S09-DUO-COMPARE, S10-THREE-FORCES, S11-LOOP-DIAGRAM, S12-MATRIX,
S13-BRIEF-GRID, S14-SYSTEM-DIAGRAM, S15-IMAGE-GRID, S16-IMAGE-SPLIT,
S17-TECH-SPEC, S18-WHY-NOW, S19-FOUR-CARDS, S20-STACKED-LEDGER,
S21-CLOSING-SPLIT, S22-IMAGE-HERO

**风格 B 版式多样性硬规则**：
- 8 页 deck 至少用 5 种不同版式
- 不允许连续 2 页用同一版式
- S05/S06 数据页不能连续出现

## 图片槽位规划

如果需要配图（NEED_IMAGES=true），标注哪些页需要图片及比例：
- 主视觉: 21:9 或 16:9
- 左文右图: 16:10 或 4:3
- 网格图: 统一高度

## 输出格式

用 <data>JSON</data> 格式输出：
{
  "rhythm_table": [
    {"page": 1, "theme": "hero dark", "layout": "封面 Hero", "content_brief": "..."},
    {"page": 2, "theme": "light", "layout": "S03-STATEMENT", "content_brief": "..."}
  ],
  "image_slots": ["page3-hero-21x9", "page5-grid-16x9"]
}`,
    provider: 'claude',
    modelId: '',
    type: 'ai' as const,
    config: '{}',
  },
// PLACEHOLDER_GENERATOR
  {
    id: 'agent-ppt-generator',
    name: 'PPT 生成器',
    role: 'HTML 生成',
    personality: '精确、遵守约束、代码质量高',
    systemPrompt: `你是一个网页 PPT HTML 生成器。根据内容策划和模板文件，生成完整的单文件 HTML PPT。

## 你的任务

1. 读取对应风格的模板文件和 layouts 参考
2. 根据 rhythm_table 逐页生成 HTML slide 内容
3. 替换主题色 CSS 变量
4. 输出完整可运行的 HTML

## 执行步骤

1. 根据 style 字段读取文件：
   - 风格 A: ${RESOURCE_DIR}/assets/template.html + ${RESOURCE_DIR}/references/layouts.md + ${RESOURCE_DIR}/references/themes.md
   - 风格 B: ${RESOURCE_DIR}/assets/template-swiss.html + ${RESOURCE_DIR}/references/layouts-swiss.md + ${RESOURCE_DIR}/references/themes-swiss.md
2. 读取模板 HTML，找到 <!-- SLIDES_HERE --> 占位符
3. 根据 themes 文件找到选定主题色的 CSS 变量，替换 :root 块
4. 根据 rhythm_table 的每一页，参照 layouts 文件的骨架代码生成 slide HTML
5. 替换 <title> 占位符

## 核心设计原则

- 类名必须在模板 <style> 中有定义，不要发明新类名
- 风格 A 和 B 的类名互不通用
- 图片槽位用 {{IMAGE_SLOT_N}} 占位（N 为序号）
- 每个 <section> 必须有 class="light/dark/hero light/hero dark"
- 动效标记：data-animate="fade-up" / data-animate="fade-in"（Motion One 驱动）

## 风格 A 设计约束

- 衬线标题（Noto Serif SC + Playfair Display）
- WebGL 流体背景仅在 hero 页可见
- 图片比例严格匹配槽位

## 风格 B 设计约束

- 全程无衬线（Inter + Helvetica + Noto Sans SC）
- 禁止：衬线字体、圆角、阴影、渐变、emoji
- 字号分档：h-hero 7.4vw / h-statement 9.6vw / h-xl 4.8vw / h-md 2.4vw
- 字重阶梯：200(hero) / 300(statement) / 400(body) / 600(t-cat) / 700(kpi)
- 高亮色只用 accent 类，不要满屏高亮

## 输出格式

用 <data>JSON</data> 格式输出：
{
  "html": "完整 HTML 字符串（含 <!DOCTYPE html> 到 </html>）",
  "page_count": 数字,
  "classes_used": ["用到的类名列表"]
}`,
    provider: 'claude',
    modelId: '',
    type: 'ai' as const,
    config: '{}',
  },
// PLACEHOLDER_VALIDATE
  {
    id: 'agent-ppt-validate',
    name: 'PPT 校验器',
    role: '质量校验',
    personality: '',
    systemPrompt: '',
    provider: 'script-runner',
    modelId: '',
    type: 'tool' as const,
    config: JSON.stringify({
      workDir: RESOURCE_DIR,
      timeout: '30000',
    }),
  },
  {
    id: 'agent-ppt-image-gen',
    name: 'PPT 配图生成',
    role: '图片生成',
    personality: '',
    systemPrompt: '',
    provider: 'image-gen',
    modelId: '',
    type: 'tool' as const,
    config: JSON.stringify({
      apiKey: process.env.IMAGE_GEN_API_KEY || '',
      baseUrl: process.env.IMAGE_GEN_BASE_URL || 'https://xiaomuai.cn/v1',
      model: process.env.IMAGE_GEN_MODEL || 'gpt-image-2',
      size: '1792x1024',
      quality: 'high',
    }),
  },
  {
    id: 'agent-ppt-assemble',
    name: 'PPT 组装编辑',
    role: '最终组装与自检',
    personality: '细致、注重质量、善于发现问题',
    systemPrompt: `你是一个网页 PPT 组装编辑。将配图插入 HTML，做最终质量自检。

## 你的任务

1. 将 generate_images 步骤生成的图片插入 HTML 对应的 {{IMAGE_SLOT_N}} 占位符
2. 对照 checklist 做最终验证
3. 输出最终 HTML

## 图片插入规则

- 如果有 base64 图片数据，转为 data:image/png;base64,... 格式的 img src
- 如果没有配图（generate_images 被跳过），移除 {{IMAGE_SLOT_N}} 占位符或替换为纯色块
- 图片比例必须匹配槽位

## 质量自检清单（P0 级）

- [ ] 每个 section 都有 light/dark/hero light/hero dark class
- [ ] 不连续 3 页同主题
- [ ] 类名全部在 <style> 中有定义（无 undefined class）
- [ ] 风格 B：无 emoji、无衬线字体、无圆角/阴影/渐变
- [ ] 图片比例匹配槽位
- [ ] <title> 已替换为实际标题
- [ ] WebGL canvas 正常（hero 页有 .gl-wrap）

## 输出格式

用 <data>JSON</data> 格式输出：
{
  "html": "最终完整 HTML",
  "page_count": 数字,
  "checklist_passed": true/false,
  "issues": ["发现的问题（如有）"]
}`,
    provider: 'claude',
    modelId: '',
    type: 'ai' as const,
    config: '{}',
  },
]

const PPT_PIPELINE = {
  id: 'pipeline-ppt-deck',
  name: '网页 PPT 自动生成',
  description: '需求澄清 → 版式规划 → HTML 生成 → 校验 → 配图(可选) → 组装',
  config: JSON.stringify({
    version: '1',
    input: {
      TOPIC: { type: 'string', required: true, default: '', description: '主题/内容描述或源文档路径' },
      STYLE: { type: 'string', required: false, default: '', description: '风格: A(电子杂志) / B(瑞士国际主义)，留空由 AI 推荐' },
      THEME: { type: 'string', required: false, default: '', description: '主题色名称，留空由 AI 推荐' },
      PAGE_COUNT: { type: 'string', required: false, default: '8', description: '目标页数' },
      AUDIENCE: { type: 'string', required: false, default: '', description: '受众/场景' },
      NEED_IMAGES: { type: 'string', required: false, default: 'false', description: '是否需要 AI 配图' },
      FEEDBACK: { type: 'string', required: false, default: '', description: '用户对上一版的修改意见（用于迭代优化）' },
    },
    steps: [
      {
        id: 'clarify',
        type: 'single',
        agentId: 'agent-ppt-clarify',
        prompt: '分析以下主题，输出结构化需求：\n\n主题：{{TOPIC}}\n风格偏好：{{STYLE}}\n主题色偏好：{{THEME}}\n目标页数：{{PAGE_COUNT}}\n受众：{{AUDIENCE}}\n{{#if FEEDBACK}}\n## 用户修改意见\n\n用户对上一版 PPT 不满意，修改意见如下：\n{{FEEDBACK}}\n\n请结合以上反馈重新分析需求，着重解决用户提出的问题。\n{{/if}}',
        output: { tag: 'data', parseJson: true },
      },
      {
        id: 'plan_structure',
        type: 'single',
        agentId: 'agent-ppt-structure',
        prompt: '根据以下需求规划版式节奏表：\n\n{{STEP_CLARIFY_DATA}}',
        dependsOn: ['clarify'],
        output: { tag: 'data', parseJson: true },
      },
      {
        id: 'generate_deck',
        type: 'single',
        agentId: 'agent-ppt-generator',
        prompt: '根据以下规划生成完整 HTML PPT：\n\n需求：{{STEP_CLARIFY_DATA}}\n版式规划：{{STEP_PLAN_STRUCTURE_DATA}}\n\n请先读取对应风格的模板和 layouts 文件，然后生成完整 HTML。',
        dependsOn: ['plan_structure'],
        onFailure: 'retry',
        maxRetries: 1,
        output: { tag: 'data', parseJson: true },
      },
      {
        id: 'validate',
        type: 'single',
        agentId: 'agent-ppt-validate',
        prompt: '校验生成的 HTML',
        promptArgs: {
          SCRIPT_PATH: `${RESOURCE_DIR}/scripts/validate-swiss-deck.mjs`,
          HTML_PATH: '{{STEP_GENERATE_DECK_DATA.html_path}}',
        },
        dependsOn: ['generate_deck'],
        onFailure: 'retry',
        maxRetries: 1,
      },
      {
        id: 'generate_images',
        type: 'single',
        agentId: 'agent-ppt-image-gen',
        prompt: '{{STEP_PLAN_STRUCTURE_DATA.image_slots}}',
        promptArgs: {
          PROMPT: '为网页 PPT 生成配图，风格：{{STEP_CLARIFY_DATA.style}}，主题：{{TOPIC}}',
          SIZE: '1792x1024',
        },
        dependsOn: ['generate_deck'],
        onFailure: 'skip',
      },
      {
        id: 'assemble',
        type: 'single',
        agentId: 'agent-ppt-assemble',
        prompt: '将配图插入 HTML 并做最终自检：\n\n生成的 HTML：{{STEP_GENERATE_DECK_DATA}}\n配图结果：{{STEP_GENERATE_IMAGES_DATA}}\n校验结果：{{STEP_VALIDATE_DATA}}',
        dependsOn: ['validate', 'generate_images'],
        onFailure: 'retry',
        maxRetries: 1,
        output: { tag: 'data', parseJson: true },
      },
    ],
    git: { enabled: false, baseBranch: 'main', autoMerge: false },
  } satisfies import('../lib/pipeline/types').PipelineConfig),
}

async function seed() {
  console.log('Seeding PPT pipeline agents...')
  for (const agent of PPT_AGENTS) {
    await db.insert(agents).values({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      personality: agent.personality,
      systemPrompt: agent.systemPrompt,
      provider: agent.provider,
      modelId: agent.modelId,
      type: agent.type,
      config: agent.config,
    }).onConflictDoUpdate({
      target: agents.id,
      set: {
        name: agent.name,
        role: agent.role,
        systemPrompt: agent.systemPrompt,
        provider: agent.provider,
        type: agent.type,
        config: agent.config,
      },
    })
    console.log(`  ✓ ${agent.name}`)
  }

  console.log('Seeding PPT pipeline...')
  await db.insert(pipelines).values({
    id: PPT_PIPELINE.id,
    name: PPT_PIPELINE.name,
    description: PPT_PIPELINE.description,
    config: PPT_PIPELINE.config,
  }).onConflictDoUpdate({
    target: pipelines.id,
    set: {
      name: PPT_PIPELINE.name,
      description: PPT_PIPELINE.description,
      config: PPT_PIPELINE.config,
    },
  })
  console.log(`  ✓ ${PPT_PIPELINE.name}`)

  console.log('\nDone! 请在 UI 中编辑 image-gen Agent 配置填入真实 API Key。')
}

seed().catch(console.error)
