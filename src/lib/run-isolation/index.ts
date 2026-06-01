import { mkdir, symlink, readdir, copyFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const UPLOAD_BASE = process.env.UPLOAD_DIR || '/tmp/agent-hub-runs'
const RESOURCE_DIR = join(process.cwd(), 'src/resources/ppt-skill')

export interface RunWorkspace {
  runId: string
  workDir: string
  uploadsDir: string
  outputDir: string
  resourcesDir: string
}

/**
 * Create an isolated workspace for a pipeline run.
 * Structure:
 *   /tmp/agent-hub-runs/{runId}/
 *   ├── uploads/       (user uploaded files, copied from session)
 *   ├── resources/     (symlink to ppt-skill resources)
 *   ├── output/        (generated artifacts)
 *   └── workspace/     (Claude CLI cwd)
 */
export async function createRunWorkspace(runId: string, sessionId?: string): Promise<RunWorkspace> {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
    throw new Error('Invalid runId')
  }

  const baseDir = join(UPLOAD_BASE, runId)
  const uploadsDir = join(baseDir, 'uploads')
  const outputDir = join(baseDir, 'output')
  const resourcesDir = join(baseDir, 'resources')
  const workDir = join(baseDir, 'workspace')

  await mkdir(uploadsDir, { recursive: true })
  await mkdir(outputDir, { recursive: true })
  await mkdir(workDir, { recursive: true })

  // Symlink resources if available
  if (existsSync(RESOURCE_DIR) && !existsSync(resourcesDir)) {
    await symlink(RESOURCE_DIR, resourcesDir)
  }

  // Copy user uploads from session if provided
  if (sessionId && /^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    const sessionUploads = join(UPLOAD_BASE, sessionId, 'uploads')
    if (existsSync(sessionUploads)) {
      const files = await readdir(sessionUploads)
      for (const file of files) {
        await copyFile(join(sessionUploads, file), join(uploadsDir, file))
      }
    }
  }

  return { runId, workDir, uploadsDir, outputDir, resourcesDir }
}
