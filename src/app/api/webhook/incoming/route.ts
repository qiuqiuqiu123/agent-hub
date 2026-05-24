import { NextRequest } from 'next/server'
import { handleIncomingWebhook } from '@/lib/webhook'

export async function POST(req: NextRequest) {
  // 提取 headers（小写化）
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await handleIncomingWebhook(headers, body)

  if (!result.matched) {
    return Response.json({ matched: false, message: 'No webhook matched' }, { status: 200 })
  }

  if (result.error) {
    return Response.json({ matched: true, error: result.error }, { status: 500 })
  }

  return Response.json({
    matched: true,
    pipelineId: result.pipelineId,
    runId: result.runId,
  }, { status: 202 })
}
