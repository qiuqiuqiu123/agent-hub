import { onPipelineEvent } from '@/lib/pipeline/events'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const encoder = new TextEncoder()
  let off: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'))

      off = onPipelineEvent(runId, event => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      })

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, 15000)
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat)
      off?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
