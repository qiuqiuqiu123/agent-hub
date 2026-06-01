import { NextRequest } from 'next/server'
import { readdir, stat, readFile } from 'fs/promises'
import { join, resolve, sep } from 'path'
import { db } from '@/db'
import { pipelineStepRuns } from '@/db/schema'
import { eq } from 'drizzle-orm'

const UPLOAD_BASE = process.env.UPLOAD_DIR || '/tmp/agent-hub-runs'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
    return Response.json({ error: 'Invalid runId' }, { status: 400 })
  }

  const fileName = req.nextUrl.searchParams.get('file')

  // If specific file requested, serve it
  if (fileName) {
    const outputDir = resolve(UPLOAD_BASE, runId, 'output')
    const filePath = resolve(outputDir, fileName)

    // Path traversal protection
    if (!filePath.startsWith(outputDir + sep)) {
      return Response.json({ error: 'Invalid path' }, { status: 400 })
    }

    try {
      const content = await readFile(filePath)
      const ext = fileName.split('.').pop()?.toLowerCase()
      const contentType = ext === 'html' ? 'text/html'
        : ext === 'pdf' ? 'application/pdf'
        : 'application/octet-stream'

      return new Response(content, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    } catch {
      return Response.json({ error: 'File not found' }, { status: 404 })
    }
  }

  // List artifacts: check output dir + step outputs from DB
  const artifacts: { name: string; type: string; size: number; source: string }[] = []

  // Check filesystem output dir
  const outputDir = join(UPLOAD_BASE, runId, 'output')
  try {
    const files = await readdir(outputDir)
    for (const f of files) {
      const s = await stat(join(outputDir, f))
      artifacts.push({ name: f, type: 'file', size: s.size, source: 'filesystem' })
    }
  } catch {
    // No output dir yet
  }

  // Check DB for step outputs containing HTML
  const stepRuns = await db.select().from(pipelineStepRuns).where(eq(pipelineStepRuns.runId, runId))
  for (const step of stepRuns) {
    if (step.output && step.output.includes('<!DOCTYPE html')) {
      artifacts.push({
        name: `${step.stepId}.html`,
        type: 'html_output',
        size: step.output.length,
        source: 'step_output',
      })
    }
  }

  return Response.json({ artifacts, runId })
}
