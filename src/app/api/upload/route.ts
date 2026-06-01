import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_BASE = process.env.UPLOAD_DIR || '/tmp/agent-hub-runs'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
])

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.md', '.png', '.jpg', '.jpeg',
])

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const sessionIdInput = formData.get('sessionId') as string | null
  const sessionId = sessionIdInput && /^[a-zA-Z0-9_-]+$/.test(sessionIdInput)
    ? sessionIdInput
    : randomUUID()

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return Response.json({ error: `File type not allowed: ${ext}` }, { status: 400 })
  }

  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    // Allow if extension is valid even if MIME is wrong
  }

  const uploadDir = join(UPLOAD_BASE, sessionId, 'uploads')
  await mkdir(uploadDir, { recursive: true })

  const fileId = randomUUID()
  const fileName = `${fileId}${ext}`
  const filePath = join(uploadDir, fileName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  return Response.json({
    fileId,
    fileName: file.name,
    filePath,
    size: file.size,
    sessionId,
  })
}
