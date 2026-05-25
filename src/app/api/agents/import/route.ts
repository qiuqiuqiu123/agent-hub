import { NextRequest } from 'next/server'
import { importAgents } from '@/lib/agent-bundle'

export async function POST(req: NextRequest) {
  try {
    const bundle = await req.json()
    const result = await importAgents(bundle)
    return Response.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 400 })
  }
}
