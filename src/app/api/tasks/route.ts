import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const result = await db.select().from(tasks).where(eq(tasks.agentId, agentId)).orderBy(tasks.createdAt)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const id = generateId()
  const now = new Date()

  await db.insert(tasks).values({
    id,
    agentId: body.agentId,
    title: body.title,
    description: body.description || '',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  })

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
  return NextResponse.json(task, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...data } = body

  await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, id))
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
  return NextResponse.json(task)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(tasks).where(eq(tasks.id, id))
  return NextResponse.json({ ok: true })
}
