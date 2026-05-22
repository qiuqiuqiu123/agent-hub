/**
 * 预设 Agents 和 Pipelines 种子数据
 * 运行: npx tsx src/db/seed.ts
 */
import { db } from './index'
import { agents, pipelines } from './schema'
import { eq } from 'drizzle-orm'
import { generateId } from '../lib/constants'

const SEED_AGENTS = [
  {
    id: 'agent-architect',
    name: 'Architect',
    role: '系统架构师',
    personality: '全局视野、注重可扩展性和简洁性，善于权衡取舍',
    systemPrompt: '你是一个资深系统架构师。分析需求后输出清晰的技术方案，包括模块划分、接口设计、数据流。用 <plan>JSON</plan> 格式输出结构化方案。',
    provider: 'claude',
    modelId: '',
  },
  {
    id: 'agent-implementer',
    name: 'Implementer',
    role: '全栈开发工程师',
    personality: '高效务实、代码简洁、测试驱动',
    systemPrompt: '你是一个全栈开发工程师。根据给定的技术方案编写代码实现。遵循 TDD：先写测试再实现。完成所有任务后输出 <done>COMPLETE</done>。',
    provider: 'claude',
    modelId: '',
  },
  {
    id: 'agent-reviewer',
    name: 'Reviewer',
    role: '代码审查专家',
    personality: '严谨细致、关注安全和性能、给出可操作的改进建议',
    systemPrompt: '你是一个代码审查专家。审查代码变更，关注：安全漏洞、性能问题、可维护性、边界情况。输出格式：每个问题一行，severity: CRITICAL/HIGH/MEDIUM/LOW。',
    provider: 'claude',
    modelId: '',
  },
  {
    id: 'agent-tester',
    name: 'Tester',
    role: '测试工程师',
    personality: '追求覆盖率、善于发现边界情况、自动化优先',
    systemPrompt: '你是一个测试工程师。为给定代码编写全面的测试用例，包括单元测试、集成测试和边界情况。目标覆盖率 80%+。完成后输出 <done>COMPLETE</done>。',
    provider: 'claude',
    modelId: '',
  },
  {
    id: 'agent-devops',
    name: 'DevOps',
    role: 'DevOps 工程师',
    personality: '自动化一切、关注可靠性和可观测性',
    systemPrompt: '你是一个 DevOps 工程师。负责 CI/CD 配置、Docker 化、部署脚本、监控告警设置。输出可直接执行的配置文件和脚本。',
    provider: 'claude',
    modelId: '',
  },
]

