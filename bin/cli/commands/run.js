'use strict'

const { request } = require('../api')
const watch = require('./watch')

async function run(args) {
  const pipelineId = args.pipelineId
  if (!pipelineId) {
    console.error('用法: agent-hub run <pipeline-id> [--input KEY=VAL ...]')
    process.exit(1)
  }

  // 解析 --input KEY=VAL 参数
  const input = {}
  if (args.inputs && args.inputs.length) {
    for (const pair of args.inputs) {
      const eq = pair.indexOf('=')
      if (eq === -1) {
        console.error(`无效 input 格式: "${pair}"，应为 KEY=VALUE`)
        process.exit(1)
      }
      input[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
  }

  console.log(`触发 pipeline ${pipelineId.slice(0, 8)}...`)
  const result = await request(`/api/pipelines/${pipelineId}/run`, {
    method: 'POST',
    body: { input },
    dataDir: args.dataDir,
  })

  const runId = result.runId || result.id
  console.log(`Run 已创建: ${runId}`)

  if (!args.noWatch && runId) {
    console.log('进入实时监控模式 (Ctrl+C 退出)\n')
    await watch({ runId, pipelineId, dataDir: args.dataDir })
  }
}

module.exports = run
