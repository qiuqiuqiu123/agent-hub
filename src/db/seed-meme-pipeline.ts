/**
 * 热梗漫画 Pipeline 种子数据
 * 运行: npx tsx src/db/seed-meme-pipeline.ts
 */
import { db } from './index'
import { agents, pipelines } from './schema'
import { generateId } from '../lib/constants'

const MEME_AGENTS = [
  {
    id: 'agent-meme-collector',
    name: '热梗收集器',
    role: '网络热梗搜索员',
    personality: '敏锐、紧跟潮流、善于发现有趣内容',
    systemPrompt: `你是一个网络热梗搜索专家。搜索最近 24 小时内的网络热梗、热门话题和有趣事件。
要求：
1. 使用 web_search 工具搜索微博热搜、抖音热点、B站热门等
2. 收集 5-10 个有漫画创作潜力的热梗
3. 用 <data>JSON</data> 格式输出，包含：title, source, description, humor_point`,
    provider: 'claude',
    modelId: '',
    type: 'ai' as const,
    config: '{}',
  },
  {
    id: 'agent-meme-planner',
    name: '漫画策划',
    role: '创意策划师',
    personality: '幽默感强、善于将热点转化为视觉故事',
    systemPrompt: `你是一个漫画创意策划师。从热梗列表中选出最适合做四格漫画的 1 个话题，写出漫画脚本。
要求：
1. 选择最有视觉表现力和幽默感的热梗
2. 设计 4 格漫画的分镜脚本
3. 为每格写出详细的画面描述（英文，用于 AI 绘图 prompt）
4. 写出配套的公众号标题和摘要

用 <data>JSON</data> 格式输出：
{
  "selected_meme": "选中的热梗标题",
  "title": "公众号文章标题",
  "digest": "文章摘要（20字内）",
  "panels": [
    {"panel": 1, "description": "中文场景描述"},
    {"panel": 2, "description": "中文场景描述"},
    {"panel": 3, "description": "中文场景描述"},
    {"panel": 4, "description": "中文场景描述"}
  ],
  "combined_image_prompt": "四格漫画，2x2布局，中文气泡文字。[热梗主题的搞笑故事]。格1:[场景描述，对话]。格2:[场景描述，对话]。格3:[场景描述，对话]。格4:[场景描述，对话]。日系漫画风格，彩色，搞笑表情。"
}`,
    provider: 'claude',
    modelId: '',
    type: 'ai' as const,
    config: '{}',
  },
  {
    id: 'agent-image-gen',
    name: '漫画生成器',
    role: '图片生成',
    personality: '',
    systemPrompt: '',
    provider: 'image-gen',
    modelId: '',
    type: 'tool' as const,
    config: JSON.stringify({
      apiKey: 'sk-S6dMnkynh87xNpEs1pBvpUvI0KyYXMrK16aZ7NiuBqmRrg3F',
      baseUrl: 'https://xiaomuai.cn/v1',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'high',
    }),
  },
  {
    id: 'agent-meme-formatter',
    name: '排版编辑',
    role: '公众号排版编辑',
    personality: '审美在线、排版精致、文案有趣',
    systemPrompt: `你是一个公众号排版编辑。根据漫画脚本组织成一篇精美的公众号图文。
要求：
1. 输出完整的 HTML 正文（微信公众号兼容格式）
2. 在正文中用 {{IMAGE_URL}} 作为图片占位符（系统会自动替换为真实图片URL）
3. 图片前后配上简短有趣的文字说明
4. 底部加上 #热梗漫画 标签和引导关注文案

用 <data>JSON</data> 格式输出：
{
  "title": "文章标题（吸引眼球，带热梗关键词）",
  "content": "<section>...{{IMAGE_URL}}...</section>",
  "digest": "摘要（20字内，引发好奇）"
}`,
    provider: 'claude',
    modelId: '',
    type: 'ai' as const,
    config: '{}',
  },
  {
    id: 'agent-wechat-mp',
    name: '公众号发布',
    role: '公众号发布',
    personality: '',
    systemPrompt: '',
    provider: 'wechat-mp',
    modelId: '',
    type: 'tool' as const,
    config: JSON.stringify({
      appId: 'wxa56d85da1b988129',
      appSecret: '7c861b5d940c67fbb168f2af18dbedfd',
    }),
  },
]

