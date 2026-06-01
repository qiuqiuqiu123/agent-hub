import { db } from '@/db'
import { pipelineStepRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params

  const steps = await db.select().from(pipelineStepRuns).where(eq(pipelineStepRuns.runId, runId))

  const result = steps.map((s) => ({
    stepId: s.stepId,
    status: s.status,
    output: s.output,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
  }))

  return Response.json({ runId, steps: result })
}
