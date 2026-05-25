import { NextRequest } from 'next/server'
import { importBundle } from '@/lib/pipeline/bundle'

export async function POST(req: NextRequest) {
  try {
    const bundle = await req.json()
    const pipeline = await importBundle(bundle)
    return Response.json(pipeline, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 400 })
  }
}
