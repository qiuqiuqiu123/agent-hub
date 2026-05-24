import * as cron from 'node-cron'
import { db } from '@/db'
import { schedules, pipelines, agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runPipeline } from '@/lib/pipeline/runner'
import type { PipelineConfig } from '@/lib/pipeline/types'

interface ScheduleJob {
  id: string
  task: cron.ScheduledTask
}

const activeJobs = new Map<string, ScheduleJob>()

async function executeTrigger(scheduleId: string): Promise<void> {
  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, scheduleId))
  if (!schedule || !schedule.enabled) return

  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, schedule.pipelineId))
  if (!pipeline) return

  const config: PipelineConfig = JSON.parse(pipeline.config)
  const input: Record<string, string> = JSON.parse(schedule.input || '{}')

  // 注入动态变量
  const now = new Date()
  input.NOW = now.toISOString()
  input.TODAY = now.toISOString().split('T')[0]
  if (schedule.lastRunAt) {
    input.LAST_RUN_TIME = schedule.lastRunAt.toISOString()
  }

  // 确定工作目录
  let workDir = process.cwd()
  const firstStep = config.steps[0]
  if (firstStep?.type === 'single') {
    const [agent] = await db.select().from(agents).where(eq(agents.id, firstStep.agentId))
    if (agent?.workDir) workDir = agent.workDir
  }

  // 更新 lastRunAt
  await db.update(schedules)
    .set({ lastRunAt: now, nextRunAt: now })
    .where(eq(schedules.id, scheduleId))

  // 触发 pipeline
  runPipeline({
    pipelineId: schedule.pipelineId,
    pipelineName: pipeline.name,
    config,
    workDir,
    input,
  }).catch(err => {
    console.error(`[Scheduler] Pipeline ${pipeline.name} failed:`, err)
  })
}

function startJob(id: string, cronExpr: string): void {
  if (activeJobs.has(id)) stopJob(id)

  if (!cron.validate(cronExpr)) {
    console.warn(`[Scheduler] Invalid cron expression for ${id}: ${cronExpr}`)
    return
  }

  const task = cron.schedule(cronExpr, () => {
    executeTrigger(id).catch(console.error)
  })

  activeJobs.set(id, { id, task })
}

function stopJob(id: string): void {
  const job = activeJobs.get(id)
  if (job) {
    job.task.stop()
  }
  activeJobs.delete(id)
}

/**
 * 启动所有 enabled 的定时任务
 */
export async function initScheduler(): Promise<void> {
  const allSchedules = await db.select().from(schedules).where(eq(schedules.enabled, true))
  for (const schedule of allSchedules) {
    startJob(schedule.id, schedule.cron)
  }
  console.log(`[Scheduler] Loaded ${allSchedules.length} active schedules`)
}

/**
 * 添加或更新定时任务
 */
export function upsertScheduleJob(id: string, cronExpr: string, enabled: boolean): void {
  if (enabled) {
    startJob(id, cronExpr)
  } else {
    stopJob(id)
  }
}

/**
 * 移除定时任务
 */
export function removeScheduleJob(id: string): void {
  stopJob(id)
}

/**
 * 停止所有定时任务
 */
export function shutdownScheduler(): void {
  for (const [id] of activeJobs) {
    stopJob(id)
  }
}