const MEME_PIPELINE = {
  id: 'pipeline-meme-comic',
  name: '热梗漫画自动生成',
  description: '收集热梗 → 策划脚本 → 生成漫画 → 排版 → 发布公众号草稿箱',
  config: JSON.stringify({
    version: '1',
    input: {
      TOPIC_HINT: { type: 'string', required: false, default: '', description: '可选：指定搜索方向' },
    },
    steps: [
      {
        id: 'collect',
        type: 'single',
        agentId: 'agent-meme-collector',
        prompt: '搜索今天的网络热梗。{{TOPIC_HINT}}',
        output: { tag: 'data', parseJson: true },
      },
      {
        id: 'plan',
        type: 'single',
        agentId: 'agent-meme-planner',
        prompt: '从以下热梗中选择最适合做漫画的，写出四格漫画脚本：\n\n{{STEP_COLLECT_DATA}}',
        dependsOn: ['collect'],
        output: { tag: 'data', parseJson: true },
      },
      {
        id: 'generate_images',
        type: 'single',
        agentId: 'agent-image-gen',
        prompt: '{{STEP_PLAN_DATA.combined_image_prompt}}',
        promptArgs: { PROMPT: '{{STEP_PLAN_DATA.combined_image_prompt}}' },
        dependsOn: ['plan'],
        onFailure: 'retry',
        maxRetries: 2,
      },
      {
        id: 'format',
        type: 'single',
        agentId: 'agent-meme-formatter',
        prompt: '漫画脚本：{{STEP_PLAN_DATA}}\n\n图片生成步骤已完成，正文中请继续使用 {{IMAGE_URL}} 作为图片占位符，系统发布时会替换为真实微信图片地址。不要在正文中直接嵌入 base64。\n\n请排版成公众号图文。',
        dependsOn: ['generate_images'],
        output: { tag: 'data', parseJson: true },
      },
      {
        id: 'publish',
        type: 'single',
        agentId: 'agent-wechat-mp',
        prompt: '发布到公众号草稿箱',
        promptArgs: {
          TITLE: '{{STEP_FORMAT_DATA.title}}',
          CONTENT: '{{STEP_FORMAT_DATA.content}}',
          THUMB_URL: 'https://picsum.photos/1024/1024',
          IMAGE_BASE64: '{{STEP_GENERATE_IMAGES_DATA.b64_json}}',
          SKIP_CONTENT_IMAGE_UPLOAD: 'true',
          DIGEST: '{{STEP_FORMAT_DATA.digest}}',
        },
        dependsOn: ['format'],
      },
    ],
    git: { enabled: false, baseBranch: 'main', autoMerge: false },
  } satisfies import('../lib/pipeline/types').PipelineConfig),
}

async function seed() {
  console.log('Seeding meme pipeline agents...')
  for (const agent of MEME_AGENTS) {
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

  console.log('Seeding meme pipeline...')
  await db.insert(pipelines).values({
    id: MEME_PIPELINE.id,
    name: MEME_PIPELINE.name,
    description: MEME_PIPELINE.description,
    config: MEME_PIPELINE.config,
  }).onConflictDoUpdate({
    target: pipelines.id,
    set: {
      name: MEME_PIPELINE.name,
      description: MEME_PIPELINE.description,
      config: MEME_PIPELINE.config,
    },
  })
  console.log(`  ✓ ${MEME_PIPELINE.name}`)

  console.log('\nDone! 请在 UI 中编辑 Agent 配置填入真实 API Key。')
}

seed().catch(console.error)
