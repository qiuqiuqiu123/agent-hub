import { spawn } from 'child_process'
import { db } from '@/db'
import { agents, pipelineRuns, pipelineStepRuns, skills, agentSkills } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'
import { getProvider } from '@/lib/providers'
import type { ProviderEvent } from '@/lib/providers'
import { resolvePrompt } from './prompt-template'
import { createRunBranch, collectCommits, mergeBack, cleanupBranch, isGitRepo } from './git-strategy'
import type { PipelineConfig, PipelineStep, SingleStep, StepResult, OutputExtraction } from './types'

const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟
const DEFAULT_COMPLETION_SIGNAL = '<done>COMPLETE</done>'

export interface RunPipelineOptions {
  pipelineId: string
  pipelineName: string
  config: PipelineConfig
  workDir: string
  signal?: AbortSignal
  onStepStart?: (stepId: string) => void
  onStepComplete?: (stepId: string, result: StepResult) => void
}

export async function runPipeline(options: RunPipelineOptions): Promise<string> {
  const { pipelineId, pipelineName, config, workDir, signal, onStepStart, onStepComplete } = options

  const runId = generateId()
  let branch: string | null = null
  let baseSha: string | null = null

  // Git 分支策略
  if (config.git.enabled && isGitRepo(workDir)) {
    const branchInfo = createRunBranch(workDir, pipelineName, config.git.baseBranch)
    branch = branchInfo.branch
    baseSha = branchInfo.baseSha
  }

  await db.insert(pipelineRuns).values({
    id: runId,
    pipelineId,
    status: 'running',
    branch,
    baseSha,
    startedAt: new Date(),
  })

  try {
    const results = new Map<string, StepResult>()
    const sortedSteps = topologicalSort(config.steps)

    for (const step of sortedSteps) {
      if (signal?.aborted) {
        throw new Error('Pipeline cancelled')
      }

      // 检查依赖
      const deps = step.dependsOn || []
      const depsOk = deps.every(d => results.get(d)?.status === 'completed')
      if (!depsOk) {
        const skipResult: StepResult = { stepId: step.id, status: 'skipped', output: '', commits: [] }
        results.set(step.id, skipResult)
        continue
      }

      onStepStart?.(step.id)

      if (step.type === 'parallel') {
        const subResults = await Promise.allSettled(
          step.steps.map(sub => executeStep(runId, { ...sub, type: 'single', dependsOn: [] }, workDir, results, signal))
        )
        for (let i = 0; i < subResults.length; i++) {
          const sub = step.steps[i]
          const settled = subResults[i]
          const result: StepResult = settled.status === 'fulfilled'
            ? settled.value
            : { stepId: sub.id, status: 'failed', output: '', commits: [], error: (settled.reason as Error).message }
          results.set(sub.id, result)
          onStepComplete?.(sub.id, result)
        }
        const allSubOk = step.steps.every(s => results.get(s.id)?.status === 'completed')
        results.set(step.id, {
          stepId: step.id,
          status: allSubOk ? 'completed' : 'failed',
          output: '',
          commits: step.steps.flatMap(s => results.get(s.id)?.commits || []),
        })
      } else {
        const result = await executeStep(runId, step, workDir, results, signal)
        results.set(step.id, result)
        onStepComplete?.(step.id, result)
      }
    }

    // 收集 commits 并处理合并
    const hasFailure = Array.from(results.values()).some(r => r.status === 'failed')

    if (config.git.enabled && branch && baseSha && !hasFailure && config.git.autoMerge) {
      mergeBack(workDir, config.git.baseBranch, branch)
      cleanupBranch(workDir, branch)
    }

    await db.update(pipelineRuns)
      .set({
        status: hasFailure ? 'failed' : 'completed',
        completedAt: new Date(),
      })
      .where(eq(pipelineRuns.id, runId))

    return runId
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db.update(pipelineRuns)
      .set({ status: 'failed', error, completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))
    return runId
  }
}

