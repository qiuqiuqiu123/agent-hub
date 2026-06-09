'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')

function getBaseUrl(dataDir) {
  const stateFile = path.join(dataDir || getDefaultDataDir(), 'agent-hub.pid')
  let state
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {
    return null
  }
  if (!state || !state.pid || !state.port) return null
  // 检查进程是否存活
  try {
    process.kill(state.pid, 0)
  } catch {
    return null
  }
  return `http://127.0.0.1:${state.port}`
}

function getDefaultDataDir() {
  return process.env.AGENT_HUB_DATA_DIR
    ? path.resolve(process.env.AGENT_HUB_DATA_DIR, '..')
    : path.join(os.homedir(), '.agent-hub')
}

async function request(path, options = {}) {
  const dataDir = options.dataDir || getDefaultDataDir()
  const baseUrl = getBaseUrl(dataDir)
  if (!baseUrl) {
    console.error('Agent-Hub 未运行。请先执行: agent-hub start')
    process.exit(1)
  }
  const url = `${baseUrl}${path}`
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API 错误 ${res.status}: ${text || res.statusText}`)
  }
  if (options.stream) return res
  return res.json()
}

async function streamSSE(path, onEvent, options = {}) {
  const dataDir = options.dataDir || getDefaultDataDir()
  const baseUrl = getBaseUrl(dataDir)
  if (!baseUrl) {
    console.error('Agent-Hub 未运行。请先执行: agent-hub start')
    process.exit(1)
  }
  const url = `${baseUrl}${path}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`SSE 连接失败 ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            const shouldStop = onEvent(event)
            if (shouldStop) return
          } catch { /* 非 JSON data 行，忽略 */ }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

module.exports = { request, streamSSE, getBaseUrl, getDefaultDataDir }