const SEED_PIPELINES = [
  {
    id: 'pipeline-feature',
    name: 'Feature Development',
    description: '完整功能开发流水线：架构设计 → 实现 → 审查 → 测试',
    config: JSON.stringify({
      steps: [
        {
          id: 'design',
          type: 'single',
          agentId: 'agent-architect',
          prompt: '分析以下需求并输出技术方案：\n\n{{TASK}}\n\n用 <plan>{"modules": [...], "interfaces": [...], "dataFlow": "..."}</plan> 格式输出。',
          promptArgs: { TASK: '' },
          output: { tag: 'plan', parseJson: true },
        },
        {
          id: 'implement',
          type: 'single',
          agentId: 'agent-implementer',
          prompt: '根据以下技术方案实现代码：\n\n{{STEP_DESIGN_DATA}}\n\n完成后输出 <done>COMPLETE</done>',
          dependsOn: ['design'],
          maxIterations: 3,
          completionSignal: '<done>COMPLETE</done>',
        },
        {
          id: 'review',
          type: 'single',
          agentId: 'agent-reviewer',
          prompt: '审查当前分支的代码变更。重点关注安全性和性能。',
          dependsOn: ['implement'],
          resumeFrom: 'implement',
        },
        {
          id: 'test',
          type: 'single',
          agentId: 'agent-tester',
          prompt: '为当前变更编写测试用例，目标覆盖率 80%+。完成后输出 <done>COMPLETE</done>',
          dependsOn: ['review'],
          maxIterations: 2,
          completionSignal: '<done>COMPLETE</done>',
        },
      ],
      git: { enabled: true, baseBranch: 'main', autoMerge: false },
    }),
  },
  {
    id: 'pipeline-bugfix',
    name: 'Bug Fix',
    description: '快速修复流水线：复现 → 修复 → 验证',
    config: JSON.stringify({
      steps: [
        {
          id: 'reproduce',
          type: 'single',
          agentId: 'agent-tester',
          prompt: '分析以下 bug 报告，编写一个能复现该 bug 的测试用例：\n\n{{BUG_DESCRIPTION}}\n\n完成后输出 <done>COMPLETE</done>',
          promptArgs: { BUG_DESCRIPTION: '' },
          maxIterations: 2,
          completionSignal: '<done>COMPLETE</done>',
        },
        {
          id: 'fix',
          type: 'single',
          agentId: 'agent-implementer',
          prompt: '修复 bug。确保之前编写的复现测试通过。完成后输出 <done>COMPLETE</done>',
          dependsOn: ['reproduce'],
          resumeFrom: 'reproduce',
          maxIterations: 3,
          completionSignal: '<done>COMPLETE</done>',
        },
        {
          id: 'verify',
          type: 'single',
          agentId: 'agent-reviewer',
          prompt: '验证修复：1) 复现测试通过 2) 无回归 3) 修复方案合理',
          dependsOn: ['fix'],
          resumeFrom: 'fix',
        },
      ],
      git: { enabled: true, baseBranch: 'main', autoMerge: true },
    }),
  },
  {
    id: 'pipeline-parallel-impl',
    name: 'Parallel Implementation',
    description: '规划 → 并行实现 → 合并审查',
    config: JSON.stringify({
      steps: [
        {
          id: 'plan',
          type: 'single',
          agentId: 'agent-architect',
          prompt: '将以下需求拆分为可并行实现的独立模块：\n\n{{TASK}}\n\n输出 <plan>{"tasks": [{"id": "...", "title": "...", "description": "..."}]}</plan>',
          promptArgs: { TASK: '' },
          output: { tag: 'plan', parseJson: true },
        },
        {
          id: 'parallel-impl',
          type: 'parallel',
          steps: [
            {
              id: 'impl-frontend',
              agentId: 'agent-implementer',
              prompt: '实现前端部分。方案：{{STEP_PLAN_DATA}}\n\n完成后输出 <done>COMPLETE</done>',
              maxIterations: 3,
              completionSignal: '<done>COMPLETE</done>',
            },
            {
              id: 'impl-backend',
              agentId: 'agent-implementer',
              prompt: '实现后端部分。方案：{{STEP_PLAN_DATA}}\n\n完成后输出 <done>COMPLETE</done>',
              maxIterations: 3,
              completionSignal: '<done>COMPLETE</done>',
            },
          ],
          dependsOn: ['plan'],
        },
        {
          id: 'integration-review',
          type: 'single',
          agentId: 'agent-reviewer',
          prompt: '审查前后端集成：接口一致性、数据流正确性、错误处理完整性。',
          dependsOn: ['parallel-impl'],
        },
      ],
      git: { enabled: true, baseBranch: 'main', autoMerge: false },
    }),
  },
  {
    id: 'pipeline-refactor',
    name: 'Safe Refactor',
    description: '安全重构：测试覆盖 → 重构 → 验证测试通过',
    config: JSON.stringify({
      steps: [
        {
          id: 'add-tests',
          type: 'single',
          agentId: 'agent-tester',
          prompt: '为以下模块添加测试覆盖（不修改实现代码）：\n\n{{TARGET}}\n\n确保现有行为被测试覆盖。完成后输出 <done>COMPLETE</done>',
          promptArgs: { TARGET: '' },
          maxIterations: 2,
          completionSignal: '<done>COMPLETE</done>',
        },
        {
          id: 'refactor',
          type: 'single',
          agentId: 'agent-implementer',
          prompt: '重构目标模块：{{REFACTOR_GOAL}}\n\n约束：所有现有测试必须继续通过。完成后输出 <done>COMPLETE</done>',
          promptArgs: { REFACTOR_GOAL: '' },
          dependsOn: ['add-tests'],
          resumeFrom: 'add-tests',
          maxIterations: 3,
          completionSignal: '<done>COMPLETE</done>',
        },
        {
          id: 'verify-tests',
          type: 'single',
          agentId: 'agent-tester',
          prompt: '运行所有测试，确认重构未引入回归。如有失败，列出失败用例和原因。',
          dependsOn: ['refactor'],
          resumeFrom: 'refactor',
        },
      ],
      git: { enabled: true, baseBranch: 'main', autoMerge: false },
    }),
  },
]

async function seed() {
  console.log('Seeding agents...')
  for (const agent of SEED_AGENTS) {
    const existing = await db.select().from(agents).where(eq(agents.id, agent.id))
    if (existing.length === 0) {
      await db.insert(agents).values({
        ...agent,
        apiKey: '',
        baseUrl: '',
        workDir: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      console.log(`  + ${agent.name}`)
    } else {
      console.log(`  = ${agent.name} (exists)`)
    }
  }

  console.log('Seeding pipelines...')
  for (const pipeline of SEED_PIPELINES) {
    const existing = await db.select().from(pipelines).where(eq(pipelines.id, pipeline.id))
    if (existing.length === 0) {
      await db.insert(pipelines).values({
        ...pipeline,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      console.log(`  + ${pipeline.name}`)
    } else {
      console.log(`  = ${pipeline.name} (exists)`)
    }
  }

  console.log('Done!')
}

seed().catch(console.error)
