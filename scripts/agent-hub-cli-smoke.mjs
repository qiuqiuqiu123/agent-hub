import fs from 'node:fs'

const target = process.argv[2]
if (!target || !fs.existsSync(target)) {
  console.log(JSON.stringify({ passed: false, errors: ['target file not found'], warnings: [] }))
  process.exit(1)
}

const raw = fs.readFileSync(target, 'utf8')
const passed = raw.includes('agent-hub-cli-smoke')
console.log(JSON.stringify({
  passed,
  errors: passed ? [] : ['missing smoke marker'],
  warnings: [],
  raw: raw.trim(),
}))
