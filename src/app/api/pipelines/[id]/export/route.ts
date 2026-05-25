import { exportBundle } from '@/lib/pipeline/bundle'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bundle = await exportBundle(id)
  if (!bundle) return Response.json({ error: 'Pipeline not found' }, { status: 404 })

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pipeline-${id}.json"`,
    },
  })
}
