import { spawn } from 'child_process'
import { db } from '@/db'
import { agents, pipelineRuns, pipelineStepRuns, skills, agentSkills } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'
import { getProvider, getToolProvider } from '@/lib/providers'
import type { ProviderEvent } from '@/lib/providers'
import { resolvePrompt } from './prompt-template'
import { createRunBranch, mergeBack, cleanupBranch, isGitRepo } from './git-strategy'
import type { PipelineConfig, PipelineStep, SingleStep, ConditionStep, StepResult, OutputExtraction } from './types'

const IDLE_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_COMPLETION_SIGNAL = '<done>COMPLETE</done>'
const MAX_PROMPT_CONTEXT_CHARS = 2000

// Module-level progress callback for current step
let _currentProgressCb: ((tokens: { inputTokens: number; outputTokens: number }) => void) | null = null

export interface RunPipelineOptions {
  pipelineId: string
  pipelineName: string
  config: PipelineConfig
  workDir: string
  input?: Record<string, string>  // 外部注入的 input 参数
  signal?: AbortSignal
  onRunStart?: (runId: string) => void
  onStepStart?: (stepId: string) => void
  onStepProgress?: (stepId: string, tokens: { inputTokens: number; outputTokens: number }) => void
  onStepComplete?: (stepId: string, result: StepResult) => void
  onRunComplete?: (runId: string, status: 'completed' | 'failed', error?: string) => void
}

export async function runPipeline(options: RunPipelineOptions): Promise<string> {
  const { pipelineId, pipelineName, config, workDir, input, signal, onRunStart, onStepStart, onStepProgress, onStepComplete, onRunComplete } = options

  const runId = generateId()
  let branch: string | null = null
  let baseSha: string | null = null

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
  onRunStart?.(runId)

  try {
    const results = new Map<string, StepResult>()
    const sortedSteps = topologicalSort(config.steps)

    // 合并 pipeline input 默认值和外部注入
    const pipelineInput: Record<string, string> = {}
    if (config.input) {
      for (const [key, param] of Object.entries(config.input)) {
        if (param.default !== undefined) pipelineInput[key] = param.default
      }
    }
    if (input) {
      Object.assign(pipelineInput, input)
    }

    // 跟踪 condition 激活的 step
    const activatedByCondition = new Set<string>()
    // 所有被 condition 管理的 step（初始不激活）
    const conditionManagedSteps = new Set<string>()
    for (const step of config.steps) {
      if (step.type === 'condition') {
        for (const targets of Object.values(step.branches)) {
          targets.forEach(id => conditionManagedSteps.add(id))
        }
      }
    }

    for (const step of sortedSteps) {
      if (signal?.aborted) {
        throw new Error('Pipeline cancelled')
      }

      // condition 管理的 step 未被激活则跳过
      if (conditionManagedSteps.has(step.id) && !activatedByCondition.has(step.id)) {
        const skipResult: StepResult = { stepId: step.id, status: 'skipped', output: '', commits: [] }
        results.set(step.id, skipResult)
        continue
      }

      // 检查依赖
      const deps = step.dependsOn || []
      const depsOk = deps.every(d => {
        const r = results.get(d)
        return r ? isDependencySatisfied(r) : false
      })
      if (!depsOk) {
        const skipResult: StepResult = { stepId: step.id, status: 'skipped', output: '', commits: [], error: 'Dependency not completed' }
        results.set(step.id, skipResult)
        continue
      }

      onStepStart?.(step.id)

      if (step.type === 'condition') {
        const condResult = executeCondition(step, results, pipelineInput)
        results.set(step.id, condResult)
        // 激活匹配的分支 step
        if (condResult.structuredOutput && Array.isArray(condResult.structuredOutput)) {
          (condResult.structuredOutput as string[]).forEach(id => activatedByCondition.add(id))
        }
        onStepComplete?.(step.id, condResult)
      } else if (step.type === 'parallel') {
        const subResults = await Promise.allSettled(
          step.steps.map(sub => executeStep(runId, { ...sub, type: 'single', dependsOn: [] }, workDir, results, pipelineInput, signal))
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
        _currentProgressCb = (tokens) => onStepProgress?.(step.id, tokens)
        const result = await executeStepWithRetry(runId, step, workDir, results, pipelineInput, signal)
        _currentProgressCb = null
        results.set(step.id, result)
        onStepComplete?.(step.id, result)

        // 失败策略：stop 时中断整个 pipeline
        if (result.status === 'failed' && (step.onFailure || 'stop') === 'stop') {
          throw new Error(`Step ${step.id} failed: ${result.error || 'unknown'}`)
        }
      }
    }

    const hasFailure = Array.from(results.values()).some(r => r.status === 'failed')

    if (config.git.enabled && branch && baseSha && !hasFailure && config.git.autoMerge) {
      mergeBack(workDir, config.git.baseBranch, branch)
      cleanupBranch(workDir, branch)
    }

    await db.update(pipelineRuns)
      .set({ status: hasFailure ? 'failed' : 'completed', completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))

    onRunComplete?.(runId, hasFailure ? 'failed' : 'completed')

    return runId
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db.update(pipelineRuns)
      .set({ status: 'failed', error, completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))
    onRunComplete?.(runId, 'failed', error)
    return runId
  }
}

// --- Condition 路由 ---

function executeCondition(
  step: ConditionStep,
  results: Map<string, StepResult>,
  pipelineInput: Record<string, string>,
): StepResult {
  // 构建 args 用于解析 input 模板
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
    output: `route: ${fieldValue} -> [${activatedSteps.join(', ')}]`,
    structuredOutput: activatedSteps,
    commits: [],
  }
}

