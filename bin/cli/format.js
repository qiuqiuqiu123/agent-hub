'use strict'

const Table = require('cli-table3')

// chalk 是 ESM，需要动态 import
let chalk = null
async function getChalk() {
  if (!chalk) {
    chalk = (await import('chalk')).default
  }
  return chalk
}

async function statusColor(status) {
  const c = await getChalk()
  const colors = {
    running: c.cyan,
    pending: c.gray,
    completed: c.green,
    failed: c.red,
    cancelled: c.yellow,
    skipped: c.yellow,
    success: c.green,
    error: c.red,
  }
  const fn = colors[status] || c.white
  return fn(status)
}

function relativeTime(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 0) {
    const future = -diff
    if (future < 60000) return `${Math.round(future / 1000)}秒后`
    if (future < 3600000) return `${Math.round(future / 60000)}分钟后`
    if (future < 86400000) return `${Math.round(future / 3600000)}小时后`
    return `${Math.round(future / 86400000)}天后`
  }
  if (diff < 60000) return `${Math.round(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.round(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.round(diff / 3600000)}小时前`
  return `${Math.round(diff / 86400000)}天前`
}

function formatTokens(input, output) {
  if (!input && !output) return '-'
  const fmt = (n) => {
    if (!n) return '0'
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
  }
  return `${fmt(input)}/${fmt(output)}`
}

function createTable(head, colWidths) {
  const opts = {
    head,
    style: { head: ['cyan'], border: ['gray'] },
  }
  if (colWidths) opts.colWidths = colWidths
  return new Table(opts)
}

function truncate(str, maxLen = 40) {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

module.exports = { getChalk, statusColor, relativeTime, formatTokens, createTable, truncate }
