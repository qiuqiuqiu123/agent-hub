import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelines, agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runPipeline } from '@/lib/pipeline/runner'
import { emitPipelineEvent } from '@/lib/pipeline/events'
import type { PipelineConfig } from '@/lib/pipeline/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  // 解析请求体：workDir 覆盖 + input 参数
  let input: Record<string, string> | undefined
  try {
    const body = await req.json()
    if (body.workDir) workDir = body.workDir
    if (body.input) input = body.input
  } catch {
    // 空 body 没关系
  }

  let resolveRunStart: (runId: string) => void = () => {}
  const runStartPromise = new Promise<string>(resolve => { resolveRunStart = resolve })
  let startedRunId = ''

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
    },
    onStepStart(stepId) {
      if (!startedRunId) return
      emitPipelineEvent(startedRunId, { type: 'step_start', stepId, timestamp: Date.now() })
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

  return Response.json({ runId: startedRunId, status: 'started' }, { status: 202 })
}
