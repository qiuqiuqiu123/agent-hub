/**
 * 拆分 PPT Pipeline 为两段：生成段 + 增强段
 * 运行: npx tsx src/db/seed-ppt-pipeline-split.ts
 */
import { db } from './index'
import { pipelines } from './schema'

const RESOURCE_DIR = 'src/resources/ppt-skill'

// Pipeline A: 生成段（需求分析 → 内容策划 → HTML 生成 → 校验）
const PPT_GENERATE_PIPELINE = {
  id: 'ppt-generate',
  name: 'PPT 生成（第一阶段）',
  description: '需求澄清 → 版式规划 → HTML 生成 → 校验。用户预览确认后再触发配图组装。',
  config: JSON.stringify({
    version: '1',
    input: {
      TOPIC: { type: 'string', required: true, default: '', description: '主题/内容描述' },
      STYLE: { type: 'string', required: false, default: '', description: '风格: A(电子杂志) / B(瑞士国际主义)' },
      THEME: { type: 'string', required: false, default: '', description: '主题色名称' },
      PAGE_COUNT: { type: 'string', required: false, default: '8', description: '目标页数' },
      AUDIENCE: { type: 'string', required: false, default: '', description: '受众/场景' },
      UPLOADS_DIR: { type: 'string', required: false, default: '', description: '用户上传文件目录' },
    },
    steps: [
      {
        id: 'clarify',
        type: 'single',
        agentId: 'agent-ppt-clarify',
        prompt: '分析以下主题，输出结构化需求：\n\n主题：{{TOPIC}}\n风格偏好：{{STYLE}}\n主题色偏好：{{THEME}}\n目标页数：{{PAGE_COUNT}}\n受众：{{AUDIENCE}}\n\n用户上传的参考文件目录：{{UPLOADS_DIR}}（如果有文件请先读取参考）',
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
        onFailure: 'skip',
      },
    ],
    git: { enabled: false, baseBranch: 'main', autoMerge: false },
  }),
}

// Pipeline B: 增强段（配图生成 → 最终组装）
const PPT_ENHANCE_PIPELINE = {
  id: 'ppt-enhance',
  name: 'PPT 增强（第二阶段）',
  description: '配图生成 → 最终组装。接收第一阶段的 HTML 输出，添加 AI 配图。',
  config: JSON.stringify({
    version: '1',
    input: {
      HTML_CONTENT: { type: 'string', required: true, default: '', description: '第一阶段生成的 HTML 内容' },
      STYLE: { type: 'string', required: false, default: 'B', description: '风格' },
      TOPIC: { type: 'string', required: true, default: '', description: '主题' },
      IMAGE_SLOTS: { type: 'string', required: false, default: '', description: '需要配图的位置描述' },
      FEEDBACK: { type: 'string', required: false, default: '', description: '用户对配图的修改意见（用于迭代优化）' },
    },
    steps: [
      {
        id: 'generate_images',
        type: 'single',
        agentId: 'agent-ppt-image-gen',
        prompt: '为以下 PPT 生成配图：\n\n主题：{{TOPIC}}\n风格：{{STYLE}}\n配图位置：{{IMAGE_SLOTS}}\n{{#if FEEDBACK}}\n## 用户修改意见\n\n{{FEEDBACK}}\n\n请结合以上反馈调整配图方案。\n{{/if}}',
        promptArgs: {
          PROMPT: '为网页 PPT 生成配图，风格：{{STYLE}}，主题：{{TOPIC}}',
          SIZE: '1792x1024',
        },
        onFailure: 'skip',
      },
      {
        id: 'assemble',
        type: 'single',
        agentId: 'agent-ppt-assemble',
        prompt: '将配图插入 HTML 并做最终自检：\n\nHTML 内容：{{HTML_CONTENT}}\n配图结果：{{STEP_GENERATE_IMAGES_DATA}}',
        dependsOn: ['generate_images'],
        onFailure: 'retry',
        maxRetries: 1,
        output: { tag: 'data', parseJson: true },
      },
    ],
    git: { enabled: false, baseBranch: 'main', autoMerge: false },
  }),
}

async function seed() {
  console.log('Seeding split PPT pipelines...')

  for (const pipeline of [PPT_GENERATE_PIPELINE, PPT_ENHANCE_PIPELINE]) {
    await db.insert(pipelines).values({
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      config: pipeline.config,
    }).onConflictDoUpdate({
      target: pipelines.id,
      set: {
        name: pipeline.name,
        description: pipeline.description,
        config: pipeline.config,
      },
    })
    console.log(`  ✓ ${pipeline.id}: ${pipeline.name}`)
  }

  console.log('Done!')
}

seed().catch(console.error)
