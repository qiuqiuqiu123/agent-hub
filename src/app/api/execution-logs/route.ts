import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { executionLogs } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const messageId = searchParams.get('messageId')

  if (!messageId) {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 })
  }

  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.messageId, messageId))
    .orderBy(executionLogs.sequence)

  return NextResponse.json(logs)
}
