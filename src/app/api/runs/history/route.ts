import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, pipelineStepRuns, pipelines } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '20'), 50)
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0')

  const runs = await db
    .select({
      id: pipelineRuns.id,
      pipelineId: pipelineRuns.pipelineId,
      status: pipelineRuns.status,
      workspaceRunId: pipelineRuns.workspaceRunId,
      inputJson: pipelineRuns.inputJson,
      error: pipelineRuns.error,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
    })
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit)
    .offset(offset)

  // Enrich with pipeline name and step summary
  const enriched = await Promise.all(runs.map(async (run) => {
    const [pipeline] = await db.select({ name: pipelines.name }).from(pipelines).where(eq(pipelines.id, run.pipelineId))
    const steps = await db.select({
      stepId: pipelineStepRuns.stepId,
      status: pipelineStepRuns.status,
      inputTokens: pipelineStepRuns.inputTokens,
      outputTokens: pipelineStepRuns.outputTokens,
    }).from(pipelineStepRuns).where(eq(pipelineStepRuns.runId, run.id))

    const totalTokens = steps.reduce((sum, s) => sum + (s.inputTokens || 0) + (s.outputTokens || 0), 0)
    const input = run.inputJson ? JSON.parse(run.inputJson) : null

    return {
      id: run.id,
      pipelineId: run.pipelineId,
      pipelineName: pipeline?.name || run.pipelineId,
      status: run.status,
      workspaceRunId: run.workspaceRunId,
      topic: input?.TOPIC || '',
      style: input?.STYLE || '',
      totalTokens,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    }
  }))

  return Response.json({ runs: enriched })
}
