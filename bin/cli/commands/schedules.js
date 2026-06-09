'use strict'

const { request } = require('../api')
const { createTable, statusColor, relativeTime } = require('../format')

async function schedules(args) {
  const data = await request('/api/schedules', { dataDir: args.dataDir })
  if (!data.length) {
    console.log('暂无定时任务')
    return
  }
  const table = createTable(['ID', '名称', 'Cron', '启用', '上次运行', '下次运行'])
  for (const s of data) {
    const enabled = s.enabled ? '✓' : '✗'
    table.push([
      s.id.slice(0, 8),
      s.name,
      s.cron,
      enabled,
      relativeTime(s.lastRunAt),
      relativeTime(s.nextRunAt),
    ])
  }
  console.log(table.toString())
}

module.exports = schedules
