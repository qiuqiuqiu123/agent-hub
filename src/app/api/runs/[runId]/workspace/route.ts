import { NextRequest } from 'next/server'
import { readFile, readdir } from 'fs/promises'
import { join, resolve, sep } from 'path'

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
  const workspaceDir = resolve(UPLOAD_BASE, runId, 'workspace')

  // List files in workspace
  if (!fileName) {
    try {
      const files = await readdir(workspaceDir)
      return Response.json({ files })
    } catch {
      return Response.json({ files: [] })
    }
  }

  // Read specific file
  const filePath = resolve(workspaceDir, fileName)
  if (!filePath.startsWith(workspaceDir + sep) && filePath !== workspaceDir + sep + fileName) {
    return Response.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    return Response.json({ content, fileName })
  } catch {
    return Response.json({ error: 'File not found' }, { status: 404 })
  }
}
