'use strict'

const { request } = require('../api')
const { createTable, truncate, relativeTime } = require('../format')

async function agents(args) {
  const data = await request('/api/agents', { dataDir: args.dataDir })
  if (!data.length) {
    console.log('暂无 agent')
    return
  }
  const table = createTable(['ID', '名称', '类型', 'Provider', '模型', '角色'])
  for (const a of data) {
    table.push([
      a.id.slice(0, 8),
      truncate(a.name, 20),
      a.type,
      a.provider,
      truncate(a.modelId, 20) || '-',
      truncate(a.role, 20),
    ])
  }
  console.log(table.toString())
}

module.exports = agents
