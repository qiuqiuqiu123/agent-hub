'use strict'

const { request } = require('../api')
const { createTable, truncate, relativeTime } = require('../format')

async function pipelines(args) {
  const data = await request('/api/pipelines', { dataDir: args.dataDir })
  if (!data.length) {
    console.log('暂无 pipeline')
    return
  }
  const table = createTable(['ID', '名称', '描述', 'Steps', '更新时间'])
  for (const p of data) {
    let stepCount = '-'
    try {
      const config = JSON.parse(p.config)
      stepCount = String(config.steps?.length || 0)
    } catch {}
    table.push([
      p.id.slice(0, 8),
      truncate(p.name, 30),
      truncate(p.description, 30),
      stepCount,
      relativeTime(p.updatedAt),
    ])
  }
  console.log(table.toString())
}

module.exports = pipelines
