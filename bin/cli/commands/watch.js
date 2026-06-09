'use strict'

const { request } = require('../api')
const { getChalk, formatTokens } = require('../format')

async function watch(args) {
  const runId = args.runId
  if (!runId) {
    console.error('用法: agent-hub watch <run-id>')
    process.exit(1)
  }

  const c = await getChalk()
  const timeStr = () => c.gray(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]`)

  console.log(`${timeStr()} 监控 run ${runId.slice(0, 8)}...\n`)

  let stopped = false
  const handleExit = () => {
    stopped = true
    console.log(`\n${timeStr()} 已断开`)
    process.exit(0)
  }
  process.on('SIGINT', handleExit)
  process.on('SIGTERM', handleExit)

  const printedSteps = new Map()

  while (!stopped) {
    const status = await request(`/api/runs/${runId}/status`, { dataDir: args.dataDir })
    for (const step of status.steps || []) {
      const key = `${step.stepId}:${step.status}:${step.inputTokens || 0}:${step.outputTokens || 0}`
      if (printedSteps.get(step.stepId) === key) continue
      printedSteps.set(step.stepId, key)

      if (step.status === 'running') {
        console.log(`${timeStr()} ${c.cyan('●')} ${c.bold(step.stepId)} running`)
      } else if (step.status === 'pending') {
        console.log(`${timeStr()} ${c.gray('○')} ${step.stepId} pending`)
      } else {
        const icon = step.status === 'completed' ? c.green('✓')
          : step.status === 'failed' ? c.red('✗')
          : c.yellow('⊘')
        const usage = c.gray(` (${formatTokens(step.inputTokens, step.outputTokens)})`)
        console.log(`${timeStr()} ${icon} ${step.stepId} ${step.status}${usage}`)
      }
    }

    if (['completed', 'failed', 'cancelled'].includes(status.status)) {
      const icon = status.status === 'completed' ? c.green('✓')
        : status.status === 'failed' ? c.red('✗')
        : c.yellow('⊘')
      console.log(`\n${timeStr()} ${icon} ${c.bold('run ' + status.status)}`)
      if (status.error) console.log(`${timeStr()} ${c.red(status.error)}`)
      return
    }

    await sleep(1000)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = watch
