import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelines, pipelineRuns, agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runPipeline } from '@/lib/pipeline/runner'
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

  // 异步执行 pipeline
  const runPromise = runPipeline({
    pipelineId: id,
    pipelineName: pipeline.name,
    config,
    workDir,
    input,
  })
  runPromise.catch(() => {})

  // 短暂等待让 run 记录创建
  await new Promise(resolve => setTimeout(resolve, 100))

  const [latestRun] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.pipelineId, id))
    .orderBy(pipelineRuns.startedAt)
    .limit(1)

  return Response.json({ runId: latestRun?.id, status: 'started' }, { status: 202 })
}
