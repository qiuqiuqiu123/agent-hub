import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, pipelineStepRuns } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const runs = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.pipelineId, id))
    .orderBy(desc(pipelineRuns.startedAt))

  // 附带每个 run 的 step runs
  const result = await Promise.all(
    runs.map(async (run) => {
      const stepRuns = await db
        .select()
        .from(pipelineStepRuns)
        .where(eq(pipelineStepRuns.runId, run.id))
      return { ...run, steps: stepRuns }
    })
  )

  return Response.json(result)
}
