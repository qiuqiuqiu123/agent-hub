import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'

// 列出工作目录文件
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')
  const filePath = searchParams.get('path') || ''

  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent?.workDir) return NextResponse.json({ error: 'no workDir configured' }, { status: 400 })

  const targetPath = path.resolve(agent.workDir, filePath)

  // 安全检查：不允许访问工作目录之外
  if (!targetPath.startsWith(path.resolve(agent.workDir))) {
    return NextResponse.json({ error: 'path outside workDir' }, { status: 403 })
  }

  try {
    const stat = fs.statSync(targetPath)
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath, { withFileTypes: true })
      const files = entries.map(e => ({
        name: e.name,
        isDir: e.isDirectory(),
        path: path.relative(agent.workDir, path.join(targetPath, e.name)),
      }))
      return NextResponse.json({ type: 'directory', files })
    } else {
      const content = fs.readFileSync(targetPath, 'utf-8')
      return NextResponse.json({ type: 'file', content, path: filePath })
    }
  } catch (err) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}

// 写入文件到工作目录
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { agentId, filePath, content } = body

  if (!agentId || !filePath || content === undefined) {
    return NextResponse.json({ error: 'agentId, filePath, content required' }, { status: 400 })
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent?.workDir) return NextResponse.json({ error: 'no workDir configured' }, { status: 400 })

  const targetPath = path.resolve(agent.workDir, filePath)

  // 安全检查
  if (!targetPath.startsWith(path.resolve(agent.workDir))) {
    return NextResponse.json({ error: 'path outside workDir' }, { status: 403 })
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content, 'utf-8')

  return NextResponse.json({ ok: true, path: filePath })
}
