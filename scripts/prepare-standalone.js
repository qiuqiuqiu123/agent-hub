const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const standaloneDir = path.join(root, '.next', 'standalone')

if (!fs.existsSync(standaloneDir)) {
  process.exit(0)
}

copyIfExists(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'))
copyIfExists(path.join(root, 'public'), path.join(standaloneDir, 'public'))

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
}