async function executeStep(
  runId: string,
  step: SingleStep,
  workDir: string,
  previousResults: Map<string, StepResult>,
  signal?: AbortSignal,
): Promise<StepResult> {
  const stepRunId = generateId()

  // 获取 agent
  const [agent] = await db.select().from(agents).where(eq(agents.id, step.agentId))
  if (!agent) {
    return { stepId: step.id, status: 'failed', output: '', commits: [], error: `Agent ${step.agentId} not found` }
  }

  // 构建 prompt args
  const args: Record<string, string> = { ...step.promptArgs }
  args.WORK_DIR = workDir
  for (const [id, result] of previousResults) {
    args[`STEP_${id.toUpperCase()}_OUTPUT`] = result.output || ''
    // 注入 structured output
    if (result.structuredOutput) {
      args[`STEP_${id.toUpperCase()}_DATA`] = JSON.stringify(result.structuredOutput)
    }
  }

  const resolvedPrompt = resolvePrompt(step.prompt, args)

  // 获取 agent skills
  const agentSkillRows = await db
    .select({ skill: skills })
    .from(agentSkills)
    .innerJoin(skills, eq(agentSkills.skillId, skills.id))
    .where(eq(agentSkills.agentId, agent.id))

  const skillsContext = agentSkillRows.length > 0
    ? `\n\n可用技能:\n${agentSkillRows.map(r => `- ${r.skill.name}: ${r.skill.description}`).join('\n')}`
    : ''

  const systemPrompt = `你是 ${agent.name}。角色: ${agent.role}。性格: ${agent.personality}。${agent.systemPrompt || ''}${skillsContext}`

  // Session 恢复：从前序 step 获取 sessionId
  let sessionId: string | undefined
  if (step.resumeFrom) {
    const prevResult = previousResults.get(step.resumeFrom)
    if (prevResult?.sessionId) {
      sessionId = prevResult.sessionId
    }
  }

  // 记录 step run
  await db.insert(pipelineStepRuns).values({
    id: stepRunId,
    runId,
    stepId: step.id,
    agentId: agent.id,
    status: 'running',
    prompt: resolvedPrompt,
    startedAt: new Date(),
  })

  // Multi-iteration 循环
  const maxIterations = step.maxIterations || 1
  const completionSignal = step.completionSignal || DEFAULT_COMPLETION_SIGNAL
  let totalOutput = ''
  let currentSessionId = sessionId
  let iterations = 0

  for (let i = 0; i < maxIterations; i++) {
    if (signal?.aborted) {
      break
    }
    iterations++

    const iterResult = await executeOnce(agent, resolvedPrompt, systemPrompt, workDir, currentSessionId, completionSignal, signal)

    totalOutput += iterResult.output
    if (iterResult.sessionId) {
      currentSessionId = iterResult.sessionId
    }

    // 检查完成信号
    if (iterResult.completed || iterResult.status === 'failed') {
      break
    }

    // 非最后一轮，继续迭代（prompt 可以包含"继续"指令）
    if (i < maxIterations - 1) {
      // 后续迭代使用 session 恢复，prompt 简化为"继续"
    }
  }

  // Structured Output 提取
  let structuredOutput: unknown = undefined
  if (step.output) {
    structuredOutput = extractStructuredOutput(totalOutput, step.output)
  }

  const finalStatus = signal?.aborted ? 'failed' : 'completed'
  const error = signal?.aborted ? 'Cancelled' : undefined

  await db.update(pipelineStepRuns)
    .set({ status: finalStatus, output: totalOutput, error, completedAt: new Date() })
    .where(eq(pipelineStepRuns.id, stepRunId))

  return {
    stepId: step.id,
    status: finalStatus as 'completed' | 'failed',
    output: totalOutput,
    structuredOutput,
    sessionId: currentSessionId,
    commits: [],
    iterations,
    error,
  }
}

interface IterationResult {
  output: string
  sessionId?: string
  completed: boolean  // 是否检测到完成信号
  status: 'completed' | 'failed'
}

async function executeOnce(
  agent: typeof agents.$inferSelect,
  prompt: string,
  systemPrompt: string,
  workDir: string,
  sessionId: string | undefined,
  completionSignal: string,
  signal?: AbortSignal,
): Promise<IterationResult> {
  const provider = getProvider(agent.provider)
  const { command, args: cmdArgs, env: providerEnv } = provider.buildCommand({
    prompt,
    systemPrompt,
    model: agent.modelId || undefined,
    apiKey: agent.apiKey || undefined,
    baseUrl: agent.baseUrl || undefined,
    workDir,
    sessionId,
  })

  return new Promise<IterationResult>((resolve) => {
    const env = { ...process.env, ...providerEnv } as NodeJS.ProcessEnv
    const proc = spawn(command, cmdArgs, { cwd: workDir, env, stdio: ['pipe', 'pipe', 'pipe'] })
    proc.stdin.end()

    let output = ''
    let capturedSessionId: string | undefined
    let completed = false
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        proc.kill('SIGTERM')
        finish('failed')
      }, IDLE_TIMEOUT_MS)
    }

    const abortHandler = () => {
      proc.kill('SIGTERM')
      finish('failed')
    }
    signal?.addEventListener('abort', abortHandler, { once: true })

    resetIdle()

    let buffer = ''
    proc.stdout.on('data', (data: Buffer) => {
      resetIdle()
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const events = provider.parseOutputLine(line)
        for (const evt of events) {
          handleEvent(evt)
        }
      }
    })

    proc.stderr.on('data', () => { resetIdle() })

    function handleEvent(evt: ProviderEvent) {
      switch (evt.type) {
        case 'text':
        case 'result':
          output += evt.content
          // 检查完成信号
          if (output.includes(completionSignal)) {
            completed = true
          }
          break
        case 'session_id':
          capturedSessionId = evt.id
          break
      }
    }

    let finished = false
    function finish(status: 'completed' | 'failed') {
      if (finished) return
      finished = true
      if (idleTimer) clearTimeout(idleTimer)
      signal?.removeEventListener('abort', abortHandler)
      resolve({ output, sessionId: capturedSessionId, completed, status })
    }

    proc.on('close', (code) => {
      if (buffer.trim()) {
        const events = provider.parseOutputLine(buffer)
        for (const evt of events) { handleEvent(evt) }
      }
      finish(code === 0 ? 'completed' : 'failed')
    })

    proc.on('error', () => { finish('failed') })
  })
}

/**
 * 从输出中提取 XML tag 包裹的结构化数据
 */
function extractStructuredOutput(output: string, extraction: OutputExtraction): unknown {
  const { tag, parseJson } = extraction
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const match = output.match(regex)
  if (!match) return undefined

  const content = match[1].trim()
  if (parseJson) {
    try {
      return JSON.parse(content)
    } catch {
      return content
    }
  }
  return content
}

/**
 * 拓扑排序
 */
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

  for (const step of steps) {
    visit(step)
  }

  return sorted
}
