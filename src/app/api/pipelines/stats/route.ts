import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelineRuns, pipelineStepRuns, pipelines } from '@/db/schema'
import { eq, sql, desc, and, gte } from 'drizzle-orm'

/**
 * GET /api/pipelines/stats
 * 返回 Pipeline 执行统计：成功率、平均耗时、最近运行
 *
 * Query params:
 *   pipelineId — 可选，筛选特定 pipeline
 *   days — 统计天数，默认 7
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pipelineId = searchParams.get('pipelineId')
  const days = parseInt(searchParams.get('days') || '7')

  const since = new Date()
  since.setDate(since.getDate() - days)

  // 基础查询条件
  const conditions = [gte(pipelineRuns.startedAt, since)]
  if (pipelineId) {
    conditions.push(eq(pipelineRuns.pipelineId, pipelineId))
  }

  // 获取所有 runs
  const runs = await db
    .select({
      id: pipelineRuns.id,
      pipelineId: pipelineRuns.pipelineId,
      status: pipelineRuns.status,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
    })
    .from(pipelineRuns)
    .where(and(...conditions))
    .orderBy(desc(pipelineRuns.startedAt))

  // 按 pipeline 分组统计
  const statsMap = new Map<string, {
    pipelineId: string
    total: number
    completed: number
    failed: number
    avgDurationMs: number
    durations: number[]
  }>()

  for (const run of runs) {
    if (!statsMap.has(run.pipelineId)) {
      statsMap.set(run.pipelineId, {
        pipelineId: run.pipelineId,
        total: 0,
        completed: 0,
        failed: 0,
        avgDurationMs: 0,
        durations: [],
      })
    }
    const stat = statsMap.get(run.pipelineId)!
    stat.total++
    if (run.status === 'completed') stat.completed++
    if (run.status === 'failed') stat.failed++
    if (run.startedAt && run.completedAt) {
      stat.durations.push(run.completedAt.getTime() - run.startedAt.getTime())
    }
  }

  const stats = Array.from(statsMap.values()).map(s => ({
    pipelineId: s.pipelineId,
    total: s.total,
    completed: s.completed,
    failed: s.failed,
    successRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
    avgDurationMs: s.durations.length > 0
      ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length)
      : 0,
  }))

  // 获取 step 级别统计（如果指定了 pipelineId）
  let stepStats: unknown[] = []
  if (pipelineId) {
    const runIds = runs.map(r => r.id)
    if (runIds.length > 0) {
      const stepRuns = await db
        .select()
        .from(pipelineStepRuns)
        .where(sql`${pipelineStepRuns.runId} IN (${sql.join(runIds.map(id => sql`${id}`), sql`, `)})`)

      // 按 stepId 分组
      const stepMap = new Map<string, { total: number; completed: number; failed: number; durations: number[]; retries: number }>()
      for (const sr of stepRuns) {
        if (!stepMap.has(sr.stepId)) {
          stepMap.set(sr.stepId, { total: 0, completed: 0, failed: 0, durations: [], retries: 0 })
        }
        const s = stepMap.get(sr.stepId)!
        s.total++
        if (sr.status === 'completed') s.completed++
        if (sr.status === 'failed') s.failed++
        if (sr.startedAt && sr.completedAt) {
          s.durations.push(sr.completedAt.getTime() - sr.startedAt.getTime())
        }
      }

      stepStats = Array.from(stepMap.entries()).map(([stepId, s]) => ({
        stepId,
        total: s.total,
        completed: s.completed,
        failed: s.failed,
        successRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
        avgDurationMs: s.durations.length > 0
          ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length)
          : 0,
      }))
    }
  }

  return Response.json({ stats, stepStats, period: { days, since: since.toISOString() } })
}
