import { NextRequest } from 'next/server'
import { db } from '@/db'
import { webhooks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'

export async function GET() {
  const all = await db.select().from(webhooks)
  return Response.json(all)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, pipelineId, matchRules, extractInput, enabled } = body

  if (!name || !pipelineId) {
    return Response.json({ error: '缺少必填字段: name, pipelineId' }, { status: 400 })
  }

  const id = generateId()
  await db.insert(webhooks).values({
    id,
    name,
    pipelineId,
    matchRules: JSON.stringify(matchRules || {}),
    extractInput: JSON.stringify(extractInput || {}),
    enabled: enabled ?? true,
  })

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
  if (updates.pipelineId !== undefined) setData.pipelineId = updates.pipelineId
  if (updates.matchRules !== undefined) setData.matchRules = JSON.stringify(updates.matchRules)
  if (updates.extractInput !== undefined) setData.extractInput = JSON.stringify(updates.extractInput)
  if (updates.enabled !== undefined) setData.enabled = updates.enabled

  await db.update(webhooks).set(setData).where(eq(webhooks.id, id))
  return Response.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return Response.json({ error: '缺少 id' }, { status: 400 })
  }

  await db.delete(webhooks).where(eq(webhooks.id, id))
  return Response.json({ success: true })
}
