import { NextRequest } from 'next/server'
import { db } from '@/db'
import { pipelines } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'

export async function GET() {
  const result = await db.select().from(pipelines).orderBy(pipelines.createdAt)
  return Response.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, description, config } = body

  if (!name || !config) {
    return Response.json({ error: 'name and config required' }, { status: 400 })
  }

  const id = generateId()
  await db.insert(pipelines).values({
    id,
    name,
    description: description || '',
    config: typeof config === 'string' ? config : JSON.stringify(config),
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const [created] = await db.select().from(pipelines).where(eq(pipelines.id, id))
  return Response.json(created, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, name, description, config } = body

  if (!id) {
    return Response.json({ error: 'id required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (config !== undefined) updates.config = typeof config === 'string' ? config : JSON.stringify(config)

  await db.update(pipelines).set(updates).where(eq(pipelines.id, id))
  const [updated] = await db.select().from(pipelines).where(eq(pipelines.id, id))
  return Response.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id required' }, { status: 400 })

  await db.delete(pipelines).where(eq(pipelines.id, id))
  return Response.json({ success: true })
}
