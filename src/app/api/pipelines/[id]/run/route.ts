import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelines, agents, pipelineRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runPipeline } from '@/lib/pipeline/runner'
import { emitPipelineEvent } from '@/lib/pipeline/events'
import { createRunWorkspace } from '@/lib/run-isolation'
import { checkRateLimit } from '@/lib/rate-limit'
import type { PipelineConfig } from '@/lib/pipeline/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Rate limiting by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
  const rateResult = checkRateLimit(`pipeline-run:${ip}`)
  if (!rateResult.allowed) {
    return Response.json(
      { error: '请求过于频繁，请稍后再试', resetAt: rateResult.resetAt },
      { status: 429 }
    )
  }

  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, id))
  if (!pipeline) {
    return Response.json({ error: 'Pipeline not found' }, { status: 404 })
  }

  const config: PipelineConfig = JSON.parse(pipeline.config)

  // 确定工作目录：取第一个 step 的 agent workDir
  const firstStepAgentId = config.steps[0]?.type === 'single'
    ? config.steps[0].agentId
    : config.steps[0]?.type === 'parallel'
      ? config.steps[0].steps[0]?.agentId
      : null

  let workDir = process.cwd()
  if (firstStepAgentId) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, firstStepAgentId))
    if (agent?.workDir) workDir = agent.workDir
  }

  // 解析请求体：workDir 覆盖 + input 参数 + sessionId
  let input: Record<string, string> | undefined
  let sessionId: string | undefined
  let useIsolation = false
  try {
    const body = await req.json()
    if (body.workDir) workDir = body.workDir
    if (body.input) input = body.input
    if (body.sessionId) sessionId = body.sessionId
    if (body.isolated !== false) useIsolation = true
  } catch {
    // 空 body 没关系
  }

  let resolveRunStart: (runId: string) => void = () => {}
  const runStartPromise = new Promise<string>(resolve => { resolveRunStart = resolve })
  let startedRunId = ''
  let workspaceRunId = ''

  // 如果启用隔离模式，创建独立工作空间
  if (useIsolation) {
    const tempRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    workspaceRunId = tempRunId
    const workspace = await createRunWorkspace(tempRunId, sessionId)
    workDir = workspace.workDir
    // 注入上传文件路径到 input
    if (!input) input = {}
    input.UPLOADS_DIR = workspace.uploadsDir
    input.OUTPUT_DIR = workspace.outputDir
    input.RESOURCES_DIR = workspace.resourcesDir
  }

  // 异步执行 pipeline
  const runPromise = runPipeline({
    pipelineId: id,
    pipelineName: pipeline.name,
    config,
    workDir,
    input,
    onRunStart(runId) {
      startedRunId = runId
      resolveRunStart(runId)
      // Save workspaceRunId and input to DB
      if (workspaceRunId || input) {
        db.update(pipelineRuns).set({
          workspaceRunId: workspaceRunId || null,
          inputJson: input ? JSON.stringify(input) : null,
        }).where(eq(pipelineRuns.id, runId)).catch(() => {})
      }
    },
    onStepStart(stepId) {
      if (!startedRunId) return
      emitPipelineEvent(startedRunId, { type: 'step_start', stepId, timestamp: Date.now() })
    },
    onStepProgress(stepId, tokens) {
      if (!startedRunId) return
      emitPipelineEvent(startedRunId, { type: 'step_progress', stepId, message: '生成中...', tokens, timestamp: Date.now() })
    },
    onStepComplete(stepId, result) {
      if (!startedRunId) return
      emitPipelineEvent(startedRunId, {
        type: 'step_complete',
        stepId,
        status: result.status,
        output: result.output,
        usage: result.usage,
        timestamp: Date.now(),
      })
    },
    onRunComplete(runId, status, error) {
      emitPipelineEvent(runId, { type: 'run_complete', status, error, timestamp: Date.now() })
    },
  })
  runPromise.catch(() => {})

  await Promise.race([
    runStartPromise,
    new Promise(resolve => setTimeout(resolve, 1000)),
  ])

  return Response.json({ runId: startedRunId, workspaceRunId, status: 'started' }, { status: 202 })
}
