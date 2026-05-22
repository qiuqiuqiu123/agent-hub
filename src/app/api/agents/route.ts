import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'

export async function GET() {
  const result = await db.select().from(agents).orderBy(agents.createdAt)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const id = generateId()
  const now = new Date()

  await db.insert(agents).values({
    id,
    name: body.name,
    role: body.role,
    personality: body.personality,
    systemPrompt: body.systemPrompt || '',
    provider: body.provider || 'claude',
    apiKey: body.apiKey || '',
    baseUrl: body.baseUrl || '',
    modelId: body.modelId || '',
    workDir: body.workDir || '',
    createdAt: now,
    updatedAt: now,
  })

  const [agent] = await db.select().from(agents).where(eq(agents.id, id))
  return NextResponse.json(agent, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...data } = body

  await db.update(agents).set({ ...data, updatedAt: new Date() }).where(eq(agents.id, id))
  const [agent] = await db.select().from(agents).where(eq(agents.id, id))
  return NextResponse.json(agent)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(agents).where(eq(agents.id, id))
  return NextResponse.json({ ok: true })
}
