import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, pipelineStepRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
    return Response.json({ error: 'Invalid runId' }, { status: 400 })
  }

  const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId))
  if (!run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  const steps = await db.select().from(pipelineStepRuns).where(eq(pipelineStepRuns.runId, runId))

  return Response.json({
    runId: run.id,
    pipelineId: run.pipelineId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    error: run.error,
    steps: steps.map(s => ({
      stepId: s.stepId,
      status: s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
    })),
  })
}