// --- 带重试的 step 执行 ---

async function executeStepWithRetry(
  runId: string,
  step: SingleStep,
  workDir: string,
  results: Map<string, StepResult>,
  pipelineInput: Record<string, string>,
  signal?: AbortSignal,
): Promise<StepResult> {
  const maxRetries = step.onFailure === 'retry' ? (step.maxRetries ?? 2) : 0
  let lastResult: StepResult | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await executeStep(runId, step, workDir, results, pipelineInput, signal)
    if (lastResult.status === 'completed') return lastResult
    if (signal?.aborted) return lastResult
  }

  // skip 策略：标记为 skipped 而非 failed
  if (step.onFailure === 'skip' && lastResult) {
    return { ...lastResult, status: 'skipped', error: undefined }
  }
  return lastResult!
}

export function isDependencySatisfied(result: StepResult): boolean {
  return result.status === 'completed' || (result.status === 'skipped' && !result.error)
}

// --- 构建模板参数 ---

export function buildTemplateArgs(
  results: Map<string, StepResult>,
  pipelineInput: Record<string, string>,
  workDir: string,
): Record<string, string> {
  const args: Record<string, string> = { ...pipelineInput }
  if (workDir) args.WORK_DIR = workDir
  for (const [id, result] of results) {
    const prefix = `STEP_${id.toUpperCase()}`
    args[`${prefix}_OUTPUT`] = sanitizePromptContextValue(result.output || '')
    if (result.structuredOutput) {
      args[`${prefix}_DATA`] = stringifyPromptContext(result.structuredOutput)
      if (isPlainObject(result.structuredOutput)) {
        for (const [key, value] of Object.entries(result.structuredOutput)) {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
          args[`${prefix}_DATA.${key}`] = stringValue
          args[`${prefix}_DATA_${toEnvKey(key)}`] = stringValue
        }
      }
    }
  }
  return args
}

function stringifyPromptContext(value: unknown): string {
  return JSON.stringify(sanitizePromptContext(value))
}

function sanitizePromptContext(value: unknown): unknown {
  if (typeof value === 'string') return sanitizePromptContextValue(value)
  if (Array.isArray(value)) return value.map(item => sanitizePromptContext(item))
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = sanitizePromptContext(item)
    }
    return result
  }
  return value
}

