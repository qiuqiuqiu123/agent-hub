'use strict'

const { request } = require('../api')
const { createTable, statusColor, formatTokens, relativeTime } = require('../format')

async function steps(args) {
  const runId = args.runId
  if (!runId) {
    console.error('用法: agent-hub steps <run-id>')
    process.exit(1)
  }
  const data = await request(`/api/runs/${runId}/steps`, { dataDir: args.dataDir })
  const stepList = data.steps || []
  if (!stepList.length) {
    console.log('该 run 暂无 step 记录')
    return
  }
  const table = createTable(['Step', '状态', 'Tokens (in/out)', '开始', '耗时'])
  for (const s of stepList) {
    const duration = s.completedAt && s.startedAt
      ? formatDuration(new Date(s.completedAt) - new Date(s.startedAt))
      : s.status === 'running' ? '进行中' : '-'
    table.push([
      s.stepId,
      await statusColor(s.status),
      formatTokens(s.inputTokens, s.outputTokens),
      relativeTime(s.startedAt),
      duration,
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

module.exports = steps
