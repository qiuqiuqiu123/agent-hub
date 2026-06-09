#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')

const DEFAULT_PORT = 3939

const CLI_COMMANDS = ['pipelines', 'agents', 'schedules', 'runs', 'ps', 'run', 'watch', 'steps']

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args.command || 'start'
  const dataDir = path.resolve(args.dataDir || process.env.AGENT_HUB_DATA_DIR || path.join(os.homedir(), '.agent-hub'))

  if (command === 'version') {
    const pkg = require('../package.json')
    console.log(pkg.version)
    return
  }

  if (command === 'help') {
    printHelp()
    return
  }

  if (command === 'status') {
    printStatus(dataDir)
    return
  }

  if (command === 'stop') {
    stopServer(dataDir)
    return
  }

  // CLI 查询命令 — 不启动服务器，调用本地 API
  if (CLI_COMMANDS.includes(command)) {
    await runCliCommand(command, args, dataDir)
    return
  }

  if (command !== 'start') {
    throw new Error(`未知命令: ${command}`)
  }

  const requestedPort = Number(args.port || process.env.PORT || DEFAULT_PORT)
  const port = await resolvePort(requestedPort)
  const dbDataDir = path.join(dataDir, 'data')
  fs.mkdirSync(dbDataDir, { recursive: true })
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true })

  const serverPath = resolveServerPath()
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: process.env.HOSTNAME || '127.0.0.1',
    AGENT_HUB_DATA_DIR: dbDataDir,
  }

  const server = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env,
    stdio: 'inherit',
  })
  writeState(dataDir, { pid: server.pid, port, startedAt: new Date().toISOString() })

  const url = `http://127.0.0.1:${port}`
  console.log(`Agent-Hub 已启动: ${url}`)
  console.log(`数据目录: ${dataDir}`)

  if (!args.noOpen) {
    setTimeout(() => openBrowser(url), 1000)
  }

  const shutdown = () => {
    removeState(dataDir)
    server.kill('SIGTERM')
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  server.on('exit', code => {
    removeState(dataDir)
    process.exit(code || 0)
  })
}

function parseArgs(argv) {
  const args = { command: 'start', noOpen: false, noWatch: false, port: undefined, dataDir: undefined, limit: undefined, pipelineId: undefined, runId: undefined, inputs: [] }
  const list = [...argv]
  if (list.includes('--help') || list.includes('-h')) return { ...args, command: 'help' }
  if (list.includes('--version') || list.includes('-v')) return { ...args, command: 'version' }
  if (list[0] && !list[0].startsWith('-')) {
    args.command = list.shift()
  }
  // 第二个位置参数作为 target（pipeline-id 或 run-id）
  if (list[0] && !list[0].startsWith('-')) {
    const target = list.shift()
    if (args.command === 'run') args.pipelineId = target
    else if (args.command === 'watch' || args.command === 'steps') args.runId = target
  }

  for (let i = 0; i < list.length; i++) {
    const arg = list[i]
    if (arg === '--no-open') args.noOpen = true
    else if (arg === '--no-watch') args.noWatch = true
    else if (arg === '--port') args.port = list[++i]
    else if (arg.startsWith('--port=')) args.port = arg.slice('--port='.length)
    else if (arg === '--data-dir') args.dataDir = list[++i]
    else if (arg.startsWith('--data-dir=')) args.dataDir = arg.slice('--data-dir='.length)
    else if (arg === '--limit') args.limit = Number(list[++i])
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length))
    else if (arg === '--input') args.inputs.push(list[++i])
    else if (arg.startsWith('--input=')) args.inputs.push(arg.slice('--input='.length))
    else throw new Error(`未知参数: ${arg}`)
  }
  return args
}

function printHelp() {
  console.log(`Agent-Hub CLI

Usage:
  agent-hub [start] [--port 3939] [--data-dir ~/.agent-hub] [--no-open]
  agent-hub status
  agent-hub stop

查询命令 (需要服务运行中):
  agent-hub pipelines              列出所有 pipeline
  agent-hub agents                 列出所有 agent
  agent-hub schedules              列出定时任务
  agent-hub runs [--limit 10]      运行历史
  agent-hub ps                     当前运行中的任务
  agent-hub steps <run-id>         查看某次运行各步骤
  agent-hub run <pipeline-id> [--input KEY=VAL ...] [--no-watch]  触发执行
  agent-hub watch <run-id>         实时监控运行日志

  agent-hub version
`)
}

function printStatus(dataDir) {
  const state = readState(dataDir)
  if (!state || !state.pid || !isProcessAlive(state.pid)) {
    console.log('Agent-Hub 未运行')
    return
  }
  console.log(`Agent-Hub 运行中: http://127.0.0.1:${state.port} (pid ${state.pid})`)
}

function stopServer(dataDir) {
  const state = readState(dataDir)
  if (!state || !state.pid || !isProcessAlive(state.pid)) {
    console.log('Agent-Hub 未运行')
    removeState(dataDir)
    return
  }
  process.kill(state.pid, 'SIGTERM')
  removeState(dataDir)
  console.log(`已停止 Agent-Hub (pid ${state.pid})`)
}

function writeState(dataDir, state) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(getStatePath(dataDir), JSON.stringify(state, null, 2))
}

function readState(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(dataDir), 'utf8'))
  } catch {
    return null
  }
}

function removeState(dataDir) {
  fs.rmSync(getStatePath(dataDir), { force: true })
}

function getStatePath(dataDir) {
  return path.join(dataDir, 'agent-hub.pid')
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function resolveServerPath() {
  const candidates = [
    path.join(__dirname, '..', '.next', 'standalone', 'server.js'),
    path.join(__dirname, '..', 'server.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('未找到 Next.js standalone server，请先运行 pnpm build。')
}

async function resolvePort(port) {
  if (!Number.isInteger(port) || port <= 0) throw new Error(`无效端口: ${port}`)
  for (let current = port; current < port + 50; current++) {
    if (await isPortAvailable(current)) return current
  }
  throw new Error(`端口 ${port}-${port + 49} 均不可用`)
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function runCliCommand(command, args, dataDir) {
  args.dataDir = dataDir
  switch (command) {
    case 'pipelines': return require('./cli/commands/pipelines')(args)
    case 'agents': return require('./cli/commands/agents')(args)
    case 'schedules': return require('./cli/commands/schedules')(args)
    case 'runs': return require('./cli/commands/runs').runs(args)
    case 'ps': return require('./cli/commands/runs').ps(args)
    case 'run': return require('./cli/commands/run')(args)
    case 'watch': return require('./cli/commands/watch')(args)
    case 'steps': return require('./cli/commands/steps')(args)
  }
}

function openBrowser(url) {
  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.unref()
}
