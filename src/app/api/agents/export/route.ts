import { NextRequest } from 'next/server'
import { exportAgents } from '@/lib/agent-bundle'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ids = searchParams.get('ids')?.split(',').map(id => id.trim()).filter(Boolean)
  const bundle = await exportAgents(ids)

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="agents.json"',
    },
  })
}