function sanitizePromptContextValue(value: string): string {
  if (value.length <= MAX_PROMPT_CONTEXT_CHARS) return value

  try {
    const parsed = JSON.parse(value)
    return stringifyPromptContext(parsed)
  } catch {
    return `[large output omitted: ${value.length} chars]`
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toEnvKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
}

// --- Step 执行（AI / Tool 分流）---

async function executeStep(
  runId: string,
  step: SingleStep,
  workDir: string,
  previousResults: Map<string, StepResult>,
  pipelineInput: Record<string, string>,
  signal?: AbortSignal,
): Promise<StepResult> {
  const stepRunId = generateId()

  const [agent] = await db.select().from(agents).where(eq(agents.id, step.agentId))
  if (!agent) {
    return { stepId: step.id, status: 'failed', output: '', commits: [], error: `Agent ${step.agentId} not found` }
  }

  const args = buildTemplateArgs(previousResults, pipelineInput, workDir)
  if (step.promptArgs) Object.assign(args, step.promptArgs)

  const resolvedPrompt = resolvePrompt(step.prompt, args)

  await db.insert(pipelineStepRuns).values({
    id: stepRunId,
    runId,
    stepId: step.id,
    agentId: agent.id,
    status: 'running',
    prompt: resolvedPrompt,
    startedAt: new Date(),
  })

  // Tool Agent 分流
  if (agent.type === 'tool') {
    return executeToolStep(stepRunId, step, agent, resolvedPrompt, args)
  }

  // AI Agent 执行
  return executeAIStep(stepRunId, step, agent, resolvedPrompt, workDir, previousResults, signal)
}

// --- Tool Agent 执行 ---

async function executeToolStep(
  stepRunId: string,
  step: SingleStep,
  agent: typeof agents.$inferSelect,
  resolvedPrompt: string,
  args: Record<string, string>,
): Promise<StepResult> {
  try {
    const toolProvider = getToolProvider(agent.provider)
    const agentConfig: Record<string, string> = JSON.parse(agent.config || '{}')
    // Tool Agent 的 input = promptArgs 合并 resolved prompt
    const toolInput: Record<string, string> = { ...args, PROMPT: resolvedPrompt }
    const result = await toolProvider.execute(toolInput, agentConfig)

    const status = result.success ? 'completed' : 'failed'
    await db.update(pipelineStepRuns)
      .set({ status, output: result.output, error: result.error, completedAt: new Date() })
      .where(eq(pipelineStepRuns.id, stepRunId))

    // Tool Agent output 如果是 JSON，自动设为 structuredOutput
    let structuredOutput: unknown
    if (result.output) {
      try { structuredOutput = JSON.parse(result.output) } catch {}
    }

    return {
      stepId: step.id,
      status: status as 'completed' | 'failed',
      output: result.output,
      structuredOutput,
      commits: [],
      error: result.error,
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db.update(pipelineStepRuns)
      .set({ status: 'failed', error, completedAt: new Date() })
      .where(eq(pipelineStepRuns.id, stepRunId))
    return { stepId: step.id, status: 'failed', output: '', commits: [], error }
  }
}

// --- AI Agent 执行 ---

async function executeAIStep(
  stepRunId: string,
  step: SingleStep,
  agent: typeof agents.$inferSelect,
  resolvedPrompt: string,
  workDir: string,
  previousResults: Map<string, StepResult>,
  signal?: AbortSignal,
): Promise<StepResult> {
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

  // Output schema 注入：追加格式约束到 prompt 末尾
  let finalPrompt = resolvedPrompt
  if (step.output?.schema) {
    const schemaDesc = JSON.stringify(step.output.schema, null, 2)
    finalPrompt += `\n\n请将最终结果以如下 XML 格式输出：\n<${step.output.tag}>${schemaDesc}</${step.output.tag}>`
  }

  // Session 恢复
  let sessionId: string | undefined
  if (step.resumeFrom) {
    const prevResult = previousResults.get(step.resumeFrom)
    if (prevResult?.sessionId) sessionId = prevResult.sessionId
  }

  // Multi-iteration 循环
  const maxIterations = step.maxIterations || 1
  const completionSignal = step.completionSignal || DEFAULT_COMPLETION_SIGNAL
  let totalOutput = ''
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let currentSessionId = sessionId
  let iterations = 0

  for (let i = 0; i < maxIterations; i++) {
    if (signal?.aborted) break
    iterations++

    const iterResult = await executeOnce(agent, finalPrompt, systemPrompt, workDir, currentSessionId, completionSignal, signal)
    totalOutput += iterResult.output
    totalInputTokens += iterResult.usage?.inputTokens || 0
    totalOutputTokens += iterResult.usage?.outputTokens || 0
    if (iterResult.sessionId) currentSessionId = iterResult.sessionId
    if (iterResult.completed || iterResult.status === 'failed') break
  }

  // Structured Output 提取
  let structuredOutput: unknown = undefined
  if (step.output) {
    structuredOutput = extractStructuredOutput(totalOutput, step.output)
  }

  const finalStatus = signal?.aborted ? 'failed' : 'completed'
  const error = signal?.aborted ? 'Cancelled' : undefined

  await db.update(pipelineStepRuns)
    .set({
      status: finalStatus,
      output: totalOutput,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      error,
      completedAt: new Date(),
    })
    .where(eq(pipelineStepRuns.id, stepRunId))

  return {
    stepId: step.id,
    status: finalStatus as 'completed' | 'failed',
    output: totalOutput,
    structuredOutput,
    sessionId: currentSessionId,
    commits: [],
    iterations,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    error,
  }
}

// --- CLI spawn 执行单次 ---

interface IterationResult {
  output: string
  sessionId?: string
  completed: boolean
  status: 'completed' | 'failed'
  usage?: { inputTokens: number; outputTokens: number }
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
    let inputTokens = 0
    let outputTokens = 0
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
        for (const evt of events) handleEvent(evt)
      }
    })

    proc.stderr.on('data', () => { resetIdle() })

    function handleEvent(evt: ProviderEvent) {
      switch (evt.type) {
        case 'text':
        case 'result':
          output += evt.content
          if (output.includes(completionSignal)) completed = true
          break
        case 'session_id':
          capturedSessionId = evt.id
          break
        case 'usage':
          inputTokens += evt.inputTokens
          outputTokens += evt.outputTokens
          _currentProgressCb?.({ inputTokens, outputTokens })
          break
      }
    }

    let finished = false
    function finish(status: 'completed' | 'failed') {
      if (finished) return
      finished = true
      if (idleTimer) clearTimeout(idleTimer)
      signal?.removeEventListener('abort', abortHandler)
      resolve({ output, sessionId: capturedSessionId, completed, status, usage: { inputTokens, outputTokens } })
    }

    proc.on('close', (code) => {
      if (buffer.trim()) {
        const events = provider.parseOutputLine(buffer)
        for (const evt of events) handleEvent(evt)
      }
      finish(code === 0 ? 'completed' : 'failed')
    })

    proc.on('error', () => { finish('failed') })
  })
}

// --- Structured Output 提取 ---

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

// --- 拓扑排序 ---

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
