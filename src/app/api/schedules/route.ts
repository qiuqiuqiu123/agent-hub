import { NextRequest } from 'next/server'
import { db } from '@/db'
import { schedules } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'
import { upsertScheduleJob, removeScheduleJob } from '@/lib/scheduler'

export async function GET() {
  const all = await db.select().from(schedules)
  return Response.json(all)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pipelineId, name, cron, input, enabled } = body

  if (!pipelineId || !name || !cron) {
    return Response.json({ error: '缺少必填字段: pipelineId, name, cron' }, { status: 400 })
  }

  const id = generateId()
  await db.insert(schedules).values({
    id,
    pipelineId,
    name,
    cron,
    input: JSON.stringify(input || {}),
    enabled: enabled ?? true,
  })

  upsertScheduleJob(id, cron, enabled ?? true)
  return Response.json({ id }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body

  if (!id) {
    return Response.json({ error: '缺少 id' }, { status: 400 })
  }

  const setData: Record<string, unknown> = { updatedAt: new Date() }
  if (updates.name !== undefined) setData.name = updates.name
  if (updates.cron !== undefined) setData.cron = updates.cron
  if (updates.input !== undefined) setData.input = JSON.stringify(updates.input)
  if (updates.enabled !== undefined) setData.enabled = updates.enabled
  if (updates.pipelineId !== undefined) setData.pipelineId = updates.pipelineId

  await db.update(schedules).set(setData).where(eq(schedules.id, id))

  // 更新运行中的 job
  const [updated] = await db.select().from(schedules).where(eq(schedules.id, id))
  if (updated) {
    upsertScheduleJob(id, updated.cron, updated.enabled)
  }

  return Response.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return Response.json({ error: '缺少 id' }, { status: 400 })
  }

  removeScheduleJob(id)
  await db.delete(schedules).where(eq(schedules.id, id))
  return Response.json({ success: true })
}
