'use strict'

const { request } = require('../api')
const { createTable, statusColor, relativeTime, formatTokens, truncate } = require('../format')

async function runs(args) {
  const limit = args.limit || 10
  const { runs: data } = await request(`/api/runs/history?limit=${limit}`, { dataDir: args.dataDir })
  if (!data || !data.length) {
    console.log('暂无运行记录')
    return
  }
  const table = createTable(['Run ID', 'Pipeline', '状态', 'Tokens', '开始时间', '耗时'])
  for (const r of data) {
    const duration = r.completedAt && r.startedAt
      ? formatDuration(new Date(r.completedAt) - new Date(r.startedAt))
      : r.status === 'running' ? '进行中' : '-'
    table.push([
      r.id.slice(0, 8),
      truncate(r.pipelineName, 20),
      await statusColor(r.status),
      formatTokens(r.totalTokens, 0),
      relativeTime(r.startedAt),
      duration,
    ])
  }
  console.log(table.toString())
}

async function ps(args) {
  const { runs: data } = await request('/api/runs/history?limit=50', { dataDir: args.dataDir })
  const running = (data || []).filter(r => r.status === 'running' || r.status === 'pending')
  if (!running.length) {
    console.log('当前没有运行中的任务')
    return
  }
  const table = createTable(['Run ID', 'Pipeline', '状态', '开始时间'])
  for (const r of running) {
    table.push([
      r.id.slice(0, 8),
      truncate(r.pipelineName, 25),
      await statusColor(r.status),
      relativeTime(r.startedAt),
    ])
  }
  console.log(table.toString())
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remainder = sec % 60
  return `${min}m${remainder}s`
}

module.exports = { runs, ps }
