import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { skills, agentSkills } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')

  if (agentId) {
    // 获取指定 agent 的 skills
    const result = await db
      .select({ skill: skills })
      .from(agentSkills)
      .innerJoin(skills, eq(agentSkills.skillId, skills.id))
      .where(eq(agentSkills.agentId, agentId))
    return NextResponse.json(result.map(r => r.skill))
  }

  const result = await db.select().from(skills).orderBy(skills.createdAt)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // 分配 skill 给 agent
  if (body.agentId && body.skillId) {
    const id = generateId()
    await db.insert(agentSkills).values({ id, agentId: body.agentId, skillId: body.skillId })
    return NextResponse.json({ ok: true }, { status: 201 })
  }

  // 创建新 skill
  const id = generateId()
  await db.insert(skills).values({
    id,
    name: body.name,
    description: body.description,
    content: body.content,
    createdAt: new Date(),
  })

  const [skill] = await db.select().from(skills).where(eq(skills.id, id))
  return NextResponse.json(skill, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const agentId = searchParams.get('agentId')
  const skillId = searchParams.get('skillId')

  // 移除 agent-skill 关联
  if (agentId && skillId) {
    await db.delete(agentSkills)
      .where(eq(agentSkills.agentId, agentId))
    return NextResponse.json({ ok: true })
  }

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.delete(skills).where(eq(skills.id, id))
  return NextResponse.json({ ok: true })
}
